from __future__ import annotations

import asyncio
from copy import deepcopy
import json
from datetime import datetime, timezone
import os
from pathlib import Path
import re
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
ACCESS_CONFIG_PATH = BASE_DIR / "access_config.json"

def load_local_env() -> None:
    for env_path in (BASE_DIR / ".env", BASE_DIR.parent / ".env"):
        if not env_path.exists():
            continue

        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            if not key or key in os.environ:
                continue

            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", "\""}:
                value = value[1:-1]
            os.environ[key] = value


load_local_env()

DATASET_FILES = [
    "eng_pressure_zones.json",
    "plan_permits_2024.json",
    "health_cases.json",
    "transit_gtfs_stops.json",
    "social_services_demographics.json",
    "climate_risk_overlays.json",
    "zoning_districts.json",
    "scorecard_metrics.json",
]

CLEARANCE_ORDER = ["open", "internal", "confidential", "personal_sensitive", "health_sensitive"]
COMMON_TEMPORAL_FIELDS = {
    "issued_date",
    "last_updated",
    "week_start",
    "last_computed",
    "year",
}
NORMALIZED_TOKEN_PATTERN = re.compile(r"[^a-z0-9]+")
POST_FILTER_OPERATORS = [">=", "<=", "==", "!=", ">", "<"]
STATUS_SCORE = {"on-track": 100, "at-risk": 65, "behind": 35}

LEGACY_ROLE_ALIASES = {
    "public": "public_portal",
    "eng_staff": "eng_analyst",
    "plan_staff": "planner",
    "health_steward": "health_steward",
    "transit_staff": "transit_analyst",
    "social_staff": "social_manager",
    "admin": "city_admin",
}

USER_DIRECTORY: dict[str, dict[str, Any]] = {
    "public_portal": {
        "department": "public",
        "role": "public_user",
        "clearances": {"open"},
        "approved_purposes": {"public_information"},
        "default_purpose": "public_information",
        "permissions": set(),
        "is_steward": False,
    },
    "eng_analyst": {
        "department": "engineering",
        "role": "engineer",
        "clearances": {"open", "internal"},
        "approved_purposes": {"infrastructure_operations", "capital_planning", "service_planning"},
        "default_purpose": "infrastructure_operations",
        "permissions": set(),
        "is_steward": False,
    },
    "planner": {
        "department": "planning",
        "role": "planner",
        "clearances": {"open", "internal", "personal_sensitive"},
        "approved_purposes": {"service_planning", "housing_forecast"},
        "default_purpose": "housing_forecast",
        "permissions": set(),
        "is_steward": False,
    },
    "planning_manager": {
        "department": "planning",
        "role": "planning_manager",
        "clearances": {"open", "internal", "personal_sensitive", "confidential"},
        "approved_purposes": {"service_planning", "housing_forecast", "infrastructure_operations"},
        "default_purpose": "service_planning",
        "permissions": {"unmask_sensitive_fields"},
        "is_steward": True,
    },
    "health_steward": {
        "department": "public_health",
        "role": "health_steward",
        "clearances": {"open", "internal", "health_sensitive"},
        "approved_purposes": {"outbreak_monitoring", "service_planning"},
        "default_purpose": "outbreak_monitoring",
        "permissions": set(),
        "is_steward": True,
    },
    "transit_analyst": {
        "department": "transit",
        "role": "transit_analyst",
        "clearances": {"open", "internal"},
        "approved_purposes": {"public_information", "service_planning", "operations"},
        "default_purpose": "operations",
        "permissions": set(),
        "is_steward": False,
    },
    "social_manager": {
        "department": "social_services",
        "role": "social_manager",
        "clearances": {"open", "internal", "confidential"},
        "approved_purposes": {"service_delivery", "service_planning"},
        "default_purpose": "service_delivery",
        "permissions": set(),
        "is_steward": True,
    },
    "climate_analyst": {
        "department": "climate",
        "role": "climate_analyst",
        "clearances": {"open", "internal"},
        "approved_purposes": {"public_information", "climate_resilience", "service_planning"},
        "default_purpose": "climate_resilience",
        "permissions": set(),
        "is_steward": False,
    },
    "city_admin": {
        "department": "city_manager",
        "role": "city_admin",
        "clearances": {
            "open",
            "internal",
            "confidential",
            "personal_sensitive",
            "health_sensitive",
        },
        "approved_purposes": {
            "public_information",
            "service_planning",
            "housing_forecast",
            "infrastructure_operations",
            "capital_planning",
            "outbreak_monitoring",
            "service_delivery",
            "climate_resilience",
            "operations",
            "governance_oversight",
        },
        "default_purpose": "governance_oversight",
        "permissions": {"view_audit", "unmask_sensitive_fields"},
        "is_steward": True,
    },
}

CLASSIFICATION_CLEARANCE = {
    "open": "open",
    "internal": "internal",
    "confidential": "confidential",
    "personal_sensitive": "personal_sensitive",
    "health_sensitive": "health_sensitive",
}

DEPARTMENT_DIRECTORY = {
    "public": "Public",
    "engineering": "Engineering",
    "planning": "Planning",
    "public_health": "Public Health",
    "social_services": "Social Services",
    "transit": "Transit",
    "climate": "Climate",
    "city_manager": "City Manager",
}

SHARING_POLICY_OPTIONS = {
    "public": "Anyone can use this data.",
    "municipal_internal": "Any municipal staff user can use this data.",
    "department_access": "Only the selected departments can use this data.",
    "masked_department_access": "Selected departments can use this data with personal fields hidden.",
    "summary_only_department_access": "Selected departments only get summary-level output.",
}

DELIVERY_OPTIONS = {
    "full_detail": "Show full detail in approved views.",
    "hidden_personal_fields": "Hide personal or sensitive fields in approved views.",
    "summary_only": "Show summary output only.",
}


class UserContext(BaseModel):
    user_id: str
    department: str
    role: str
    clearances: set[str]
    approved_purposes: set[str]
    requested_purpose: str
    permissions: set[str]
    is_steward: bool


class JoinRequest(BaseModel):
    left_dataset: str
    right_dataset: str
    join_key: str
    left_fields: list[str] | None = None
    right_fields: list[str] | None = None
    left_filter: dict[str, Any] | None = None
    right_filter: dict[str, Any] | None = None
    right_aggregate: str | None = None


class NaturalQueryRequest(BaseModel):
    question: str


class AccessDecision(BaseModel):
    allowed: bool
    reason: str | None = None
    denied_by: str | None = None
    share_mode: str
    classification: str
    access_mode: str = "raw"
    masked_fields: set[str] = Field(default_factory=set)
    join_allowed: bool = True


class AccessConfigEntry(BaseModel):
    dataset_id: str
    dataset_name: str
    owner_department: str
    classification: str
    sharing_policy: str
    allowed_departments: list[str]
    default_delivery: str
    viewer_note: str


class AccessConfigUpdate(BaseModel):
    sharing_policy: str
    allowed_departments: list[str]
    default_delivery: str
    viewer_note: str


