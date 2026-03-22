export type QueryResult = {
  dataset_id: string;
  result_count: number;
  results: Array<Record<string, unknown>>;
};

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export async function fetchJson<T>(
  path: string,
  role = "eng_staff",
): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${role}` },
      cache: "no-store",
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
