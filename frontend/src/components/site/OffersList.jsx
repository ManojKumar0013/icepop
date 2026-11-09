import { useEffect, useState } from "react";
import { BadgePercent, Check, ChevronDown, Sparkles, Tag, X } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/context/StoreContext";
import { useLang } from "@/context/LangContext";

const AUTO = ["first_order", "wednesday_bogo", "family_pack", "free_delivery", "loyalty"];

export const OffersList = ({ applied, onApply, appliedCodes = [] }) => {
  const store = useStore();
  const [coupons, setCoupons] = useState([]);
  const [open, setOpen] = useState(false);
  const { t } = useLang();

  useEffect(() => {
    api.get("/coupons/available").then(({ data }) => setCoupons(data)).catch(() => {});
  }, []);

  const autos = (store?.promotions || []).filter((p) => AUTO.includes(p.code));
  const totalOffers = coupons.length + autos.length;

  if (!totalOffers) return null;

  return (
    <div className="rounded-2xl border border-border bg-white overflow-hidden shadow-xs" data-testid="offers-list">
      {/* Header bar that toggles offers open/closed */}
      <button
        type="button"
        data-testid="offers-toggle-btn"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-cream-deep/40"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-pink-light text-strawberry">
            <Tag className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-sm font-bold leading-tight text-choco">
              {applied ? (
                <span className="text-emerald-700 font-extrabold flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" /> Coupon &lsquo;{applied}&rsquo; applied
                </span>
              ) : (
                t("Available offers & coupons")
              )}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {applied ? "Tap to view other offers or change coupon" : `${totalOffers} offers available · Tap to view`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 text-xs font-bold text-strawberry">
          <span>{open ? "Hide" : "View"}</span>
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {/* Expandable offers drawer */}
      {open && (
        <div className="space-y-3.5 border-t border-border/80 bg-cream-deep/20 p-4 transition-all">
          {coupons.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Coupons</p>
              {coupons.map((c) => (
                <div key={c.code} data-testid={`offer-coupon-${c.code}`} className="rounded-2xl border-2 border-dashed border-pink bg-white p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="rounded-md bg-choco px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-cream">{c.code}</span>
                      <p className="mt-1.5 text-xs font-bold text-choco">{c.title}{c.description ? ` — ${c.description}` : ""}</p>
                    </div>
                    {applied === c.code ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                        <Check className="h-3.5 w-3.5" /> {t("Applied")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        data-testid={`offer-apply-${c.code}`}
                        onClick={() => onApply(c.code)}
                        className="rounded-full bg-strawberry px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-strawberry/90 transition-transform active:scale-95"
                      >
                        {t("Apply")}
                      </button>
                    )}
                  </div>
                  {c.conditions?.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                      {c.conditions.map((x) => <li key={x}>{x}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          {autos.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("Applied automatically — no code needed")}</p>
              {autos.map((p) => {
                const isItemApplied = appliedCodes.includes(p.code);
                return (
                  <div key={p.code} data-testid={`offer-auto-${p.code}`} className="flex gap-2.5 rounded-2xl bg-white border border-border/80 p-3 shadow-2xs">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-mango" />
                    <div className="text-xs flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-choco">{p.name}</p>
                        {isItemApplied && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            ✓ {t("Applied")}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{p.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground pt-1">
            {t("We always pick the combination that makes your total lowest — including free delivery.")}
          </p>
        </div>
      )}
    </div>
  );
};
