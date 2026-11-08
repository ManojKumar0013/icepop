import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageLoader } from "@/components/site/Guards";
import { safeNext } from "@/pages/Login";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser, refresh } = useAuth();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const sessionId = new URLSearchParams(window.location.hash.slice(1)).get("session_id");
    const next = safeNext(sessionStorage.getItem("icepops_next"));
    sessionStorage.removeItem("icepops_next");
    window.history.replaceState(null, "", window.location.pathname);
    api.post("/auth/google/session", { session_id: sessionId })
      .then(({ data }) => {
        setUser(data);
        navigate(next === "/" && data.roles.includes("admin") ? "/admin" : next, { replace: true });
      })
      .catch((e) => {
        toast.error(errMsg(e, "Google sign-in failed."));
        refresh();
        navigate("/login", { replace: true });
      });
  }, [navigate, setUser, refresh]);

  return <PageLoader />;
}
