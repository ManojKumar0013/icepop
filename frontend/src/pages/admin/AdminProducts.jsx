import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";
import { inr } from "@/lib/format";
import { PageLoader } from "@/components/site/Guards";
import { Check, ImageUpload, Lbl, adminInput } from "@/pages/admin/AdminKit";

const ALLERGENS = ["Milk", "Nuts", "Gluten", "Soy", "Egg", "Sesame"];
const newVariant = () => ({ name: "Regular", price_paise: 0, stock: 0, is_active: true, track_stock: true, low_stock_threshold: 5 });

const VariantRow = ({ v, onChange, onRemove, i }) => (
  <div className="grid grid-cols-2 gap-2 rounded-2xl bg-cream-deep p-3 sm:grid-cols-[1.4fr_1fr_1fr_auto]" data-testid={`variant-row-${i}`}>
    <Lbl label="Size / flavour"><input className={adminInput} value={v.name} onChange={(e) => onChange({ ...v, name: e.target.value })} data-testid={`variant-name-${i}`} /></Lbl>
    <Lbl label="Price ₹"><input type="number" min="0" step="0.5" className={adminInput} value={v.price_paise / 100} onChange={(e) => onChange({ ...v, price_paise: Math.round(Number(e.target.value) * 100) })} data-testid={`variant-price-${i}`} /></Lbl>
    <Lbl label="In stock"><input type="number" min="0" className={adminInput} value={v.stock} onChange={(e) => onChange({ ...v, stock: Math.max(0, parseInt(e.target.value || "0", 10)) })} data-testid={`variant-stock-${i}`} /></Lbl>
    <button type="button" aria-label="Remove size" onClick={onRemove} className="self-end p-2 text-strawberry" data-testid={`variant-remove-${i}`}><Trash2 className="h-4 w-4" /></button>
    <div className="col-span-2 flex flex-wrap gap-4 sm:col-span-4">
      <Check label="Available" checked={v.is_active} onChange={(x) => onChange({ ...v, is_active: x })} testid={`variant-active-${i}`} />
      <Check label="Track stock" checked={v.track_stock} onChange={(x) => onChange({ ...v, track_stock: x })} testid={`variant-track-${i}`} />
      {v.sku && <span className="text-xs text-muted-foreground">SKU {v.sku}</span>}
    </div>
  </div>
);

