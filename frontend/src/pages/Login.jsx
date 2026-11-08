import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export const inputCls = "w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-pink";

export const AuthShell = ({ title, subtitle, children, testid }) => (
  <div className="relative mx-auto grid min-h-[75vh] max-w-6xl items-center gap-10 px-4 py-12 md:grid-cols-2" data-testid={testid}>
    <div className="hidden overflow-hidden rounded-[2.5rem] md:block"><img src="/images/cream-1.jpg" alt="" className="h-[560px] w-full object-cover" /></div>
    <div className="rise mx-auto w-full max-w-md">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">{title}</h1>
      <p className="mb-8 mt-2 text-muted-foreground">{subtitle}</p>
      {children}
    </div>
  </div>
);

export const safeNext = (v) => (v && v.startsWith("/") && !v.startsWith("//") ? v : "/");

export const GoogleButton = ({ next }) => (
  <button type="button" data-testid="google-login-button" onClick={() => {
    sessionStorage.setItem("icepops_next", safeNext(next));
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  }} className="flex w-full items-center justify-center gap-3 rounded-full border-2 border-border bg-white py-3 text-sm font-bold transition-colors hover:border-choco">
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" /><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8z" /><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.8 3.6-4.9 6.7-4.9z" /></svg>
    Continue with Google
  </button>
);

export default function Login() {
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/auth/login", f);
      setUser(data);
      toast.success(`Welcome back, ${data.name.split(" ")[0]}!`);
      navigate(next === "/" && data.roles.includes("admin") ? "/admin" : next, { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Log in to order, track and reorder your favourites." testid="login-page">
      <GoogleButton next={next} />
      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or with email<span className="h-px flex-1 bg-border" /></div>
      <form onSubmit={submit} className="space-y-4">
        <input type="email" required autoComplete="email" placeholder="Email" aria-label="Email" data-testid="login-email-input" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <input type="password" required autoComplete="current-password" placeholder="Password" aria-label="Password" data-testid="login-password-input" className={inputCls} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        {error && <p data-testid="login-error" className="text-sm font-semibold text-strawberry">{error}</p>}
        <button disabled={busy} data-testid="login-submit-button" className="flex w-full items-center justify-center gap-2 rounded-full bg-choco py-3.5 font-bold text-cream hover:bg-strawberry disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Log in</button>
      </form>
      <div className="mt-6 flex justify-between text-sm">
        <Link to="/forgot-password" data-testid="forgot-password-link" className="font-semibold hover:text-strawberry">Forgot password?</Link>
        <Link to={`/signup?next=${encodeURIComponent(next)}`} data-testid="signup-link" className="font-bold text-strawberry">Create account</Link>
      </div>
    </AuthShell>
  );
}
