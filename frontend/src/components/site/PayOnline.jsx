import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CreditCard, Landmark, Loader2, Smartphone, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { inr } from "@/lib/format";
import { useLang } from "@/context/LangContext";

const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";
const loadScript = () => new Promise((resolve, reject) => {
  if (window.Razorpay) return resolve();
  const s = document.createElement("script");
  s.src = SCRIPT;
  s.onload = resolve;
  s.onerror = () => reject(new Error("load"));
  document.body.appendChild(s);
});

export const PaidTick = () => {
  const { t } = useLang();
  return (
  <div data-testid="order-paid-tick" className="rise flex items-center gap-3 rounded-3xl bg-pistachio/15 p-5">
    <CheckCircle2 className="h-10 w-10 shrink-0 text-pistachio" />
    <div><p className="font-display text-lg font-extrabold">{t("Paid")}</p><p className="text-sm text-muted-foreground">{t("Your online payment is confirmed.")}</p></div>
  </div>
  );
};

export const PayOnline = ({ o, autoStart, onChange }) => {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(o.payment_error || "");
  const [walletBalance, setWalletBalance] = useState(0);
  const started = useRef(false);
  const { t } = useLang();

  useEffect(() => {
    api.get("/giftcards/wallet").then(({ data }) => setWalletBalance(data.wallet_balance_paise || 0)).catch(() => {});
  }, []);

  const pay = useCallback(async () => {
    setBusy(true);
    setFailed("");
    try {
      await loadScript();
      const { data } = await api.post("/payments/razorpay/order", { order_number: o.order_number });
      const rzp = new window.Razorpay({
        key: data.key_id, order_id: data.razorpay_order_id, amount: data.amount, currency: data.currency,
        name: data.name, description: data.description, prefill: data.prefill, theme: { color: "#3D2314" },
        handler: async (resp) => {
          try {
            const { data: order } = await api.post("/payments/razorpay/verify", { order_number: o.order_number, ...resp });
            toast.success("Payment received!");
            onChange(order);
          } catch (e) {
            setFailed(errMsg(e));
          }
          setBusy(false);
        },
        modal: { ondismiss: () => { setBusy(false); setFailed((f) => f || "Payment was cancelled."); } },
      });
      rzp.on("payment.failed", (r) => setFailed(r?.error?.description || "Payment didn't go through."));
      rzp.open();
    } catch (e) {
      setFailed(e?.message === "load" ? "Couldn't open the payment window. Check your internet and try again." : errMsg(e));
      setBusy(false);
    }
  }, [o.order_number, onChange]);

  useEffect(() => {
    if (autoStart && !started.current) { started.current = true; pay(); }
  }, [autoStart, pay]);

  const switchTo = async () => {
    const method = o.fulfilment_type === "delivery" ? "pay_on_delivery" : "pay_at_pickup";
    try {
      const { data } = await api.post("/payments/switch-method", { order_number: o.order_number, payment_method: method });
      toast.success(o.fulfilment_type === "delivery" ? "You'll pay on delivery" : "You'll pay at pickup");
      onChange(data);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div data-testid="pay-online-card" className="space-y-4 rounded-3xl border-2 border-choco bg-white p-6">
      <div>
        <p className="font-display text-lg font-extrabold">{t("Pay online")}</p>
        <p className="mt-1 flex flex-wrap items-center gap-3 text-xs font-semibold text-muted-foreground">
          <span className="flex items-center gap-1"><Smartphone className="h-4 w-4" />UPI</span>
          <span className="flex items-center gap-1"><CreditCard className="h-4 w-4" />Card</span>
          <span className="flex items-center gap-1"><Landmark className="h-4 w-4" />Netbanking</span>
        </p>
      </div>
      {failed && <p data-testid="pay-online-error" className="rounded-2xl bg-mango/15 px-4 py-3 text-sm font-semibold">{t("Payment didn't go through")} — {failed.replace(/^Payment didn't go through\.?\s*/, "") || "please try again."} {t("No money was taken for this attempt.")}</p>}
      
      {walletBalance >= o.total_paise && (
        <button
          type="button"
          data-testid="pay-wallet-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const { data } = await api.post("/payments/wallet/pay", { order_number: o.order_number });
              toast.success("Paid with ICEPOPS Wallet!");
              onChange(data);
            } catch (e) {
              toast.error(errMsg(e));
            } finally {
              setBusy(false);
            }
          }}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 py-3.5 font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60 shadow-sm"
        >
          <Wallet className="h-4 w-4" /> {t("Pay")} {inr(o.total_paise)} {t("from Wallet")} ({inr(walletBalance)} available)
        </button>
      )}

      <button data-testid="pay-online-button" onClick={pay} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-strawberry py-4 font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}{failed ? t("Try again") : t("Pay")} {inr(o.total_paise)} {t("via Razorpay")}
      </button>
      <button data-testid="pay-online-switch" onClick={switchTo} className="w-full text-center text-sm font-bold text-choco underline-offset-4 hover:underline">
        {t(o.fulfilment_type === "delivery" ? "Pay on delivery instead" : "Pay at pickup instead")}
      </button>
    </div>
  );
};
