"use client";

import { useMemo, useState } from "react";

const AMOUNT = 1;

export default function BuyPage() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("+91 ");
  const [submitting, setSubmitting] = useState(false);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const paymentPortal = process.env.NEXT_PUBLIC_PAYMENT_PORTAL;
  const merchantId = "${merchantId}";

  const merchantTransactionId = useMemo(() => `MT${Date.now()}`, []);
  const merchantUserId = useMemo(() => `MUI${Date.now()}`, []);
  const docId = useMemo(() => `BOOK${Date.now()}`, []);

  const onBuyClick = () => setOpen(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      alert("Phone number is required.");
      return;
    }
    if (!merchantId) {
      alert("Missing NEXT_PUBLIC_MERCHANT_ID");
      return;
    }
    if (!siteUrl) {
      alert("Missing NEXT_PUBLIC_SITE_URL");
      return;
    }

    setSubmitting(true);

    if (typeof window !== "undefined") {
      sessionStorage.setItem(
        "bookingPayload",
        JSON.stringify({
          email,
          phone,
          amount: AMOUNT,
          docId,
          merchantId,
          merchantTransactionId,
        })
      );
    }

    const redirectUrl =
      `${siteUrl}/payments?amount=${AMOUNT}` +
      `&docId=${encodeURIComponent(docId)}` +
      `&merchantTransactionId=${encodeURIComponent(merchantTransactionId)}` +
      `&merchantId=${merchantId}` +
      `&email=${encodeURIComponent(email)}` +
      `&phone=${encodeURIComponent(phone)}`;

    const checkoutUrl =
      `${paymentPortal}/payment/checkout` +
      `?amount=${AMOUNT}` +
      `&merchantTransactionId=${encodeURIComponent(merchantTransactionId)}` +
      `&merchantUserId=${encodeURIComponent(merchantUserId)}` +
      `&redirectUrl=${encodeURIComponent(redirectUrl)}`;

    window.location.href = checkoutUrl;
  };

  return (
    <section className="py-10">
      <div className="mx-auto max-w-2xl rounded-3xl border border-[var(--foreground)]/10 bg-[var(--background)] p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-[var(--foreground)]/10">
            <svg viewBox="0 0 24 24" fill="none" className="size-5">
              <path d="M3 7h18M6 12h12M9 17h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold">Book a slot</h1>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <div className="text-sm text-[var(--foreground)]/60">Amount</div>
            <div className="mt-1 text-4xl font-bold">₹{AMOUNT}</div>
          </div>
          <div className="flex items-end">
            <button
              onClick={onBuyClick}
              className="w-full rounded-2xl bg-[var(--foreground)] px-5 py-3 text-[var(--background)] font-medium shadow-sm transition hover:opacity-90 active:opacity-80"
            >
              Buy
            </button>
          </div>
        </div>

        <ul className="mt-6 space-y-2 text-sm text-[var(--foreground)]/65">
          <li className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-emerald-500" /> Secure checkout
          </li>
          <li className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-sky-500" /> Instant confirmation
          </li>
        </ul>
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-[var(--foreground)]/10 bg-[var(--background)] p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Contact details</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-1 text-sm text-[var(--foreground)]/70 hover:bg-[var(--foreground)]/10"
              >
                Close
              </button>
            </div>

            <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium">Email (optional)</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="mt-1 w-full rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] px-3 py-2 outline-none focus:border-[var(--foreground)]/30"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Phone number *</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone number"
                  required
                  className="mt-1 w-full rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] px-3 py-2 outline-none focus:border-[var(--foreground)]/30"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl bg-[var(--foreground)] px-5 py-3 text-[var(--background)] font-medium shadow-sm transition hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? "Redirecting…" : "Continue to payment"}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}