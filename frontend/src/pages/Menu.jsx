import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { ProductCard } from "@/components/site/ProductCard";
import { PageLoader } from "@/components/site/Guards";
import { useLang } from "@/context/LangContext";

export default function Menu() {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") || "";
  const [cats, setCats] = useState([]);
  const [products, setProducts] = useState(null);
  const [q, setQ] = useState("");
  const { t } = useLang();

  useEffect(() => {
    api.get("/catalog/categories").then(({ data }) => setCats(data)).catch(() => {});
  }, []);

  useEffect(() => {
    setProducts(null);
    const t = setTimeout(() => {
      api.get("/catalog/products", { params: { category: category || undefined, q: q || undefined } })
        .then(({ data }) => setProducts(data)).catch(() => setProducts([]));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [category, q]);

  const pill = (active) => `shrink-0 rounded-full px-5 py-2.5 text-sm font-bold transition-colors ${active ? "bg-choco text-cream" : "bg-white border border-border hover:border-choco"}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8" data-testid="menu-page">
      <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-strawberry">{t("The menu")}</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{t("Scoop, sip, repeat.")}</h1>
        </div>
        <label className="relative w-full md:w-72">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input data-testid="menu-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search flavours…")} aria-label="Search products"
            className="w-full rounded-full border border-border bg-white py-3 pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-pink" />
        </label>
      </div>
      <div className="no-scrollbar -mx-4 mb-10 flex gap-2 overflow-x-auto px-4" role="tablist">
        <button data-testid="menu-category-all" className={pill(!category)} onClick={() => setParams({})}>{t("All")}</button>
        {cats.map((c) => (
          <button key={c.id} data-testid={`menu-category-${c.slug}`} className={pill(category === c.slug)} onClick={() => setParams({ category: c.slug })}>{c.name}</button>
        ))}
      </div>
      {category && <p className="-mt-6 mb-8 text-sm text-muted-foreground">{cats.find((c) => c.slug === category)?.description}</p>}
      {!products ? <PageLoader /> : products.length === 0 ? (
        <div data-testid="menu-empty" className="rounded-3xl border-2 border-dashed border-border p-12 text-center text-muted-foreground">{t("No treats match your search.")}</div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
        </div>
      )}
    </div>
  );
}
