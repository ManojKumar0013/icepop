import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Clock, IceCreamCone, MapPin, Phone, Sparkles, Truck, Gift, Users, CheckCircle2, Star } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/context/StoreContext";
import { ProductCard } from "@/components/site/ProductCard";
import { inr, to12h } from "@/lib/format";
import { ReviewCard } from "@/components/site/Reviews";
import { useLang } from "@/context/LangContext";

const T = ({ s }) => useLang().t(s);

const PROMO_STYLE = {
  wednesday_bogo: { icon: Sparkles, cls: "from-pink-light via-pink/60 to-pink", tag: "Every Wednesday" },
  first_order: { icon: Gift, cls: "from-amber-100 via-orange-100 to-mango/40", tag: "New customers" },
  free_delivery: { icon: Truck, cls: "from-emerald-50 via-emerald-100 to-pistachio/40", tag: "Always on" },
  family_pack: { icon: Users, cls: "from-sky-50 via-sky-100 to-blueberry/30", tag: "Family favourite" },
  loyalty: { icon: Gift, cls: "from-pink-light via-orange-50 to-pink/50", tag: "Loyalty" },
};

const Hero = ({ store }) => {
  const { t } = useLang();
  return (
  <section className="relative overflow-hidden">
    <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 md:grid-cols-12 lg:px-8 lg:pt-16">
      <div className="rise space-y-7 md:col-span-6">
        <span data-testid="hero-offer-badge" className="inline-flex items-center gap-2 rounded-full bg-pink-light px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-strawberry">
          <Sparkles className="h-3.5 w-3.5" /> {t("Wednesday: buy 2 pops, get 1 free")}
        </span>
        <h1 className="font-display text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-5xl lg:text-6xl">
          {t("Handcrafted pops")} <br className="hidden sm:block" />{t("& scoops,")} <span className="text-strawberry">{t("frozen fresh")}</span> {t("every day.")}
        </h1>
        <p className="max-w-md text-base text-muted-foreground">{t("Real fruit, real milk, small batches. Order for pickup or get it delivered to your door — cold, quick and perfectly packed.")}</p>
        <div className="flex flex-wrap gap-3">
          <Link to="/menu" data-testid="hero-explore-menu" className="inline-flex items-center gap-2 rounded-full bg-choco px-7 py-3.5 font-bold text-cream transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-strawberry">
            {t("Explore the menu")} <ArrowRight className="h-4 w-4" />
          </Link>
          <a href="#offers" data-testid="hero-see-offers" className="inline-flex items-center rounded-full border-2 border-choco px-7 py-3 font-bold transition-colors hover:bg-choco hover:text-cream">{t("See offers")}</a>
        </div>
        {store && (
          <p data-testid="hero-store-status" className="flex items-center gap-2 text-sm font-semibold">
            <span className={`h-2.5 w-2.5 rounded-full ${store.status.open ? "bg-pistachio" : "bg-strawberry"}`} />
            {store.status.open ? t("Open now — taking orders") : store.status.reason}
          </p>
        )}
      </div>
      <div className="relative md:col-span-6">
        <div className="absolute -right-10 -top-10 h-72 w-72 rounded-full bg-pink/40 blur-3xl" />
        <div className="relative aspect-[4/5] overflow-hidden rounded-[2.5rem] shadow-2xl sm:aspect-[5/5] md:ml-8">
          <img src="/images/hero.jpg" alt="Ice cream sundae with scoops and toppings" className="h-full w-full object-cover" fetchPriority="high" />
        </div>
        <div className="animate-floaty absolute -left-2 bottom-10 rounded-2xl bg-white/90 px-4 py-3 shadow-xl backdrop-blur-md sm:left-0">
          <p className="text-xs font-semibold text-muted-foreground">{t("Free delivery")}</p>
          <p className="font-display text-lg font-extrabold">{t("on ₹100+")}</p>
        </div>
        <div className="animate-floaty absolute -right-1 top-10 rounded-2xl bg-choco px-4 py-3 text-cream shadow-xl [animation-delay:1.2s]">
          <p className="text-xs text-cream/70">{t("Pops from")}</p>
          <p className="font-display text-lg font-extrabold">₹20</p>
        </div>
      </div>
    </div>
  </section>
  );
};

const H2 = ({ children }) => {
  const { t } = useLang();
  return <h2 className="mb-8 font-display text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">{t(children)}</h2>;
};

