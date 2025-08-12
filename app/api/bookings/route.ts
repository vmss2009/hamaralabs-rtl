import { NextResponse } from "next/server";


export async function POST(req: Request) {
  const backendBase = process.env.BACKEND_SERVER || "";
  try {
    const body = await req.json();
    // Optional: idempotency check if merchantTransactionId is passed
    const mtx = body?.merchantTransactionId;
    if (mtx) {
      try {
        const checkRes = await fetch(
          `${backendBase}/api/bookings?merchantTransactionId=${encodeURIComponent(String(mtx))}`,
          { method: "GET", headers: { "content-type": "application/json" } }
        );
        if (checkRes.ok) {
          const existing = await checkRes.json().catch(() => null);
          const hasAny = Array.isArray(existing?.bookings)
            ? existing.bookings.length > 0
            : Array.isArray(existing)
            ? existing.length > 0
            : !!existing?.id;
          if (hasAny) {
            return NextResponse.json(
              { message: "Booking already exists for this merchantTransactionId" },
              { status: 409 }
            );
          }
        }
      } catch {
        // ignore errors and proceed
      }
    }

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
