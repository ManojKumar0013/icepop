import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, MessageSquareReply, Star } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useLang } from "@/context/LangContext";

export const Stars = ({ value, size = "h-4 w-4", onPick, testid = "stars" }) => (
  <div className="flex gap-1" data-testid={testid} aria-label={`${value || 0} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((n) => {
      const icon = <Star className={`${size} ${n <= Math.round(value || 0) ? "fill-amber-400 text-amber-400" : "text-choco/20"}`} />;
      return onPick ? <button type="button" key={n} aria-label={`${n} star${n > 1 ? "s" : ""}`} data-testid={`${testid}-${n}`} onClick={() => onPick(n)} className="p-1 transition-transform hover:scale-110">{icon}</button> : <span key={n}>{icon}</span>;
    })}
  </div>
);

export const ReviewCard = ({ r }) => {
  const initial = (r.name || "C").trim().charAt(0).toUpperCase();
  return (
    <figure
      data-testid={`review-${r.id}`}
      className="rounded-3xl bg-white border border-border p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between"
    >
      <div className="space-y-3">
        {/* Header: Customer Avatar + Name + Verified Badge */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-pink-light via-pink/40 to-amber-100 flex items-center justify-center font-display font-extrabold text-strawberry text-base shadow-sm">
              {initial}
            </div>
            <div>
              <figcaption className="font-display font-bold text-choco text-sm flex items-center gap-1.5">
                {r.name}
              </figcaption>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                <span>Verified Buyer</span>
              </div>
            </div>
          </div>
          <Stars value={r.rating} size="h-4 w-4" />
        </div>

        {/* Product tag pill */}
        {r.product && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-cream/70 border border-border px-3 py-1 text-[11px] font-bold text-choco/80">
            <span>🍡</span>
            <span>{r.product}</span>
          </div>
        )}

        {/* Review comment quote */}
        {r.comment && (
          <blockquote className="text-xs sm:text-sm text-choco/85 leading-relaxed font-normal">
            “{r.comment}”
          </blockquote>
        )}
      </div>

      {/* Owner reply */}
      {r.reply && (
        <div className="mt-4 flex gap-2.5 rounded-2xl bg-cream/50 border border-border p-3 text-xs text-choco/80">
          <MessageSquareReply className="h-4 w-4 shrink-0 text-strawberry mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold text-choco block text-[11px] uppercase tracking-wide">
              ICEPOPS Kitchen
            </span>
            <p className="leading-relaxed">{r.reply}</p>
          </div>
        </div>
      )}
    </figure>
  );
};

export const RateOrder = ({ o, onDone }) => {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const { t } = useLang();

  useEffect(() => {
    if (window.location.hash === "#rate") document.getElementById("rate")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  if (o.review) {
    return (
      <div id="rate" data-testid="order-review-done" className="rounded-3xl bg-cream-deep p-6 text-sm">
        <p className="mb-2 font-bold">{t("Your rating")}</p><Stars value={o.review.rating} size="h-5 w-5" />
        {o.review.comment && <p className="mt-2">“{o.review.comment}”</p>}
        <p className="mt-2 text-xs text-muted-foreground">{o.review.status === "approved" ? t("Published — thank you!") : t("Thank you! It will appear once the shop has checked it.")}</p>
        {o.review.reply && <p className="mt-2 text-xs"><b>ICEPOPS replied:</b> {o.review.reply}</p>}
      </div>
    );
  }
  if (!o.can_review) return null;
  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/orders/${o.order_number}/review`, { rating, comment: comment.trim() || null });
      toast.success("Thanks for rating your order!");
      onDone({ ...o, review: data, can_review: false });
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };
  return (
    <div id="rate" data-testid="order-review-form" className="scroll-mt-24 rounded-3xl border-2 border-pink bg-white p-6">
      <p className="font-display text-lg font-extrabold">{t("How was your order?")}</p>
      <p className="mb-3 text-sm text-muted-foreground">{t("Tap the stars to rate it.")}</p>
      <Stars value={rating} size="h-9 w-9" onPick={setRating} testid="review-stars" />
      <textarea data-testid="review-comment" rows={3} maxLength={300} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("Tell us what you liked (optional)")}
        className="mt-3 w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-pink" />
      <div className="mt-1 text-right text-xs text-muted-foreground">{comment.length}/300</div>
      <button data-testid="review-submit" disabled={!rating || busy} onClick={submit} className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-choco py-3 font-bold text-cream disabled:opacity-50">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("Submit rating")}
      </button>
    </div>
  );
};

export const ProductReviews = ({ slug }) => {
  const [d, setD] = useState(null);
  const { t } = useLang();
  useEffect(() => {
    api.get(`/catalog/products/${slug}/reviews`).then(({ data }) => setD(data)).catch(() => {});
  }, [slug]);
  if (!d) return null;
  return (
    <section className="mt-14" data-testid="product-reviews">
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <h2 className="font-display text-2xl font-bold">{t("Customer reviews")}</h2>
        {d.count > 0 && <span data-testid="product-rating-summary" className="flex items-center gap-2 text-sm font-bold"><Stars value={d.average} />{d.average} · {d.count} {t(d.count > 1 ? "reviews" : "review")}</span>}
      </div>
      {d.reviews.length ? <div className="grid gap-4 md:grid-cols-2">{d.reviews.map((r) => <ReviewCard key={r.id} r={r} />)}</div>
        : <p data-testid="product-reviews-empty" className="rounded-3xl border-2 border-dashed border-border p-8 text-center text-sm text-muted-foreground">{t("No reviews yet. Order it and be the first to rate it!")}</p>}
    </section>
  );
};
