import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

type Context = {
  params: Promise<{ datasetId: string }>;
};

export async function PUT(request: NextRequest, context: Context) {
  const { datasetId } = await context.params;
  const response = await fetch(`${API_BASE}/access-config/${datasetId}`, {
    method: "PUT",
    headers: forwardHeaders(request),
    body: await request.text(),
    cache: "no-store",
  });

  return NextResponse.json(await response.json(), { status: response.status });
}

function forwardHeaders(request: NextRequest) {
  return {
    Authorization: request.headers.get("authorization") ?? "",
    "X-User-Id": request.headers.get("x-user-id") ?? "",
    "X-Purpose": request.headers.get("x-purpose") ?? "",
    "Content-Type": "application/json",
  };
}
