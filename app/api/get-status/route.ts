import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { merchantTransactionId, merchantId } = await req.json();

    if (!merchantTransactionId || !merchantId) {
      return NextResponse.json(
        { error: "Missing required parameters: merchantTransactionId, merchantId" },
        { status: 400 }
      );
    }

    const base = process.env.PAYMENT_SERVER;
    if (!base) {
      return NextResponse.json(
        { error: "PAYMENT_SERVER is not configured on the server" },
        { status: 500 }
      );
    }

    const upstream = await fetch(`${base}/paymentIntegration/getStatus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantTransactionId, merchantId }),
      cache: "no-store",
    });

    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, {
      status: upstream.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("getStatus route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}