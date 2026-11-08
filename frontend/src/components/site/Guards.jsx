import { Navigate, useLocation } from "react-router-dom";
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
