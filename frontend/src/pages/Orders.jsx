import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Package } from "lucide-react";
import { api } from "@/lib/api";
import { PageLoader } from "@/components/site/Guards";
import { STATUS_STYLES, inr, istDateTime } from "@/lib/format";
import { ReorderButton } from "@/components/site/ReorderButton";
import { useLang } from "@/context/LangContext";

export default function Orders() {
  const [orders, setOrders] = useState(null);
  const { lang, t } = useLang();
  useEffect(() => {
    api.get("/orders").then(({ data }) => setOrders(data)).catch(() => setOrders([]));
  }, []);
  if (!orders) return <PageLoader />;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6" data-testid="orders-page">
      <h1 className="mb-8 font-display text-4xl font-extrabold tracking-tight">{t("My orders")}</h1>
      {orders.length === 0 ? (
        <div data-testid="orders-empty" className="rounded-3xl border-2 border-dashed border-border p-12 text-center">
          <Package className="mx-auto h-10 w-10 text-pink" /><p className="mt-3 font-semibold">{t("No orders yet")}</p>
          <Link to="/menu" className="mt-4 inline-block rounded-full bg-choco px-6 py-2.5 text-sm font-bold text-cream">{t("Start an order")}</Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.order_number}>
              <Link to={`/orders/${o.order_number}`} data-testid={`order-row-${o.order_number}`} className="flex items-center gap-4 rounded-3xl border border-border bg-white p-5 transition-shadow hover:shadow-lg">
                <div className="flex-1">
                  <p className="font-display font-bold">{o.order_number}</p>
                  <p className="text-xs text-muted-foreground">{istDateTime(o.created_at)} · {o.items.reduce((s, i) => s + i.quantity, 0)} {t("items")} · {t(o.fulfilment_type)}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLES[o.status]}`}>{lang === "te" ? t(o.status) : o.status_label}</span>
                <span className="font-bold">{inr(o.total_paise)}</span>
                <span className="hidden sm:block"><ReorderButton order={o} compact /></span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