const ProductForm = ({ initial, categories, onSaved }) => {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...f, category_id: Number(f.category_id), variants: f.variants.map(({ sku, ...v }) => v) };
      if (f.id) await api.put(`/admin/products/${f.id}`, body);
      else await api.post("/admin/products", body);
      toast.success("Product saved");
      onSaved();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="space-y-4" data-testid="product-form">
      <ImageUpload value={f.image_url} onChange={set("image_url")} testid="product-image" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Lbl label="Name"><input required className={adminInput} value={f.name} onChange={(e) => set("name")(e.target.value)} data-testid="product-name-input" /></Lbl>
        <Lbl label="Category">
          <select required className={adminInput} value={f.category_id} onChange={(e) => set("category_id")(e.target.value)} data-testid="product-category-select">
            <option value="">Choose…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Lbl>
        <Lbl label="Description" className="sm:col-span-2"><textarea rows={2} className={adminInput} value={f.description} onChange={(e) => set("description")(e.target.value)} data-testid="product-description-input" /></Lbl>
        <Lbl label="Telugu name (optional)"><input className={adminInput} value={f.name_te || ""} maxLength={120} onChange={(e) => set("name_te")(e.target.value || null)} placeholder="ఉదా: మామిడి పాప్సికల్" data-testid="product-name-te-input" /></Lbl>
        <Lbl label="Telugu description (optional)"><input className={adminInput} value={f.description_te || ""} maxLength={1000} onChange={(e) => set("description_te")(e.target.value || null)} data-testid="product-description-te-input" /></Lbl>
        <Lbl label="Ingredients" className="sm:col-span-2"><input className={adminInput} value={f.ingredients || ""} onChange={(e) => set("ingredients")(e.target.value)} data-testid="product-ingredients-input" /></Lbl>
      </div>
      <div className="flex flex-wrap gap-3"><span className="text-xs font-bold uppercase text-muted-foreground">Allergens:</span>
        {ALLERGENS.map((a) => <Check key={a} label={a} checked={f.allergens.includes(a)} testid={`allergen-${a}`} onChange={(x) => set("allergens")(x ? [...f.allergens, a] : f.allergens.filter((y) => y !== a))} />)}
      </div>
      <div className="flex flex-wrap gap-4">
        <Check label="Visible on menu" checked={f.is_active} onChange={set("is_active")} testid="product-active-checkbox" />
        <Check label="Featured" checked={f.is_featured} onChange={set("is_featured")} testid="product-featured-checkbox" />
        <Check label="Bestseller" checked={f.is_bestseller} onChange={set("is_bestseller")} testid="product-bestseller-checkbox" />
        <Check label="Eligible for offers" checked={f.promo_eligible} onChange={set("promo_eligible")} testid="product-promo-checkbox" />
      </div>
      <div className="space-y-2">
        {f.variants.map((v, i) => <VariantRow key={v.id || `n${i}`} i={i} v={v} onChange={(nv) => set("variants")(f.variants.map((x, j) => (j === i ? nv : x)))} onRemove={() => f.variants.length > 1 && set("variants")(f.variants.filter((_, j) => j !== i))} />)}
        <button type="button" onClick={() => set("variants")([...f.variants, newVariant()])} data-testid="variant-add-button" className="text-sm font-bold text-strawberry">+ Add size / variant</button>
      </div>
      <button disabled={busy} data-testid="product-save-button" className="w-full rounded-full bg-choco py-3 font-bold text-cream disabled:opacity-50">Save product</button>
    </form>
  );
};

const CategoryForm = ({ initial, onSaved }) => {
  const [f, setF] = useState(initial);
  const save = async (e) => {
    e.preventDefault();
    try {
      if (f.id) await api.put(`/admin/categories/${f.id}`, f);
      else await api.post("/admin/categories", f);
      toast.success("Category saved");
      onSaved();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };
  return (
    <form onSubmit={save} className="space-y-3" data-testid="category-form">
      <ImageUpload value={f.image_url} onChange={(v) => setF({ ...f, image_url: v })} testid="category-image" />
      <Lbl label="Name"><input required className={adminInput} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="category-name-input" /></Lbl>
      <Lbl label="Description"><input className={adminInput} value={f.description || ""} onChange={(e) => setF({ ...f, description: e.target.value })} data-testid="category-description-input" /></Lbl>
      <Lbl label="Display order"><input type="number" min="0" className={adminInput} value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })} /></Lbl>
      <Check label="Popsicle category (counts for Wednesday & first-order offers)" checked={f.is_popsicle} onChange={(v) => setF({ ...f, is_popsicle: v })} testid="category-popsicle-checkbox" />
      <Check label="Visible" checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} testid="category-active-checkbox" />
      <button data-testid="category-save-button" className="w-full rounded-full bg-choco py-3 font-bold text-cream">Save category</button>
    </form>
  );
};

