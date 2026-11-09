import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Gift, Loader2, Lock, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, newKey } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useStore } from "@/context/StoreContext";
import { useQuote } from "@/hooks/useQuote";
import { PriceSummary } from "@/components/site/PriceSummary";
import { CartLines, OfferNotes, RewardToggle, useRewardChoice } from "@/pages/Cart";
import { PageLoader } from "@/components/site/Guards";
import { TimeSlotPicker } from "@/components/site/TimeSlotPicker";
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
  const { user, setUser } = useAuth();
  const { items, clear } = useCart();
  const store = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLang();
  const [params] = useSearchParams();
  const [fulfilment, setFulfilment] = useState(params.get("f") === "pickup" ? "pickup" : "delivery");
  const [contact, setContact] = useState({
    customer_name: user?.name || "",
    customer_phone: user?.phone || "",
    customer_email: user?.email && !user.email.endsWith("@customer.icepops.in") ? user.email : "",
  });
  const [addr, setAddr] = useState(EMPTY);
  const [saved, setSaved] = useState([]);
  const [saveAddress, setSaveAddress] = useState(true);
  const [timing, setTiming] = useState("asap");
  const [when, setWhen] = useState("");
  const [payment, setPayment] = useState("");
  const [walletBalance, setWalletBalance] = useState(user?.wallet_balance_paise || 0);
  const [useWallet, setUseWallet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const idem = useRef(newKey());
  const coupon = sessionStorage.getItem("icepops_coupon") || "";
  const [tipPaise, setTipPaise] = useState(0);
  const [isCustomTip, setIsCustomTip] = useState(false);
  const [customTip, setCustomTip] = useState("");
  const [referral, setReferral] = useState(() => localStorage.getItem("icepops_referral") || "");
  const [referralInput, setReferralInput] = useState("");
  const [useReward, setUseReward] = useRewardChoice();
  const { quote: q, loading } = useQuote({
    coupon,
    fulfilment,
    useReward,
    pincode: fulfilment === "delivery" ? addr.pincode : "",
    tip_paise: tipPaise,
    referral_code: referral,
  });

  useEffect(() => {
    if (user) {
      setContact((prev) => ({
        customer_name: prev.customer_name || user.name || "",
        customer_phone: prev.customer_phone || user.phone || "",
        customer_email: prev.customer_email || (user.email && !user.email.endsWith("@customer.icepops.in") ? user.email : ""),
      }));
      api.get("/giftcards/wallet")
        .then(({ data }) => setWalletBalance(data.wallet_balance_paise || 0))
        .catch(() => {});
    }
  }, [user]);

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

  const orderTotal = q ? q.total_paise : 0;
  const isWalletFull = payment === "wallet" || (useWallet && walletBalance >= orderTotal);
  const walletDeducted = isWalletFull ? orderTotal : (useWallet ? Math.min(walletBalance, orderTotal) : 0);
  const payableTotal = Math.max(0, orderTotal - walletDeducted);

  const methods = (store.payment_methods || []).filter((m) => m.code === "online" || (fulfilment === "delivery" ? m.code === "pay_on_delivery" : m.code === "pay_at_pickup"));
  const blocking = q.errors;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (timing === "later" && !when) return setError("Please choose your preferred time.");
    if (store?.status && !store.status.open && timing === "asap") {
      return setError(`The parlour is currently closed (${store.status.reason}). Please select "Choose a time" above to schedule when we are open.`);
    }
    setSubmitting(true);
    try {
      const effectiveMethod = payableTotal === 0 ? "wallet" : payment;
      const { data } = await api.post("/orders", {
        items, coupon_code: coupon || null, fulfilment_type: fulfilment, ...contact,
        ...(fulfilment === "delivery" ? addr : { delivery_instructions: addr.delivery_instructions, pincode: null }),
        preferred_time: timing === "later" ? `${when}:00+05:30` : null,
        payment_method: effectiveMethod,
        use_wallet: useWallet || effectiveMethod === "wallet",
        save_address: fulfilment === "delivery" && saveAddress,
        idempotency_key: idem.current,
        expected_total_paise: payableTotal > 0 ? payableTotal : q.total_paise,
        use_loyalty_reward: useReward,
        tip_paise: tipPaise,
        referral_code: referral || null,
      });
      if (data.token) {
        localStorage.setItem("icepops_token", data.token);
      }
      if (data.user && setUser) {
        setUser(data.user);
      }
      clear();
      sessionStorage.removeItem("icepops_coupon");
      sessionStorage.removeItem("icepops_use_reward");
      localStorage.removeItem("icepops_referral");
      toast.success(
        effectiveMethod === "wallet"
          ? "Paid with ICEPOPS Wallet! Order confirmed."
          : effectiveMethod === "online"
          ? "Order saved — complete your payment"
          : "Order placed!"
      );
      navigate(`/orders/${data.order_number}?placed=1${effectiveMethod === "online" && data.payment_status !== "paid" ? "&pay=1" : ""}`, { replace: true });
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
              <Field label="Mobile number" id="cphone"><input id="cphone" required inputMode="tel" pattern="(\+91[\s\-]?)?[6-9][0-9]{9}" title="10-digit Indian mobile number" placeholder="98XXXXXXXX" data-testid="checkout-phone-input" className={inputCls} value={contact.customer_phone} onChange={set(setContact, "customer_phone")} /></Field>
              <div className="sm:col-span-2">
                <Field label="Email address (for order receipt & tracking updates)" id="cemail">
                  <input id="cemail" type="email" placeholder="you@example.com" data-testid="checkout-email-input" className={inputCls} value={contact.customer_email || ""} onChange={set(setContact, "customer_email")} />
                </Field>
              </div>
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
            {timing === "later" && <TimeSlotPicker value={when} onChange={setWhen} />}
            {!store.status.open && (
              <div className="mb-4 rounded-2xl bg-amber-50 border border-amber-200/80 p-3.5 text-xs text-amber-900" data-testid="checkout-closed-note">
                <p className="font-bold">⚠️ Store Status: {store.status.reason}</p>
                {timing === "asap" ? (
                  <p className="mt-1">We are currently closed for instant delivery. Please select <strong>"Choose a time"</strong> above to schedule delivery when we are open.</p>
                ) : (
                  <p className="mt-1">Please ensure your chosen time is during opening hours ({store.status.reason}).</p>
                )}
              </div>
            )}
            <Field label={fulfilment === "delivery" ? "Delivery instructions (optional)" : "Notes for the shop (optional)"} id="instr">
              <textarea id="instr" rows={2} maxLength={300} data-testid="checkout-instructions" className={inputCls} value={addr.delivery_instructions} onChange={set(setAddr, "delivery_instructions")} />
            </Field>
          </Section>
          {fulfilment === "delivery" && (
            <Section n="5" title="Delivery Partner Tip">
              <div className="rounded-2xl bg-amber-50/70 border border-amber-200/80 p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500 text-white font-bold shadow-sm text-lg">
                    ☀️
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-extrabold text-choco">
                      Support Your Delivery Partner
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      100% of your tip goes directly to your rider navigating hot afternoons.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {[
                    { label: "No tip", val: 0 },
                    { label: "₹10 😊", val: 1000 },
                    { label: "₹20 🥤", val: 2000 },
                    { label: "₹30 🦸", val: 3000 },
                  ].map((pill) => {
                    const isSelected = tipPaise === pill.val && !isCustomTip;
                    return (
                      <button
                        key={pill.val}
                        type="button"
                        onClick={() => {
                          setTipPaise(pill.val);
                          setIsCustomTip(false);
                        }}
                        className={`rounded-full px-4 py-1.5 text-xs font-bold border transition-all ${
                          isSelected
                            ? "border-choco bg-choco text-cream shadow-xs"
                            : "border-border bg-white text-choco hover:border-choco/60"
                        }`}
                      >
                        {pill.label}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setIsCustomTip(true)}
                    className={`rounded-full px-4 py-1.5 text-xs font-bold border transition-all ${
                      isCustomTip
                        ? "border-choco bg-choco text-cream shadow-xs"
                        : "border-border bg-white text-choco hover:border-choco/60"
                    }`}
                  >
                    Custom
                  </button>
                </div>

                {isCustomTip && (
                  <div className="mt-3 flex items-center gap-2 max-w-xs">
                    <span className="text-sm font-bold text-choco">₹</span>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={customTip}
                      onChange={(e) => {
                        const val = Math.max(0, parseInt(e.target.value) || 0);
                        setCustomTip(e.target.value);
                        setTipPaise(val * 100);
                      }}
                      placeholder="Enter tip (e.g. 15, 50)"
                      className="w-full rounded-xl border border-border bg-white px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-pink font-semibold"
                    />
                  </div>
                )}
              </div>
            </Section>
          )}
          <Section n={fulfilment === "delivery" ? "6" : "4"} title="Payment">
            {/* Wallet Balance Card */}
            {user && (
              <div className="mb-5 rounded-2xl bg-gradient-to-r from-amber-50/90 via-orange-50/50 to-pink-light/30 border border-amber-200/80 p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-choco text-cream font-bold">
                      <Wallet className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-choco/70">ICEPOPS Digital Wallet</p>
                      <p className="text-sm font-semibold text-choco">
                        Available Balance: <span className="font-extrabold text-emerald-700 text-base">{inr(walletBalance)}</span>
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/giftcards"
                    target="_blank"
                    className="shrink-0 text-xs font-bold text-strawberry hover:underline"
                  >
                    + Redeem voucher
                  </Link>
                </div>

                {walletBalance > 0 && (
                  <div className="mt-3 pt-3 border-t border-amber-200/60 flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-choco">
                      <input
                        type="checkbox"
                        checked={useWallet || payment === "wallet"}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setUseWallet(checked);
                          if (checked && walletBalance >= orderTotal) {
                            setPayment("wallet");
                          } else if (!checked && payment === "wallet") {
                            setPayment(fulfilment === "delivery" ? "pay_on_delivery" : "pay_at_pickup");
                          }
                        }}
                        className="h-4 w-4 rounded accent-[#3D2314]"
                      />
                      <span>
                        Use ICEPOPS Wallet balance{" "}
                        <span className="text-emerald-700">({inr(Math.min(walletBalance, orderTotal))} applied)</span>
                      </span>
                    </label>
                    <span className="text-xs font-bold text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full">
                      {walletBalance >= orderTotal ? "Covers 100% of order" : `Saves ${inr(Math.min(walletBalance, orderTotal))}`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* If 100% covered by wallet */}
            {payableTotal === 0 ? (
              <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50/70 p-4 space-y-1">
                <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <span>Your entire order of {inr(orderTotal)} will be paid using your ICEPOPS Wallet!</span>
                </div>
                <p className="text-xs text-emerald-700 pl-7">
                  Instant confirmation upon clicking Pay Order below. Remaining balance after order: {inr(walletBalance - orderTotal)}.
                </p>
              </div>
            ) : (
              <div className="space-y-3" role="radiogroup">
                {/* Full Wallet Payment Option if sufficient */}
                {user && walletBalance >= orderTotal && (
                  <label
                    data-testid="checkout-payment-wallet"
                    className={`flex items-start gap-3 rounded-2xl border-2 p-4 cursor-pointer transition-all ${
                      payment === "wallet" ? "border-choco bg-cream-deep shadow-sm" : "border-border hover:border-choco/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment"
                      checked={payment === "wallet"}
                      onChange={() => {
                        setPayment("wallet");
                        setUseWallet(true);
                      }}
                      className="mt-1 accent-[#3D2314]"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-choco">Pay fully with ICEPOPS Wallet</span>
                        <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                          Balance: {inr(walletBalance)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Deducts {inr(orderTotal)} from your wallet. Your order will be marked Paid immediately.
                      </p>
                    </div>
                  </label>
                )}

                {/* Standard Methods */}
                {methods.map((m) => (
                  <label
                    key={m.code}
                    data-testid={`checkout-payment-${m.code}`}
                    className={`flex items-center gap-3 rounded-2xl border-2 p-4 ${
                      !m.enabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                    } ${payment === m.code && payableTotal > 0 ? "border-choco bg-cream-deep" : "border-border"}`}
                  >
                    <input
                      type="radio"
                      name="payment"
                      disabled={!m.enabled}
                      checked={payment === m.code && payableTotal > 0}
                      onChange={() => setPayment(m.code)}
                      className="accent-[#3D2314]"
                    />
                    <span className="text-sm font-semibold">
                      {t(m.label)}
                      {m.code === "online" && !m.enabled && ` ${t("(not available right now)")}`}
                      {walletDeducted > 0 && payableTotal > 0 && ` (Pay remaining ${inr(payableTotal)})`}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {payment === "wallet" || payableTotal === 0 ? (
              <p className="mt-4 flex items-center gap-2 text-xs text-emerald-800 font-semibold bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                Paid securely from your wallet balance. Instant order confirmation — no card, UPI PIN or cash handling required.
              </p>
            ) : (
              <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5" />
                {payment === "online"
                  ? "You'll pay securely in the Razorpay window. Your order is marked Paid only after the payment is confirmed."
                  : 'Your order is saved with payment status "Pending" until the shop records your payment.'}{" "}
                We never ask for card or UPI PIN details.
              </p>
            )}
          </Section>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl border border-border bg-white p-6">
            <h2 className="font-display text-lg font-bold">{t("Order summary")}</h2>
            <CartLines lines={q.lines} />
            <PriceSummary q={q} fulfilment={fulfilment} walletDeducted={walletDeducted} />
          </div>
          <OfferNotes q={q} />
          {[...blocking, error].filter(Boolean).map((e) => (
            <div key={e} data-testid="checkout-error" className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-strawberry space-y-2">
              <p>{e}</p>
              {typeof e === "string" && e.toLowerCase().includes("log in") && (
                <button
                  type="button"
                  onClick={() => navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)}
                  className="inline-block rounded-full bg-strawberry px-4 py-2 text-xs font-bold text-white shadow hover:opacity-90"
                >
                  {t("Log in to continue")}
                </button>
              )}
            </div>
          ))}
          <button type="submit" data-testid="checkout-submit-button" disabled={submitting || blocking.length > 0 || loading}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-strawberry py-4 font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {payableTotal === 0 || payment === "wallet"
              ? `Pay ${inr(orderTotal)} with Wallet`
              : payment === "online"
              ? `${t("Pay")} ${inr(payableTotal)}`
              : `${t("Place order")} (${inr(payableTotal)})`}
          </button>
        </aside>
      </div>
    </form>
  );
}
