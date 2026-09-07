import { NextResponse } from "next/server";

// The backend's GET /api/slots ignores query filters entirely and always
// returns its full paginated list ({ data, total, skip, take }), so a
// merchantTransactionId match has to be done here, over the full list.
function extractSlots(raw: any): any[] {
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.slots)) return raw.slots;
  if (Array.isArray(raw)) return raw;
  if (raw?.id) return [raw];
  return [];
}

function findSlotByTransactionId(raw: any, mtx: string): any | null {
  return extractSlots(raw).find((s) => s?.merchantTransactionId === mtx) ?? null;
}

// Look up the slot (payment record) for a merchantTransactionId. Used before
// showing slot selection so we know whether one needs to be created.
export async function GET(req: Request) {
  const backendBase = process.env.BACKEND_SERVER || "";
  try {
    const { searchParams } = new URL(req.url);
    const mtx = searchParams.get("merchantTransactionId");
    if (!mtx) {
      return NextResponse.json(
        { message: "merchantTransactionId is required" },
        { status: 400 }
      );
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
      "X-Api-Key": process.env.BACKEND_API_KEY || "",
    };
    const cookie = req.headers.get("cookie");
    if (cookie) headers["cookie"] = cookie;
    const auth = req.headers.get("authorization");
    if (auth) headers["authorization"] = auth;

    const res = await fetch(`${backendBase}/api/slots`, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ slot: null });
    }
    const data = await res.json().catch(() => null);
    return NextResponse.json({ slot: findSlotByTransactionId(data, mtx) });
  } catch (err: any) {
    return NextResponse.json(
      { message: err?.message || "Failed to fetch slot" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const backendBase = process.env.BACKEND_SERVER || "";
  try {
  const body = await req.json();
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "X-Api-Key": process.env.BACKEND_API_KEY || "",
    };
    // Forward cookies/authorization if present (useful when backend needs session)
    const cookie = req.headers.get("cookie");
    if (cookie) headers["cookie"] = cookie;
    const auth = req.headers.get("authorization");
    if (auth) headers["authorization"] = auth;

    // If merchantTransactionId is present, check if a slot already exists for idempotency
    const mtx = body?.merchantTransactionId;
    if (mtx) {
      try {
        const checkRes = await fetch(`${backendBase}/api/slots`, {
          method: "GET",
          headers,
        });
        if (checkRes.ok) {
          const existing = await checkRes.json().catch(() => null);
          if (findSlotByTransactionId(existing, String(mtx))) {
            // Return 409 Conflict without throwing so the client can treat it as processed
            return NextResponse.json(
              { message: "Slot already exists for this merchantTransactionId" },
              { status: 409 }
            );
          }
        }
      } catch {
        // Ignore check errors and proceed to creation
      }
    }

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