export default function AdminProducts() {
  const [products, setProducts] = useState(null);
  const [cats, setCats] = useState([]);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [editingCat, setEditingCat] = useState(null);
  const load = () => {
    api.get("/admin/products").then(({ data }) => setProducts(data)).catch(() => setProducts([]));
    api.get("/admin/categories").then(({ data }) => setCats(data)).catch(() => {});
  };
  useEffect(() => {
    load();
  }, []);
  if (!products) return <PageLoader />;
  const remove = async (p) => {
    if (!window.confirm(`Permanently delete ${p.name}? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/products/${p.id}`);
      toast.success("Product deleted");
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const shown = products.filter((p) => !filter || String(p.category_id) === filter);
  const blank = { name: "", category_id: filter || "", description: "", image_url: null, ingredients: "", allergens: [], is_featured: false, is_bestseller: false, promo_eligible: true, is_active: true, sort_order: 0, variants: [newVariant()] };

  return (
    <div className="space-y-6" data-testid="admin-products">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Products & stock</h1>
        <div className="flex gap-2">
          <button onClick={() => setEditingCat({ name: "", description: "", image_url: null, is_popsicle: false, sort_order: cats.length, is_active: true })} data-testid="category-add-button" className="rounded-full border border-choco px-4 py-2 text-sm font-bold">+ Category</button>
          <button onClick={() => setEditing(blank)} data-testid="product-add-button" className="flex items-center gap-1 rounded-full bg-choco px-4 py-2 text-sm font-bold text-cream"><Plus className="h-4 w-4" />Product</button>
        </div>
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        <button onClick={() => setFilter("")} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${!filter ? "bg-choco text-cream" : "border border-border bg-white"}`} data-testid="products-filter-all">All</button>
        {cats.map((c) => (
          <span key={c.id} className={`flex shrink-0 items-center gap-1 rounded-full pl-4 pr-2 text-sm font-bold ${filter === String(c.id) ? "bg-choco text-cream" : "border border-border bg-white"} ${!c.is_active ? "opacity-50" : ""}`}>
            <button onClick={() => setFilter(String(c.id))} className="py-2" data-testid={`products-filter-${c.slug}`}>{c.name}</button>
            <button aria-label={`Edit ${c.name}`} onClick={() => setEditingCat(c)} className="p-1" data-testid={`category-edit-${c.slug}`}><Pencil className="h-3 w-3" /></button>
          </span>
        ))}
      </div>
      <div className="overflow-x-auto rounded-3xl border border-border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-cream-deep text-left text-xs uppercase tracking-wider"><tr><th className="p-3">Product</th><th className="p-3">Sizes · price · stock</th><th className="p-3">Status</th><th className="p-3" /></tr></thead>
          <tbody className="divide-y divide-border">
            {shown.map((p) => (
              <tr key={p.id} data-testid={`admin-product-row-${p.slug}`}>
                <td className="p-3"><div className="flex items-center gap-3"><img src={p.image_url} alt="" className="h-12 w-12 rounded-xl object-cover" /><div><p className="font-bold">{p.name}</p><p className="text-xs text-muted-foreground">{p.category_name}</p></div></div></td>
                <td className="p-3 text-xs">{p.variants.filter((v) => v.is_active).map((v) => (
                  <p key={v.id}>{v.name} · {inr(v.price_paise)} · <b className={v.track_stock && v.stock <= v.low_stock_threshold ? "text-strawberry" : ""} data-testid={`stock-${v.id}`}>{v.track_stock ? (v.stock ? `${v.stock} left` : "Out of stock") : "Not tracked"}</b></p>
                ))}</td>
                <td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${p.is_active ? "bg-green-100 text-green-800" : "bg-stone-200"}`}>{p.is_active ? "Active" : "Hidden"}</span></td>
                <td className="whitespace-nowrap p-3 text-right">
                  <button aria-label="Edit product" onClick={() => setEditing(p)} className="p-2" data-testid={`product-edit-${p.slug}`}><Pencil className="h-4 w-4" /></button>
                  {!p.is_active && <button aria-label="Delete product" onClick={() => remove(p)} className="p-2 text-strawberry" data-testid={`product-delete-${p.slug}`}><Trash2 className="h-4 w-4" /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-3xl">
          <DialogHeader><DialogTitle>{editing?.id ? `Edit ${editing.name}` : "New product"}</DialogTitle></DialogHeader>
          {editing && <ProductForm initial={editing} categories={cats} onSaved={() => { setEditing(null); load(); }} />}
        </DialogContent>
      </Dialog>
      <Dialog open={!!editingCat} onOpenChange={(o) => !o && setEditingCat(null)}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader><DialogTitle>{editingCat?.id ? "Edit category" : "New category"}</DialogTitle></DialogHeader>
          {editingCat && <CategoryForm initial={editingCat} onSaved={() => { setEditingCat(null); load(); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
