import { inr } from "@/lib/format";
import { useLang } from "@/context/LangContext";

const Row = ({ label, value, testid, className = "" }) => (
  <div className={`flex items-center justify-between text-sm ${className}`}>
    <span>{label}</span>
    <span data-testid={testid} className="font-semibold">{value}</span>
  </div>
);

export const PriceSummary = ({ q, fulfilment, walletDeducted = 0 }) => {
  const { t } = useLang();
  const effectiveWallet = walletDeducted || q.wallet_deducted_paise || 0;
  const finalPayable = effectiveWallet > 0 && q.total_paise > 0 && !q.wallet_deducted_paise
    ? Math.max(0, q.total_paise - effectiveWallet)
    : q.total_paise;

  return (
    <div className="space-y-2.5" data-testid="price-summary">
      <Row label={t("Item subtotal")} value={inr(q.subtotal_paise)} testid="summary-subtotal" />
      {q.discounts.map((d) => (
        <Row key={d.code} label={d.label} value={`− ${inr(d.amount_paise)}`} testid={`summary-discount-${d.code}`} className="text-pistachio" />
      ))}
      {fulfilment === "delivery" ? (
        <Row label={t("Delivery fee")} testid="summary-delivery-fee"
          value={q.delivery_savings_paise ? <><s className="mr-1.5 text-muted-foreground">{inr(q.delivery_savings_paise)}</s><span className="text-pistachio">{t("FREE")}</span></> : inr(q.delivery_fee_paise)} />
      ) : <Row label={t("Pickup")} value={t("Free")} testid="summary-pickup" />}
      {q.tip_paise > 0 && (
        <Row label={`❤️ ${t("Delivery Partner Tip")}`} value={`+ ${inr(q.tip_paise)}`} testid="summary-tip" className="text-amber-800 font-semibold" />
      )}
      {effectiveWallet > 0 && (
        <Row label={t("ICEPOPS Wallet applied")} value={`− ${inr(effectiveWallet)}`} testid="summary-wallet-deduction" className="text-emerald-700 font-semibold" />
      )}
      <div className="my-2 border-t border-dashed border-border" />
      <div className="flex items-center justify-between">
        <span className="font-display text-lg font-bold">{t("To pay")}</span>
        <span data-testid="summary-total" className="font-display text-2xl font-extrabold">{inr(finalPayable)}</span>
      </div>
      {(q.discount_paise + q.delivery_savings_paise + effectiveWallet) > 0 && (
        <p data-testid="summary-savings" className="rounded-xl bg-pistachio/10 px-3 py-2 text-center text-xs font-bold text-pistachio">
          {t("You save")} {inr(q.discount_paise + q.delivery_savings_paise + effectiveWallet)} {t("on this order")}
        </p>
      )}
    </div>
  );
};
