import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Info, Minus, Plus, ShoppingBag, Sparkles, Trash2 } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { useQuote } from "@/hooks/useQuote";
import { PriceSummary } from "@/components/site/PriceSummary";
import { PageLoader } from "@/components/site/Guards";
import { inr } from "@/lib/format";
import { WhatsAppCartButton } from "@/components/site/WhatsApp";
import { OffersList } from "@/components/site/OffersList";
import { StampCard } from "@/components/site/StampCard";
import { Switch } from "@/components/ui/switch";
import { useLang } from "@/context/LangContext";

const T = ({ s }) => useLang().t(s);

export const RewardToggle = ({ q, useReward, setUseReward }) => {
  const l = q.loyalty;
  if (!l?.enabled) return null;
  return (
    <div className="space-y-3">
      <StampCard l={l} compact />
      {l.available_rewards > 0 && (
        <label data-testid="use-reward-toggle" className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-pink-light px-4 py-3 text-sm font-bold">
          <T s="Use my free popsicle" />
          <Switch data-testid="use-reward-switch" checked={useReward} onCheckedChange={setUseReward} aria-label="Use my free popsicle" />
        </label>
      )}
    </div>
  );
};

export const useRewardChoice = () => {
  const [useReward, set] = useState(sessionStorage.getItem("icepops_use_reward") === "1");
  const setUseReward = (v) => {
    sessionStorage.setItem("icepops_use_reward", v ? "1" : "0");
    set(v);
  };
  return [useReward, setUseReward];
};

