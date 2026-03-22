from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"

ROLE_ACCESS = {
    "public": {"open"},
    "eng_staff": {"open", "internal"},
    "plan_staff": {"open", "internal"},
    "health_steward": {"open", "internal", "restricted"},
    "admin": {"open", "internal", "restricted", "confidential"},
}

DATASET_FILES = [
    "eng_pressure_zones.json",
    "plan_permits_2024.json",
    "health_cases.json",
    "transit_gtfs_stops.json",
    "social_services_demographics.json",
    "climate_risk_overlays.json",
]


class UserContext(BaseModel):
    role: str
    allowed_tiers: set[str]


class JoinRequest(BaseModel):
    left_dataset: str
    right_dataset: str
    join_key: str
    left_fields: list[str] | None = None
    right_fields: list[str] | None = None


def load_datasets() -> dict[str, dict[str, Any]]:
    loaded: dict[str, dict[str, Any]] = {}
    for file_name in DATASET_FILES:
        payload = json.loads((DATA_DIR / file_name).read_text())
        loaded[payload["dataset_id"]] = payload
    return loaded


datasets = load_datasets()
audit_log: list[dict[str, Any]] = []

app = FastAPI(title="Municipal Data Infrastructure")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def log_audit(action: str, role: str, details: dict[str, Any]) -> None:
    audit_log.append(
        {
            "action": action,
            "role": role,
            "details": details,
        }
    )


def get_user_context(authorization: str | None = Header(default=None)) -> UserContext:
    raw_role = (authorization or "").removeprefix("Bearer ").strip()
    role = raw_role or "public"
    return UserContext(role=role, allowed_tiers=ROLE_ACCESS.get(role, {"open"}))


def get_dataset_or_404(dataset_id: str) -> dict[str, Any]:
    dataset = datasets.get(dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


def require_tier(dataset: dict[str, Any], user: UserContext) -> None:
    dataset_tier = dataset["access_tier"]
    if dataset_tier not in user.allowed_tiers:
        log_audit(
            "blocked",
            user.role,
            {"dataset": dataset["dataset_id"], "reason": f"requires {dataset_tier} access"},
        )
        raise HTTPException(
            status_code=403,
            detail={
                "error": "Access denied",
                "dataset": dataset["dataset_id"],
                "required_tier": dataset_tier,
                "role": user.role,
            },
        )


def filter_record_fields(record: dict[str, Any], fields: list[str] | None) -> dict[str, Any]:
    if not fields:
        return record
    return {field: record[field] for field in fields if field in record}


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/catalog")
def get_catalog(
    q: str | None = None,
    tier: str | None = None,
    user: UserContext = Depends(get_user_context),
) -> dict[str, Any]:
    entries = []
    for dataset in datasets.values():
        summary = {
            "dataset_id": dataset["dataset_id"],
            "name": dataset["name"],
            "owner_dept": dataset["owner_dept"],
            "access_tier": dataset["access_tier"],
            "spatial_key": dataset["spatial_key"],
            "last_updated": dataset["last_updated"],
            "quality_score": dataset["quality_score"],
            "fields": dataset["fields"],
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

    if tier:
        entries = [entry for entry in entries if entry["access_tier"] == tier]

    log_audit("catalog", user.role, {"query": {"q": q, "tier": tier}, "count": len(entries)})
    return {"count": len(entries), "datasets": entries}


@app.get("/datasets/{dataset_id}/query")
def query_dataset(
    dataset_id: str,
    zone_id: str | None = None,
    ward: str | None = None,
    aggregate: str | None = Query(default=None, pattern="^(count|sum|avg)$"),
    field: str | None = None,
    fields: str | None = None,
    user: UserContext = Depends(get_user_context),
) -> dict[str, Any]:
    dataset = get_dataset_or_404(dataset_id)
    require_tier(dataset, user)

    records = list(dataset["records"])
    if zone_id:
        records = [record for record in records if record.get("zone_id") == zone_id]
    if ward:
        records = [record for record in records if record.get("ward") == ward]

    field_list = [item.strip() for item in fields.split(",")] if fields else None
    pii_fields = set(dataset.get("pii_fields", []))

    if aggregate:
        safe_records = [{k: v for k, v in record.items() if k not in pii_fields} for record in records]
        if aggregate == "count":
            results: Any = {"value": len(safe_records)}
        else:
            metric_field = field or "units"
            numeric_values = [
                value
                for value in (record.get(metric_field) for record in safe_records)
                if isinstance(value, (int, float))
            ]
            value = 0 if not numeric_values else sum(numeric_values)
            if aggregate == "avg" and numeric_values:
                value = value / len(numeric_values)
            results = {"field": metric_field, "value": value}
    else:
        results = [filter_record_fields(record, field_list) for record in records]
        if user.allowed_tiers.isdisjoint({"restricted", "confidential"}) and pii_fields:
            results = [
                {key: value for key, value in record.items() if key not in pii_fields}
                for record in results
            ]

    result_count = 1 if isinstance(results, dict) else len(results)
    log_audit(
        "query",
        user.role,
        {
            "dataset": dataset_id,
            "zone_id": zone_id,
            "ward": ward,
            "aggregate": aggregate,
            "result_count": result_count,
        },
    )
    return {"dataset_id": dataset_id, "result_count": result_count, "results": results}


@app.post("/join")
def join_datasets(payload: JoinRequest, user: UserContext = Depends(get_user_context)) -> dict[str, Any]:
    left = get_dataset_or_404(payload.left_dataset)
    right = get_dataset_or_404(payload.right_dataset)
    require_tier(left, user)
    require_tier(right, user)

    right_index: dict[Any, list[dict[str, Any]]] = {}
    for record in right["records"]:
        right_index.setdefault(record.get(payload.join_key), []).append(record)

    joined_rows = []
    for left_record in left["records"]:
        key_value = left_record.get(payload.join_key)
        matches = right_index.get(key_value, [])
        for right_record in matches:
            joined_rows.append(
                {
                    "join_key": payload.join_key,
                    "join_value": key_value,
                    "left": filter_record_fields(left_record, payload.left_fields),
                    "right": filter_record_fields(right_record, payload.right_fields),
                }
            )

    log_audit(
        "join",
        user.role,
        {
            "left_dataset": payload.left_dataset,
            "right_dataset": payload.right_dataset,
            "join_key": payload.join_key,
            "result_count": len(joined_rows),
        },
    )
    return {
        "left_dataset": payload.left_dataset,
        "right_dataset": payload.right_dataset,
        "join_key": payload.join_key,
        "result_count": len(joined_rows),
        "results": joined_rows,
    }


@app.get("/audit")
def get_audit_log(user: UserContext = Depends(get_user_context)) -> dict[str, Any]:
    log_audit("audit_view", user.role, {"count": len(audit_log)})
    return {"count": len(audit_log), "entries": audit_log[-50:]}
