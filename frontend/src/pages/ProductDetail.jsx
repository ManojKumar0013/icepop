import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Minus, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useCart } from "@/context/CartContext";
import { PageLoader } from "@/components/site/Guards";
import { inr } from "@/lib/format";
import { ProductReviews } from "@/components/site/Reviews";
import { useLang } from "@/context/LangContext";

export default function ProductDetail() {
  const { slug } = useParams();
  const { add } = useCart();
  const [p, setP] = useState(undefined);
  const [variantId, setVariantId] = useState(null);
  const [qty, setQty] = useState(1);
  const { t, pn, pd } = useLang();

  useEffect(() => {
    api.get(`/catalog/products/${slug}`).then(({ data }) => {
      setP(data);
      setVariantId((data.variants.find((v) => v.in_stock) || data.variants[0])?.id);
      document.title = `${data.name} | ICEPOPS`;
    }).catch(() => setP(null));
  }, [slug]);

  if (p === undefined) return <PageLoader />;
  if (p === null) return <div className="p-16 text-center" data-testid="product-not-found">Product not found. <Link className="font-bold text-strawberry" to="/menu">Back to menu</Link></div>;
  const v = p.variants.find((x) => x.id === variantId);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8" data-testid="product-detail-page">
      <Link to="/menu" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold hover:text-strawberry"><ArrowLeft className="h-4 w-4" />Menu</Link>
      <div className="grid gap-10 md:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-[2rem] bg-cream-deep"><img src={p.image_url} alt={pn(p)} className="h-full w-full object-cover" /></div>
        <div className="rise space-y-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-strawberry">{p.category.name}</p>
            <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{pn(p)}</h1>
            <p className="mt-3 text-muted-foreground">{pd(p)}</p>
          </div>
          {p.category.is_popsicle && p.promo_eligible && <p className="rounded-2xl bg-pink-light px-4 py-3 text-sm font-semibold text-strawberry">Eligible for Wednesday 2+1 and the first-order free popsicle.</p>}
          <div>
            <p className="mb-2 text-sm font-bold">{t("Choose size")}</p>
            <div className="flex flex-wrap gap-2">
              {p.variants.map((x) => (
                <button key={x.id} disabled={!x.in_stock} onClick={() => setVariantId(x.id)} data-testid={`detail-variant-${x.id}`}
                  className={`rounded-2xl border-2 px-4 py-2.5 text-left text-sm transition-colors disabled:opacity-40 ${x.id === variantId ? "border-choco bg-choco text-cream" : "border-border bg-white hover:border-choco"}`}>
                  <span className="block font-bold">{x.name}</span><span>{inr(x.price_paise)}{!x.in_stock && " · sold out"}{x.low_stock && " · few left"}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center rounded-full border border-border bg-white">
              <button aria-label="Decrease" data-testid="detail-qty-decrease" className="p-3" onClick={() => setQty(Math.max(1, qty - 1))}><Minus className="h-4 w-4" /></button>
              <span data-testid="detail-qty" className="w-8 text-center font-bold">{qty}</span>
              <button aria-label="Increase" data-testid="detail-qty-increase" className="p-3" onClick={() => setQty(Math.min(20, qty + 1))}><Plus className="h-4 w-4" /></button>
            </div>
            <button disabled={!v?.in_stock} data-testid="detail-add-to-cart" onClick={() => { add(v.id, qty); toast.success(`${qty} × ${pn(p)} ${t("added")}`); }}
              className="flex-1 rounded-full bg-choco px-6 py-3.5 font-bold text-cream transition-colors hover:bg-strawberry disabled:bg-muted disabled:text-muted-foreground">
              {v?.in_stock ? `${t("Add to cart")} · ${inr(v.price_paise * qty)}` : t("Out of stock")}
            </button>
          </div>
          <div className="space-y-3 rounded-3xl border border-border bg-white p-6 text-sm">
            <p><span className="font-bold">Ingredients: </span>{p.ingredients || "Details coming soon."}</p>
            <p className="flex gap-2" data-testid="detail-allergens"><ShieldAlert className="h-4 w-4 shrink-0 text-mango" /><span><span className="font-bold">Allergens: </span>{p.allergens.length ? p.allergens.join(", ") : "None listed"}. Prepared in a kitchen that handles milk, nuts, gluten and soy.</span></p>
          </div>
        </div>
      </div>
      <ProductReviews slug={slug} />
    </div>
  );
}