class NaturalLanguageUnavailableError(RuntimeError):
    pass


class AuditBroadcaster:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self.loop: asyncio.AbstractEventLoop | None = None

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.clients.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.clients.discard(websocket)

    async def broadcast(self, entry: dict[str, Any]) -> None:
        disconnected: list[WebSocket] = []
        for websocket in list(self.clients):
            try:
                await websocket.send_json(entry)
            except Exception:
                disconnected.append(websocket)
        for websocket in disconnected:
            self.disconnect(websocket)

    def queue_broadcast(self, entry: dict[str, Any]) -> None:
        if self.loop is None:
            return
        try:
            asyncio.run_coroutine_threadsafe(self.broadcast(entry), self.loop)
        except RuntimeError:
            return


def load_datasets() -> dict[str, dict[str, Any]]:
    loaded: dict[str, dict[str, Any]] = {}
    for file_name in DATASET_FILES:
        payload = json.loads((DATA_DIR / file_name).read_text())
        loaded[payload["dataset_id"]] = payload
    return loaded


def infer_sharing_policy(dataset: dict[str, Any]) -> str:
    if dataset.get("share_mode") == "open":
        return "public"
    if dataset.get("share_mode") == "municipal_internal":
        return "municipal_internal"
    if any(rule.get("condition") == "aggregate_only" for rule in dataset.get("row_filter_rules", [])):
        return "summary_only_department_access"
    if dataset.get("share_mode") == "restricted_row_or_field_access":
        return "masked_department_access"
    return "department_access"


def infer_default_delivery(dataset: dict[str, Any]) -> str:
    if any(rule.get("condition") == "aggregate_only" for rule in dataset.get("row_filter_rules", [])):
        return "summary_only"
    if set(dataset.get("field_mask_rules", {}).get("default", [])) or set(dataset.get("pii_fields", [])):
        return "hidden_personal_fields"
    return "full_detail"


def default_viewer_note(dataset: dict[str, Any]) -> str:
    notes = {
        "eng-pressure-zones": "Use this for infrastructure and capacity planning.",
        "plan-permits-2024": "Shared planning permits should hide applicant-related fields outside planning.",
        "health-cases": "Other departments should only see summary health indicators, not raw surveillance rows.",
        "social-services-demographics": "Keep this for approved internal program planning only.",
        "transit-stops": "Safe for public-facing operational dashboards.",
        "climate-risk-overlays": "Open environmental risk layer suitable for public use.",
        "zoning-districts": "Open parcel-level zoning rules for infill and land-use compatibility analysis.",
        "scorecard-metrics": "Executive scorecard indicators synthesized for municipal readiness tracking.",
    }
    return notes.get(dataset["dataset_id"], "")


def build_default_access_config(dataset_map: dict[str, dict[str, Any]]) -> dict[str, AccessConfigEntry]:
    config: dict[str, AccessConfigEntry] = {}
    for dataset in dataset_map.values():
        config[dataset["dataset_id"]] = AccessConfigEntry(
            dataset_id=dataset["dataset_id"],
            dataset_name=dataset["name"],
            owner_department=dataset["owner_department"],
            classification=dataset["classification"],
            sharing_policy=infer_sharing_policy(dataset),
            allowed_departments=sorted(set(dataset.get("allowed_consumer_departments", []))),
            default_delivery=infer_default_delivery(dataset),
            viewer_note=default_viewer_note(dataset),
        )
    return config


def load_access_config(dataset_map: dict[str, dict[str, Any]]) -> dict[str, AccessConfigEntry]:
    defaults = build_default_access_config(dataset_map)
    if not ACCESS_CONFIG_PATH.exists():
        return defaults

    payload = json.loads(ACCESS_CONFIG_PATH.read_text())
    loaded: dict[str, AccessConfigEntry] = {}
    for item in payload:
        entry = AccessConfigEntry(**item)
        if entry.dataset_id in defaults:
            loaded[entry.dataset_id] = entry

    for dataset_id, entry in defaults.items():
        loaded.setdefault(dataset_id, entry)
    return loaded


def save_access_config(config: dict[str, AccessConfigEntry]) -> None:
    ACCESS_CONFIG_PATH.write_text(
        json.dumps(
            [entry.model_dump() for entry in config.values()],
            indent=2,
        )
        + "\n"
    )


def apply_access_entry(dataset: dict[str, Any], entry: AccessConfigEntry) -> None:
    dataset["allowed_consumer_departments"] = sorted(set(entry.allowed_departments))
    dataset["sharing_policy"] = entry.sharing_policy
    dataset["default_delivery"] = entry.default_delivery
    dataset["viewer_note"] = entry.viewer_note

    if entry.sharing_policy == "public":
        dataset["share_mode"] = "open"
        dataset["allowed_consumer_departments"] = ["public"]
    elif entry.sharing_policy == "municipal_internal":
        dataset["share_mode"] = "municipal_internal"
        dataset["allowed_consumer_departments"] = []
    elif entry.sharing_policy == "department_access":
        dataset["share_mode"] = "approved_department_access"
    elif entry.sharing_policy == "masked_department_access":
        dataset["share_mode"] = "restricted_row_or_field_access"
    elif entry.sharing_policy == "summary_only_department_access":
        dataset["share_mode"] = "approved_purpose_access"

    access_overrides = dict(dataset.get("access_clearance_overrides", {}))
    if entry.default_delivery == "hidden_personal_fields":
        access_overrides["masked"] = "internal"
    else:
        access_overrides.pop("masked", None)

    if entry.default_delivery == "summary_only":
        access_overrides["aggregate"] = "internal"
        dataset["row_filter_rules"] = [
            {
                "consumer_department": department,
                "purposes": dataset.get("permitted_use_cases", []),
                "condition": "aggregate_only",
            }
            for department in dataset["allowed_consumer_departments"]
            if department != dataset["owner_department"]
        ]
        dataset["join_policy"] = {
            "allow_cross_department_join": False,
            "allow_raw_row_output": False,
        }
    else:
        access_overrides.pop("aggregate", None)
        dataset["row_filter_rules"] = []
        dataset["join_policy"] = {
            "allow_cross_department_join": True,
            "allow_raw_row_output": True,
        }

    dataset["access_clearance_overrides"] = access_overrides


def rebuild_datasets() -> dict[str, dict[str, Any]]:
    rebuilt = {dataset_id: deepcopy(dataset) for dataset_id, dataset in dataset_templates.items()}
    for dataset_id, entry in access_config.items():
        if dataset_id in rebuilt:
            apply_access_entry(rebuilt[dataset_id], entry)
    return rebuilt


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_token(value: str | None) -> str:
    return NORMALIZED_TOKEN_PATTERN.sub("", (value or "").strip().lower())


