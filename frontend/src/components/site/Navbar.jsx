import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Bell, Bike, Gift, LayoutDashboard, LogOut, Menu as MenuIcon, Package, ShoppingBag, User, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Logo } from "@/components/site/Logo";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { api } from "@/lib/api";
import { LangSwitch, useLang } from "@/context/LangContext";

const LINKS = [
  { to: "/", label: "Home", id: "home" },
  { to: "/menu", label: "Menu", id: "menu" },
  { to: "/giftcards", label: "Gift Cards", id: "giftcards" },
  { to: "/orders", label: "Track order", id: "track" },
];

function useUnread(user) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    const load = () => api.get("/notifications").then(({ data }) => setUnread(data.unread)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    window.addEventListener("icepops:notifications", load);
    return () => {
      clearInterval(t);
      window.removeEventListener("icepops:notifications", load);
    };
  }, [user]);
  return unread;
}

const UserMenu = ({ user, isAdmin, isRider, logout }) => {
  const navigate = useNavigate();
  const { t } = useLang();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger data-testid="nav-profile-button" className="grid h-10 w-10 place-items-center rounded-full bg-choco text-cream text-sm font-bold">
        {user.name?.[0]?.toUpperCase() || <User className="h-4 w-4" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-2xl">
        <div className="px-2 py-1.5 text-sm font-semibold truncate">{user.name}</div>
        <DropdownMenuSeparator />
        <DropdownMenuItem data-testid="nav-account-link" onClick={() => navigate("/account")}><User className="mr-2 h-4 w-4" />{t("My account")}</DropdownMenuItem>
        <DropdownMenuItem data-testid="nav-orders-link" onClick={() => navigate("/orders")}><Package className="mr-2 h-4 w-4" />{t("My orders")}</DropdownMenuItem>
        <DropdownMenuItem data-testid="nav-giftcards-link" onClick={() => navigate("/giftcards")}><Gift className="mr-2 h-4 w-4" />{t("Gift vouchers & wallet")}</DropdownMenuItem>
        {isRider && <DropdownMenuItem data-testid="nav-rider-link" onClick={() => navigate("/rider")}><Bike className="mr-2 h-4 w-4" />Delivery partner</DropdownMenuItem>}
        {isAdmin && <DropdownMenuItem data-testid="nav-admin-link" onClick={() => navigate("/admin")}><LayoutDashboard className="mr-2 h-4 w-4" />Seller dashboard</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem data-testid="nav-logout-button" onClick={async () => { await logout(); navigate("/"); }}><LogOut className="mr-2 h-4 w-4" />{t("Log out")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const Navbar = () => {
  const { user, isAdmin, isRider, logout } = useAuth();
  const { count } = useCart();
  const unread = useUnread(user);
  const [open, setOpen] = useState(false);
  const { t } = useLang();
  const linkCls = ({ isActive }) => `text-sm font-semibold transition-colors hover:text-strawberry ${isActive ? "text-strawberry" : "text-choco"}`;

  return (
    <header className="sticky top-0 z-40 border-b border-white/40 bg-cream/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo />
        <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
          {LINKS.map((l) => l.to.includes("#")
            ? <Link key={l.id} to={l.to} className={linkCls({ isActive: false })} data-testid={`nav-link-${l.id}`}>{t(l.label)}</Link>
            : <NavLink key={l.id} to={l.to} end className={linkCls} data-testid={`nav-link-${l.id}`}>{t(l.label)}</NavLink>)}
        </nav>
        <div className="flex items-center gap-2">
          <span className="hidden sm:block"><LangSwitch /></span>
          {user && (
            <Link to="/notifications" data-testid="nav-notifications-button" className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-pink-light" aria-label="Notifications">
              <Bell className="h-5 w-5" />
              {unread > 0 && <span data-testid="nav-unread-count" className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-strawberry px-1 text-[10px] font-bold text-white">{unread}</span>}
            </Link>
          )}
          <Link to="/cart" data-testid="nav-cart-button" className="relative flex h-10 items-center gap-2 rounded-full bg-choco px-4 text-cream transition-transform hover:-translate-y-0.5" aria-label="Cart">
            <ShoppingBag className="h-4 w-4" />
            <span data-testid="nav-cart-count" className="text-sm font-bold">{count}</span>
          </Link>
          {user ? <UserMenu user={user} isAdmin={isAdmin} isRider={isRider} logout={logout} /> : (
            <Link to="/login" data-testid="nav-login-link" className="hidden rounded-full border border-choco/20 px-4 py-2 text-sm font-semibold hover:bg-white sm:block">{t("Log in")}</Link>
          )}
          <button data-testid="nav-mobile-toggle" className="grid h-10 w-10 place-items-center rounded-full md:hidden" onClick={() => setOpen(!open)} aria-label="Toggle menu">
            {open ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-border bg-cream px-4 pb-4 md:hidden" aria-label="Mobile">
          <div className="pt-3 sm:hidden"><LangSwitch /></div>
          {LINKS.map((l) => <Link key={l.id} to={l.to} onClick={() => setOpen(false)} data-testid={`mobile-nav-${l.id}`} className="block py-3 font-semibold">{t(l.label)}</Link>)}
          {!user && <Link to="/login" onClick={() => setOpen(false)} data-testid="mobile-nav-login" className="block py-3 font-semibold text-strawberry">{t("Log in / Sign up")}</Link>}
        </nav>
      )}
    </header>
  );
};
