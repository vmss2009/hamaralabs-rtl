import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const backendBase = process.env.BACKEND_SERVER || "";
  try {
    const body = await req.json();
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    // Forward cookies/authorization if present (useful when backend needs session)
    const cookie = req.headers.get("cookie");
    if (cookie) headers["cookie"] = cookie;
    const auth = req.headers.get("authorization");
    if (auth) headers["authorization"] = auth;

  const res = await fetch(`${backendBase}/api/slots`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const data = await res
      .json()
      .catch(() => ({ message: "Invalid JSON from backend" }));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { message: err?.message || "Failed to create slot" },
      { status: 500 }
    );
  }
}
