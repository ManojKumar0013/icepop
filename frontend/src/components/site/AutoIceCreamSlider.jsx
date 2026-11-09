import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import useEmblaCarousel from "embla-carousel-react";
import {
  Minus,
  Plus,
  ShoppingBag,
  Sparkles,
  Zap,
  ArrowRight,
  Flame,
} from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/context/CartContext";
import { inr } from "@/lib/format";

// Exactly 6 top popular crowd-favourite ice creams
const POPULAR_SLUGS = [
  "orange-stick-ice",
  "mango-stick-ice",
  "raspberry-ripple-pop",
  "lemon-mint-ice",
  "kala-khatta-ice",
  "belgian-chocolate-scoop",
];

const DEFAULT_POPULAR_ITEMS = [
  {
    id: 4,
    name: "Orange Stick Ice",
    slug: "orange-stick-ice",
    category: "Water Popsicles",
    price_paise: 2000,
    image_url: "/images/water-1.jpg",
    tag: "Wed 2+1",
    description: "Classic tangy orange ice pop made from freshly pressed juice.",
  },
  {
    id: 5,
    name: "Mango Stick Ice",
    slug: "mango-stick-ice",
    category: "Water Popsicles",
    price_paise: 2000,
    image_url: "/images/water-2.jpg",
    tag: "Bestseller",
    description: "Sweet golden Ratnagiri Alphonso mango frozen into pure bliss.",
  },
  {
    id: 1,
    name: "Raspberry Ripple Pop",
    slug: "raspberry-ripple-pop",
    category: "Cream Popsicles",
    price_paise: 5000,
    image_url: "/images/cream-1.jpg",
    tag: "Bestseller",
    description: "Creamy vanilla pop rippled with real tangy raspberry swirl.",
  },
  {
    id: 6,
    name: "Lemon Mint Ice",
    slug: "lemon-mint-ice",
    category: "Water Popsicles",
    price_paise: 2000,
    image_url: "/images/water-3.jpg",
    tag: "Pure Fruit",
    description: "Cooling zesty lemon with whole fresh garden mint leaves.",
  },
  {
    id: 8,
    name: "Kala Khatta Ice",
    slug: "kala-khatta-ice",
    category: "Water Popsicles",
    price_paise: 2000,
    image_url: "/images/water-8.jpg",
    tag: "Desi Special",
    description: "Tangy jamun pulp with black salt and roasted cumin.",
  },
  {
    id: 14,
    name: "Belgian Chocolate Scoop",
    slug: "belgian-chocolate-scoop",
    category: "Special Scoops",
    price_paise: 6000,
    image_url: "/images/scoop-1.jpg",
    tag: "Decadent",
    description: "Rich, velvety 70% dark Belgian cocoa churned with whole milk.",
  },
];

