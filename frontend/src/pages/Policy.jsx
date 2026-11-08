import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { PageLoader } from "@/components/site/Guards";
import { useStore } from "@/context/StoreContext";

export default function Policy() {
  const { slug } = useParams();
  const store = useStore();
  const [p, setP] = useState(undefined);
  useEffect(() => {
    setP(undefined);
    api.get(`/policies/${slug}`).then(({ data }) => {
      setP(data);
      document.title = `${data.title} | ICEPOPS`;
    }).catch(() => setP(null));
  }, [slug]);
  if (p === undefined) return <PageLoader />;
  if (p === null) return <div className="p-16 text-center">Page not found. <Link to="/" className="font-bold text-strawberry">Go home</Link></div>;
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6" data-testid="policy-page">
      <p className="text-xs font-bold uppercase tracking-widest text-strawberry">ICEPOPS</p>
      <h1 data-testid="policy-title" className="mb-8 font-display text-4xl font-extrabold tracking-tight">{p.title}</h1>
      <div className="space-y-4 rounded-3xl border border-border bg-white p-8 leading-relaxed">
        {p.content.split(/\n\n+/).map((para, i) => <p key={i} className="whitespace-pre-line">{para}</p>)}
        {slug === "food-safety" && store && <p className="rounded-2xl bg-cream-deep p-4 text-sm" data-testid="policy-fssai"><b>Registered FSSAI number:</b> {store.fssai_number}</p>}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">Questions? Contact us at {store?.phone} or {store?.email}.</p>
    </article>
  );
}
