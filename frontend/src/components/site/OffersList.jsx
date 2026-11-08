import { useEffect, useState } from "react";
import { BadgePercent, Check, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/context/StoreContext";
import { useLang } from "@/context/LangContext";

const AUTO = ["first_order", "wednesday_bogo", "family_pack", "free_delivery", "loyalty"];

export const OffersList = ({ applied, onApply, appliedCodes = [] }) => {
  const store = useStore();
  const [coupons, setCoupons] = useState([]);
  const { t } = useLang();
  useEffect(() => {
    api.get("/coupons/available").then(({ data }) => setCoupons(data)).catch(() => {});
  }, []);
  const autos = (store?.promotions || []).filter((p) => AUTO.includes(p.code));
  if (!coupons.length && !autos.length) return null;

  return (
    <div className="space-y-3 rounded-3xl border border-border bg-white p-5" data-testid="offers-list">
      <p className="flex items-center gap-2 font-display font-bold"><BadgePercent className="h-5 w-5 text-strawberry" />{t("Available offers")}</p>
      {coupons.map((c) => (
        <div key={c.code} data-testid={`offer-coupon-${c.code}`} className="rounded-2xl border-2 border-dashed border-pink p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="rounded-lg bg-choco px-2 py-1 font-mono text-xs font-bold tracking-wider text-cream">{c.code}</span>
              <p className="mt-2 text-sm font-bold">{c.title}{c.description ? ` — ${c.description}` : ""}</p>
            </div>
            {applied === c.code ? (
              <span className="flex items-center gap-1 text-xs font-bold text-pistachio"><Check className="h-4 w-4" />{t("Applied")}</span>
            ) : (
              <button data-testid={`offer-apply-${c.code}`} onClick={() => onApply(c.code)} className="rounded-full bg-strawberry px-4 py-2 text-xs font-bold text-white">{t("Apply")}</button>
            )}
          </div>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">{c.conditions.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      ))}
      {autos.length > 0 && <p className="pt-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("Applied automatically — no code needed")}</p>}
      {autos.map((p) => (
        <div key={p.code} data-testid={`offer-auto-${p.code}`} className="flex gap-3 rounded-2xl bg-cream-deep p-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-mango" />
          <div className="text-sm">
            <p className="font-bold">{p.name}{appliedCodes.includes(p.code) && <span className="ml-2 text-xs text-pistachio">✓ {t("Applied")}</span>}</p>
            <p className="text-xs text-muted-foreground">{p.description}</p>
          </div>
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">{t("We always pick the combination that makes your total lowest — including free delivery.")}</p>
    </div>
  );
};