def parse_datetime_like(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, (int, float)) and 1900 <= int(value) <= 2100:
        parsed = datetime(int(value), 1, 1)
    elif isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if re.fullmatch(r"\d{4}-\d{2}", text):
            text = f"{text}-01"
        if text.endswith("Z"):
            text = f"{text[:-1]}+00:00"
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            return None
    else:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_bbox_value(bbox: str | None) -> tuple[float, float, float, float] | None:
    if not bbox:
        return None

    parts = [item.strip() for item in bbox.split(",")]
    if len(parts) != 4:
        raise HTTPException(status_code=400, detail={"error": "Invalid bbox", "bbox": bbox})

    try:
        min_lat, min_lng, max_lat, max_lng = (float(part) for part in parts)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"error": "Invalid bbox", "bbox": bbox}) from exc

    if min_lat > max_lat or min_lng > max_lng:
        raise HTTPException(status_code=400, detail={"error": "Invalid bbox bounds", "bbox": bbox})
    return min_lat, min_lng, max_lat, max_lng


def parse_since_value(since: str | None) -> datetime | None:
    if not since:
        return None
    parsed = parse_datetime_like(since)
    if parsed is None:
        raise HTTPException(status_code=400, detail={"error": "Invalid since value", "since": since})
    return parsed


def scalar_matches(record_value: Any, expected_value: Any, field_name: str) -> bool:
    if isinstance(record_value, list):
        return any(scalar_matches(item, expected_value, field_name) for item in record_value)
    if isinstance(expected_value, list):
        return any(scalar_matches(record_value, item, field_name) for item in expected_value)

    if field_name == "ward":
        return normalize_token(str(record_value)) == normalize_token(str(expected_value))

    if isinstance(record_value, str) and isinstance(expected_value, str):
        return record_value.strip().lower() == expected_value.strip().lower()

    return record_value == expected_value


def get_record_coordinates(record: dict[str, Any]) -> tuple[float, float] | None:
    lat_value = record.get("lat", record.get("centroid_lat"))
    lng_value = record.get("lng", record.get("centroid_lng"))
    try:
        if lat_value is None or lng_value is None:
            return None
        return float(lat_value), float(lng_value)
    except (TypeError, ValueError):
        return None


def record_matches_since(record: dict[str, Any], since_value: datetime, dataset_last_updated: str | None) -> bool:
    temporal_values = []
    for key, value in record.items():
        if key in COMMON_TEMPORAL_FIELDS or key.endswith("_date") or key.endswith("_updated"):
            parsed = parse_datetime_like(value)
            if parsed is not None:
                temporal_values.append(parsed)

    if not temporal_values:
        dataset_timestamp = parse_datetime_like(dataset_last_updated)
        return bool(dataset_timestamp and dataset_timestamp >= since_value)
    return any(item >= since_value for item in temporal_values)


