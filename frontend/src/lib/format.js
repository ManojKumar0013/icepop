export const inr = (paise = 0) =>
  `₹${(paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: paise % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;

export const istDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

export const to12h = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

export const STATUS_STYLES = {
  pending_confirmation: "bg-amber-100 text-amber-800",
  accepted: "bg-sky-100 text-sky-800",
  preparing: "bg-violet-100 text-violet-800",
  ready_for_pickup: "bg-emerald-100 text-emerald-800",
  out_for_delivery: "bg-orange-100 text-orange-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-700",
  refund_pending: "bg-rose-100 text-rose-700",
  refunded: "bg-stone-200 text-stone-700",
};

export const PAYMENT_LABELS = {
  pending: "Payment pending",
  paid: "Paid",
  cancelled: "Not charged",
  refunded: "Refunded",
  failed: "Payment failed",
};
