import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { AuthShell, inputCls } from "@/pages/Login";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      setMsg(data.message);
    } catch (err) {
      setError(errMsg(err));
    }
  };
  return (
    <AuthShell title="Forgot password?" subtitle="Enter your email and we'll send you a reset link." testid="forgot-page">
      {msg ? <p data-testid="forgot-success" className="rounded-2xl bg-pistachio/10 p-4 text-sm font-semibold">{msg}</p> : (
        <form onSubmit={submit} className="space-y-4">
          <input type="email" required placeholder="Email" aria-label="Email" data-testid="forgot-email-input" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <p className="text-sm font-semibold text-strawberry" data-testid="forgot-error">{error}</p>}
          <button data-testid="forgot-submit-button" className="w-full rounded-full bg-choco py-3.5 font-bold text-cream">Send reset link</button>
        </form>
      )}
      <Link to="/login" className="mt-6 inline-block text-sm font-bold text-strawberry">Back to log in</Link>
    </AuthShell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) return setError("Passwords don't match.");
    try {
      await api.post("/auth/reset-password", { token: params.get("token") || "", password: pw });
      toast.success("Password updated. Please log in.");
      navigate("/login", { replace: true });
    } catch (err) {
      setError(errMsg(err));
    }
  };
  return (
    <AuthShell title="Choose a new password" subtitle="Use at least 8 characters." testid="reset-page">
      <form onSubmit={submit} className="space-y-4">
        <input type="password" required minLength={8} placeholder="New password" aria-label="New password" data-testid="reset-password-input" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} />
        <input type="password" required minLength={8} placeholder="Confirm password" aria-label="Confirm password" data-testid="reset-password-confirm" className={inputCls} value={pw2} onChange={(e) => setPw2(e.target.value)} />
        {error && <p className="text-sm font-semibold text-strawberry" data-testid="reset-error">{error}</p>}
        <button data-testid="reset-submit-button" className="w-full rounded-full bg-choco py-3.5 font-bold text-cream">Update password</button>
      </form>
    </AuthShell>
  );
}
