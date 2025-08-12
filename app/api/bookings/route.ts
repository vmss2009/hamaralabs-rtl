import { NextResponse } from "next/server";


export async function POST(req: Request) {
  const backendBase = process.env.BACKEND_SERVER || "";
  try {
    const body = await req.json();

    const res = await fetch(`${backendBase}/api/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res
      .json()
      .catch(() => ({ message: "Invalid JSON from backend" }));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { message: err?.message || "Failed to create booking" },
      { status: 500 }
    );
  }
}
