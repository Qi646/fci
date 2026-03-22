export type QueryResult = {
  dataset_id: string;
  result_count: number;
  access_mode?: string;
  masked_fields?: string[];
  results: Array<Record<string, unknown>>;
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
};

export const accessProfiles = {
  publicPortal: { userId: "public_portal", purpose: "public_information" },
  engineering: { userId: "eng_analyst", purpose: "infrastructure_operations" },
  planning: { userId: "planner", purpose: "housing_forecast" },
  publicHealth: { userId: "health_steward", purpose: "outbreak_monitoring" },
  socialServices: { userId: "social_manager", purpose: "service_delivery" },
  transit: { userId: "transit_analyst", purpose: "operations" },
  climate: { userId: "climate_analyst", purpose: "climate_resilience" },
  admin: { userId: "city_admin", purpose: "governance_oversight" },
} satisfies Record<string, AccessContext>;

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
