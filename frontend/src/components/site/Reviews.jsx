import { useEffect, useState } from "react";
import { Loader2, MessageSquareReply, Star } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useLang } from "@/context/LangContext";

export const Stars = ({ value, size = "h-4 w-4", onPick, testid = "stars" }) => (
  <div className="flex gap-1" data-testid={testid} aria-label={`${value || 0} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((n) => {
      const icon = <Star className={`${size} ${n <= Math.round(value || 0) ? "fill-mango text-mango" : "text-choco/20"}`} />;
      return onPick ? <button type="button" key={n} aria-label={`${n} star${n > 1 ? "s" : ""}`} data-testid={`${testid}-${n}`} onClick={() => onPick(n)} className="p-1 transition-transform hover:scale-110">{icon}</button> : <span key={n}>{icon}</span>;
    })}
  </div>
);

export const ReviewCard = ({ r }) => (
  <figure data-testid={`review-${r.id}`} className="rounded-3xl bg-cream-deep p-6">
    <Stars value={r.rating} />
    {r.comment && <blockquote className="mt-3 text-sm">“{r.comment}”</blockquote>}
    <figcaption className="mt-3 text-sm font-bold">{r.name}{r.product && <span className="font-normal text-muted-foreground"> · {r.product}</span>}</figcaption>
    {r.reply && <p className="mt-3 flex gap-2 rounded-2xl bg-white p-3 text-xs"><MessageSquareReply className="h-4 w-4 shrink-0 text-strawberry" /><span><b>ICEPOPS:</b> {r.reply}</span></p>}
  </figure>
);

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
