import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { api, errMsg } from "@/lib/api";
import { PageLoader } from "@/components/site/Guards";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const num = "w-28 rounded-xl border border-border bg-white px-3 py-2 text-sm";

const LoyaltyFields = ({ f, setF }) => {
  const [products, setProducts] = useState([]);
  useEffect(() => {
    api.get("/catalog/products").then(({ data }) => setProducts(data)).catch(() => {});
  }, []);
  const ids = f.product_ids || [];
  const toggle = (id) => setF({ ...f, product_ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2">Stamps needed for a free popsicle <input type="number" min="2" max="50" className={num} value={f.stamps_needed} onChange={(e) => setF({ ...f, stamps_needed: e.target.value })} data-testid="promo-stamps-needed" /></div>
      <p className="font-bold">Products that can be the free reward <span className="font-normal text-muted-foreground">(none ticked = any water popsicle, up to ₹20)</span></p>
      <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
        {products.map((p) => (
          <button type="button" key={p.id} data-testid={`promo-reward-product-${p.id}`} onClick={() => toggle(p.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${ids.includes(p.id) ? "bg-choco text-cream" : "border border-border"}`}>{p.name}</button>
        ))}
      </div>
    </div>
  );
};

const PromoCard = ({ p, onSaved }) => {
  const [f, setF] = useState({ is_enabled: p.is_enabled, ...p.config });
  const save = async () => {
    const body = { is_enabled: f.is_enabled };
    if (p.code === "wednesday_bogo") Object.assign(body, { weekdays: f.weekdays, buy: Number(f.buy), free: Number(f.free) });
    if (p.code === "first_order") body.min_order_paise = Math.round(Number(f.min_order_paise) || 0);
    if (p.code === "free_delivery") body.threshold_paise = Math.round(Number(f.threshold_paise) || 0);
    if (p.code === "family_pack") Object.assign(body, { pack_size: Number(f.pack_size), pack_price_paise: Math.round(Number(f.pack_price_paise) || 0) });
    if (p.code === "loyalty") Object.assign(body, { stamps_needed: Number(f.stamps_needed), product_ids: f.product_ids || [] });
    try {
      await api.patch(`/admin/promotions/${p.code}`, body);
      toast.success(`${p.name} saved`);
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const rupees = (k) => <input type="number" min="0" data-testid={`promo-${p.code}-${k}`} className={num} value={(f[k] ?? 0) / 100} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) * 100 })} />;

  return (
    <div className="space-y-4 rounded-3xl border border-border bg-white p-6" data-testid={`promo-admin-${p.code}`}>
      <div className="flex items-start justify-between gap-4">
        <div><h3 className="font-display text-lg font-bold">{p.name}</h3><p className="text-sm text-muted-foreground">{p.description}</p></div>
        <Switch data-testid={`promo-${p.code}-toggle`} checked={f.is_enabled} onCheckedChange={(v) => setF({ ...f, is_enabled: v })} aria-label="Enabled" />
      </div>
      {p.code === "wednesday_bogo" && (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => {
              const on = f.weekdays?.includes(i);
              return <button key={d} data-testid={`promo-day-${i}`} onClick={() => setF({ ...f, weekdays: on ? f.weekdays.filter((x) => x !== i) : [...(f.weekdays || []), i] })} className={`rounded-full px-3 py-1.5 text-xs font-bold ${on ? "bg-choco text-cream" : "border border-border"}`}>{d}</button>;
            })}
          </div>
          <div className="flex items-center gap-2">Buy <input type="number" min="1" className={num} value={f.buy} onChange={(e) => setF({ ...f, buy: e.target.value })} data-testid="promo-buy" /> get <input type="number" min="1" className={num} value={f.free} onChange={(e) => setF({ ...f, free: e.target.value })} data-testid="promo-free" /> free (cheapest eligible popsicle)</div>
        </div>
      )}
      {p.code === "first_order" && <div className="flex items-center gap-2 text-sm">First order must be above ₹ {rupees("min_order_paise")}</div>}
      {p.code === "free_delivery" && <div className="flex items-center gap-2 text-sm">Free delivery when items total (after discounts) is at least ₹ {rupees("threshold_paise")}</div>}
      {p.code === "family_pack" && <div className="flex flex-wrap items-center gap-2 text-sm">Any <input type="number" min="2" className={num} value={f.pack_size} onChange={(e) => setF({ ...f, pack_size: e.target.value })} data-testid="promo-pack-size" /> water popsicles for ₹ {rupees("pack_price_paise")}</div>}
      {p.code === "loyalty" && <LoyaltyFields f={f} setF={setF} />}
      <button data-testid={`promo-${p.code}-save`} onClick={save} className="rounded-full bg-choco px-5 py-2.5 text-sm font-bold text-cream">Save</button>
    </div>
  );
};

export default function AdminPromotions() {
  const [d, setD] = useState(null);
  const load = () => api.get("/admin/promotions").then(({ data }) => setD(data)).catch(() => {});
  useEffect(() => {
    load();
  }, []);
  if (!d) return <PageLoader />;
  const toggleStacking = async (v) => {
    try {
      await api.patch("/admin/offer-stacking", { allow_offer_stacking: v });
      setD({ ...d, allow_offer_stacking: v });
      toast.success(v ? "Offers can now be combined" : "Only the best offer applies per order");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <div className="max-w-3xl space-y-6" data-testid="admin-promotions">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Promotions</h1>
      <div className="flex items-center justify-between gap-4 rounded-3xl bg-pink-light p-6">
        <div><p className="font-bold">Allow combining offers & coupons</p><p className="text-sm text-muted-foreground">When off, only the single best discount applies to each order. Free delivery is always separate.</p></div>
        <Switch data-testid="offer-stacking-toggle" checked={d.allow_offer_stacking} onCheckedChange={toggleStacking} aria-label="Allow offer stacking" />
      </div>
      {d.promotions.map((p) => <PromoCard key={p.code} p={p} onSaved={load} />)}
      <p className="text-xs text-muted-foreground">All offers are calculated on the server at checkout, in IST (Asia/Kolkata).</p>
    </div>
  );
}
