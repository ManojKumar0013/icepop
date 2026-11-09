import "@/App.css";
import { useEffect } from "react";
import { BrowserRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { StoreProvider } from "@/context/StoreContext";
import { LangProvider } from "@/context/LangContext";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { WhatsAppFab } from "@/components/site/WhatsApp";
import { RequireAdmin, RequireAuth, RequireRider } from "@/components/site/Guards";
import Home from "@/pages/Home";
import Menu from "@/pages/Menu";
import ProductDetail from "@/pages/ProductDetail";
import Cart from "@/pages/Cart";
import Checkout from "@/pages/Checkout";
import Orders from "@/pages/Orders";
import OrderDetail from "@/pages/OrderDetail";
import Account from "@/pages/Account";
import Notifications from "@/pages/Notifications";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import { ForgotPassword, ResetPassword } from "@/pages/PasswordPages";
import AuthCallback from "@/pages/AuthCallback";
import Policy from "@/pages/Policy";
import GiftCards from "@/pages/GiftCards";
import RiderPortal from "@/pages/RiderPortal";
import AdminLayout from "@/pages/admin/AdminLayout";
import AdminOverview from "@/pages/admin/AdminOverview";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminPromotions from "@/pages/admin/AdminPromotions";
import AdminReviews from "@/pages/admin/AdminReviews";
import AdminAudit from "@/pages/admin/AdminAudit";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminCoupons from "@/pages/admin/AdminCoupons";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminPOS from "@/pages/admin/AdminPOS";
import AdminKDS from "@/pages/admin/AdminKDS";

const SiteLayout = () => (
  <div className="flex min-h-screen flex-col">
    <Navbar />
    <main className="flex-1"><Outlet /></main>
    <Footer />
    <WhatsAppFab />
  </div>
);

const NotFound = () => <div className="p-20 text-center font-display text-2xl font-bold" data-testid="not-found">Page not found</div>;
const authed = (el) => <RequireAuth>{el}</RequireAuth>;

const ScrollToTop = () => {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
};

function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/menu/:slug" element={<ProductDetail />} />
        <Route path="/giftcards" element={<GiftCards />} />
        <Route path="/rider" element={<RequireRider><RiderPortal /></RequireRider>} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={authed(<Checkout />)} />
        <Route path="/orders" element={authed(<Orders />)} />
        <Route path="/orders/:number" element={authed(<OrderDetail />)} />
        <Route path="/account" element={authed(<Account />)} />
        <Route path="/notifications" element={authed(<Notifications />)} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/policies/:slug" element={<Policy />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
        <Route index element={<AdminOverview />} />
        <Route path="pos" element={<AdminPOS />} />
        <Route path="kds" element={<AdminKDS />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="coupons" element={<AdminCoupons />} />
        <Route path="promotions" element={<AdminPromotions />} />
        <Route path="reviews" element={<AdminReviews />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="audit" element={<AdminAudit />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LangProvider>
        <StoreProvider>
          <CartProvider>
            <ScrollToTop />
            <AppRouter />
            <Toaster position="top-center" richColors />
          </CartProvider>
        </StoreProvider>
        </LangProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
