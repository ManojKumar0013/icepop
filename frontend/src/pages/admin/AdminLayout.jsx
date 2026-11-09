import { NavLink, Outlet, Link } from "react-router-dom";
import { BadgePercent, Bike, Boxes, ClipboardList, LayoutDashboard, Monitor, Receipt, Settings, ScrollText, Star, Store, Ticket } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { NewOrderAlert } from "@/components/admin/NewOrderAlert";

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, id: "overview", end: true },
  { to: "/admin/pos", label: "Counter POS", icon: Receipt, id: "pos" },
  { to: "/admin/kds", label: "Kitchen (KDS)", icon: Monitor, id: "kds" },
  { to: "/admin/orders", label: "Orders", icon: ClipboardList, id: "orders" },
  { to: "/rider", label: "Rider Deliveries", icon: Bike, id: "rider" },
  { to: "/admin/products", label: "Products & stock", icon: Boxes, id: "products" },
  { to: "/admin/coupons", label: "Coupons", icon: Ticket, id: "coupons" },
  { to: "/admin/promotions", label: "Promotions", icon: BadgePercent, id: "promotions" },
  { to: "/admin/reviews", label: "Reviews", icon: Star, id: "reviews" },
  { to: "/admin/settings", label: "Business settings", icon: Settings, id: "settings" },
  { to: "/admin/audit", label: "Audit log", icon: ScrollText, id: "audit" },
];

export default function AdminLayout() {
  const cls = ({ isActive }) => `flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors ${isActive ? "bg-pink text-choco" : "text-cream/80 hover:bg-white/10"}`;
  return (
    <div className="min-h-screen bg-cream md:flex" data-testid="admin-layout">
      <aside className="bg-choco text-cream md:fixed md:inset-y-0 md:w-64">
        <div className="flex items-center justify-between p-5 md:block">
          <Logo light to="/admin" />
          <p className="mt-1 hidden text-xs text-cream/50 md:block">Seller dashboard</p>
        </div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0" aria-label="Admin">
          {NAV.map((n) => <NavLink key={n.id} to={n.to} end={n.end} className={cls} data-testid={`admin-sidebar-${n.id}`}><n.icon className="h-4 w-4 shrink-0" /><span className="whitespace-nowrap">{n.label}</span></NavLink>)}
        </nav>
        <NewOrderAlert />
        <Link to="/" data-testid="admin-view-shop" className="mx-3 mt-4 hidden items-center gap-2 rounded-2xl border border-cream/20 px-4 py-2.5 text-sm font-semibold md:flex"><Store className="h-4 w-4" />View shop</Link>
      </aside>
      <main className="flex-1 p-4 sm:p-8 md:ml-64"><Outlet /></main>
    </div>
  );
}
