import { NextResponse } from "next/server";

export async function GET() {
  try {
    const base = process.env.PAYMENT_SERVER;
    if (!base) {
      return NextResponse.json(
        { error: "PAYMENT_SERVER is not configured on the server" },
        { status: 500 }
      );
    }

    // Upstream looks like it was called via GET in your code.
    const upstream = await fetch(`${base}/phoneCall/call`, {
      method: "GET",
      cache: "no-store",
    });

    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, {
      status: upstream.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("phoneCall route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}