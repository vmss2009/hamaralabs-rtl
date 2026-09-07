
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import * as htmlToImage from "html-to-image";
import jsPDF from "jspdf";

type Status =
  | "idle"
  | "checking"
  | "selecting-slot"
  | "booking"
  | "success"
  | "failed";

type Item = {
  description: string;
  quantity: number;
  price: number;
  total: number;
};
type ReceiptData = {
  date: string;
  merchantTransactionId: string;
  transactionId?: string;
  paidBy: string;
  paymentMethod?: string;
  items: Item[];
  amount: number;
  notes?: string;
};

type BackendBooking = {
  slotId: string;
  date: string;
  startTime: string;
  endTime: string;
};

type BackendSlot = {
  id: string;
};

// The stored slot values stay in 24-hour "HH:MM" (needed by the booking
// APIs) — these only affect what's displayed to the user.
function formatTime12h(time: string): string {
  const [hoursStr, minutes] = time.split(":");
  const hours = Number(hoursStr);
  if (Number.isNaN(hours) || !minutes) return time;
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${period}`;
}

function formatTimeRange12h(range: string): string {
  const [start, end] = range.split("-");
  if (!start || !end) return range;
  return `${formatTime12h(start)} - ${formatTime12h(end)}`;
}

export default function PaymentsReturnPage() {
  const params = useSearchParams();
  const router = useRouter();

  const qp = useMemo(() => Object.fromEntries(params.entries()), [params]);

  const [amount, setAmount] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [docId, setDocId] = useState<string>("");
  const [merchantId, setMerchantId] = useState<string>("");
  const [merchantTransactionId, setMerchantTransactionId] =
    useState<string>("");

  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("Verifying payment…");
  const [missing, setMissing] = useState<string[]>([]);

  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  const [slotId, setSlotId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | undefined>(
    undefined
  );

  const [schedules, setSchedules] = useState<
    Array<{
      id: string;
      userId: string;
      date: string; // ISO date
      timeSlots: Array<{
        id: string;
        startTime: string; // "HH:MM"
        endTime: string; // "HH:MM"
        maxSlots: number;
        bookedSlots: number;
      }>;
      createdAt?: string;
      updatedAt?: string;
    }>
  >([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [schedulesError, setSchedulesError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{
    date: string; // ISO date
    time: string; // "HH:mm-HH:mm"
  } | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  useEffect(() => {
    const fromQuery = {
      amount: qp.amount ?? null,
      email: qp.email ?? "",
      phone: qp.phone ?? "",
      docId: qp.docId ?? "",
      merchantId: qp.merchantId ?? "",
      merchantTransactionId: qp.merchantTransactionId ?? "",
    };

    const raw =
      typeof window !== "undefined"
        ? sessionStorage.getItem("bookingPayload")
        : null;
    const fromSession = raw ? JSON.parse(raw) : {};

    setAmount(fromQuery.amount ?? fromSession.amount ?? null);
    setEmail(fromQuery.email ?? fromSession.email ?? "");
    setPhone(fromQuery.phone ?? fromSession.phone ?? "");
    setDocId(fromQuery.docId ?? fromSession.docId ?? "");
    setMerchantId(fromQuery.merchantId ?? fromSession.merchantId ?? "");
    setMerchantTransactionId(
      fromQuery.merchantTransactionId ?? fromSession.merchantTransactionId ?? ""
    );
  }, [qp]);

  // Looks up the payment record for a merchantTransactionId, so the slot the
  // user picks has something to attach to.
  const fetchSlotByTransaction = async (
    mtx: string
  ): Promise<BackendSlot | null> => {
    const res = await fetch(
      `/api/slots?merchantTransactionId=${encodeURIComponent(mtx)}`,
      { cache: "no-store" }
    );
    const data = await res.json().catch(() => ({}));
    return data?.slot ?? null;
  };

  // All bookings tied to this email, regardless of which slot/transaction
  // they came from. Used to work out whether a given slot already has a
  // booking attached (the slots API doesn't support filtering server-side).
  const fetchBookingsByEmail = async (
    mail: string
  ): Promise<BackendBooking[]> => {
    const res = await fetch(
      `/api/bookings/by-email?email=${encodeURIComponent(mail)}`,
      { cache: "no-store" }
    );
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data?.bookings) ? data.bookings : [];
  };

  const showBookedReceipt = (
    booking: BackendBooking,
    paymentMethodValue: string | undefined
  ) => {
    setStatus("success");
    setMessage("Payment successful! Your slot is booked.");
    const now = new Date();
    setReceiptData({
      date: now.toLocaleString(),
      merchantTransactionId,
      paidBy: email || phone,
      paymentMethod: paymentMethodValue,
      items: [
        {
          description: `Remote Lab Booking (${booking.date} ${booking.startTime}-${booking.endTime})`,
          quantity: 1,
          price: Number(amount),
          total: Number(amount),
        },
      ],
      amount: Number(amount),
      notes: "Thank you for your payment.",
    });
  };

  useEffect(() => {
    const verify = async () => {
      const missingKeys: string[] = [];
      if (!amount) missingKeys.push("amount");
      if (!merchantId) missingKeys.push("merchantId");
      if (!merchantTransactionId) missingKeys.push("merchantTransactionId");
      if (!email) missingKeys.push("email");

      if (missingKeys.length) {
        setMissing(missingKeys);
        setStatus("failed");
        setMessage("Missing required parameters.");
        return;
      }

      setStatus("checking");
      try {
        const res = await fetch(`/api/get-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ merchantTransactionId, merchantId }),
        });
        const json = await res.json();
        const code = json?.data?.code;

        if (code !== "PAYMENT_SUCCESS") {
          setStatus("failed");
          setMessage("Payment failed or was cancelled.");
          return;
        }

        setPaymentMethod(json?.data?.paymentMethod);

        // The slots API can't be filtered server-side, so the "already
        // booked" check is done by hand: fetch every booking for this email,
        // find the payment record (slot) for this transaction, then see
        // whether any booking's slotId matches that slot's id.
        const bookings = await fetchBookingsByEmail(email);
        const existingSlot = await fetchSlotByTransaction(merchantTransactionId);
        if (existingSlot?.id) {
          const matchingBooking = bookings.find((b) => b.slotId === existingSlot.id);
          if (matchingBooking) {
            showBookedReceipt(matchingBooking, json?.data?.paymentMethod);
            return;
          }
          setSlotId(existingSlot.id);
          setStatus("selecting-slot");
          setMessage("Payment successful! Please select your slot below.");
          return;
        }

        // No payment record yet for this transaction — create one so the
        // slot the user picks next has something to attach to.
        const unifiedNotes = `Booking for ${email || phone}`;
        const slotRes = await fetch("/api/slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            merchantTransactionId,
            merchantId,
            email,
            // Contact number is optional in the UI, but the backend requires
            // a non-empty phone field — fall back to email when it's blank.
            phone: phone || email,
            amount: Number(amount),
            status: "PAID",
            items: [
              {
                description: "Remote Lab Booking",
                quantity: 1,
                price: Number(amount),
                total: Number(amount),
              },
            ],
            paidBy: email || phone,
            paymentMethod: json?.data?.paymentMethod || undefined,
            notes: unifiedNotes,
          }),
        });

        if (slotRes.status === 409) {
          // Created concurrently (e.g. duplicate tab) — trust the backend record.
          const slot = await fetchSlotByTransaction(merchantTransactionId);
          const matchingBooking = slot
            ? bookings.find((b) => b.slotId === slot.id)
            : undefined;
          if (matchingBooking) {
            showBookedReceipt(matchingBooking, json?.data?.paymentMethod);
          } else if (slot?.id) {
            setSlotId(slot.id);
            setStatus("selecting-slot");
            setMessage("Payment successful! Please select your slot below.");
          } else {
            setStatus("failed");
            setMessage("Could not verify your slot. Please contact support.");
          }
          return;
        }

        if (!slotRes.ok) {
          const err = await slotRes.json().catch(() => ({}));
          throw new Error(err?.message || `Failed to create slot (${slotRes.status})`);
        }

        const slotJson = await slotRes.json();
        const newSlotId = slotJson?.slot?.id || slotJson?.id || slotJson?.slotId;
        if (!newSlotId) {
          throw new Error("Slot creation succeeded but no slotId returned.");
        }

        setSlotId(newSlotId);
        setStatus("selecting-slot");
        setMessage("Payment successful! Please select your slot below.");
      } catch (e: any) {
        setStatus("failed");
        setMessage(e?.message || "Could not verify payment.");
      }
    };

    if (amount !== null) verify();
  }, [amount, merchantId, merchantTransactionId, phone, docId, email]);

  // Fetch schedules once payment is verified and it's time to pick a slot.
  useEffect(() => {
    if (status !== "selecting-slot") return;
    let cancelled = false;
    const load = async () => {
      setSchedulesLoading(true);
      setSchedulesError(null);
      try {
        const res = await fetch(
          `https://calendar.hamaralabs.com/api/schedules/public/${process.env.NEXT_PUBLIC_CALENDAR_USER || "mohan487"}?leadMinutes=1`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`Failed to load slots (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        setSchedules(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (!cancelled) setSchedulesError(e?.message || "Failed to load slots");
      } finally {
        if (!cancelled) setSchedulesLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const handleConfirmSlot = async () => {
    if (!selectedSlot || !slotId) return;
    setStatus("booking");
    setBookingError(null);
    try {
      const username = process.env.NEXT_PUBLIC_CALENDAR_USER || "mohan487";
      const date = selectedSlot.date.split("T")[0];
      const [startTime, endTime] = selectedSlot.time.split("-");
      if (!startTime || !endTime) throw new Error("Invalid selected time slot.");

      const bookingRes = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          date,
          startTime,
          endTime,
          guestName: email || "",
          // Contact number is optional in the UI; fall back to email so the
          // backend's required guestEmail field is never sent empty.
          guestEmail: phone || email,
          contactEmail: email || "",
          notes: `Booking for ${email || phone}`,
          slotId,
        }),
      });

      if (!bookingRes.ok) {
        const err = await bookingRes.json().catch(() => ({}));
        throw new Error(err?.message || `Failed to create booking (${bookingRes.status})`);
      }

      showBookedReceipt({ slotId, date, startTime, endTime }, paymentMethod);
    } catch (e: any) {
      setStatus("selecting-slot");
      setBookingError(e?.message || "Could not confirm your slot. Please try again.");
    }
  };

  const downloadReceiptPDF = async () => {
    if (!receiptRef.current) return;

    const dataUrl = await htmlToImage.toPng(receiptRef.current, {
      backgroundColor: "#ffffff",
      pixelRatio: 2,
    });

    const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
    const imgProps = pdf.getImageProperties(dataUrl);

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth * 0.8;
    const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
    const xOffset = (pageWidth - imgWidth) / 2;
    const yOffset = (pageHeight - imgHeight) / 2;

    pdf.addImage(dataUrl, "PNG", xOffset, yOffset, imgWidth, imgHeight);
      pdf.save(`receipt_${merchantTransactionId}.pdf`);
  };

  // Payment already succeeded once we're selecting a slot or booking it, so
  // the header icon should read as success from that point on — only an
  // actual payment failure should show the failure icon.
  const paymentConfirmed =
    status === "success" || status === "selecting-slot" || status === "booking";

  // Dates with no time slots at all just take up space in the picker — drop
  // them. Soonest date first, so scrolling right moves further into the future.
  const visibleSchedules = useMemo(
    () =>
      schedules
        .filter((sch) => sch.timeSlots.length > 0)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [schedules]
  );

  // Tracks whether the date row has more content off-screen in either
  // direction, so we can show a scroll cue instead of leaving it undiscoverable.
  const scheduleScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScheduleScrollState = () => {
    const el = scheduleScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateScheduleScrollState();
    window.addEventListener("resize", updateScheduleScrollState);
    return () => window.removeEventListener("resize", updateScheduleScrollState);
  }, [visibleSchedules]);

  return (
    <section className="grid place-items-center py-16">
      <div className="w-full min-w-0 max-w-md rounded-3xl border border-[var(--foreground)]/10 bg-[var(--background)] p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className={[
              "grid size-10 place-items-center rounded-2xl",
              paymentConfirmed
                ? "bg-emerald-500/15 text-emerald-600"
                : status === "failed"
                ? "bg-rose-500/15 text-rose-600"
                : "bg-[var(--foreground)]/10",
            ].join(" ")}
          >
            {paymentConfirmed ? (
              <svg viewBox="0 0 24 24" fill="none" className="size-5">
                <path
                  d="M5 12l4 4 10-10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : status === "failed" ? (
              <svg viewBox="0 0 24 24" fill="none" className="size-5">
                <path
                  d="M6 6l12 12M6 18L18 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" className="size-5">
                <path
                  d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </div>
          <h1 className="text-2xl font-semibold">Payment status</h1>
        </div>

        <p className="mt-3 text-[var(--foreground)]/70">{message}</p>

        {status === "failed" && missing.length > 0 && (
          <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800">
            Missing: {missing.join(", ")}
          </div>
        )}

        {(status === "selecting-slot" || status === "booking") && (
          <div className="mt-6">
            {bookingError && (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {bookingError}
              </div>
            )}

            <label className="block text-sm font-medium">Select a slot *</label>
            <div className="mt-2 rounded-2xl border border-[var(--foreground)]/15 p-3">
              {schedulesLoading && (
                <div className="text-sm text-[var(--foreground)]/70">Loading slots…</div>
              )}
              {schedulesError && (
                <div className="text-sm text-red-600">{schedulesError}</div>
              )}
              {!schedulesLoading && !schedulesError && visibleSchedules.length === 0 && (
                <div className="text-sm text-[var(--foreground)]/70">No slots available.</div>
              )}

              <div className="relative -mx-1">
                <div
                  ref={scheduleScrollRef}
                  onScroll={updateScheduleScrollState}
                  className="flex gap-3 overflow-x-auto scroll-smooth snap-x snap-mandatory px-1 pb-2 sm:gap-4 [-webkit-overflow-scrolling:touch]"
                >
                  {visibleSchedules.map((sch) => {
                    const dateLabel = new Date(sch.date).toLocaleDateString(undefined, {
                      weekday: "short",
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    });
                    return (
                      <div key={sch.id} className="flex-none w-32 snap-start sm:w-40">
                        <div className="text-sm font-medium mb-2 whitespace-nowrap">{dateLabel}</div>
                        <div className="flex flex-col gap-2">
                          {sch.timeSlots.map((ts) => {
                            const label = `${ts.startTime}-${ts.endTime}`;
                            const isFull = ts.bookedSlots >= ts.maxSlots;
                            const isSelected =
                              selectedSlot?.date === sch.date && selectedSlot?.time === label;
                            return (
                              <button
                                key={ts.id}
                                type="button"
                                disabled={isFull || status === "booking"}
                                onClick={() => setSelectedSlot({ date: sch.date, time: label })}
                                className={
                                  `rounded-xl border px-3 py-1.5 text-sm transition ` +
                                  (isFull
                                    ? "border-[var(--foreground)]/10 text-[var(--foreground)]/30 cursor-not-allowed"
                                    : isSelected
                                    ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
                                    : "border-[var(--foreground)]/20 hover:border-[var(--foreground)]/40")
                                }
                              >
                                {formatTimeRange12h(label)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {canScrollLeft && (
                  <button
                    type="button"
                    aria-label="Scroll to earlier dates"
                    onClick={() => scheduleScrollRef.current?.scrollBy({ left: -150, behavior: "smooth" })}
                    className="absolute inset-y-0 left-0 flex w-9 items-center justify-center rounded-l-2xl bg-[var(--foreground)]/10 text-[var(--foreground)] backdrop-blur-[1px] transition hover:bg-[var(--foreground)]/20 active:bg-[var(--foreground)]/25 sm:w-10"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="size-4">
                      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}

                {canScrollRight && (
                  <button
                    type="button"
                    aria-label="Scroll to later dates"
                    onClick={() => scheduleScrollRef.current?.scrollBy({ left: 150, behavior: "smooth" })}
                    className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-2xl bg-[var(--foreground)]/10 text-[var(--foreground)] backdrop-blur-[1px] transition hover:bg-[var(--foreground)]/20 active:bg-[var(--foreground)]/25 sm:w-10"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="size-4">
                      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            {selectedSlot && (
              <div className="mt-2 text-xs text-[var(--foreground)]/70">
                Selected: {new Date(selectedSlot.date).toLocaleDateString()} — {formatTimeRange12h(selectedSlot.time)}
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowConfirmDialog(true)}
              disabled={!selectedSlot || status === "booking"}
              className="mt-4 w-full rounded-2xl bg-[var(--foreground)] px-5 py-3 text-[var(--background)] font-medium shadow-sm transition hover:opacity-90 disabled:opacity-60"
            >
              {status === "booking" ? "Booking…" : "Confirm booking"}
            </button>
          </div>
        )}

        {showConfirmDialog && selectedSlot && (
          <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl border border-[var(--foreground)]/10 bg-[var(--background)] p-6 shadow-xl">
              <h2 className="text-lg font-semibold">Confirm your slot</h2>
              <p className="mt-2 text-sm text-[var(--foreground)]/70">You&apos;re about to book:</p>
              <div className="mt-3 rounded-2xl border border-[var(--foreground)]/15 p-3">
                <div className="font-medium">
                  {new Date(selectedSlot.date).toLocaleDateString(undefined, {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
                <div className="mt-1 text-sm text-[var(--foreground)]/70">
                  {formatTimeRange12h(selectedSlot.time)}
                </div>
              </div>
              <p className="mt-3 text-xs text-[var(--foreground)]/60">
                This slot will be reserved as soon as you confirm.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirmDialog(false)}
                  className="flex-1 rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] px-4 py-2 font-medium text-[var(--foreground)]/80 hover:bg-[var(--foreground)]/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmDialog(false);
                    handleConfirmSlot();
                  }}
                  className="flex-1 rounded-2xl bg-[var(--foreground)] px-4 py-2 font-medium text-[var(--background)] hover:opacity-90"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 flex gap-3">
          <button
            onClick={() => location.reload()}
            className="flex-1 rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] px-4 py-2 font-medium text-[var(--foreground)]/80 hover:bg-[var(--foreground)]/10"
          >
            Retry
          </button>
          <button
            onClick={() => router.push("/")}
            className="flex-1 rounded-2xl bg-[var(--foreground)] px-4 py-2 font-medium text-[var(--background)] hover:opacity-90"
          >
            Go Home
          </button>
        </div>

        {status === "success" && receiptData && (
          <>
            <div className="mt-6 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
              You will get an email from <b>support@hamaralabs.com</b> (please check spam, if not found in inbox) regarding the session details. Thanks for your payment!
            </div>
            <div className="mt-4 rounded-xl bg-sky-50 border border-sky-200 p-4 text-sm text-sky-800">
              To join your session, click <Link href="/login" className="font-semibold underline">Login</Link>, enter the email you used for this booking, and enjoy the experience!
            </div>
            <div className="mt-6 flex gap-3 no-print">
              <button
                onClick={downloadReceiptPDF}
                className="flex-1 rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] px-4 py-2 font-medium text-[var(--foreground)]/90 hover:bg-[var(--foreground)]/10"
              >
                Download receipt
              </button>
            </div>
          </>
        )}
      </div>

      {status === "success" && receiptData && (
        <div className="mt-8 w-full min-w-0 max-w-3xl mx-auto">
          <div
            ref={receiptRef}
            className="rounded-3xl border border-slate-200 bg-white text-slate-800 shadow-lg ring-1 ring-slate-900/5"
          >
            <div className="px-6 pt-6 text-center">
              <img src="/Hamaralabs_Logo.png" alt="Logo" className="mx-auto" crossOrigin="anonymous" />
              <h1 className="mt-3 text-xl font-semibold text-slate-900">Payment Receipt</h1>
              <div className="mt-1 text-sm leading-6 text-slate-600">
                <p>SketchEA IT Consultants Pvt Ltd.</p>
                <p>#38-37-63, Bhaskar Gardens, Marripalem, Visakhapatnam</p>
                <p>Andhra Pradesh, PIN Code - 530018</p>
              </div>
            </div>

            <hr className="mx-6 mt-6 border-t border-slate-200" />

            <div className="grid grid-cols-1 gap-3 px-6 py-5 sm:grid-cols-2 text-sm">
              <p>
                <span className="font-medium text-slate-600">Date:</span>{" "}
                <span className="text-slate-900">{receiptData.date}</span>
              </p>
              <p className="sm:text-right">
                <span className="font-medium text-slate-600">Merchant Transaction Id:</span>{" "}
                <span className="font-mono text-slate-900">{receiptData.merchantTransactionId}</span>
              </p>

              {receiptData.transactionId && (
                <p>
                  <span className="font-medium text-slate-600">Transaction Id:</span>{" "}
                  <span className="font-mono text-slate-900">{receiptData.transactionId}</span>
                </p>
              )}
              <p className="sm:text-right">
                <span className="font-medium text-slate-600">Paid By:</span>{" "}
                <span className="text-slate-900">{receiptData.paidBy}</span>
              </p>

              {receiptData.paymentMethod && (
                <p className="sm:col-span-2">
                  <span className="font-medium text-slate-600">Payment Method:</span>{" "}
                  <span className="text-slate-900">{receiptData.paymentMethod}</span>
                </p>
              )}
            </div>

            <div className="px-6 pb-6">
              <h2 className="mb-2 text-lg font-medium text-slate-900">Items</h2>
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium text-slate-700">
                      <th>Description</th>
                      <th>Quantity</th>
                      <th>Price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {receiptData.items.map((item, index) => (
                      <tr key={index} className="[&>td]:px-3 [&>td]:py-2 text-slate-800">
                        <td>{item.description}</td>
                        <td>{item.quantity}</td>
                        <td>₹{item.price}</td>
                        <td>₹{item.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-end">
                <div className="inline-flex items-baseline gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2">
                  <span className="text-sm text-slate-600">Total Amount</span>
                  <span className="text-lg font-semibold text-slate-900">₹{receiptData.amount}</span>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm text-slate-800">
                  <span className="font-medium text-slate-600">Notes:</span>{" "}
                  {receiptData.notes || "-"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