const Tag = ({ children }) => {
  const { t } = useLang();
  return <span className="mb-6 inline-block rounded-full bg-white/70 px-3 py-1 text-[11px] font-bold uppercase tracking-wider">{t(children)}</span>;
};

const Offers = ({ promotions }) => (
  <section id="offers" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-12 sm:px-6 lg:px-8">
    <H2>Sweet deals</H2>
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
      {promotions.map((p, i) => {
        const st = PROMO_STYLE[p.code] || PROMO_STYLE.free_delivery;
        const Icon = st.icon;
        return (
          <div key={p.code} data-testid={`promo-card-${p.code}`} style={{ animationDelay: `${i * 90}ms` }}
            className={`rise relative overflow-hidden rounded-3xl bg-gradient-to-br ${st.cls} p-7 ${i === 0 ? "md:row-span-1" : ""}`}>
            <Tag>{st.tag}</Tag>
            <Icon className="absolute right-6 top-6 h-10 w-10 opacity-30" />
            <h3 className="font-display text-xl font-extrabold">{p.name}</h3>
            <p className="mt-2 text-sm text-choco/80">{p.description}</p>
          </div>
        );
      })}
    </div>
  </section>
);

const ProductRow = ({ title, testid, items }) => items.length > 0 && (
  <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8" data-testid={testid}>
    <div className="mb-8 flex items-end justify-between">
      <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl"><T s={title} /></h2>
      <Link to="/menu" className="text-sm font-bold text-strawberry hover:underline"><T s="View all" /></Link>
    </div>
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{items.slice(0, 4).map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}</div>
  </section>
);

const Categories = ({ cats }) => (
  <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
    <H2>Pick your treat</H2>
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      {cats.map((c) => (
        <Link key={c.id} to={`/menu?category=${c.slug}`} data-testid={`home-category-${c.slug}`} className="group relative aspect-[3/4] overflow-hidden rounded-3xl">
          <img src={c.image_url} alt={c.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
          <div className="absolute inset-0 bg-gradient-to-t from-choco/85 via-choco/10 to-transparent" />
          <span className="absolute bottom-4 left-4 right-4 font-display text-lg font-bold leading-tight text-cream">{c.name}</span>
        </Link>
      ))}
    </div>
  </section>
);

const Testimonials = ({ items }) => (
  <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8" data-testid="testimonials-section">
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full bg-pink-light px-3.5 py-1 text-xs font-bold text-strawberry mb-2">
          <Sparkles className="h-3.5 w-3.5" /> 4.9 ★ Real Customer Reviews
        </div>
        <H2>What our customers say</H2>
        <p className="text-xs sm:text-sm text-choco/70 -mt-6 max-w-xl">
          Real stories, honest feedback, and sweet smiles from verified customers who enjoyed our handcrafted popsicles.
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs font-bold text-choco/70">
        <span className="flex items-center gap-1.5 bg-white border border-border px-3.5 py-1.5 rounded-full shadow-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> 100% Verified Doorstep Orders
        </span>
      </div>
    </div>

    {items.length ? (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((r) => <ReviewCard key={r.id} r={r} />)}
      </div>
    ) : (
      <div data-testid="testimonials-empty" className="rounded-3xl border-2 border-dashed border-border bg-white/60 p-10 text-center">
        <IceCreamCone className="mx-auto h-8 w-8 text-pink" />
        <p className="mt-3 font-semibold"><T s="Real customer reviews will appear here." /></p>
        <p className="text-sm text-muted-foreground"><T s="Order, enjoy, then rate your order — the best reviews show up here." /></p>
      </div>
    )}
  </section>
);