def apply_record_filters(
    dataset: dict[str, Any],
    records: list[dict[str, Any]],
    *,
    zone_id: str | None = None,
    ward: str | None = None,
    parcel_id: str | None = None,
    bbox_bounds: tuple[float, float, float, float] | None = None,
    since_value: datetime | None = None,
    extra_filters: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    filtered = list(records)

    if zone_id:
        filtered = [record for record in filtered if scalar_matches(record.get("zone_id"), zone_id, "zone_id")]
    if ward:
        filtered = [record for record in filtered if scalar_matches(record.get("ward"), ward, "ward")]
    if parcel_id:
        filtered = [record for record in filtered if scalar_matches(record.get("parcel_id"), parcel_id, "parcel_id")]
    if extra_filters:
        for field_name, expected_value in extra_filters.items():
            filtered = [
                record
                for record in filtered
                if scalar_matches(record.get(field_name), expected_value, field_name)
            ]
    if bbox_bounds:
        min_lat, min_lng, max_lat, max_lng = bbox_bounds
        filtered = [
            record
            for record in filtered
            if (
                (coords := get_record_coordinates(record)) is not None
                and min_lat <= coords[0] <= max_lat
                and min_lng <= coords[1] <= max_lng
            )
        ]
    if since_value:
        filtered = [
            record
            for record in filtered
            if record_matches_since(record, since_value, dataset.get("last_updated"))
        ]
    return filtered


def filter_record_fields(record: dict[str, Any], fields: list[str] | None) -> dict[str, Any]:
    if not fields:
        return record
    return {field: record[field] for field in fields if field in record}


def apply_field_masks(record: dict[str, Any], masked_fields: set[str]) -> dict[str, Any]:
    if not masked_fields:
        return record
    return {key: value for key, value in record.items() if key not in masked_fields}


def parse_field_list(fields: str | None) -> list[str] | None:
    if not fields:
        return None
    parsed = [item.strip() for item in fields.split(",") if item.strip()]
    return parsed or None


def parse_join_aggregate_spec(aggregate_spec: str | None) -> tuple[str, str | None] | None:
    if not aggregate_spec:
        return None
    if ":" in aggregate_spec:
        operation, field_name = aggregate_spec.split(":", 1)
        field_name = field_name.strip() or None
    else:
        operation, field_name = aggregate_spec, None
    operation = operation.strip().lower()
    if operation not in {"count", "sum", "avg"}:
        raise HTTPException(
            status_code=400,
            detail={"error": "Invalid join aggregate", "aggregate": aggregate_spec},
        )
    if operation in {"sum", "avg"} and not field_name:
        raise HTTPException(
            status_code=400,
            detail={"error": "Join aggregate requires a field", "aggregate": aggregate_spec},
        )
    return operation, field_name


def aggregate_query_records(records: list[dict[str, Any]], aggregate: str, field: str | None) -> dict[str, Any]:
    if aggregate == "count":
        return {"value": len(records)}

    metric_field = field or "units"
    numeric_values = [value for value in (record.get(metric_field) for record in records) if isinstance(value, (int, float))]
    aggregate_value: float | int = 0 if not numeric_values else sum(numeric_values)
    if aggregate == "avg" and numeric_values:
        aggregate_value = aggregate_value / len(numeric_values)
    return {"field": metric_field, "value": aggregate_value}


def aggregate_join_records(records: list[dict[str, Any]], aggregate_spec: tuple[str, str | None]) -> dict[str, Any]:
    operation, field_name = aggregate_spec
    if operation == "count":
        return {"count": len(records)}

    numeric_values = [value for value in (record.get(field_name or "") for record in records) if isinstance(value, (int, float))]
    aggregate_value: float | int = 0 if not numeric_values else sum(numeric_values)
    if operation == "avg" and numeric_values:
        aggregate_value = aggregate_value / len(numeric_values)
    return {f"{operation}_{field_name}": aggregate_value}


def flatten_result_for_filter(record: dict[str, Any]) -> dict[str, Any]:
    flattened: dict[str, Any] = {}
    for key, value in record.items():
        if isinstance(value, dict):
            for nested_key, nested_value in value.items():
                flattened[f"{key}.{nested_key}"] = nested_value
                flattened.setdefault(nested_key, nested_value)
        else:
            flattened[key] = value
    return flattened


def parse_filter_literal(text: str) -> Any:
    value = text.strip()
    if value.startswith(("'", '"')) and value.endswith(("'", '"')) and len(value) >= 2:
        return value[1:-1]
    lowered = value.lower()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    if lowered in {"none", "null"}:
        return None
    try:
        if any(char in value for char in [".", "e", "E"]):
            return float(value)
        return int(value)
    except ValueError:
        return value


def coerce_comparable(actual: Any, expected: Any) -> tuple[Any, Any]:
    if isinstance(actual, str) and isinstance(expected, (int, float)):
        try:
            actual = float(actual)
        except ValueError:
            pass
    if isinstance(expected, str) and isinstance(actual, (int, float)):
        try:
            expected = float(expected)
        except ValueError:
            pass
    return actual, expected


def evaluate_post_filter_clause(flat_record: dict[str, Any], clause: str) -> bool:
    for operator in POST_FILTER_OPERATORS:
        if operator in clause:
            left, right = clause.split(operator, 1)
            field_name = left.strip()
            expected_value = parse_filter_literal(right.strip())
            actual_value = flat_record.get(field_name)
            if actual_value is None:
                return False

            actual_value, expected_value = coerce_comparable(actual_value, expected_value)

            if operator == "==":
                if isinstance(actual_value, str) and isinstance(expected_value, str):
                    return actual_value.strip().lower() == expected_value.strip().lower()
                return actual_value == expected_value
            if operator == "!=":
                if isinstance(actual_value, str) and isinstance(expected_value, str):
                    return actual_value.strip().lower() != expected_value.strip().lower()
                return actual_value != expected_value
            if operator == ">=":
                return actual_value >= expected_value
            if operator == "<=":
                return actual_value <= expected_value
            if operator == ">":
                return actual_value > expected_value
            if operator == "<":
                return actual_value < expected_value
    raise ValueError(f"Unsupported post filter clause: {clause}")


def apply_post_filter(results: Any, post_filter: str | None) -> tuple[Any, int]:
    if not post_filter:
        if isinstance(results, dict):
            return results, 1
        return results, len(results)

    candidate_rows = results if isinstance(results, list) else [results]
    filtered_rows = [
        row
        for row in candidate_rows
        if evaluate_post_filter_expression(flatten_result_for_filter(row), post_filter)
    ]
    if isinstance(results, dict):
        return (filtered_rows[0] if filtered_rows else []), len(filtered_rows)
    return filtered_rows, len(filtered_rows)


def evaluate_post_filter_expression(flat_record: dict[str, Any], expression: str) -> bool:
    tokens = [token.strip() for token in re.split(r"\s+(AND|OR)\s+", expression, flags=re.IGNORECASE) if token.strip()]
    if not tokens:
        return True

    result = evaluate_post_filter_clause(flat_record, tokens[0])
    index = 1
    while index < len(tokens):
        operator = tokens[index].upper()
        next_result = evaluate_post_filter_clause(flat_record, tokens[index + 1])
        if operator == "AND":
            result = result and next_result
        elif operator == "OR":
            result = result or next_result
        else:
            raise ValueError(f"Unsupported boolean operator: {operator}")
        index += 2
    return result


def build_access_denied_detail(dataset_ids: list[str], decision: AccessDecision) -> dict[str, Any]:
    return {
        "error": "Access denied",
        "datasets": dataset_ids,
        "reason": decision.reason,
        "denied_by": decision.denied_by,
        "share_mode": decision.share_mode,
        "classification": decision.classification,
        "access_mode": decision.access_mode,
    }


def get_effective_user_id(authorization: str | None, x_user_id: str | None) -> str:
    bearer = (authorization or "").removeprefix("Bearer ").strip()
    raw_id = x_user_id or bearer or "public_portal"
    return LEGACY_ROLE_ALIASES.get(raw_id, raw_id)


def get_user_context(
    authorization: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
    x_purpose: str | None = Header(default=None),
) -> UserContext:
    user_id = get_effective_user_id(authorization, x_user_id)
    user_record = USER_DIRECTORY.get(user_id)
    if user_record is None:
        raise HTTPException(
            status_code=401,
            detail={"error": "Unknown user", "user_id": user_id},
        )

    requested_purpose = (x_purpose or user_record["default_purpose"]).strip()
    if requested_purpose not in user_record["approved_purposes"]:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "Purpose not approved for user",
                "user_id": user_id,
                "requested_purpose": requested_purpose,
            },
        )

    return UserContext(
        user_id=user_id,
        department=user_record["department"],
        role=user_record["role"],
        clearances=set(user_record["clearances"]),
        approved_purposes=set(user_record["approved_purposes"]),
        requested_purpose=requested_purpose,
        permissions=set(user_record["permissions"]),
        is_steward=bool(user_record["is_steward"]),
    )


def get_dataset_or_404(dataset_id: str) -> dict[str, Any]:
    dataset = datasets.get(dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail={"error": "Dataset not found", "dataset_id": dataset_id})
    return dataset


def is_owner_or_admin(user: UserContext, dataset: dict[str, Any]) -> bool:
    return user.department == dataset["owner_department"] or "view_audit" in user.permissions


def allowed_departments(dataset: dict[str, Any]) -> set[str]:
    return set(dataset.get("allowed_consumer_departments", []))


def dataset_permitted_purposes(dataset: dict[str, Any]) -> set[str]:
    return set(dataset.get("permitted_use_cases", []))


def field_masked_for_user(dataset: dict[str, Any], user: UserContext) -> set[str]:
    rules = dataset.get("field_mask_rules", {})
    default_masks = set(rules.get("default", [])) | set(dataset.get("pii_fields", []))
    if not default_masks:
        return set()

    if (
        user.role in set(rules.get("allow_unmasked_for_roles", []))
        or user.department in set(rules.get("allow_unmasked_for_departments", []))
        or user.user_id in set(rules.get("allow_unmasked_for_users", []))
        or user.is_steward
        or "unmask_sensitive_fields" in user.permissions
    ):
        return set()
    return default_masks


def requires_aggregate_only(dataset: dict[str, Any], user: UserContext) -> bool:
    if is_owner_or_admin(user, dataset):
        return False

    for rule in dataset.get("row_filter_rules", []):
        department_match = rule.get("consumer_department") in {None, "*", user.department}
        purpose_match = not rule.get("purposes") or user.requested_purpose in set(rule["purposes"])
        if department_match and purpose_match and rule.get("condition") == "aggregate_only":
            return True
    return False


