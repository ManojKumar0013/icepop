import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Lock, PartyPopper, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { PageLoader } from "@/components/site/Guards";
import { StatusTimeline } from "@/components/site/StatusTimeline";
import { CartLines } from "@/pages/Cart";
import { PriceSummary } from "@/components/site/PriceSummary";
import { PAYMENT_LABELS, STATUS_STYLES, istDateTime } from "@/lib/format";
import { ReorderButton } from "@/components/site/ReorderButton";
import { PaidTick, PayOnline } from "@/components/site/PayOnline";
import { RateOrder } from "@/components/site/Reviews";
import { useLang } from "@/context/LangContext";

const METHOD_LABELS = { pay_on_delivery: "Pay on delivery", pay_at_pickup: "Pay at pickup", online: "Online (UPI / card / netbanking)", wallet: "ICEPOPS Wallet" };

const toQuote = (o) => ({ ...o, lines: o.items, delivery_savings_paise: o.delivery_savings_paise || 0 });

export default function OrderDetail() {
  const { number } = useParams();
  const [params] = useSearchParams();
  const [o, setO] = useState(undefined);
  const { lang, t } = useLang();

  const load = useCallback(() => api.get(`/orders/${number}`).then(({ data }) => setO(data)).catch(() => setO(null)), [number]);
  useEffect(() => {
    load();
    let es = null;
    try {
      const rawUrl = process.env.REACT_APP_BACKEND_URL || "";
      const backendUrl = rawUrl.replace("://localhost:", "://127.0.0.1:").replace("://localhost/", "://127.0.0.1/");
      es = new EventSource(`${backendUrl}/api/orders/events`, { withCredentials: true });
      es.addEventListener("order_update", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.order_number === number) {
            load();
          }
        } catch { /* parse error */ }
      });
    } catch { /* SSE unsupported */ }

    const t = setInterval(load, 30000);
    return () => {
      clearInterval(t);
      if (es) es.close();
    };
  }, [load, number]);

  if (o === undefined) return <PageLoader />;
  if (o === null) return <div className="p-16 text-center" data-testid="order-not-found">Order not found.</div>;

  const cancel = async () => {
    if (!window.confirm(t("Cancel this order?"))) return;
    try {
      const { data } = await api.post(`/orders/${number}/cancel`);
      setO(data);
      toast.success("Order cancelled");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const lines = o.items.map((i, idx) => ({ ...i, variant_id: `${i.variant_id}-${idx}`, available: true, line_total_paise: i.line_total_paise + i.discount_paise }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8" data-testid="order-detail-page">
      <Link to="/orders" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold hover:text-strawberry"><ArrowLeft className="h-4 w-4" />My orders</Link>
      {params.get("placed") && o.payment_method !== "online" && (
        <div data-testid="order-placed-banner" className="rise mb-6 flex items-center gap-4 rounded-3xl bg-gradient-to-r from-pink-light to-pink p-6">
          <PartyPopper className="h-8 w-8 shrink-0" />
          <div><p className="font-display text-xl font-extrabold">{t("Thank you! Your order is in.")}</p><p className="text-sm">{t("The shop will confirm it shortly. This page updates automatically.")}</p></div>
        </div>
      )}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("Order")}</p>
          <h1 data-testid="order-number" className="font-display text-3xl font-extrabold">{o.order_number}</h1>
          <p className="text-sm text-muted-foreground">{t("Placed")} {istDateTime(o.created_at)} · {t(o.fulfilment_type === "delivery" ? "Delivery" : "Pickup")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span data-testid="order-status-badge" className={`rounded-full px-4 py-1.5 text-sm font-bold ${STATUS_STYLES[o.status]}`}>{lang === "te" ? t(o.status) : o.status_label}</span>
          <button onClick={load} aria-label="Refresh" data-testid="order-refresh" className="rounded-full p-2 hover:bg-muted"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-white p-6 sm:p-8"><StatusTimeline order={o} /></section>
          {o.cancel_reason && <p data-testid="order-cancel-reason" className="rounded-2xl bg-red-50 p-4 text-sm"><b>Reason:</b> {o.cancel_reason}</p>}
          <section className="rounded-3xl border border-border bg-white px-6"><CartLines lines={lines} /></section>
        </div>
        <aside className="space-y-4">
          {o.fulfilment_type === "delivery" && !["delivered", "cancelled", "refunded"].includes(o.status) && (
            o.delivery_otp ? (
              <div data-testid="delivery-otp-card" className="rounded-3xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-50 to-cream p-5 text-center space-y-1.5 shadow-sm">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/90 px-3 py-0.5 text-xs font-bold text-emerald-800">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Delivery Confirmation OTP</span>
                </div>
                <p className="text-4xl font-mono font-black text-choco tracking-widest pt-1">{o.delivery_otp}</p>
                <p className="text-xs font-medium text-choco/75">Share this 4-digit code with your delivery rider upon doorstep arrival.</p>
              </div>
            ) : (
              <div data-testid="delivery-otp-pending-card" className="rounded-3xl border border-border bg-white p-5 text-center space-y-2 shadow-xs">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Delivery OTP Protection</p>
                  <p className="mt-1 text-sm font-bold text-choco">
                    {o.payment_method === "online" && o.payment_status !== "paid"
                      ? "Unlocks after online payment is completed"
                      : "Unlocks once the parlour confirms your order"}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    For your security, OTP is verified only when your fresh ice pops arrive at your doorstep.
                  </p>
                </div>
              </div>
            )
          )}
          {o.rider_name && !["delivered", "cancelled"].includes(o.status) && (
            <div className="rounded-2xl bg-sky-50 border border-sky-100 p-3.5 text-xs text-sky-900 flex items-center justify-between">
              <div>
                <p className="font-bold">Delivery Partner: {o.rider_name}</p>
                {o.rider_phone && <p className="text-sky-700 mt-0.5">{o.rider_phone}</p>}
              </div>
              {o.rider_phone && (
                <a href={`tel:${o.rider_phone}`} className="rounded-xl bg-sky-600 text-white px-3 py-1.5 font-bold hover:bg-sky-700">
                  Call Rider
                </a>
              )}
            </div>
          )}
          {o.payment_method === "online" && o.payment_status === "pending" && !["cancelled", "refund_pending", "refunded"].includes(o.status) && (
            <PayOnline o={o} autoStart={params.get("pay") === "1"} onChange={(d) => setO((prev) => ({ ...prev, ...d }))} />
          )}
          {(o.payment_method === "online" || o.payment_method === "wallet") && o.payment_status === "paid" && <PaidTick />}
          <RateOrder o={o} onDone={setO} />
          <div className="rounded-3xl border border-border bg-white p-6"><PriceSummary q={toQuote(o)} fulfilment={o.fulfilment_type} /></div>
          <div className="space-y-2 rounded-3xl border border-border bg-white p-6 text-sm">
            <p data-testid="order-payment-status"><b>{t("Payment")}:</b> {t(PAYMENT_LABELS[o.payment_status] || o.payment_status)} · {METHOD_LABELS[o.payment_method] || o.payment_method}</p>
            <p><b>{t("Contact")}:</b> {o.customer_name}, {o.customer_phone}</p>
            {o.fulfilment_type === "delivery" && <p><b>{t("Deliver to")}:</b> {o.address_line1}{o.address_line2 ? `, ${o.address_line2}` : ""}, {o.area}, {o.city} {o.pincode}</p>}
            {o.preferred_time && <p><b>Preferred time:</b> {istDateTime(o.preferred_time)}</p>}
            {o.delivery_instructions && <p><b>Notes:</b> {o.delivery_instructions}</p>}
          </div>
          <ReorderButton order={o} />
          {o.status === "pending_confirmation" && <button data-testid="order-cancel-button" onClick={cancel} className="w-full rounded-full border-2 border-strawberry py-3 text-sm font-bold text-strawberry hover:bg-strawberry hover:text-white">{t("Cancel order")}</button>}
        </aside>
      </div>
    </div>
  );
}
