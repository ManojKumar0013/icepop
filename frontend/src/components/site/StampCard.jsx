import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LangContext";

export const useLoyalty = () => {
  const { user } = useAuth();
  const [l, setL] = useState(null);
  useEffect(() => {
    if (!user) { setL(null); return; }
    api.get("/loyalty/me").then(({ data }) => setL(data)).catch(() => setL(null));
  }, [user]);
  return l;
};

const Pop = ({ filled, i }) => (
  <span data-testid={`stamp-${i}`} className={`grid aspect-square place-items-center rounded-full ${filled ? "stamp-pop bg-pink" : "border-2 border-dashed border-choco/25 bg-white"}`} style={filled ? { animationDelay: `${i * 60}ms` } : undefined}>
    {filled && (
      <svg viewBox="0 0 24 24" className="h-3/5 w-3/5" aria-hidden="true">
        <rect x="6" y="2" width="12" height="15" rx="6" fill="#3D2314" /><rect x="11" y="16" width="2" height="6" rx="1" fill="#C98B5A" />
      </svg>
    )}
  </span>
);

export const StampCard = ({ l, compact = false }) => {
  const { t } = useLang();
  if (!l?.enabled) return null;
  const full = l.available_rewards > 0;
  const filled = full ? l.stamps_needed : l.progress;
  return (
    <div data-testid="stamp-card" className="rounded-3xl border-2 border-choco bg-cream-deep p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-display font-extrabold">{t("ICEPOPS stamp card")}</p>
        <span data-testid="stamp-card-count" className="rounded-full bg-choco px-3 py-1 text-xs font-bold text-cream">{filled} / {l.stamps_needed}</span>
      </div>
      <div className={`grid grid-cols-5 gap-2 ${compact ? "max-w-[260px]" : "max-w-xs"}`}>
        {Array.from({ length: l.stamps_needed }, (_, i) => <Pop key={i} i={i} filled={i < filled} />)}
      </div>
      <p data-testid="stamp-card-message" className="mt-3 flex items-center gap-2 text-sm font-semibold">
        {full ? <><Gift className="h-4 w-4 text-strawberry" />{t("Your free water popsicle is ready!")}</> : `${l.to_next} ${t(`more delivered order${l.to_next === 1 ? "" : "s"} to a free popsicle`)}`}
      </p>
    </div>
  );
};