def evaluate_access(dataset: dict[str, Any], user: UserContext, action: str, is_aggregate: bool = False) -> AccessDecision:
    classification = dataset.get("classification", "internal")
    share_mode = dataset.get("share_mode", "department_only")
    owner_or_admin = is_owner_or_admin(user, dataset)
    permitted_departments = allowed_departments(dataset)
    permitted_purposes = dataset_permitted_purposes(dataset)
    access_mode = "aggregate_only" if requires_aggregate_only(dataset, user) else "raw"
    masked_fields = field_masked_for_user(dataset, user)
    required_clearance = CLASSIFICATION_CLEARANCE.get(classification, "internal")
    effective_clearance = required_clearance
    clearance_overrides = dataset.get("access_clearance_overrides", {})

    if action == "query" and is_aggregate:
        effective_clearance = clearance_overrides.get("aggregate", effective_clearance)
    elif action == "catalog" and access_mode == "aggregate_only":
        effective_clearance = clearance_overrides.get("aggregate", effective_clearance)
    elif masked_fields:
        effective_clearance = clearance_overrides.get("masked", effective_clearance)

    if effective_clearance != "open" and effective_clearance not in user.clearances:
        return AccessDecision(
            allowed=False,
            reason=f"requires {effective_clearance} clearance",
            denied_by="classification",
            share_mode=share_mode,
            classification=classification,
            access_mode=access_mode,
            masked_fields=masked_fields,
        )

    if share_mode == "open":
        share_allowed = True
    elif share_mode == "municipal_internal":
        share_allowed = user.department != "public"
    elif share_mode == "department_only":
        share_allowed = owner_or_admin
    elif share_mode in {"approved_department_access", "approved_purpose_access", "restricted_row_or_field_access"}:
        share_allowed = owner_or_admin or user.department in permitted_departments
    elif share_mode == "emergency_only":
        share_allowed = False
    else:
        share_allowed = False

    if not share_allowed:
        return AccessDecision(
            allowed=False,
            reason="requesting department is not approved for this dataset",
            denied_by="share_mode",
            share_mode=share_mode,
            classification=classification,
        )

    if share_mode in {"approved_purpose_access", "restricted_row_or_field_access"} and permitted_purposes:
        if user.requested_purpose not in permitted_purposes:
            return AccessDecision(
                allowed=False,
                reason="requested purpose is not approved for this dataset",
                denied_by="purpose",
                share_mode=share_mode,
                classification=classification,
            )

    if action == "query" and access_mode == "aggregate_only" and not is_aggregate:
        return AccessDecision(
            allowed=False,
            reason="dataset is available to this department only as aggregated output",
            denied_by="row_filter",
            share_mode=share_mode,
            classification=classification,
            access_mode=access_mode,
        )

    join_policy = dataset.get("join_policy", {})
    join_allowed = True
    if action == "join":
        if not owner_or_admin and not join_policy.get("allow_cross_department_join", True):
            join_allowed = False
        if not owner_or_admin and not join_policy.get("allow_raw_row_output", True):
            join_allowed = False
        if not join_allowed:
            return AccessDecision(
                allowed=False,
                reason="dataset may not be joined as raw cross-department output",
                denied_by="join_policy",
                share_mode=share_mode,
                classification=classification,
                access_mode=access_mode,
                join_allowed=False,
            )

    return AccessDecision(
        allowed=True,
        share_mode=share_mode,
        classification=classification,
        access_mode=access_mode,
        masked_fields=masked_fields,
        join_allowed=join_allowed,
    )


def write_audit_entry(
    request: Request,
    user: UserContext,
    *,
    datasets_used: list[str],
    outcome: str,
    denial_reason: str | None = None,
    access_tier_required: str | None = None,
    masked_fields: set[str] | None = None,
    record_count_returned: int | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    entry = {
        "log_id": f"audit-{len(audit_log) + 1}",
        "timestamp": utc_now(),
        "requester_user_id": user.user_id,
        "requester_department": user.department,
        "requester_role": user.role,
        "purpose": user.requested_purpose,
        "endpoint": f"{request.method} {request.url.path}",
        "datasets": datasets_used,
        "access_tier_required": access_tier_required,
        "outcome": outcome,
        "denial_reason": denial_reason,
        "masked_fields": sorted(masked_fields or set()),
        "record_count_returned": record_count_returned,
        "query_params": dict(request.query_params),
        "details": extra or {},
    }
    audit_log.append(entry)
    audit_broadcaster.queue_broadcast(entry)


def raise_access_denied(
    request: Request,
    user: UserContext,
    dataset_ids: list[str],
    decision: AccessDecision,
    *,
    audit: bool = True,
) -> None:
    if audit:
        write_audit_entry(
            request,
            user,
            datasets_used=dataset_ids,
            outcome="denied",
            denial_reason=decision.reason,
            access_tier_required=decision.classification,
            masked_fields=decision.masked_fields,
            extra={
                "denied_by": decision.denied_by,
                "share_mode": decision.share_mode,
                "access_mode": decision.access_mode,
            },
        )
    raise HTTPException(status_code=403, detail=build_access_denied_detail(dataset_ids, decision))


def execute_dataset_query(
    request: Request,
    user: UserContext,
    *,
    dataset_id: str,
    zone_id: str | None = None,
    ward: str | None = None,
    parcel_id: str | None = None,
    bbox: str | None = None,
    since: str | None = None,
    aggregate: str | None = None,
    field: str | None = None,
    fields: str | None = None,
    audit: bool = True,
) -> dict[str, Any]:
    dataset = get_dataset_or_404(dataset_id)
    decision = evaluate_access(dataset, user, action="query", is_aggregate=bool(aggregate))
    if not decision.allowed:
        raise_access_denied(request, user, [dataset_id], decision, audit=audit)

    bbox_bounds = parse_bbox_value(bbox)
    since_value = parse_since_value(since)
    records = apply_record_filters(
        dataset,
        list(dataset["records"]),
        zone_id=zone_id,
        ward=ward,
        parcel_id=parcel_id,
        bbox_bounds=bbox_bounds,
        since_value=since_value,
    )

    field_list = parse_field_list(fields)
    masked_fields = set(decision.masked_fields)

    if aggregate:
        safe_records = [apply_field_masks(record, masked_fields) for record in records]
        results: Any = aggregate_query_records(safe_records, aggregate, field)
    else:
        results = [apply_field_masks(filter_record_fields(record, field_list), masked_fields) for record in records]

    result_count = 1 if isinstance(results, dict) else len(results)
    if audit:
        write_audit_entry(
            request,
            user,
            datasets_used=[dataset_id],
            outcome="approved",
            access_tier_required=decision.classification,
            masked_fields=masked_fields,
            record_count_returned=result_count,
            extra={
                "aggregate": aggregate,
                "access_mode": decision.access_mode,
                "share_mode": decision.share_mode,
                "bbox": bbox,
                "since": since,
                "parcel_id": parcel_id,
            },
        )
    return {
        "dataset_id": dataset_id,
        "result_count": result_count,
        "access_mode": decision.access_mode,
        "masked_fields": sorted(masked_fields),
        "results": results,
    }


def execute_join_operation(
    request: Request,
    user: UserContext,
    payload: JoinRequest,
    *,
    audit: bool = True,
) -> dict[str, Any]:
    left = get_dataset_or_404(payload.left_dataset)
    right = get_dataset_or_404(payload.right_dataset)

    if payload.join_key not in left.get("fields", []) or payload.join_key not in right.get("fields", []):
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Join key must exist in both datasets",
                "join_key": payload.join_key,
                "left_dataset": payload.left_dataset,
                "right_dataset": payload.right_dataset,
            },
        )

    left_decision = evaluate_access(left, user, action="join")
    if not left_decision.allowed:
        raise_access_denied(request, user, [payload.left_dataset], left_decision, audit=audit)

    right_decision = evaluate_access(right, user, action="join")
    if not right_decision.allowed:
        raise_access_denied(request, user, [payload.right_dataset], right_decision, audit=audit)

    aggregate_spec = parse_join_aggregate_spec(payload.right_aggregate)
    left_records = apply_record_filters(left, list(left["records"]), extra_filters=payload.left_filter)
    right_records = apply_record_filters(right, list(right["records"]), extra_filters=payload.right_filter)

    right_index: dict[Any, list[dict[str, Any]] | dict[str, Any]] = {}
    if aggregate_spec:
        grouped_records: dict[Any, list[dict[str, Any]]] = {}
        for record in right_records:
            masked_record = apply_field_masks(record, right_decision.masked_fields)
            grouped_records.setdefault(masked_record.get(payload.join_key), []).append(masked_record)
        for join_value, grouped in grouped_records.items():
            right_index[join_value] = aggregate_join_records(grouped, aggregate_spec)
    else:
        for record in right_records:
            filtered = filter_record_fields(record, payload.right_fields)
            right_index.setdefault(record.get(payload.join_key), []).append(
                apply_field_masks(filtered, right_decision.masked_fields)
            )

    joined_rows = []
    for left_record in left_records:
        key_value = left_record.get(payload.join_key)
        left_output = apply_field_masks(filter_record_fields(left_record, payload.left_fields), left_decision.masked_fields)
        matches = right_index.get(key_value, [] if not aggregate_spec else {})
        if aggregate_spec:
            if matches:
                joined_rows.append(
                    {
                        "join_key": payload.join_key,
                        "join_value": key_value,
                        "left": left_output,
                        "right": matches,
                    }
                )
            continue

        for right_record in matches:
            joined_rows.append(
                {
                    "join_key": payload.join_key,
                    "join_value": key_value,
                    "left": left_output,
                    "right": right_record,
                }
            )

    effective_classification = max(
        [left_decision.classification, right_decision.classification],
        key=lambda item: CLEARANCE_ORDER.index(item),
    )

    if audit:
        write_audit_entry(
            request,
            user,
            datasets_used=[payload.left_dataset, payload.right_dataset],
            outcome="approved",
            access_tier_required=effective_classification,
            masked_fields=left_decision.masked_fields | right_decision.masked_fields,
            record_count_returned=len(joined_rows),
            extra={
                "join_key": payload.join_key,
                "derived_classification": effective_classification,
                "left_filter": payload.left_filter,
                "right_filter": payload.right_filter,
                "right_aggregate": payload.right_aggregate,
            },
        )
    return {
        "left_dataset": payload.left_dataset,
        "right_dataset": payload.right_dataset,
        "join_key": payload.join_key,
        "derived_classification": effective_classification,
        "result_count": len(joined_rows),
        "results": joined_rows,
    }


