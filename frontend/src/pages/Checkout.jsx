import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, newKey } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useStore } from "@/context/StoreContext";
import { useQuote } from "@/hooks/useQuote";
import { PriceSummary } from "@/components/site/PriceSummary";
import { CartLines, OfferNotes, RewardToggle, useRewardChoice } from "@/pages/Cart";
import { PageLoader } from "@/components/site/Guards";
import { inr } from "@/lib/format";
import { useLang } from "@/context/LangContext";

const inputCls = "w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-pink";
const Field = ({ label, id, children }) => (
  <label htmlFor={id} className="block space-y-1.5"><span className="text-xs font-bold uppercase tracking-wider text-muted-foreground"><T s={label} /></span>{children}</label>
);
const T = ({ s }) => useLang().t(s);
const Section = ({ n, title, children }) => (
  <section className="rounded-3xl border border-border bg-white p-6 sm:p-8">
    <h2 className="mb-5 flex items-center gap-3 font-display text-lg font-bold"><span className="grid h-7 w-7 place-items-center rounded-full bg-pink text-sm">{n}</span><T s={title} /></h2>
    {children}
  </section>
);

const EMPTY = { address_line1: "", address_line2: "", area: "", city: "", pincode: "", delivery_instructions: "" };

export default function Checkout() {
  const { user } = useAuth();
  const { items, clear } = useCart();
  const store = useStore();
  const navigate = useNavigate();
  const { t } = useLang();
  const [params] = useSearchParams();
  const [fulfilment, setFulfilment] = useState(params.get("f") === "pickup" ? "pickup" : "delivery");
  const [contact, setContact] = useState({ customer_name: user?.name || "", customer_phone: user?.phone || "" });
  const [addr, setAddr] = useState(EMPTY);
  const [saved, setSaved] = useState([]);
  const [saveAddress, setSaveAddress] = useState(true);
  const [timing, setTiming] = useState("asap");
  const [when, setWhen] = useState("");
  const [payment, setPayment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const idem = useRef(newKey());
  const coupon = sessionStorage.getItem("icepops_coupon") || "";
  const [useReward, setUseReward] = useRewardChoice();
  const { quote: q, loading } = useQuote({ coupon, fulfilment, useReward, pincode: fulfilment === "delivery" ? addr.pincode : "" });

  useEffect(() => {
    api.get("/account/addresses").then(({ data }) => {
      setSaved(data);
      const d = data.find((a) => a.is_default);
      if (d) pickAddress(d);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setPayment(fulfilment === "delivery" ? "pay_on_delivery" : "pay_at_pickup");
  }, [fulfilment]);

  const pickAddress = (a) => {
    setAddr({ address_line1: a.line1, address_line2: a.line2 || "", area: a.area, city: a.city, pincode: a.pincode, delivery_instructions: a.instructions || "" });
    setContact({ customer_name: a.name, customer_phone: a.phone });
    setSaveAddress(false);
  };

  useEffect(() => {
    if (!items.length && !submitting) navigate("/cart", { replace: true });
  }, [items.length, submitting, navigate]);

  if (!q || !store) return <PageLoader />;

  const methods = (store.payment_methods || []).filter((m) => m.code === "online" || (fulfilment === "delivery" ? m.code === "pay_on_delivery" : m.code === "pay_at_pickup"));
  const blocking = q.errors;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (timing === "later" && !when) return setError("Please choose your preferred time.");
    setSubmitting(true);
    try {
      const { data } = await api.post("/orders", {
        items, coupon_code: coupon || null, fulfilment_type: fulfilment, ...contact,
        ...(fulfilment === "delivery" ? addr : { delivery_instructions: addr.delivery_instructions, pincode: null }),
        preferred_time: timing === "later" ? `${when}:00+05:30` : null,
        payment_method: payment, save_address: fulfilment === "delivery" && saveAddress, idempotency_key: idem.current,
        expected_total_paise: q.total_paise, use_loyalty_reward: useReward,
      });
      clear();
      sessionStorage.removeItem("icepops_coupon");
      sessionStorage.removeItem("icepops_use_reward");
      toast.success(payment === "online" ? "Order saved — complete your payment" : "Order placed!");
      navigate(`/orders/${data.order_number}?placed=1${payment === "online" ? "&pay=1" : ""}`, { replace: true });
    } catch (err) {
      setError(errMsg(err));
      setSubmitting(false);
    }
  };

  const set = (setter, k) => (e) => setter((s) => ({ ...s, [k]: e.target.value }));

  return (
    <form onSubmit={submit} className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8" data-testid="checkout-page">
      <h1 className="mb-8 font-display text-4xl font-extrabold tracking-tight">{t("Checkout")}</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <Section n="1" title="Pickup or delivery">
            <div className="grid grid-cols-2 gap-3">
              {["delivery", "pickup"].map((f) => {
                const enabled = f === "delivery" ? store.delivery_enabled : store.pickup_enabled;
                return (
                  <button type="button" key={f} disabled={!enabled} onClick={() => setFulfilment(f)} data-testid={`checkout-fulfilment-${f}`}
                    className={`rounded-2xl border-2 p-4 text-left transition-colors disabled:opacity-40 ${fulfilment === f ? "border-choco bg-cream-deep" : "border-border"}`}>
                    <span className="block font-bold capitalize">{t(f)}</span>
                    <span className="text-xs text-muted-foreground">{f === "delivery" ? t("To your doorstep") : t("Collect from the parlour")}</span>
                  </button>
                );
              })}
            </div>
          </Section>
          <Section n="2" title="Your details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" id="cname"><input id="cname" required minLength={2} maxLength={80} data-testid="checkout-name-input" className={inputCls} value={contact.customer_name} onChange={set(setContact, "customer_name")} /></Field>
              <Field label="Mobile number" id="cphone"><input id="cphone" required inputMode="tel" pattern="(\+91[\s-]?)?[6-9]\d{9}" title="10-digit Indian mobile number" placeholder="98XXXXXXXX" data-testid="checkout-phone-input" className={inputCls} value={contact.customer_phone} onChange={set(setContact, "customer_phone")} /></Field>
            </div>
          </Section>
          {fulfilment === "delivery" && (
            <Section n="3" title="Delivery address">
              {saved.length > 0 && (
                <div className="mb-5 flex flex-wrap gap-2">
                  {saved.map((a) => <button type="button" key={a.id} data-testid={`checkout-saved-address-${a.id}`} onClick={() => pickAddress(a)} className={`rounded-full border px-4 py-2 text-xs font-bold ${addr.address_line1 === a.line1 && addr.pincode === a.pincode ? "border-choco bg-choco text-cream" : "border-border"}`}>{a.label} · {a.area} {a.pincode}</button>)}
                  <button type="button" data-testid="checkout-new-address" onClick={() => { setAddr(EMPTY); setSaveAddress(true); }} className="rounded-full border border-dashed border-choco px-4 py-2 text-xs font-bold">{t("+ New address")}</button>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><Field label="House / flat, street" id="l1"><input id="l1" required maxLength={200} data-testid="checkout-address-line1" className={inputCls} value={addr.address_line1} onChange={set(setAddr, "address_line1")} /></Field></div>
                <div className="sm:col-span-2"><Field label="Landmark (optional)" id="l2"><input id="l2" maxLength={200} data-testid="checkout-address-line2" className={inputCls} value={addr.address_line2} onChange={set(setAddr, "address_line2")} /></Field></div>
                <Field label="Area / locality" id="area"><input id="area" required maxLength={100} data-testid="checkout-area-input" className={inputCls} value={addr.area} onChange={set(setAddr, "area")} /></Field>
                <Field label="City" id="city"><input id="city" required maxLength={80} data-testid="checkout-city-input" className={inputCls} value={addr.city} onChange={set(setAddr, "city")} /></Field>
                <Field label="PIN code" id="pin"><input id="pin" required inputMode="numeric" pattern="[1-9][0-9]{5}" maxLength={6} title="6-digit PIN code" data-testid="checkout-pincode-input" className={inputCls} value={addr.pincode} onChange={(e) => setAddr((s) => ({ ...s, pincode: e.target.value.replace(/\D/g, "") }))} /></Field>
                <div className="self-end pb-3 text-xs" data-testid="checkout-zone-status">
                  {/^\d{6}$/.test(addr.pincode) && !loading && (q.delivery_zone ? <span className="font-bold text-pistachio">✓ We deliver here ({q.delivery_zone})</span> : <span className="font-bold text-strawberry">Not in our delivery area yet</span>)}
                </div>
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" data-testid="checkout-save-address" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} className="h-4 w-4 accent-[#3D2314]" />{t("Save this address for next time")}</label>
            </Section>
          )}
          <Section n={fulfilment === "delivery" ? "4" : "3"} title="Timing & instructions">
            <div className="mb-4 flex flex-wrap gap-2">
              {[["asap", "As soon as possible"], ["later", "Choose a time"]].map(([k, l]) => (
                <button type="button" key={k} data-testid={`checkout-timing-${k}`} onClick={() => setTiming(k)} className={`rounded-full border px-4 py-2 text-sm font-bold ${timing === k ? "border-choco bg-choco text-cream" : "border-border"}`}>{t(l)}</button>
              ))}
            </div>
            {timing === "later" && <input type="datetime-local" data-testid="checkout-preferred-time" className={`${inputCls} mb-4 max-w-xs`} value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Preferred time (IST)" />}
            {!store.status.open && timing === "asap" && <p className="mb-4 text-xs font-semibold text-strawberry" data-testid="checkout-closed-note">{store.status.reason} Please choose a time when we're open.</p>}
            <Field label={fulfilment === "delivery" ? "Delivery instructions (optional)" : "Notes for the shop (optional)"} id="instr">
              <textarea id="instr" rows={2} maxLength={300} data-testid="checkout-instructions" className={inputCls} value={addr.delivery_instructions} onChange={set(setAddr, "delivery_instructions")} />
            </Field>
          </Section>
          <Section n={fulfilment === "delivery" ? "5" : "4"} title="Payment">
            <div className="space-y-3" role="radiogroup">
              {methods.map((m) => (
                <label key={m.code} data-testid={`checkout-payment-${m.code}`} className={`flex items-center gap-3 rounded-2xl border-2 p-4 ${!m.enabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${payment === m.code ? "border-choco bg-cream-deep" : "border-border"}`}>
                  <input type="radio" name="payment" disabled={!m.enabled} checked={payment === m.code} onChange={() => setPayment(m.code)} className="accent-[#3D2314]" />
                  <span className="text-sm font-semibold">{t(m.label)}{m.code === "online" && !m.enabled && ` ${t("(not available right now)")}`}</span>
                </label>
              ))}
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5" />{payment === "online" ? "You'll pay securely in the Razorpay window. Your order is marked Paid only after the payment is confirmed." : "Your order is saved with payment status \"Pending\" until the shop records your payment."} We never ask for card or UPI PIN details.</p>
          </Section>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl border border-border bg-white p-6">
            <h2 className="font-display text-lg font-bold">{t("Order summary")}</h2>
            <CartLines lines={q.lines} />
            <PriceSummary q={q} fulfilment={fulfilment} />
          </div>
          <OfferNotes q={q} />
          {[...blocking, error].filter(Boolean).map((e) => <p key={e} data-testid="checkout-error" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-strawberry">{e}</p>)}
          <button type="submit" data-testid="checkout-submit-button" disabled={submitting || blocking.length > 0 || loading}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-strawberry py-4 font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}{payment === "online" ? `${t("Pay")} ${inr(q.total_paise)}` : t("Place order")}
          </button>
        </aside>
      </div>
    </form>
  );
}
