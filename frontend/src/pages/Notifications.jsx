import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";
import { PageLoader } from "@/components/site/Guards";
import { istDateTime } from "@/lib/format";

export default function Notifications() {
  const [data, setData] = useState(null);
  const load = () => api.get("/notifications").then(({ data }) => setData(data)).catch(() => setData({ items: [], unread: 0 }));
  useEffect(() => {
    load();
  }, []);
  if (!data) return <PageLoader />;
  const readAll = async () => {
    await api.post("/notifications/read-all");
    window.dispatchEvent(new Event("icepops:notifications"));
    load();
  };
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6" data-testid="notifications-page">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Notifications</h1>
        {data.unread > 0 && <button data-testid="notifications-read-all" onClick={readAll} className="text-sm font-bold text-strawberry">Mark all read</button>}
      </div>
      {data.items.length === 0 ? <p data-testid="notifications-empty" className="rounded-3xl border-2 border-dashed border-border p-12 text-center text-muted-foreground"><Bell className="mx-auto mb-2 h-8 w-8 text-pink" />You're all caught up.</p> : (
        <ul className="space-y-3">
          {data.items.map((n) => (
            <li key={n.id} data-testid={`notification-${n.id}`} className={`rounded-3xl border p-5 ${n.is_read ? "border-border bg-white" : "border-pink bg-pink-light/50"}`}>
              <div className="flex justify-between gap-3"><p className="font-bold">{n.title}</p><span className="text-xs text-muted-foreground">{istDateTime(n.created_at)}</span></div>
              <p className="text-sm">{n.body}</p>
              {n.order_number && <Link to={`/orders/${n.order_number}`} className="mt-1 inline-block text-xs font-bold text-strawberry">View order</Link>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