def execute_scorecard_operation(request: Request, user: UserContext, *, audit: bool = True) -> dict[str, Any]:
    dataset = get_dataset_or_404("scorecard-metrics")
    decision = evaluate_access(dataset, user, action="query")
    if not decision.allowed:
        raise_access_denied(request, user, ["scorecard-metrics"], decision, audit=audit)

    pillars: dict[str, dict[str, Any]] = {}
    for record in dataset["records"]:
        bucket = pillars.setdefault(record["pillar"], {"_scores": [], "indicators": []})
        bucket["_scores"].append(STATUS_SCORE.get(record["status"], 50))
        bucket["indicators"].append(record)

    response: dict[str, Any] = {}
    for pillar, payload in pillars.items():
        score_components = payload.pop("_scores")
        response[pillar] = {
            "score": round(sum(score_components) / max(len(score_components), 1)),
            "indicators": payload["indicators"],
        }

    if audit:
        write_audit_entry(
            request,
            user,
            datasets_used=["scorecard-metrics"],
            outcome="approved",
            access_tier_required=decision.classification,
            record_count_returned=sum(len(item["indicators"]) for item in response.values()),
            extra={"action": "scorecard"},
        )
    return response


def require_access_admin(user: UserContext) -> None:
    if user.department == "public":
        raise HTTPException(status_code=403, detail={"error": "Municipal staff access required"})


def validate_access_update(dataset_id: str, payload: AccessConfigUpdate, user: UserContext) -> None:
    dataset = dataset_templates[dataset_id]
    if not is_owner_or_admin(user, dataset):
        raise HTTPException(
            status_code=403,
            detail={"error": "Only the owner department or an administrator can update this dataset"},
        )

    if payload.sharing_policy not in SHARING_POLICY_OPTIONS:
        raise HTTPException(status_code=400, detail={"error": "Unknown sharing policy"})
    if payload.default_delivery not in DELIVERY_OPTIONS:
        raise HTTPException(status_code=400, detail={"error": "Unknown delivery option"})

    unknown_departments = sorted(set(payload.allowed_departments) - set(DEPARTMENT_DIRECTORY))
    if unknown_departments:
        raise HTTPException(
            status_code=400,
            detail={"error": "Unknown departments", "departments": unknown_departments},
        )

    if payload.sharing_policy == "public" and dataset["classification"] != "open":
        raise HTTPException(
            status_code=400,
            detail={"error": "Only open-classification datasets can be shared publicly"},
        )

    if payload.sharing_policy != "public" and payload.sharing_policy != "municipal_internal" and not payload.allowed_departments:
        raise HTTPException(
            status_code=400,
            detail={"error": "Choose at least one department for non-public sharing"},
        )

    if payload.default_delivery == "summary_only" and payload.sharing_policy in {"public", "municipal_internal"}:
        raise HTTPException(
            status_code=400,
            detail={"error": "Summary-only delivery is intended for selected-department sharing"},
        )


def strip_code_fence(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped)
        stripped = re.sub(r"\s*```$", "", stripped)
    return stripped.strip()


def extract_json_object(text: str) -> dict[str, Any]:
    stripped = strip_code_fence(text)
    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError:
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise NaturalLanguageUnavailableError("Claude did not return valid JSON")
        try:
            parsed = json.loads(stripped[start : end + 1])
        except json.JSONDecodeError as exc:
            raise NaturalLanguageUnavailableError("Claude returned malformed JSON") from exc

    if not isinstance(parsed, dict):
        raise NaturalLanguageUnavailableError("Claude returned an unexpected query-plan shape")
    return parsed


def dataset_summaries_for_prompt() -> list[dict[str, Any]]:
    summaries = []
    for dataset in sorted(datasets.values(), key=lambda item: item["dataset_id"]):
        summaries.append(
            {
                "dataset_id": dataset["dataset_id"],
                "name": dataset["name"],
                "owner_department": dataset["owner_department"],
                "classification": dataset["classification"],
                "share_mode": dataset["share_mode"],
                "spatial_key": dataset.get("spatial_key"),
                "fields": dataset.get("fields", []),
                "permitted_use_cases": dataset.get("permitted_use_cases", []),
            }
        )
    return summaries


