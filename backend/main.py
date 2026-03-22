from __future__ import annotations

from copy import deepcopy
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
ACCESS_CONFIG_PATH = BASE_DIR / "access_config.json"

DATASET_FILES = [
    "eng_pressure_zones.json",
    "plan_permits_2024.json",
    "health_cases.json",
    "transit_gtfs_stops.json",
    "social_services_demographics.json",
    "climate_risk_overlays.json",
]

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


dataset_templates = load_datasets()
access_config = load_access_config(dataset_templates)
datasets = rebuild_datasets()
audit_log: list[dict[str, Any]] = []

app = FastAPI(title="Municipal Data Infrastructure")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


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
        raise HTTPException(status_code=404, detail="Dataset not found")
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


def apply_field_masks(record: dict[str, Any], masked_fields: set[str]) -> dict[str, Any]:
    if not masked_fields:
        return record
    return {key: value for key, value in record.items() if key not in masked_fields}


def filter_record_fields(record: dict[str, Any], fields: list[str] | None) -> dict[str, Any]:
    if not fields:
        return record
    return {field: record[field] for field in fields if field in record}


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
    audit_log.append(
        {
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
    )


def raise_access_denied(
    request: Request,
    user: UserContext,
    dataset_ids: list[str],
    decision: AccessDecision,
) -> None:
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
    raise HTTPException(
        status_code=403,
        detail={
            "error": "Access denied",
            "datasets": dataset_ids,
            "reason": decision.reason,
            "denied_by": decision.denied_by,
            "share_mode": decision.share_mode,
            "classification": decision.classification,
            "access_mode": decision.access_mode,
        },
    )


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

    if payload.sharing_policy != "public" and not payload.allowed_departments:
        raise HTTPException(
            status_code=400,
            detail={"error": "Choose at least one department for non-public sharing"},
        )

    if payload.default_delivery == "summary_only" and payload.sharing_policy in {"public", "municipal_internal"}:
        raise HTTPException(
            status_code=400,
            detail={"error": "Summary-only delivery is intended for selected-department sharing"},
        )


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


@app.get("/datasets/{dataset_id}/query")
def query_dataset(
    request: Request,
    dataset_id: str,
    zone_id: str | None = None,
    ward: str | None = None,
    aggregate: str | None = Query(default=None, pattern="^(count|sum|avg)$"),
    field: str | None = None,
    fields: str | None = None,
    user: UserContext = Depends(get_user_context),
) -> dict[str, Any]:
    dataset = get_dataset_or_404(dataset_id)
    decision = evaluate_access(dataset, user, action="query", is_aggregate=bool(aggregate))
    if not decision.allowed:
        raise_access_denied(request, user, [dataset_id], decision)

    records = list(dataset["records"])
    if zone_id:
        records = [record for record in records if record.get("zone_id") == zone_id]
    if ward:
        records = [record for record in records if record.get("ward") == ward]

    field_list = [item.strip() for item in fields.split(",")] if fields else None
    masked_fields = set(decision.masked_fields)

    if aggregate:
        safe_records = [apply_field_masks(record, masked_fields) for record in records]
        if aggregate == "count":
            results: Any = {"value": len(safe_records)}
        else:
            metric_field = field or "units"
            numeric_values = [
                value
                for value in (record.get(metric_field) for record in safe_records)
                if isinstance(value, (int, float))
            ]
            aggregate_value = 0 if not numeric_values else sum(numeric_values)
            if aggregate == "avg" and numeric_values:
                aggregate_value = aggregate_value / len(numeric_values)
            results = {"field": metric_field, "value": aggregate_value}
    else:
        results = [filter_record_fields(record, field_list) for record in records]
        results = [apply_field_masks(record, masked_fields) for record in results]

    result_count = 1 if isinstance(results, dict) else len(results)
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
        },
    )
    return {
        "dataset_id": dataset_id,
        "result_count": result_count,
        "access_mode": decision.access_mode,
        "masked_fields": sorted(masked_fields),
        "results": results,
    }


@app.post("/join")
def join_datasets(
    request: Request,
    payload: JoinRequest,
    user: UserContext = Depends(get_user_context),
) -> dict[str, Any]:
    left = get_dataset_or_404(payload.left_dataset)
    right = get_dataset_or_404(payload.right_dataset)
    left_decision = evaluate_access(left, user, action="join")
    if not left_decision.allowed:
        raise_access_denied(request, user, [payload.left_dataset], left_decision)
    right_decision = evaluate_access(right, user, action="join")
    if not right_decision.allowed:
        raise_access_denied(request, user, [payload.right_dataset], right_decision)

    right_index: dict[Any, list[dict[str, Any]]] = {}
    for record in right["records"]:
        filtered = filter_record_fields(record, payload.right_fields)
        right_index.setdefault(record.get(payload.join_key), []).append(
            apply_field_masks(filtered, right_decision.masked_fields)
        )

    joined_rows = []
    for left_record in left["records"]:
        key_value = left_record.get(payload.join_key)
        matches = right_index.get(key_value, [])
        for right_record in matches:
            joined_rows.append(
                {
                    "join_key": payload.join_key,
                    "join_value": key_value,
                    "left": apply_field_masks(
                        filter_record_fields(left_record, payload.left_fields),
                        left_decision.masked_fields,
                    ),
                    "right": right_record,
                }
            )

    effective_classification = max(
        [left_decision.classification, right_decision.classification],
        key=lambda item: ["open", "internal", "confidential", "personal_sensitive", "health_sensitive"].index(item),
    )
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
