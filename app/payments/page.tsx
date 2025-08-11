import { Suspense } from "react";
import PaymentsReturnClient from "./PaymentsReturnClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <section className="grid place-items-center py-16">
          <div className="w-full max-w-md rounded-3xl border border-[var(--foreground)]/10 bg-[var(--background)] p-8 shadow-sm">
            <h1 className="text-2xl font-semibold">Payment status</h1>
            <p className="mt-3 text-[var(--foreground)]/70">Loading…</p>
          </div>
        </section>
      }
    >
      <PaymentsReturnClient />
    </Suspense>
  );
}