def build_natural_query_system_prompt() -> str:
    dataset_json = json.dumps(dataset_summaries_for_prompt(), indent=2)
    return (
        "You translate plain-English municipal data questions into JSON query plans for a FastAPI backend. "
        "Return JSON only with keys: action, params, optional post_filter, optional explanation.\n\n"
        "Supported actions:\n"
        "1. query -> params may include dataset_id, zone_id, ward, parcel_id, bbox, since, aggregate, field, fields.\n"
        "2. join -> params may include left_dataset, right_dataset, join_key, left_fields, right_fields, left_filter, right_filter, right_aggregate.\n\n"
        "Use exact dataset_id values from the schema below. If a filter cannot be expressed directly in params, put it in post_filter using simple comparisons joined by AND or OR, for example capacity_pct > 90 AND permit_type == 'infill'.\n"
        "Prefer exact dataset fields. For ward references, use the human-readable ward strings present in the data, such as 'Ward 6'.\n"
        "For 'how many' questions, use aggregate: 'count' when you can answer without a post_filter.\n"
        "Do not invent datasets or fields.\n\n"
        f"Datasets:\n{dataset_json}"
    )


def request_natural_query_plan(question: str) -> dict[str, Any]:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise NaturalLanguageUnavailableError("ANTHROPIC_API_KEY is not configured")

    try:
        from anthropic import Anthropic
    except ImportError as exc:
        raise NaturalLanguageUnavailableError("Anthropic SDK is not installed") from exc

    client = Anthropic(api_key=api_key)
    try:
        response = client.messages.create(
            model="claude-opus-4-20250514",
            max_tokens=700,
            temperature=0,
            system=build_natural_query_system_prompt(),
            messages=[{"role": "user", "content": question}],
        )
    except Exception as exc:
        raise NaturalLanguageUnavailableError(str(exc)) from exc

    text = "".join(getattr(block, "text", "") for block in response.content if getattr(block, "type", None) == "text")
    return extract_json_object(text)


def infer_datasets_from_query_plan(query_plan: dict[str, Any]) -> list[str]:
    params = query_plan.get("params") or {}
    if query_plan.get("action") == "query":
        dataset_id = params.get("dataset_id")
        return [dataset_id] if dataset_id else []
    if query_plan.get("action") == "join":
        return [dataset_id for dataset_id in [params.get("left_dataset"), params.get("right_dataset")] if dataset_id]
    return []


def describe_query_plan(query_plan: dict[str, Any]) -> str:
    params = query_plan.get("params") or {}
    if query_plan.get("action") == "query":
        dataset_id = params.get("dataset_id", "unknown dataset")
        description = f"I queried {dataset_id}"
        if params.get("ward"):
            description += f" for {params['ward']}"
        if params.get("zone_id"):
            description += f" in zone {params['zone_id']}"
    elif query_plan.get("action") == "join":
        description = (
            f"I joined {params.get('left_dataset', 'unknown dataset')} with {params.get('right_dataset', 'unknown dataset')} "
            f"on {params.get('join_key', 'a shared key')}"
        )
    else:
        description = "I executed the requested analysis"

    if query_plan.get("post_filter"):
        description += f", then filtered the results with {query_plan['post_filter']}"
    return description + "."


def execute_natural_query_plan(query_plan: dict[str, Any], request: Request, user: UserContext) -> tuple[list[str], dict[str, Any]]:
    params = query_plan.get("params")
    action = query_plan.get("action")
    if not isinstance(params, dict) or not isinstance(action, str):
        raise NaturalLanguageUnavailableError("Claude returned an invalid query-plan structure")

    if action == "query":
        dataset_id = params.get("dataset_id")
        if not dataset_id:
            raise NaturalLanguageUnavailableError("Claude did not specify dataset_id for the query action")
        result = execute_dataset_query(
            request,
            user,
            dataset_id=dataset_id,
            zone_id=params.get("zone_id"),
            ward=params.get("ward"),
            parcel_id=params.get("parcel_id"),
            bbox=params.get("bbox"),
            since=params.get("since"),
            aggregate=params.get("aggregate"),
            field=params.get("field"),
            fields=",".join(params["fields"]) if isinstance(params.get("fields"), list) else params.get("fields"),
            audit=False,
        )
        return [dataset_id], result

    if action == "join":
        try:
            join_request = JoinRequest(**params)
        except Exception as exc:
            raise NaturalLanguageUnavailableError("Claude returned an invalid join plan") from exc
        result = execute_join_operation(request, user, join_request, audit=False)
        return [join_request.left_dataset, join_request.right_dataset], result

    raise NaturalLanguageUnavailableError("Claude returned an unsupported action")


def natural_query_unavailable_response(message: str) -> HTTPException:
    return HTTPException(
        status_code=503,
        detail={"error": "natural_language_unavailable", "reason": message},
    )


dataset_templates = load_datasets()
access_config = load_access_config(dataset_templates)
datasets = rebuild_datasets()
audit_log: list[dict[str, Any]] = []
audit_broadcaster = AuditBroadcaster()

app = FastAPI(title="Municipal Data Infrastructure")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def register_audit_loop() -> None:
    audit_broadcaster.loop = asyncio.get_running_loop()


@app.on_event("shutdown")
async def clear_audit_loop() -> None:
    audit_broadcaster.loop = None
    audit_broadcaster.clients.clear()


@app.get("/access-config")
def get_access_config(request: Request, user: UserContext = Depends(get_user_context)) -> dict[str, Any]:
    require_access_admin(user)
    visible_entries = [
        entry
        for entry in access_config.values()
        if user.department == "city_manager" or entry.owner_department == user.department
    ]
    write_audit_entry(
        request,
        user,
        datasets_used=[entry.dataset_id for entry in visible_entries],
        outcome="approved",
        record_count_returned=len(visible_entries),
        extra={"action": "access_config_view"},
    )
    return {
        "sharing_policy_options": SHARING_POLICY_OPTIONS,
        "delivery_options": DELIVERY_OPTIONS,
        "department_options": DEPARTMENT_DIRECTORY,
        "datasets": [entry.model_dump() for entry in visible_entries],
    }


