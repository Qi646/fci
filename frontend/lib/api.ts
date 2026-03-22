export type QueryResult = {
  dataset_id: string;
  result_count: number;
  access_mode?: string;
  masked_fields?: string[];
  results: Array<Record<string, unknown>>;
};

export type ApiError = {
  error?: string;
  reason?: string;
  denied_by?: string;
  share_mode?: string;
  classification?: string;
  access_mode?: string;
};

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ApiError | null };

export type CatalogDataset = {
  dataset_id: string;
  name: string;
  owner_department: string;
  classification: string;
  share_mode: string;
  spatial_key: string;
  last_updated: string;
  quality_score: number;
  fields: string[];
  accessible: boolean;
  access_mode: string;
  masked_fields: string[];
  permitted_use_cases: string[];
};

export type CatalogResponse = {
  count: number;
  datasets: CatalogDataset[];
};

export type AccessConfigDataset = {
  dataset_id: string;
  dataset_name: string;
  owner_department: string;
  classification: string;
  sharing_policy: string;
  allowed_departments: string[];
  default_delivery: string;
  viewer_note: string;
};

export type AccessConfigResponse = {
  sharing_policy_options: Record<string, string>;
  delivery_options: Record<string, string>;
  department_options: Record<string, string>;
  datasets: AccessConfigDataset[];
};

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export type AccessContext = {
  userId: string;
  purpose?: string;
  label?: string;
  department?: string;
  role?: string;
  approvedPurposes?: string[];
};

export const accessProfiles = {
  publicPortal: {
    userId: "public_portal",
    purpose: "public_information",
    label: "Public Portal",
    department: "public",
    role: "public_user",
    approvedPurposes: ["public_information"],
  },
  engineering: {
    userId: "eng_analyst",
    purpose: "infrastructure_operations",
    label: "Engineering Analyst",
    department: "engineering",
    role: "engineer",
    approvedPurposes: ["infrastructure_operations", "capital_planning", "service_planning"],
  },
  planning: {
    userId: "planner",
    purpose: "housing_forecast",
    label: "Planning Analyst",
    department: "planning",
    role: "planner",
    approvedPurposes: ["service_planning", "housing_forecast"],
  },
  publicHealth: {
    userId: "health_steward",
    purpose: "outbreak_monitoring",
    label: "Health Steward",
    department: "public_health",
    role: "health_steward",
    approvedPurposes: ["outbreak_monitoring", "service_planning"],
  },
  socialServices: {
    userId: "social_manager",
    purpose: "service_delivery",
    label: "Social Services Manager",
    department: "social_services",
    role: "social_manager",
    approvedPurposes: ["service_delivery", "service_planning"],
  },
  transit: {
    userId: "transit_analyst",
    purpose: "operations",
    label: "Transit Analyst",
    department: "transit",
    role: "transit_analyst",
    approvedPurposes: ["public_information", "service_planning", "operations"],
  },
  climate: {
    userId: "climate_analyst",
    purpose: "climate_resilience",
    label: "Climate Analyst",
    department: "climate",
    role: "climate_analyst",
    approvedPurposes: ["public_information", "climate_resilience", "service_planning"],
  },
  admin: {
    userId: "city_admin",
    purpose: "governance_oversight",
    label: "City Administrator",
    department: "city_manager",
    role: "city_admin",
    approvedPurposes: [
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
    ],
  },
} satisfies Record<string, AccessContext>;

export const purposeLabels: Record<string, string> = {
  public_information: "Public information",
  infrastructure_operations: "Infrastructure operations",
  capital_planning: "Capital planning",
  service_planning: "Service planning",
  housing_forecast: "Housing forecast",
  outbreak_monitoring: "Outbreak monitoring",
  service_delivery: "Service delivery",
  climate_resilience: "Climate resilience",
  operations: "Operations",
  governance_oversight: "Governance oversight",
};

export async function fetchJson<T>(
  path: string,
  context: AccessContext = accessProfiles.engineering,
): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE}${path}`, buildRequestInit(context));
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchApi<T>(
  path: string,
  context: AccessContext = accessProfiles.engineering,
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, buildRequestInit(context));
    const payload = (await response.json().catch(() => null)) as T | ApiError | null;
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: (payload as ApiError | null) ?? null,
      };
    }
    return { ok: true, status: response.status, data: payload as T };
  } catch {
    return {
      ok: false,
      status: 0,
      error: { error: "Could not reach the backend service." },
    };
  }
}

export async function sendJson<T>(
  path: string,
  context: AccessContext,
  method: "PUT" | "POST",
  body: unknown,
): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...buildRequestInit(context),
      method,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function asRecords(payload: QueryResult | null) {
  return (payload?.results ?? []) as Array<Record<string, unknown>>;
}

export function withPurpose(context: AccessContext, purpose: string): AccessContext {
  return { ...context, purpose };
}

function buildRequestInit(context: AccessContext): RequestInit {
  return {
    headers: {
      Authorization: `Bearer ${context.userId}`,
      "X-User-Id": context.userId,
      "X-Purpose": context.purpose ?? "",
      "Content-Type": "application/json",
    },
    cache: "no-store",
  };
}
