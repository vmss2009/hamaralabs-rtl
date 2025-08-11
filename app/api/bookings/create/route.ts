import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const base = process.env.PAYMENT_SERVER;
    const {
      merchantTransactionId,
      merchantId,
      email,
      phone,
      amount,
      items,
      paidBy,
      paymentMethod,
      notes,
      status = "success",
    } = body ?? {};

    const missing = [
      !merchantTransactionId && "merchantTransactionId",
      !merchantId && "merchantId",
      !phone && "phone",
      (amount === undefined || amount === null) && "amount",
    ].filter(Boolean) as string[];

    if (missing.length) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const id = String(merchantTransactionId);
    const ref = adminDb.collection("remoteLabsBookings").doc(id);

    const result = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        return { created: false };
      }
      tx.create(ref, {
        merchantTransactionId: id,
        merchantId: String(merchantId),
        email: String(email || ""),
        phone: String(phone),
        amount: Number(amount),
        status: String(status),
        items: Array.isArray(items) ? items : [],
        paidBy: paidBy ?? "",
        paymentMethod: paymentMethod ?? "",
        notes: notes ?? "",

      });
      await fetch(`${base}/phoneCall/call`);
      return { created: true };
    });

    return NextResponse.json(
      { ok: true, id, created: result.created },
      { status: result.created ? 201 : 200 }
    );
  } catch (err) {
    console.error("Create booking error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}