@app.put("/access-config/{dataset_id}")
def update_access_config(
    dataset_id: str,
    payload: AccessConfigUpdate,
    request: Request,
    user: UserContext = Depends(get_user_context),
) -> dict[str, Any]:
    require_access_admin(user)
    if dataset_id not in access_config:
        raise HTTPException(status_code=404, detail={"error": "Dataset not found"})

    validate_access_update(dataset_id, payload, user)
    existing = access_config[dataset_id]
    updated_entry = existing.model_dump()
    updated_entry["sharing_policy"] = payload.sharing_policy
    updated_entry["allowed_departments"] = sorted(set(payload.allowed_departments))
    updated_entry["default_delivery"] = payload.default_delivery
    updated_entry["viewer_note"] = payload.viewer_note.strip()
    access_config[dataset_id] = AccessConfigEntry(**updated_entry)

    save_access_config(access_config)
    datasets.clear()
    datasets.update(rebuild_datasets())

    write_audit_entry(
        request,
        user,
        datasets_used=[dataset_id],
        outcome="approved",
        record_count_returned=1,
        extra={"action": "access_config_update", "payload": payload.model_dump()},
    )
    return {"dataset": access_config[dataset_id].model_dump()}


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/catalog")
def get_catalog(
    request: Request,
    q: str | None = None,
    classification: str | None = None,
    include_unavailable: bool = False,
    user: UserContext = Depends(get_user_context),
) -> dict[str, Any]:
    entries = []
    for dataset in datasets.values():
        decision = evaluate_access(dataset, user, action="catalog")
        if not decision.allowed and not include_unavailable:
            continue

        summary = {
            "dataset_id": dataset["dataset_id"],
            "name": dataset["name"],
            "owner_department": dataset["owner_department"],
            "classification": dataset["classification"],
            "share_mode": dataset["share_mode"],
            "spatial_key": dataset["spatial_key"],
            "last_updated": dataset["last_updated"],
            "quality_score": dataset["quality_score"],
            "fields": dataset["fields"],
            "accessible": decision.allowed,
            "access_mode": decision.access_mode if decision.allowed else "denied",
            "masked_fields": sorted(decision.masked_fields),
            "permitted_use_cases": dataset.get("permitted_use_cases", []),
        }
        entries.append(summary)

    if q:
        search = q.lower()
        entries = [
            entry
            for entry in entries
            if search in entry["name"].lower()
            or search in entry["dataset_id"].lower()
            or any(search in field.lower() for field in entry["fields"])
        ]

    if classification:
        entries = [entry for entry in entries if entry["classification"] == classification]

    write_audit_entry(
        request,
        user,
        datasets_used=[entry["dataset_id"] for entry in entries],
        outcome="approved",
        record_count_returned=len(entries),
        extra={"action": "catalog"},
    )
    return {"count": len(entries), "datasets": entries}


@app.get("/scorecard")
def get_scorecard(request: Request, user: UserContext = Depends(get_user_context)) -> dict[str, Any]:
    return execute_scorecard_operation(request, user)


@app.get("/datasets/{dataset_id}/query")
def query_dataset(
    request: Request,
    dataset_id: str,
    zone_id: str | None = None,
    ward: str | None = None,
    parcel_id: str | None = None,
    bbox: str | None = None,
    since: str | None = None,
    aggregate: str | None = Query(default=None, pattern="^(count|sum|avg)$"),
    field: str | None = None,
    fields: str | None = None,
    user: UserContext = Depends(get_user_context),
) -> dict[str, Any]:
    return execute_dataset_query(
        request,
        user,
        dataset_id=dataset_id,
        zone_id=zone_id,
        ward=ward,
        parcel_id=parcel_id,
        bbox=bbox,
        since=since,
        aggregate=aggregate,
        field=field,
        fields=fields,
    )


@app.post("/join")
def join_datasets(
    request: Request,
    payload: JoinRequest,
    user: UserContext = Depends(get_user_context),
) -> dict[str, Any]:
    return execute_join_operation(request, user, payload)


@app.post("/query/natural")
def query_natural(
    payload: NaturalQueryRequest,
    request: Request,
    user: UserContext = Depends(get_user_context),
) -> dict[str, Any]:
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail={"error": "Question is required"})

    if "internal" not in user.clearances:
        write_audit_entry(
            request,
            user,
            datasets_used=[],
            outcome="denied",
            denial_reason="requires internal clearance",
            access_tier_required="internal",
            extra={"action": "natural_query", "question": question},
        )
        raise HTTPException(
            status_code=403,
            detail={"error": "Access denied", "reason": "requires internal clearance"},
        )

    query_plan: dict[str, Any] | None = None
    datasets_used: list[str] = []
    try:
        query_plan = request_natural_query_plan(question)
        datasets_used, execution_result = execute_natural_query_plan(query_plan, request, user)
        filtered_results, result_count = apply_post_filter(execution_result["results"], query_plan.get("post_filter"))
        explanation = str(query_plan.get("explanation") or describe_query_plan(query_plan))
        write_audit_entry(
            request,
            user,
            datasets_used=datasets_used,
            outcome="approved",
            access_tier_required="internal",
            record_count_returned=result_count,
            extra={
                "action": "natural_query",
                "question": question,
                "query_plan": query_plan,
            },
        )
        return {
            "question": question,
            "query_plan": query_plan,
            "explanation": explanation,
            "result_count": result_count,
            "results": filtered_results,
        }
    except HTTPException as exc:
        if exc.status_code == 403:
            detail = exc.detail if isinstance(exc.detail, dict) else {"error": str(exc.detail)}
            write_audit_entry(
                request,
                user,
                datasets_used=datasets_used or infer_datasets_from_query_plan(query_plan or {}),
                outcome="denied",
                denial_reason=detail.get("reason") or detail.get("error"),
                access_tier_required=detail.get("classification", "internal"),
                extra={
                    "action": "natural_query",
                    "question": question,
                    "query_plan": query_plan,
                },
            )
            raise

        write_audit_entry(
            request,
            user,
            datasets_used=datasets_used or infer_datasets_from_query_plan(query_plan or {}),
            outcome="error",
            denial_reason="generated query plan could not be executed",
            access_tier_required="internal",
            extra={
                "action": "natural_query",
                "question": question,
                "query_plan": query_plan,
                "status_code": exc.status_code,
                "detail": exc.detail,
            },
        )
        raise natural_query_unavailable_response("generated query plan could not be executed")
    except (NaturalLanguageUnavailableError, ValueError) as exc:
        write_audit_entry(
            request,
            user,
            datasets_used=datasets_used or infer_datasets_from_query_plan(query_plan or {}),
            outcome="error",
            denial_reason=str(exc),
            access_tier_required="internal",
            extra={
                "action": "natural_query",
                "question": question,
                "query_plan": query_plan,
            },
        )
        raise natural_query_unavailable_response(str(exc))


@app.get("/audit")
def get_audit_log(request: Request, user: UserContext = Depends(get_user_context)) -> dict[str, Any]:
    if "view_audit" not in user.permissions:
        denial = AccessDecision(
            allowed=False,
            reason="audit log is restricted to governance and administrative users",
            denied_by="permission",
            share_mode="department_only",
            classification="confidential",
        )
        raise_access_denied(request, user, ["audit-log"], denial)

    write_audit_entry(
        request,
        user,
        datasets_used=["audit-log"],
        outcome="approved",
        access_tier_required="confidential",
        record_count_returned=len(audit_log[-50:]),
        extra={"action": "audit_view"},
    )
    return {"count": len(audit_log), "entries": audit_log[-50:]}


@app.websocket("/ws/audit")
async def audit_stream(websocket: WebSocket) -> None:
    await audit_broadcaster.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        audit_broadcaster.disconnect(websocket)
    except Exception:
        audit_broadcaster.disconnect(websocket)