export function AutoIceCreamSlider({ products = [] }) {
  const { add, items, setQty } = useCart();
  const navigate = useNavigate();

  // Embla Carousel with smooth physics-based infinite loop
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: "start",
    slidesToScroll: 1,
    duration: 35,
  });

  const [selectedIndex, setSelectedIndex] = useState(0);

  // Pick exactly 6 top popular items
  const popularSlides = (() => {
    if (products.length > 0) {
      const matched = POPULAR_SLUGS.map((slug) =>
        products.find((p) => p.slug === slug)
      ).filter(Boolean);

      if (matched.length >= 4) {
        return matched.slice(0, 6).map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          category: p.category?.name || "Handcrafted Pops",
          price_paise: p.variants?.[0]?.price_paise || 2000,
          variant_id: p.variants?.[0]?.id || p.id,
          image_url: p.image_url || "/images/placeholder.jpg",
          tag: p.is_bestseller ? "Bestseller" : p.promo_eligible ? "Wed 2+1" : "Pure Fruit",
          description: p.description || "Handcrafted cold-churned fresh delight.",
        }));
      }
    }
    return DEFAULT_POPULAR_ITEMS;
  })();

  // Track select event for dots
  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap() % popularSlides.length);
  }, [emblaApi, popularSlides.length]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onSelect);
    onSelect();
    return () => emblaApi.off("select", onSelect);
  }, [emblaApi, onSelect]);

  // Continuous smooth auto-slide every 2 seconds
  useEffect(() => {
    if (!emblaApi) return;
    const interval = setInterval(() => {
      emblaApi.scrollNext();
    }, 2000);
    return () => clearInterval(interval);
  }, [emblaApi]);

  const getItemQty = (variantId) => {
    const found = items.find((i) => i.variant_id === variantId);
    return found?.quantity || 0;
  };

  const handleAdd = (slide, e) => {
    e?.preventDefault();
    e?.stopPropagation();
    const vid = slide.variant_id || slide.id;
    add(vid);
    toast.success(`${slide.name} added to cart!`);
  };

  const handleBuyNow = (slide, e) => {
    e?.preventDefault();
    e?.stopPropagation();
    const vid = slide.variant_id || slide.id;
    const qty = getItemQty(vid);
    if (qty === 0) {
      add(vid);
    }
    navigate("/checkout");
  };

  const handleGoToCart = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    navigate("/cart");
  };

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Neat & Unique Gradient Background Container */}
      <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-pink-50/70 via-cream/90 to-amber-50/60 border border-pink/30 p-6 sm:p-10 shadow-sm">
        {/* Subtle Ambient Decorative Glows */}
        <div className="pointer-events-none absolute -left-16 -top-16 h-72 w-72 rounded-full bg-pink/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 -bottom-16 h-72 w-72 rounded-full bg-amber-200/25 blur-3xl" />

        {/* Header - Neat & clean with NO ugly badge */}
        <div className="relative z-10 mb-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/90 border border-pink/30 px-3.5 py-1 text-xs font-bold text-strawberry mb-2 shadow-2xs">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Most Popular Crowd Favourites</span>
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-black text-choco tracking-tight flex items-center gap-2">
            <span>Freshly Frozen Handcrafted Ice Cream</span>
            <span className="text-2xl">🍧</span>
          </h2>
          <p className="text-xs sm:text-sm text-choco/70 mt-1">
            Pure real fruit, fresh dairy, and rich cocoa made in small batches every day.
          </p>
        </div>

        {/* Embla Smooth Sliding Viewport */}
        <div className="relative z-10 overflow-hidden py-1" ref={emblaRef}>
          <div className="flex -ml-6">
            {popularSlides.map((slide) => {
              const vid = slide.variant_id || slide.id;
              const currentQty = getItemQty(vid);

              return (
                <div
                  key={slide.id || slide.slug}
                  className="min-w-0 shrink-0 grow-0 pl-6 basis-full sm:basis-1/2 lg:basis-1/3"
                >
                  <div className="group relative flex flex-col h-full overflow-hidden rounded-3xl border border-border bg-white shadow-sm hover:shadow-lg transition-all duration-300">
                    {/* Photo & Tag */}
                    <Link
                      to={`/menu/${slide.slug}`}
                      className="relative block aspect-[4/3] overflow-hidden bg-cream-deep"
                    >
                      <img
                        src={slide.image_url}
                        alt={slide.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.src = "/images/cream-1.jpg";
                        }}
                      />
                      <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                        {slide.tag && (
                          <span className="rounded-full bg-strawberry px-2.5 py-1 text-[10px] font-bold text-white shadow-sm flex items-center gap-1">
                            <Flame className="h-3 w-3 fill-white" />
                            <span>{slide.tag}</span>
                          </span>
                        )}
                      </div>
                    </Link>

                    {/* Body Details */}
                    <div className="flex flex-1 flex-col gap-3 p-5">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                          {slide.category}
                        </span>
                        <Link
                          to={`/menu/${slide.slug}`}
                          className="font-display text-lg font-bold text-choco hover:text-strawberry transition-colors leading-tight line-clamp-1 block mt-0.5"
                        >
                          {slide.name}
                        </Link>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                          {slide.description}
                        </p>
                      </div>

                      {/* Action Bar with Price, Add, Stepper, and Buy Now */}
                      <div className="mt-auto space-y-2.5 pt-2 border-t border-border/60">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display text-xl font-extrabold text-choco shrink-0">
                            {inr(slide.price_paise)}
                          </span>

                          {currentQty > 0 ? (
                            <div className="flex items-center rounded-full bg-strawberry text-white shadow-sm h-9 px-1 transition-all">
                              <button
                                type="button"
                                aria-label="Decrease quantity"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setQty(vid, currentQty - 1);
                                  if (currentQty === 1) {
                                    toast.info(`${slide.name} removed`);
                                  }
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded-full text-white transition-all hover:bg-black/20 active:scale-90"
                              >
                                <Minus className="h-4 w-4 stroke-[3]" />
                              </button>
                              <span className="min-w-7 px-1 text-center font-display text-sm font-black text-white select-none">
                                {currentQty}
                              </span>
                              <button
                                type="button"
                                aria-label="Increase quantity"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setQty(vid, currentQty + 1);
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded-full text-white transition-all hover:bg-black/20 active:scale-90"
                              >
                                <Plus className="h-4 w-4 stroke-[3]" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => handleAdd(slide, e)}
                                className="flex items-center gap-1 rounded-full bg-choco px-3.5 py-2 text-xs font-bold text-cream transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-strawberry active:scale-95 shadow-2xs"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                <span>Add</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleBuyNow(slide, e)}
                                className="flex items-center gap-1 rounded-full bg-strawberry px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-strawberry/90 active:scale-95 transition-all"
                              >
                                <Zap className="h-3.5 w-3.5 fill-current" />
                                <span>Buy Now</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* When in cart: Direct Go to Cart & Buy Now Buttons */}
                        {currentQty > 0 && (
                          <div className="flex items-center gap-2 pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                            <button
                              type="button"
                              onClick={handleGoToCart}
                              className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-cream-deep border border-choco/15 py-2 px-2 text-xs font-bold text-choco hover:bg-choco hover:text-cream active:scale-95 transition-all shadow-2xs"
                            >
                              <ShoppingBag className="h-3.5 w-3.5 text-strawberry" />
                              <span>Go to Cart</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleBuyNow(slide, e)}
                              className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-strawberry py-2 px-2 text-xs font-bold text-white hover:bg-strawberry/90 active:scale-95 transition-all shadow-sm"
                            >
                              <Zap className="h-3.5 w-3.5 fill-current" />
                              <span>Buy Now</span>
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Clean 6-dot indicator */}
        <div className="relative z-10 mt-5 flex items-center justify-center gap-1.5">
          {popularSlides.map((_, idx) => (
            <span
              key={idx}
              className={`h-2 rounded-full transition-all duration-300 ${
                selectedIndex === idx
                  ? "w-7 bg-strawberry"
                  : "w-2 bg-choco/20"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
