import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Download, Package } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { PageLoader } from "@/components/site/Guards";
import { inr } from "@/lib/format";

const Stat = ({ label, value, testid, accent }) => (
  <div className={`rounded-3xl p-5 ${accent || "border border-border bg-white"}`} data-testid={testid}>
    <p className="text-xs font-bold uppercase tracking-wider opacity-70">{label}</p>
    <p className="mt-2 font-display text-3xl font-extrabold">{value}</p>
  </div>
);

const RevenueChart = ({ data, xKey, title }) => (
  <div className="rounded-3xl border border-border bg-white p-6">
    <h3 className="mb-4 font-display font-bold">{title}</h3>
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.map((d) => ({ ...d, rupees: d.revenue_paise / 100 }))}>
          <XAxis dataKey={xKey} tickFormatter={(v) => v.slice(5)} fontSize={11} stroke="#7A685A" />
          <YAxis fontSize={11} stroke="#7A685A" width={48} />
          <Tooltip formatter={(v) => `₹${v.toLocaleString("en-IN")}`} />
          <Bar dataKey="rupees" fill="#F8A5C2" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
);

export default function AdminOverview() {
  const [d, setD] = useState(null);
  useEffect(() => {
    const load = () => api.get("/admin/overview").then(({ data }) => setD(data)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const downloadCsv = async () => {
    try {
      const res = await api.get("/admin/reports/sales-csv", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `icepops_sales_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      window.open(`${process.env.REACT_APP_BACKEND_URL || ""}/api/admin/reports/sales-csv`, "_blank");
    }
  };

  if (!d) return <PageLoader />;
  return (
    <div className="space-y-6" data-testid="admin-overview">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Overview</h1>
        <button
          onClick={downloadCsv}
          data-testid="export-sales-csv-btn"
          className="flex items-center gap-2 rounded-full border border-choco bg-white px-5 py-2.5 text-sm font-bold text-choco transition hover:bg-cream-deep"
        >
          <Download className="h-4 w-4" />
          Export Sales CSV
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Today's orders" value={d.today_orders} testid="stat-today-orders" accent="bg-choco text-cream" />
        <Stat label="Today's sales" value={inr(d.today_sales_paise)} testid="stat-today-sales" accent="bg-pink" />
        <Stat label="Pending" value={d.pending_orders} testid="stat-pending" />
        <Stat label="In progress" value={d.active_orders} testid="stat-active" />
        <Stat label="Completed" value={d.completed_orders} testid="stat-completed" />
        <Stat label="Cancelled" value={d.cancelled_orders} testid="stat-cancelled" />
        <Stat label="Total sales" value={inr(d.total_sales_paise)} testid="stat-total-sales" />
        <Link to="/admin/orders" data-testid="overview-go-orders" className="grid place-items-center rounded-3xl bg-strawberry p-5 font-display text-lg font-bold text-white transition hover:opacity-95">Manage orders →</Link>
      </div>

      {d.low_stock_items && d.low_stock_items.length > 0 && (
        <div className="rounded-3xl border border-amber-300 bg-amber-50 p-6" data-testid="low-stock-card">
          <div className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-amber-900">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Low Stock Warnings ({d.low_stock_items.length})
          </div>
          <p className="mb-3 text-xs text-amber-800">The following flavours are running low. Prepare more stock to prevent out-of-stock orders.</p>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {d.low_stock_items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm border border-amber-200">
                <span className="font-semibold text-sm">{item.product_name} ({item.variant_name})</span>
                <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
                  {item.stock} left
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <RevenueChart data={d.daily_revenue} xKey="date" title="Daily revenue (last 14 days)" />
        <RevenueChart data={d.monthly_revenue} xKey="month" title="Monthly revenue" />
      </div>

      <div className="rounded-3xl border border-border bg-white p-6" data-testid="bestsellers-list">
        <h3 className="mb-4 font-display font-bold">Bestselling products</h3>
        {d.bestsellers.length === 0 ? <p className="text-sm text-muted-foreground">No sales yet.</p> : (
          <ol className="space-y-2">{d.bestsellers.map((b, i) => <li key={b.name} className="flex justify-between text-sm"><span><b className="mr-2 text-strawberry">#{i + 1}</b>{b.name}</span><span className="font-semibold">{b.quantity} sold · {inr(b.revenue_paise)}</span></li>)}</ol>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Sales exclude cancelled and refunded orders. Times in IST.</p>
    </div>
  );
}
