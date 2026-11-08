import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { AuthShell, GoogleButton, inputCls, safeNext } from "@/pages/Login";

export default function Signup() {
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/auth/register", f);
      setUser(data);
      toast.success("Account created — your first-order popsicle is waiting!");
      navigate(next, { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Join ICEPOPS" subtitle="New customers get a free popsicle on their first order above ₹50." testid="signup-page">
      <GoogleButton next={next} />
      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or with email<span className="h-px flex-1 bg-border" /></div>
      <form onSubmit={submit} className="space-y-4">
        <input required minLength={2} maxLength={80} autoComplete="name" placeholder="Full name" aria-label="Full name" data-testid="signup-name-input" className={inputCls} value={f.name} onChange={set("name")} />
        <input type="email" required autoComplete="email" placeholder="Email" aria-label="Email" data-testid="signup-email-input" className={inputCls} value={f.email} onChange={set("email")} />
        <input required inputMode="tel" autoComplete="tel" placeholder="Mobile number (10 digits)" aria-label="Mobile number" data-testid="signup-phone-input" className={inputCls} value={f.phone} onChange={set("phone")} />
        <input type="password" required minLength={8} autoComplete="new-password" placeholder="Password (min 8 characters)" aria-label="Password" data-testid="signup-password-input" className={inputCls} value={f.password} onChange={set("password")} />
        {error && <p data-testid="signup-error" className="text-sm font-semibold text-strawberry">{error}</p>}
        <button disabled={busy} data-testid="signup-submit-button" className="flex w-full items-center justify-center gap-2 rounded-full bg-choco py-3.5 font-bold text-cream hover:bg-strawberry disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Create account</button>
      </form>
      <p className="mt-6 text-sm">Already have an account? <Link to={`/login?next=${encodeURIComponent(next)}`} data-testid="login-link" className="font-bold text-strawberry">Log in</Link></p>
    </AuthShell>
  );
}
