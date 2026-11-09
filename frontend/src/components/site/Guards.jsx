import { Link, Navigate, useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export const PageLoader = () => (
  <div className="grid min-h-[50vh] place-items-center" data-testid="page-loader">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-pink border-t-choco" />
  </div>
);

export const RequireAuth = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return children;
};

export const RequireAdmin = ({ children }) => {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login?next=/admin" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
};

export const RequireRider = ({ children }) => {
  const { user, loading, isRider, isAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (!isRider && !isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center" data-testid="rider-access-denied">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-strawberry">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="font-display text-2xl font-bold">Access Restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Delivery Partner authorization required. If you are an assigned rider, please ask the admin to grant delivery partner access to your account ({user.email}).
        </p>
        <Link to="/" className="mt-6 inline-block rounded-full bg-choco px-6 py-2.5 text-xs font-bold text-cream">
          Back to home
        </Link>
      </div>
    );
  }
  return children;
};
