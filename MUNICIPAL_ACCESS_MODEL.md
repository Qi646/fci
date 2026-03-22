# Municipal Access Control Model

This document defines a production-oriented access control design for a federated municipal data platform.

It replaces the current demo assumption of "role maps directly to tier" with a model that municipalities can defend operationally, legally, and politically.

## 1. Design Goal

The platform should allow:

- departments to retain ownership of their own datasets
- departments to share approved data with other departments
- departments to choose which approved datasets appear in their working views
- the municipality to enforce non-negotiable policy around privacy, legal authority, audit, and least privilege

The platform should not allow:

- arbitrary department-defined security rules
- unlimited lateral sharing once one department gains access
- access based only on a user-declared role string
- raw access to sensitive data when aggregated or masked access would satisfy the need

## 2. Recommended Governance Model

Use a federated governance model with central enforcement.

- Dataset owner: the department that owns the source dataset
- Data steward: the person or office authorized to approve sharing for that dataset
- Consumer department: a department requesting access to use a dataset
- Central policy authority: municipal privacy, legal, security, or enterprise data governance function

Decision split:

- Owners decide whether to publish or share a dataset within approved policy options
- Consumer departments decide which approved datasets they want included in their dashboards, workflows, and analyses
- Central policy decides what is legally and operationally allowed
- The platform enforces the final decision and records all access

This gives departments autonomy without letting each one invent its own security regime.

## 3. Core Policy Principles

### 3.1 Deny by default

No dataset is visible or queryable unless an explicit rule grants access.

### 3.2 Least privilege

Grant the minimum data needed for the job:

- aggregate before row-level
- masked before raw
- specific fields before full record
- time-limited access before standing access

### 3.3 Purpose limitation

Access should be approved for a defined purpose such as:

- service delivery
- planning and forecasting
- operations
- reporting
- emergency response

The same department may have different rights for different purposes.

### 3.4 Ownership with guardrails

Departments own their data and can propose sharing, but only within centrally approved sharing modes.

### 3.5 No onward sharing by consumers

A department that receives access cannot automatically re-share that dataset to another department.

### 3.6 Audit and review

All access decisions and data reads should be auditable. Access grants should be periodically reviewed and revocable.

## 4. Access Model

For municipalities, pure RBAC is too weak by itself. Use a hybrid of:

- RBAC for broad responsibility
- ABAC for context and policy
- dataset-level sharing rules

### 4.1 Subject attributes

Each user or service account should have attributes such as:

- user_id
- department
- role
- steward status
- employment status
- clearance or sensitivity approval
- project or case membership
- approved purposes of use

### 4.2 Resource attributes

Each dataset should have attributes such as:

- dataset_id
- owner_department
- steward_id or steward_group
- classification
- contains_personal_information
- contains_health_information
- permitted_use_cases
- share_mode
- allowed_consumer_departments
- row_filter_rules
- field_mask_rules
- retention_requirements

### 4.3 Environment attributes

Access decisions may also depend on:

- request time
- emergency mode
- user device trust level
- network location
- incident state

## 5. Approved Sharing Modes

Departments should choose from a small approved menu rather than inventing bespoke rules.

Recommended share modes:

1. `open`
Publicly releasable data.

2. `municipal_internal`
Available to authenticated municipal staff across departments for normal internal use.

3. `department_only`
Only the owner department and its stewards may access.

4. `approved_department_access`
Visible only to explicitly approved consumer departments.

5. `approved_purpose_access`
Visible only for approved departments and approved purposes.

6. `restricted_row_or_field_access`
Accessible only with row filters, field masking, aggregation, or both.

7. `emergency_only`
Accessible only under declared emergency conditions with elevated audit.

This is the key shift from the current prototype. The owner selects the share mode, but the platform defines what each mode means.

## 6. Data Classification

Use classification to constrain what share modes are allowed.

Recommended classes:

- `open`
- `internal`
- `confidential`
- `personal`
- `personal_sensitive`
- `health_sensitive`

Example constraints:

- `open` may be published publicly
- `internal` may use `municipal_internal`
- `confidential` should never be public and may require explicit department approval
- `personal_sensitive` should usually require masking, aggregation, or case-based access
- `health_sensitive` should require steward approval, strong audit, and strict purpose limitation

This matters because municipal departments should not be able to override legal handling requirements for regulated data.

## 7. Policy Decision Logic

Recommended evaluation order:

1. Authenticate the caller
2. Load user attributes
3. Load dataset metadata and classification
4. Verify the dataset exists
5. Check that the requester's department is permitted by the dataset's sharing rule
6. Check purpose-of-use
7. Apply central policy constraints for the dataset classification
8. Apply row filters and field masks
9. Log the decision and query details
10. Return only the permitted data shape

Pseudo-logic:

```text
if not authenticated:
  deny

dataset = load_dataset(dataset_id)
user = load_user_context()

if not policy.allows_department(user.department, dataset):
  deny

if not policy.allows_role(user.role, dataset):
  deny

if not policy.allows_purpose(user.requested_purpose, dataset):
  deny

if dataset.classification in sensitive_classes:
  require_additional_constraints()

records = load_records(dataset)
records = apply_row_filters(records, user, dataset)
records = apply_field_masks(records, user, dataset)

audit(decision="allow", user=user, dataset=dataset)
return records
```

## 8. Join Rules

Joins are where municipalities get into trouble if policy is weak.

Recommended join rules:

- the requester must independently qualify for both datasets
- the effective policy is the stricter of the two datasets
- if either dataset is sensitive, join output must be evaluated as a new derived dataset
- joins involving personal or health-sensitive data should usually return aggregated output unless explicit raw access is approved
- join outputs should inherit lineage metadata for audit and downstream control

This prevents a user from inferring restricted facts by combining separately approved datasets.

## 9. Recommended Data Structures

The current code stores only `access_tier` on datasets and derives access from `role`.

For production, add dataset metadata like:

```json
{
  "dataset_id": "health-cases",
  "owner_department": "public_health",
  "classification": "health_sensitive",
  "share_mode": "approved_purpose_access",
  "allowed_consumer_departments": ["public_health", "planning"],
  "permitted_use_cases": ["service_planning", "outbreak_monitoring"],
  "field_mask_rules": {
    "default": ["patient_name", "dob", "address"],
    "steward_override_roles": ["health_steward"]
  },
  "row_filter_rules": [
    {
      "consumer_department": "planning",
      "condition": "aggregate_only"
    }
  ],
  "join_policy": {
    "allow_cross_department_join": true,
    "allow_raw_row_output": false
  }
}
```

User context should also move beyond a single bearer role string:

```json
{
  "user_id": "u-1042",
  "department": "planning",
  "role": "planner",
  "approved_purposes": ["service_planning", "housing_forecast"],
  "clearances": ["internal"],
  "groups": ["ward-capacity-project"]
}
```

## 10. What This Means For The Current Codebase

The current backend in [backend/main.py](/home/qi/proj/fci/backend/main.py) is a demo-only RBAC layer:

- role comes directly from `Authorization: Bearer <role>`
- unknown roles fall back to open access
- access is checked only against `dataset.access_tier`
- no owner department approval is modeled
- no purpose-of-use is modeled
- no department attribute is modeled
- joins only verify tier access to both datasets
- audit logging is in-memory and minimal

That is acceptable for a prototype demo. It is not sufficient for municipal production use.

## 11. Migration Path From Current Prototype

Implement in this order:

### Phase 1: replace demo identity assumptions

- require real authentication
- resolve user identity to department, role, and purpose attributes
- reject unknown users and unknown roles instead of silently treating them as `open`

### Phase 2: enrich dataset metadata

- add `owner_department`
- add `classification`
- add `share_mode`
- add `allowed_consumer_departments`
- add `permitted_use_cases`
- add field masking and row filter metadata

### Phase 3: centralize policy evaluation

- replace `require_tier(...)` with a policy engine function
- evaluate department, purpose, classification, and share mode together
- return structured denial reasons for audit and UX

### Phase 4: harden joins and derived outputs

- compute effective policy across all source datasets
- classify derived datasets
- support aggregate-only outputs where required

### Phase 5: real audit and access review

- persist audit logs
- record who accessed what, for what purpose, and what filters were applied
- add grant review and revocation workflows

## 12. Recommended Product Language

Use this framing in the product and documentation:

"Departments retain ownership of their datasets. They can share data with other departments using approved municipal sharing modes. Departments can build views from datasets they are entitled to use. The platform centrally enforces privacy, security, legal, and audit policy."

Avoid this framing:

"Each department decides its own access control rules."

That statement sounds attractive, but it is too loose for a real municipality.

## 13. Bottom Line

Your instinct is directionally correct:

- owner-managed sharing is good
- consumer-selected views are good
- federated data governance is good

But for real municipal use, the correct design is:

- local ownership
- central guardrails
- explicit sharing agreements
- attribute-based enforcement
- field and row-level protection
- strong auditability

That is the model this project should grow toward.
