import { useState } from "react";
import { Link } from "react-router-dom";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/context/CartContext";
import { inr } from "@/lib/format";
import { useLang } from "@/context/LangContext";

export const ProductCard = ({ product, index = 0 }) => {
  const { add, items, setQty } = useCart();
  const firstInStock = product.variants.find((v) => v.in_stock) || product.variants[0];
  const [variantId, setVariantId] = useState(firstInStock?.id);
  const variant = product.variants.find((v) => v.id === variantId);
  const canAdd = variant?.in_stock;
  const { t, pn, pd } = useLang();

  const cartItem = items.find((i) => i.variant_id === variant?.id);
  const currentQty = cartItem?.quantity || 0;

  const onAdd = () => {
    add(variant.id);
    toast.success(`${pn(product)} ${t("added")}`, { description: product.variants.length > 1 ? variant.name : undefined });
  };

  return (
    <article data-testid={`product-card-${product.slug}`} style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
      className="rise group flex flex-col overflow-hidden rounded-3xl border border-border bg-white shadow-sm transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-xl">
      <Link to={`/menu/${product.slug}`} className="relative block aspect-[4/3] overflow-hidden bg-cream-deep" data-testid={`product-link-${product.slug}`}>
        <img src={product.image_url} alt={product.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {product.is_bestseller && <span className="rounded-full bg-mango px-2.5 py-1 text-[11px] font-bold text-white">{t("Bestseller")}</span>}
          {product.category.is_popsicle && product.promo_eligible && <span className="rounded-full bg-pink px-2.5 py-1 text-[11px] font-bold text-choco">Wed 2+1</span>}
        </div>
        {!product.in_stock && <div className="absolute inset-0 grid place-items-center bg-choco/50 font-display text-lg font-bold text-cream">{t("Sold out")}</div>}
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{product.category.name}</p>
          <h3 className="font-display text-lg font-bold leading-tight">{pn(product)}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{pd(product)}</p>
        </div>
        {product.variants.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Size">
            {product.variants.map((v) => (
              <button key={v.id} type="button" role="radio" aria-checked={v.id === variantId} disabled={!v.in_stock}
                data-testid={`variant-option-${v.id}`} onClick={() => setVariantId(v.id)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-40 ${v.id === variantId ? "border-choco bg-choco text-cream" : "border-border hover:border-choco"}`}>
                {v.name}
              </button>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center justify-between pt-1">
          <span data-testid={`product-price-${product.slug}`} className="font-display text-xl font-extrabold">{variant ? inr(variant.price_paise) : "—"}</span>
          {currentQty > 0 ? (
            <div data-testid={`product-stepper-${product.slug}`} className="flex items-center rounded-full bg-strawberry text-white shadow-sm h-9 px-1 transition-all">
              <button
                type="button"
                aria-label="Decrease quantity"
                data-testid={`product-decrease-${product.slug}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setQty(variant.id, currentQty - 1);
                  if (currentQty === 1) {
                    toast.info(`${pn(product)} removed`);
                  }
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full text-white transition-all hover:bg-black/20 active:scale-90"
              >
                <Minus className="h-4 w-4 stroke-[3]" />
              </button>
              <span data-testid={`product-qty-${product.slug}`} className="min-w-7 px-1 text-center font-display text-sm font-black text-white select-none">
                {currentQty}
              </span>
              <button
                type="button"
                aria-label="Increase quantity"
                data-testid={`product-increase-${product.slug}`}
                disabled={!canAdd || currentQty >= 50}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setQty(variant.id, currentQty + 1);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full text-white transition-all hover:bg-black/20 active:scale-90 disabled:opacity-40"
              >
                <Plus className="h-4 w-4 stroke-[3]" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={onAdd} disabled={!canAdd} data-testid={`add-to-cart-${product.slug}`}
              className="flex items-center gap-1.5 rounded-full bg-choco px-4 py-2 text-sm font-bold text-cream transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-strawberry active:scale-95 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">
              <Plus className="h-4 w-4" />{canAdd ? t("Add") : t("Out of stock")}
            </button>
          )}
        </div>
      </div>
    </article>
  );
};