export const CartLines = ({ lines, setQty }) => {
  const { t } = useLang();
  return (
  <ul className="divide-y divide-border">
    {lines.map((l) => (
      <li key={l.variant_id} className="flex gap-4 py-3.5 first:pt-2 last:pb-2" data-testid={`cart-line-${l.variant_id}`}>
        <img src={l.image_url || "/images/placeholder.jpg"} alt={l.product_name} className="h-16 w-16 shrink-0 rounded-xl object-cover bg-muted" onError={(e) => { e.currentTarget.src = "/images/cream-1.jpg"; }} />
        <div className="flex flex-1 flex-col gap-1.5 justify-center">
          <div className="flex justify-between gap-3 items-start">
            <div>
              {l.product_slug ? (
                <Link to={`/menu/${l.product_slug}`} className="font-display font-bold hover:text-strawberry leading-tight">{l.product_name}</Link>
              ) : (
                <span className="font-display font-bold text-muted-foreground leading-tight">{l.product_name}</span>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">{l.variant_name} · {inr(l.unit_price_paise)} {t("each")}</p>
              {l.free_quantity > 0 && <p data-testid={`cart-line-free-${l.variant_id}`} className="mt-1 inline-block rounded-full bg-pistachio/15 px-2 py-0.5 text-[11px] font-bold text-pistachio">{l.free_quantity} {t("free")}</p>}
              {!l.available && (
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-xs font-bold text-strawberry">{l.product_id === 0 ? t("Item discontinued") : t("Unavailable in this quantity")}</p>
                  <button onClick={() => setQty(l.variant_id, 0)} className="text-xs font-semibold text-strawberry underline hover:text-red-700">{t("Remove")}</button>
                </div>
              )}
            </div>
            <div className="text-right">
              <p className="font-bold text-base" data-testid={`cart-line-total-${l.variant_id}`}>{inr(l.line_total_paise - l.discount_paise)}</p>
              {l.discount_paise > 0 && <s className="text-xs text-muted-foreground">{inr(l.line_total_paise)}</s>}
            </div>
          </div>
          {setQty && (
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center rounded-full border border-border bg-white shadow-xs">
                <button aria-label="Decrease quantity" data-testid={`cart-decrease-${l.variant_id}`} className="px-2 py-1 text-muted-foreground hover:text-foreground" onClick={() => setQty(l.variant_id, l.quantity - 1)}><Minus className="h-3 w-3" /></button>
                <span data-testid={`cart-qty-${l.variant_id}`} className="w-6 text-center text-xs font-bold">{l.quantity}</span>
                <button aria-label="Increase quantity" data-testid={`cart-increase-${l.variant_id}`} className="px-2 py-1 text-muted-foreground hover:text-foreground" onClick={() => setQty(l.variant_id, l.quantity + 1)}><Plus className="h-3 w-3" /></button>
              </div>
              <button aria-label="Remove item" data-testid={`cart-remove-${l.variant_id}`} onClick={() => setQty(l.variant_id, 0)} className="text-muted-foreground hover:text-strawberry p-1"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          )}
        </div>
      </li>
    ))}
  </ul>
  );
};

export const OfferNotes = ({ q }) => (
  <>
    {q.free_delivery_remaining_paise > 0 && (
      <div className="rounded-2xl bg-white p-3.5 border border-border" data-testid="free-delivery-progress">
        <p className="mb-1.5 text-xs font-bold text-emerald-950">Add {inr(q.free_delivery_remaining_paise)} more for FREE delivery</p>
        <div className="h-2 overflow-hidden rounded-full bg-emerald-100">
          <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${Math.max(5, 100 - (q.free_delivery_remaining_paise / (q.subtotal_paise - q.discount_paise + q.free_delivery_remaining_paise)) * 100)}%` }} />
        </div>
      </div>
    )}
    {q.notes.filter((n) => !n.startsWith("Add ₹") || !n.includes("FREE delivery")).map((n, i) => (
      <div
        key={i}
        data-testid={`offer-note-${i}`}
        className="flex items-start gap-2.5 rounded-2xl border border-emerald-200/90 bg-emerald-50/90 p-3 text-xs font-semibold text-emerald-900 shadow-2xs"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
        <span className="leading-snug">{n}</span>
      </div>
    ))}
  </>
);

export default function Cart() {
  const { items, setQty, clear } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [coupon, setCoupon] = useState(sessionStorage.getItem("icepops_coupon") || "");
  const [couponInput, setCouponInput] = useState(coupon);
  const [fulfilment, setFulfilment] = useState("delivery");
  const [useReward, setUseReward] = useRewardChoice();
  const { quote: q, loading, error, refetch } = useQuote({ coupon, fulfilment, useReward });

  const applyCoupon = (code) => {
    setCoupon(code);
    setCouponInput(code);
    sessionStorage.setItem("icepops_coupon", code);
  };

  if (!items.length) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center" data-testid="cart-empty">
        <ShoppingBag className="mx-auto h-12 w-12 text-pink" />
        <h1 className="mt-4 font-display text-3xl font-extrabold"><T s="Your cart is empty" /></h1>
        <p className="mt-2 text-muted-foreground"><T s="Time for something sweet." /></p>
        <Link to="/menu" data-testid="cart-browse-menu" className="mt-6 inline-block rounded-full bg-choco px-7 py-3 font-bold text-cream"><T s="Browse the menu" /></Link>
      </div>
    );
  }
  if (!q) {
    return loading ? (
      <PageLoader />
    ) : (
      <div className="mx-auto max-w-md px-4 py-16 text-center" data-testid="cart-load-error">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-strawberry">
          <Info className="h-7 w-7" />
        </div>
        <h2 className="font-display text-2xl font-bold"><T s="Couldn't load your cart" /></h2>
        <p className="mt-2 text-xs text-muted-foreground">
          {error || "We encountered an issue checking live prices and stock. Please refresh or reset your cart."}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => refetch()}
            className="rounded-full bg-choco px-6 py-2.5 text-xs font-bold text-cream shadow transition-opacity hover:opacity-90"
          >
            <T s="Retry" />
          </button>
          <button
            onClick={() => clear()}
            className="rounded-full border border-border bg-white px-6 py-2.5 text-xs font-bold text-foreground hover:bg-muted"
          >
            <T s="Clear Cart & Start Fresh" />
          </button>
        </div>
      </div>
    );
  }

  const hasUnavailable = q.lines.some((l) => !l.available);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8" data-testid="cart-page">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="font-display text-3xl font-extrabold tracking-tight"><T s="Your cart" /></h1>
        <button
          onClick={() => clear()}
          className="text-xs font-semibold text-muted-foreground hover:text-strawberry underline"
        >
          <T s="Clear cart" />
        </button>
      </div>

      {hasUnavailable && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-strawberry">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0" />
            <span><T s="Some items in your cart are no longer available or out of stock." /></span>
          </div>
          <button
            onClick={() => {
              q.lines.filter((l) => !l.available).forEach((l) => setQty(l.variant_id, 0));
            }}
            className="rounded-full bg-strawberry px-3.5 py-1 text-xs font-bold text-white shadow hover:opacity-90"
          >
            <T s="Remove unavailable items" />
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] items-start">
        {/* Left column: Cart Items list - hugs content tightly with h-fit and self-start */}
        <div className="rounded-2xl border border-border bg-white px-5 py-3 shadow-sm h-fit self-start">
          <CartLines lines={q.lines} setQty={setQty} />
        </div>

        {/* Right column: Order Summary & Checkout Sidebar */}
        <aside className="space-y-3.5 lg:sticky lg:top-24 lg:self-start">
          <div className="grid grid-cols-2 rounded-full bg-muted p-1" role="radiogroup" aria-label="Pickup or delivery">
            {["delivery", "pickup"].map((f) => (
              <button key={f} role="radio" aria-checked={fulfilment === f} data-testid={`cart-fulfilment-${f}`} onClick={() => setFulfilment(f)}
                className={`rounded-full py-2 text-xs font-bold capitalize transition-colors ${fulfilment === f ? "bg-white shadow" : "text-muted-foreground"}`}><T s={f} /></button>
            ))}
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); applyCoupon(couponInput.trim().toUpperCase()); }}>
            <input data-testid="cart-coupon-input" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} placeholder="Coupon code" aria-label="Coupon code"
              className="min-w-0 flex-1 rounded-full border border-border bg-white px-4 py-2 text-xs uppercase outline-none focus:ring-2 focus:ring-pink" />
            {coupon ? <button type="button" data-testid="cart-coupon-remove" onClick={() => { applyCoupon(""); setCouponInput(""); }} className="rounded-full border border-choco px-3.5 text-xs font-bold"><T s="Remove" /></button>
              : <button data-testid="cart-coupon-apply" className="rounded-full bg-choco px-4 text-xs font-bold text-cream"><T s="Apply" /></button>}
          </form>
          {q.coupon_error && <p data-testid="cart-coupon-error" className="text-xs font-semibold text-strawberry">{q.coupon_error}</p>}
          {coupon && q.coupon_code && <p data-testid="cart-coupon-success" className="text-xs font-semibold text-pistachio">Coupon {q.coupon_code} applied</p>}
          <OffersList applied={q.coupon_code} onApply={applyCoupon} appliedCodes={q.discounts.map((d) => d.code).concat(q.delivery_savings_paise ? ["free_delivery"] : [])} />
          <OfferNotes q={q} />
          {user && <RewardToggle q={q} useReward={useReward} setUseReward={setUseReward} />}
          <div className={`rounded-2xl border border-border bg-white p-5 shadow-sm transition-opacity ${loading ? "opacity-60" : ""}`}><PriceSummary q={q} fulfilment={fulfilment} /></div>
          {q.errors.filter((e) => !e.includes("PIN")).map((e) => <p key={e} className="text-xs font-semibold text-strawberry" data-testid="cart-error">{e}</p>)}
          <button data-testid="cart-checkout-button" disabled={q.lines.length === 0 || q.lines.some((l) => !l.available)}
            onClick={() => navigate(user ? `/checkout?f=${fulfilment}` : `/login?next=${encodeURIComponent(`/checkout?f=${fulfilment}`)}`)}
            className="w-full rounded-full bg-strawberry py-3.5 font-bold text-white shadow-md transition-transform hover:-translate-y-0.5 disabled:opacity-50">
            {user ? <T s="Proceed to checkout" /> : <T s="Log in to checkout" />}
          </button>
          <WhatsAppCartButton q={q} fulfilment={fulfilment} />
        </aside>
      </div>
    </div>
  );
}
