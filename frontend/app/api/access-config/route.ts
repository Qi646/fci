import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export async function GET(request: NextRequest) {
  const response = await fetch(`${API_BASE}/access-config`, {
    headers: forwardHeaders(request),
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
