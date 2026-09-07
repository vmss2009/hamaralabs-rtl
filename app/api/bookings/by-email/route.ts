import { NextResponse } from "next/server";
import { flattenBookings, type Slot } from "@/lib/bookings";

// Looks up every booking tied to an email (across all of that email's paid
// slots) and logs them server-side — used when the slot booking page is
// entered so support/debugging has visibility into a customer's history.
export async function GET(req: Request) {
  const backendBase = process.env.BACKEND_SERVER || "";
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");
    if (!email) {
      return NextResponse.json({ message: "email is required" }, { status: 400 });
    }

    const res = await fetch(
      `${backendBase}/api/slots/by-email?email=${encodeURIComponent(email)}`,
      {
        method: "GET",
        headers: { "X-Api-Key": process.env.BACKEND_API_KEY || "" },
        cache: "no-store",
      }
    );

    const { data } = res.ok ? await res.json().catch(() => ({ data: [] })) : { data: [] };
    const slots: Slot[] = Array.isArray(data) ? data : [];
    const bookings = flattenBookings(slots);


    return NextResponse.json({ bookings });
  } catch (err: any) {
    return NextResponse.json(
      { message: err?.message || "Failed to fetch bookings" },
      { status: 500 }
    );
  }
}
