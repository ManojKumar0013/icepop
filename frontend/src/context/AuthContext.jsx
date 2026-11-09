import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);

  const setUser = useCallback((userData) => {
    if (userData?.token) {
      localStorage.setItem("icepops_token", userData.token);
    } else if (userData === null) {
      localStorage.removeItem("icepops_token");
    }
    setUserState(userData);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUserState(data);
    } catch {
      localStorage.removeItem("icepops_token");
      setUserState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Returning from Google sign-in: AuthCallback exchanges the session first.
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    refresh();
  }, [refresh]);

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      console.warn("Logout error:", e);
    } finally {
      setUser(null);
    }
  };

  const isAdmin = !!user?.roles?.includes("admin");
  const isRider = !!(user?.roles?.includes("rider") || user?.roles?.includes("admin"));
  return (
    <AuthContext.Provider value={{ user, setUser, loading, refresh, logout, isAdmin, isRider }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
