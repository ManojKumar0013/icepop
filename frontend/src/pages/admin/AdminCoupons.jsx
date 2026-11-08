import { useEffect, useState } from "react";
import { History, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";
import { inr, istDateTime } from "@/lib/format";
import { PageLoader } from "@/components/site/Guards";
import { Check, Lbl, adminInput } from "@/pages/admin/AdminKit";

const toLocal = (iso) => (iso ? new Date(new Date(iso).getTime() + 5.5 * 3600e3).toISOString().slice(0, 16) : "");
const fromLocal = (v) => (v ? `${v}:00+05:30` : null);
const BLANK = { code: "", description: "", discount_type: "percent", discount_value: 10, min_order_paise: 0, max_discount_paise: null, starts_at: null, ends_at: null, usage_limit: null, per_user_limit: 1, new_customers_only: false, is_active: true, product_ids: [], category_ids: [] };

const CouponForm = ({ initial, products, categories, onSaved }) => {
  const [f, setF] = useState({ ...initial, starts_at: toLocal(initial.starts_at), ends_at: toLocal(initial.ends_at) });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const rupees = (k, testid) => <input type="number" min="0" className={adminInput} value={f[k] == null ? "" : f[k] / 100} placeholder="No limit" data-testid={testid} onChange={(e) => set(k)(e.target.value === "" ? null : Math.round(Number(e.target.value) * 100))} />;
  const toggleId = (k, id) => set(k)(f[k].includes(id) ? f[k].filter((x) => x !== id) : [...f[k], id]);
  const save = async (e) => {
    e.preventDefault();
    const body = { ...f, starts_at: fromLocal(f.starts_at), ends_at: fromLocal(f.ends_at), min_order_paise: f.min_order_paise || 0, usage_limit: f.usage_limit || null };
    try {
      if (f.id) await api.put(`/admin/coupons/${f.id}`, body);
      else await api.post("/admin/coupons", body);
      toast.success("Coupon saved");
      onSaved();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };
  return (
    <form onSubmit={save} className="space-y-4" data-testid="coupon-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <Lbl label="Code"><input required className={`${adminInput} uppercase`} value={f.code} onChange={(e) => set("code")(e.target.value.toUpperCase())} data-testid="coupon-code-input" /></Lbl>
        <Lbl label="Description"><input className={adminInput} value={f.description} onChange={(e) => set("description")(e.target.value)} data-testid="coupon-description-input" /></Lbl>
        <Lbl label="Type">
          <select className={adminInput} value={f.discount_type} onChange={(e) => set("discount_type")(e.target.value)} data-testid="coupon-type-select"><option value="percent">Percentage off</option><option value="flat">Flat ₹ off</option></select>
        </Lbl>
        <Lbl label={f.discount_type === "percent" ? "Percent off" : "Rupees off"}><input type="number" min="1" required className={adminInput} value={f.discount_value} onChange={(e) => set("discount_value")(Number(e.target.value))} data-testid="coupon-value-input" /></Lbl>
        <Lbl label="Minimum order ₹">{rupees("min_order_paise", "coupon-min-input")}</Lbl>
        <Lbl label="Maximum discount ₹">{rupees("max_discount_paise", "coupon-max-input")}</Lbl>
        <Lbl label="Starts (IST)"><input type="datetime-local" className={adminInput} value={f.starts_at} onChange={(e) => set("starts_at")(e.target.value)} data-testid="coupon-start-input" /></Lbl>
        <Lbl label="Expires (IST)"><input type="datetime-local" className={adminInput} value={f.ends_at} onChange={(e) => set("ends_at")(e.target.value)} data-testid="coupon-end-input" /></Lbl>
        <Lbl label="Total uses allowed"><input type="number" min="1" placeholder="No limit" className={adminInput} value={f.usage_limit ?? ""} onChange={(e) => set("usage_limit")(e.target.value ? Number(e.target.value) : null)} data-testid="coupon-usage-input" /></Lbl>
        <Lbl label="Uses per customer"><input type="number" min="1" className={adminInput} value={f.per_user_limit} onChange={(e) => set("per_user_limit")(Number(e.target.value))} data-testid="coupon-per-user-input" /></Lbl>
      </div>
      <div className="flex flex-wrap gap-4">
        <Check label="Active" checked={f.is_active} onChange={set("is_active")} testid="coupon-active-checkbox" />
        <Check label="New customers only" checked={f.new_customers_only} onChange={set("new_customers_only")} testid="coupon-new-only-checkbox" />
      </div>
      <details className="rounded-2xl bg-cream-deep p-3 text-sm">
        <summary className="cursor-pointer font-bold">Limit to categories / products ({f.category_ids.length + f.product_ids.length} selected — none means whole menu)</summary>
        <div className="mt-3 flex flex-wrap gap-3">{categories.map((c) => <Check key={c.id} label={c.name} checked={f.category_ids.includes(c.id)} onChange={() => toggleId("category_ids", c.id)} testid={`coupon-category-${c.slug}`} />)}</div>
        <div className="mt-3 grid max-h-40 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">{products.map((p) => <Check key={p.id} label={p.name} checked={f.product_ids.includes(p.id)} onChange={() => toggleId("product_ids", p.id)} testid={`coupon-product-${p.slug}`} />)}</div>
      </details>
      <button data-testid="coupon-save-button" className="w-full rounded-full bg-choco py-3 font-bold text-cream">Save coupon</button>
    </form>
  );
};

const Redemptions = ({ coupon }) => {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api.get(`/admin/coupons/${coupon.id}/redemptions`).then(({ data }) => setRows(data)).catch(() => setRows([]));
  }, [coupon.id]);
  if (!rows) return <p className="text-sm">Loading…</p>;
  if (!rows.length) return <p className="text-sm text-muted-foreground" data-testid="redemptions-empty">Not used yet.</p>;
  return (
    <ul className="max-h-96 space-y-2 overflow-y-auto text-sm" data-testid="redemptions-list">
      {rows.map((r) => <li key={r.order_number} className="flex justify-between gap-3 border-b border-border pb-2"><span><b>{r.order_number}</b> · {r.customer}<br /><span className="text-xs text-muted-foreground">{istDateTime(r.created_at)} · {r.status === "void" ? "voided (order cancelled)" : r.order_status}</span></span><span className="font-bold">−{inr(r.discount_paise)}</span></li>)}
    </ul>
  );
};

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState(null);
  const [products, setProducts] = useState([]);
  const [cats, setCats] = useState([]);
  const [editing, setEditing] = useState(null);
  const [history, setHistory] = useState(null);
  const load = () => api.get("/admin/coupons").then(({ data }) => setCoupons(data)).catch(() => setCoupons([]));
  useEffect(() => {
    load();
    api.get("/admin/products").then(({ data }) => setProducts(data)).catch(() => {});
    api.get("/admin/categories").then(({ data }) => setCats(data)).catch(() => {});
  }, []);
  if (!coupons) return <PageLoader />;
  const describe = (c) => `${c.discount_type === "percent" ? `${c.discount_value}% off` : `₹${c.discount_value} off`}${c.min_order_paise ? ` · min ${inr(c.min_order_paise)}` : ""}${c.max_discount_paise ? ` · max ${inr(c.max_discount_paise)}` : ""}`;
  const expired = (c) => c.ends_at && new Date(c.ends_at) < new Date();
  return (
    <div className="space-y-6" data-testid="admin-coupons">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Coupons</h1>
        <button onClick={() => setEditing(BLANK)} data-testid="coupon-add-button" className="flex items-center gap-1 rounded-full bg-choco px-4 py-2 text-sm font-bold text-cream"><Plus className="h-4 w-4" />Coupon</button>
      </div>
      {coupons.length === 0 ? <p className="text-sm text-muted-foreground">No coupons yet.</p> : (
        <div className="grid gap-4 md:grid-cols-2">
          {coupons.map((c) => (
            <div key={c.id} data-testid={`coupon-card-${c.code}`} className={`rounded-3xl border border-border bg-white p-5 ${!c.is_active || expired(c) ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-display text-xl font-extrabold tracking-wider">{c.code}</p><p className="text-sm">{describe(c)}</p><p className="text-xs text-muted-foreground">{c.description}</p></div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${c.is_active && !expired(c) ? "bg-green-100 text-green-800" : "bg-stone-200"}`}>{!c.is_active ? "Inactive" : expired(c) ? "Expired" : "Active"}</span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground" data-testid={`coupon-used-${c.code}`}>Used {c.used_count}{c.usage_limit ? ` / ${c.usage_limit}` : ""} · {c.per_user_limit}× per customer{c.new_customers_only ? " · new customers only" : ""}{c.ends_at ? ` · expires ${new Date(c.ends_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setEditing(c)} data-testid={`coupon-edit-${c.code}`} className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-bold"><Pencil className="h-3 w-3" />Edit</button>
                <button onClick={() => setHistory(c)} data-testid={`coupon-history-${c.code}`} className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-bold"><History className="h-3 w-3" />Redemptions</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-3xl">
          <DialogHeader><DialogTitle>{editing?.id ? `Edit ${editing.code}` : "New coupon"}</DialogTitle></DialogHeader>
          {editing && <CouponForm initial={editing} products={products} categories={cats} onSaved={() => { setEditing(null); load(); }} />}
        </DialogContent>
      </Dialog>
      <Dialog open={!!history} onOpenChange={(o) => !o && setHistory(null)}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader><DialogTitle>{history?.code} redemptions</DialogTitle></DialogHeader>
          {history && <Redemptions coupon={history} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