const Visit = ({ s }) => (
  <section id="visit" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-12 sm:px-6 lg:px-8">
    <div className="grid overflow-hidden rounded-[2rem] bg-cream-deep md:grid-cols-2">
      <div className="space-y-6 p-8 sm:p-12">
        <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl"><T s="Visit the parlour" /></h2>
        <p className="flex gap-3 text-sm"><MapPin className="h-5 w-5 shrink-0 text-strawberry" />{s.address_line}, {s.city}, {s.state} {s.pincode}</p>
        <p className="flex gap-3 text-sm"><Phone className="h-5 w-5 text-strawberry" />{s.phone}</p>
        <div>
          <p className="mb-3 flex gap-3 text-sm font-bold"><Clock className="h-5 w-5 text-strawberry" /><T s="Opening hours" /></p>
          <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2" data-testid="opening-hours">
            {s.hours.map((h) => <li key={h.weekday} className="flex justify-between gap-4 pr-4"><span className="text-muted-foreground">{h.day}</span><span className="font-semibold">{h.is_closed ? "Closed" : `${to12h(h.open)} – ${to12h(h.close)}`}</span></li>)}
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">Delivery fee from {inr(s.default_delivery_fee_paise)} · We deliver to {s.delivery_pincodes.length} PIN codes</p>
      </div>
      <div className="min-h-[280px] bg-pink-light">
        {s.map_embed_url ? <iframe title="Shop location" src={s.map_embed_url} className="h-full min-h-[280px] w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" /> : (
          <div data-testid="map-placeholder" className="grid h-full place-items-center p-8 text-center">
            <div><MapPin className="mx-auto h-10 w-10 text-strawberry" /><p className="mt-2 font-semibold">Map coming soon</p><p className="text-sm text-muted-foreground">The shop location map will appear once the address is added.</p></div>
          </div>
        )}
      </div>
    </div>
  </section>
);

const FeatureShowcase = () => (
  <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Link to="/menu" className="group rounded-3xl bg-gradient-to-br from-pink-light via-pink/40 to-white p-7 border border-pink/30 shadow-sm hover:shadow-md transition-all">
        <span className="text-3xl mb-3 block">🍧</span>
        <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-strawberry bg-white/80 px-2.5 py-0.5 rounded-full mb-2">Handcrafted Daily</span>
        <h3 className="font-display text-xl font-extrabold text-choco group-hover:text-strawberry transition-colors">Real-Fruit Popsicles</h3>
        <p className="mt-2 text-xs text-choco/70 leading-relaxed">100% natural fruit pulps, pure milk, and zero artificial preservatives frozen fresh in small batches.</p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-strawberry">Explore Menu →</span>
      </Link>
      <Link to="/menu" className="group rounded-3xl bg-gradient-to-br from-sky-50 via-sky-100/50 to-white p-7 border border-sky-200/50 shadow-sm hover:shadow-md transition-all">
        <span className="text-3xl mb-3 block">❄️</span>
        <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-sky-700 bg-white/80 px-2.5 py-0.5 rounded-full mb-2">Sub-Zero Chiller Box</span>
        <h3 className="font-display text-xl font-extrabold text-choco group-hover:text-strawberry transition-colors">Superfast Doorstep Delivery</h3>
        <p className="mt-2 text-xs text-choco/70 leading-relaxed">Delivered in high-performance insulated cooler bags so your ice pops arrive rock-solid and icy cold.</p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-sky-700">Order Online →</span>
      </Link>
      <Link to="/giftcards" className="group rounded-3xl bg-gradient-to-br from-amber-50 via-orange-100/40 to-white p-7 border border-amber-200/50 shadow-sm hover:shadow-md transition-all">
        <span className="text-3xl mb-3 block">🎁</span>
        <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-amber-800 bg-white/80 px-2.5 py-0.5 rounded-full mb-2">Sweet Surprises</span>
        <h3 className="font-display text-xl font-extrabold text-choco group-hover:text-strawberry transition-colors">Digital Gift Vouchers</h3>
        <p className="mt-2 text-xs text-choco/70 leading-relaxed">Treat friends and loved ones to delicious real-fruit popsicles with instant digital delivery.</p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-amber-800">Send a Gift Voucher →</span>
      </Link>
    </div>
  </section>
);

export default function Home() {
  const store = useStore();
  const { hash } = useLocation();
  const [cats, setCats] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [best, setBest] = useState([]);
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    api.get("/reviews/featured").then(({ data }) => setReviews(data)).catch(() => {});
    api.get("/catalog/categories").then(({ data }) => setCats(data)).catch(() => {});
    api.get("/catalog/products", { params: { featured: true } }).then(({ data }) => setFeatured(data)).catch(() => {});
    api.get("/catalog/products", { params: { bestseller: true } }).then(({ data }) => setBest(data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (hash && store) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
  }, [hash, store]);

  return (
    <div data-testid="home-page">
      <Hero store={store} />
      <FeatureShowcase />
      {store && <Offers promotions={store.promotions} />}
      <Categories cats={cats} />
      <ProductRow title="Fresh this week" testid="featured-section" items={featured} />
      <ProductRow title="Bestsellers" testid="bestsellers-section" items={best} />
      <Testimonials items={reviews} />
      {store && <Visit s={store} />}
    </div>
  );
}
