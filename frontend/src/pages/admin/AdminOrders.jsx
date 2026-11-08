import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Printer, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";
import { PAYMENT_LABELS, STATUS_STYLES, inr, istDateTime } from "@/lib/format";

const FILTERS = [["active", "Active"], ["pending_confirmation", "Pending"], ["delivered", "Delivered"], ["cancelled", "Cancelled"], ["", "All"]];
const ACTION_LABELS = {
  accepted: "Accept", preparing: "Mark preparing", ready_for_pickup: "Ready for pickup", out_for_delivery: "Out for delivery",
  delivered: "Mark delivered", cancelled: "Reject / cancel", refund_pending: "Start refund", refunded: "Mark refunded",
};

const WA_TEXT = {
  accepted: "your order {n} has been accepted and will be prepared shortly.",
  preparing: "we're preparing your order {n} right now.",
  ready_for_pickup: "your order {n} is ready! Please collect it from the shop.",
  out_for_delivery: "your order {n} is out for delivery and on its way to you.",
  delivered: "your order {n} has been delivered. Enjoy, and thank you!",
  cancelled: "sorry, your order {n} was cancelled. Reason: {reason}",
};

const WhatsAppUpdate = ({ o }) => {
  const tpl = WA_TEXT[o.status];
  if (!tpl) return null;
  const text = `Hi ${o.customer_name}, ${tpl.replace("{n}", o.order_number).replace("{reason}", o.cancel_reason || "-")}\nTotal: ${inr(o.total_paise)}\nTrack: ${window.location.origin}/orders/${o.order_number}\n— ICEPOPS`;
  return (
    <a href={`https://wa.me/91${o.customer_phone}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"
      data-testid="admin-whatsapp-update" className="flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 py-3 font-bold text-white hover:bg-[#1ebe5b]">
      <MessageCircle className="h-4 w-4" />Send "{o.status_label}" update on WhatsApp
    </a>
  );
};

const Receipt = ({ o }) => (
  <div className="print-only" data-testid="print-receipt">
    <h2 style={{ textAlign: "center", fontSize: 16 }}>ICEPOPS</h2>
    <p>Order {o.order_number}<br />{istDateTime(o.created_at)}<br />{o.fulfilment_type.toUpperCase()}</p>
    <p>{o.customer_name} · {o.customer_phone}{o.fulfilment_type === "delivery" && <><br />{o.address_line1}, {o.area}, {o.city} {o.pincode}</>}</p>
    <hr />
    {o.items.map((i, k) => <p key={k}>{i.quantity} × {i.product_name} ({i.variant_name}){i.free_quantity ? ` [${i.free_quantity} free]` : ""} — {inr(i.line_total_paise)}</p>)}
    <hr />
    <p>Subtotal {inr(o.subtotal_paise)}<br />Discount −{inr(o.discount_paise)}<br />Delivery {inr(o.delivery_fee_paise)}<br /><b>TOTAL {inr(o.total_paise)}</b><br />Payment: {PAYMENT_LABELS[o.payment_status]}</p>
    {o.delivery_instructions && <p>Note: {o.delivery_instructions}</p>}
  </div>
);

const OrderPanel = ({ number, onChanged }) => {
  const [o, setO] = useState(null);
  const [reasonOpen, setReasonOpen] = useState(null);
  const [note, setNote] = useState("");
  const load = useCallback(() => api.get(`/admin/orders/${number}`).then(({ data }) => setO(data))
    .catch((e) => toast.error(errMsg(e, "Couldn't load this order."))), [number]);
  useEffect(() => {
    load();
  }, [load]);

  const move = async (status, n = null) => {
    try {
      const { data } = await api.post(`/admin/orders/${number}/status`, { status, note: n });
      setO(data);
      setReasonOpen(null);
      setNote("");
      toast.success(`Order ${data.status_label}`);
      onChanged();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const collect = async () => {
    try {
      const { data } = await api.post(`/admin/orders/${number}/payment`, { action: "mark_collected" });
      setO(data);
      toast.success("Payment recorded");
      onChanged();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  if (!o) return <p className="p-6 text-sm">Loading…</p>;
  const needsNote = (s) => ["cancelled", "refund_pending", "refunded"].includes(s);

  return (
    <div className="space-y-5 text-sm" data-testid="admin-order-panel">
      <div className="flex flex-wrap items-center gap-2">
        <span data-testid="admin-order-status" className={`rounded-full px-3 py-1 font-bold ${STATUS_STYLES[o.status]}`}>{o.status_label}</span>
        <span data-testid="admin-order-payment" className="rounded-full bg-muted px-3 py-1 font-bold">{PAYMENT_LABELS[o.payment_status]}</span>
        <span className="rounded-full bg-muted px-3 py-1 font-bold capitalize">{o.fulfilment_type}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {o.allowed_transitions.map((s) => (
          <button key={s} data-testid={`admin-action-${s}`} onClick={() => (needsNote(s) ? setReasonOpen(s) : move(s))}
            className={`rounded-full px-4 py-2 font-bold ${s === "cancelled" ? "border-2 border-strawberry text-strawberry" : "bg-choco text-cream hover:bg-strawberry"}`}>{ACTION_LABELS[s]}</button>
        ))}
        {o.payment?.status === "pending" && !["cancelled", "refunded", "refund_pending"].includes(o.status) && (
          <button data-testid="admin-mark-paid" onClick={collect} className="rounded-full bg-pistachio px-4 py-2 font-bold text-white">Record cash/UPI received</button>
        )}
        <button data-testid="admin-print-receipt" onClick={() => window.print()} className="flex items-center gap-1 rounded-full border border-border px-4 py-2 font-bold"><Printer className="h-4 w-4" />Print</button>
      </div>
      <WhatsAppUpdate o={o} />
      {o.payment?.provider === "razorpay" && (
        <section className="rounded-2xl border border-border p-4 text-xs" data-testid="admin-order-razorpay">
          <p className="mb-1 text-sm font-bold">Online payment (Razorpay)</p>
          <p>Paid by: <b className="uppercase">{o.payment.method === "online" ? "—" : o.payment.method}</b>{o.payment.bank ? ` · ${o.payment.bank}` : ""}{o.payment.wallet ? ` · ${o.payment.wallet}` : ""}{o.payment.card_network ? ` · ${o.payment.card_network}` : ""}</p>
          {o.payment.reference && <p>Payment ID: <span className="font-mono" data-testid="admin-order-payment-ref">{o.payment.reference}</span></p>}
          {o.payment.provider_order_id && <p>Razorpay order: <span className="font-mono">{o.payment.provider_order_id}</span></p>}
          {o.payment.refund_id && <p>Refund: <span className="font-mono">{o.payment.refund_id}</span> ({o.payment.refund_status})</p>}
          {o.payment.status === "pending" && o.payment.last_error && <p className="text-strawberry">Last attempt failed: {o.payment.last_error}</p>}
          {o.payment.status === "paid" && <p className="mt-1 text-muted-foreground">Cancelling this order refunds the customer automatically.</p>}
        </section>
      )}
      <section className="rounded-2xl bg-cream-deep p-4" data-testid="admin-order-customer">
        <p className="font-bold">{o.customer_name}</p>
        <p><a className="text-strawberry" href={`tel:+91${o.customer_phone}`}>+91 {o.customer_phone}</a> · {o.customer_email}</p>
        {o.fulfilment_type === "delivery" && <p className="mt-1">{o.address_line1}{o.address_line2 ? `, ${o.address_line2}` : ""}, {o.area}, {o.city} — <b>{o.pincode}</b></p>}
        {o.preferred_time && <p className="mt-1"><b>Preferred:</b> {istDateTime(o.preferred_time)}</p>}
        {o.delivery_instructions && <p className="mt-1"><b>Note:</b> {o.delivery_instructions}</p>}
      </section>
      <ul className="divide-y divide-border">
        {o.items.map((i, k) => <li key={k} className="flex justify-between py-2"><span>{i.quantity} × {i.product_name} <span className="text-muted-foreground">({i.variant_name})</span>{i.free_quantity > 0 && <b className="ml-1 text-pistachio">{i.free_quantity} free</b>}</span><span>{inr(i.line_total_paise)}</span></li>)}
      </ul>
      <div className="space-y-1 border-t border-dashed border-border pt-3">
        <p className="flex justify-between"><span>Subtotal</span><span>{inr(o.subtotal_paise)}</span></p>
        {o.discounts.map((d) => <p key={d.code} className="flex justify-between text-pistachio"><span>{d.label}</span><span>−{inr(d.amount_paise)}</span></p>)}
        <p className="flex justify-between"><span>Delivery</span><span>{o.delivery_savings_paise ? "Free" : inr(o.delivery_fee_paise)}</span></p>
        <p className="flex justify-between font-display text-lg font-extrabold"><span>Total</span><span data-testid="admin-order-total">{inr(o.total_paise)}</span></p>
      </div>
      <section>
        <h4 className="mb-2 font-bold">History</h4>
        <ul className="space-y-1 text-xs">{o.history.map((h, k) => <li key={k}>{istDateTime(h.created_at)} — <b>{h.label}</b>{h.note ? ` · ${h.note}` : ""}</li>)}</ul>
      </section>
      <section data-testid="admin-order-notifications">
        <h4 className="mb-2 font-bold">Customer notifications</h4>
        <ul className="space-y-1 text-xs">{o.notifications.map((n, k) => <li key={k}><b className="capitalize">{n.channel}</b> · {n.template} · <span className={n.status === "sent" ? "text-pistachio" : "text-strawberry"}>{n.status.replace("_", " ")}</span></li>)}</ul>
        <p className="mt-1 text-[11px] text-muted-foreground">In-app notifications are always delivered. WhatsApp updates are sent by you with the green button above (automatic WhatsApp is not connected).</p>
      </section>
      <Receipt o={o} />
      <Dialog open={!!reasonOpen} onOpenChange={(v) => !v && setReasonOpen(null)}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle>{ACTION_LABELS[reasonOpen]} — {o.order_number}</DialogTitle></DialogHeader>
          <textarea data-testid="admin-reason-input" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder={reasonOpen === "cancelled" ? "Reason (shown to the customer)" : "Note / refund reference"} className="w-full rounded-2xl border border-border p-3 text-sm" />
          <button data-testid="admin-reason-confirm" disabled={reasonOpen === "cancelled" && !note.trim()} onClick={() => move(reasonOpen, note)} className="rounded-full bg-strawberry py-3 font-bold text-white disabled:opacity-50">Confirm</button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default function AdminOrders() {
  const [filter, setFilter] = useState("active");
  const [q, setQ] = useState("");
  const [orders, setOrders] = useState(null);
  const [open, setOpen] = useState(null);
  const [updated, setUpdated] = useState(null);
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    const n = params.get("open");
    if (n) { setOpen(n); setParams({}, { replace: true }); }
  }, [params, setParams]);

  const load = useCallback(() => api.get("/admin/orders", { params: { status: filter || undefined, q: q || undefined } }).then(({ data }) => {
    setOrders(data);
    setUpdated(new Date());
  }).catch(() => {}), [filter, q]);

  useEffect(() => {
    load();
    let es = null;
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || "";
      es = new EventSource(`${backendUrl}/api/orders/events`, { withCredentials: true });
      es.addEventListener("order_update", () => {
        load();
      });
    } catch { /* SSE fallback */ }

    const t = setInterval(load, 25000);
    return () => {
      clearInterval(t);
      if (es) es.close();
    };
  }, [load]);

  return (
    <div className="space-y-6" data-testid="admin-orders">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Orders</h1>
          <p className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="admin-orders-refreshed"><RefreshCw className="h-3 w-3" />Auto-refreshing every 10s{updated && ` · updated ${updated.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}`}</p>
        </div>
        <label className="relative w-full sm:w-64"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input data-testid="admin-orders-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order no, name, phone" className="w-full rounded-full border border-border bg-white py-2.5 pl-9 pr-4 text-sm" />
        </label>
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {FILTERS.map(([k, l]) => <button key={k || "all"} data-testid={`admin-filter-${k || "all"}`} onClick={() => setFilter(k)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${filter === k ? "bg-choco text-cream" : "border border-border bg-white"}`}>{l}</button>)}
      </div>
      {!orders ? <p className="text-sm">Loading…</p> : orders.length === 0 ? <p data-testid="admin-orders-empty" className="rounded-3xl border-2 border-dashed border-border p-10 text-center text-muted-foreground">No orders here.</p> : (
        <div className="overflow-hidden rounded-3xl border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-cream-deep text-left text-xs uppercase tracking-wider"><tr><th className="p-4">Order</th><th className="hidden p-4 md:table-cell">Customer</th><th className="p-4">Status</th><th className="hidden p-4 sm:table-cell">Payment</th><th className="p-4 text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-border">
              {orders.map((o) => (
                <tr key={o.order_number} data-testid={`admin-order-row-${o.order_number}`} onClick={() => setOpen(o.order_number)} className="cursor-pointer hover:bg-pink-light/40">
                  <td className="p-4"><p className="font-bold">{o.order_number}</p><p className="text-xs text-muted-foreground">{istDateTime(o.created_at)} · {o.fulfilment_type}</p></td>
                  <td className="hidden p-4 md:table-cell">{o.customer_name}<p className="text-xs text-muted-foreground">{o.customer_phone}{o.pincode ? ` · ${o.pincode}` : ""}</p></td>
                  <td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[o.status]}`}>{o.status_label}</span></td>
                  <td className="hidden p-4 text-xs sm:table-cell">{PAYMENT_LABELS[o.payment_status]}</td>
                  <td className="p-4 text-right font-bold">{inr(o.total_paise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader><SheetTitle data-testid="admin-panel-title">Order {open}</SheetTitle></SheetHeader>
          <div className="mt-4">{open && <OrderPanel number={open} onChanged={load} />}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
