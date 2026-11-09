import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { AuthShell, GoogleButton, inputCls, safeNext } from "@/pages/Login";

export default function Signup() {
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1); // 1 = details, 2 = OTP verification
  const [f, setF] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    referral_code: localStorage.getItem("icepops_referral") || "",
  });
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // Cooldown countdown timer for resending OTP
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((c) => (c > 1 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Step 1: Send OTP to email
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError("");

    const phoneClean = f.phone.replace(/\D/g, "");
    if (phoneClean.length !== 10) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }

    setBusy(true);
    try {
      await api.post("/auth/send-signup-otp", {
        email: f.email.trim(),
        name: f.name.trim(),
      });
      toast.success(`Verification code sent to ${f.email.trim()}`);
      setStep(2);
      setResendCooldown(30);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  // Resend OTP in Step 2
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/auth/send-signup-otp", {
        email: f.email.trim(),
        name: f.name.trim(),
      });
      toast.success("A new verification code has been sent to your email!");
      setResendCooldown(30);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  // Step 2: Verify OTP and Register
  const handleVerifyAndRegister = async (e) => {
    e.preventDefault();
    if (!otp.trim() || otp.trim().length !== 6) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const payload = {
        name: f.name.trim(),
        email: f.email.trim(),
        phone: f.phone.trim(),
        password: f.password,
        referral_code: f.referral_code.trim() || undefined,
        otp: otp.trim(),
      };
      const { data } = await api.post("/auth/register", payload);
      setUser(data);
      localStorage.removeItem("icepops_referral");
      if (f.referral_code.trim()) {
        toast.success("Account created! ₹10 will be credited to your wallet once you place your first order 🎉");
      } else {
        toast.success("Account created — your first-order popsicle is waiting!");
      }
      navigate(next, { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={step === 1 ? "Join ICEPOPS" : "Verify Your Email"}
      subtitle={
        step === 1
          ? "New customers get a free popsicle on their first order above ₹50."
          : `We sent a 6-digit verification code to ${f.email}`
      }
      testid="signup-page"
    >
      {step === 1 ? (
        <>
          <GoogleButton next={next} />
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or with email
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleRequestOtp} className="space-y-4">
            <input
              required
              minLength={2}
              maxLength={80}
              autoComplete="name"
              placeholder="Full name"
              aria-label="Full name"
              data-testid="signup-name-input"
              className={inputCls}
              value={f.name}
              onChange={set("name")}
            />
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="Email address"
              aria-label="Email"
              data-testid="signup-email-input"
              className={inputCls}
              value={f.email}
              onChange={set("email")}
            />
            <input
              required
              inputMode="tel"
              autoComplete="tel"
              placeholder="Mobile number (10 digits)"
              aria-label="Mobile number"
              data-testid="signup-phone-input"
              className={inputCls}
              value={f.phone}
              onChange={set("phone")}
            />
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Password (min 8 characters)"
              aria-label="Password"
              data-testid="signup-password-input"
              className={inputCls}
              value={f.password}
              onChange={set("password")}
            />
            <div className="space-y-1">
              <input
                autoComplete="off"
                placeholder="Referral code (optional, e.g. MANOJ10)"
                aria-label="Referral code"
                data-testid="signup-referral-input"
                className={`${inputCls} uppercase font-mono`}
                value={f.referral_code}
                onChange={(e) => setF({ ...f, referral_code: e.target.value.toUpperCase() })}
              />
              <p className="text-[11px] text-muted-foreground px-1">
                Optional: Enter a friend&apos;s invite code to get ₹10 in your wallet after your first order.
              </p>
            </div>

            {error && (
              <p data-testid="signup-error" className="text-sm font-semibold text-strawberry">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              data-testid="signup-submit-button"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-choco py-3.5 font-bold text-cream hover:bg-strawberry disabled:opacity-60 transition-colors shadow-sm"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending code...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4" />
                  Verify Email & Continue
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-sm">
            Already have an account?{" "}
            <Link
              to={`/login?next=${encodeURIComponent(next)}`}
              data-testid="login-link"
              className="font-bold text-strawberry"
            >
              Log in
            </Link>
          </p>
        </>
      ) : (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 text-xs text-choco/80 flex items-center justify-between gap-3">
            <div className="truncate">
              <span className="block font-bold text-choco">Verification code sent</span>
              <span className="truncate block font-medium">{f.email}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setError("");
              }}
              className="shrink-0 text-xs font-bold text-strawberry hover:underline flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" /> Edit
            </button>
          </div>

          <form onSubmit={handleVerifyAndRegister} className="space-y-4">
            <div className="space-y-1.5 text-center">
              <label htmlFor="otp-input" className="block text-xs font-bold uppercase tracking-wider text-choco/70">
                Enter 6-Digit OTP
              </label>
              <input
                id="otp-input"
                type="text"
                required
                autoFocus
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="• • • • • •"
                data-testid="signup-otp-input"
                className="w-full rounded-2xl border-2 border-choco/30 bg-white py-3.5 text-center font-mono text-2xl font-black tracking-[0.4em] outline-none focus:border-choco focus:ring-2 focus:ring-pink shadow-xs"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              <p className="text-[11px] text-muted-foreground">
                Code expires in 10 minutes. Check your inbox & spam folder.
              </p>
            </div>

            {error && (
              <p data-testid="signup-error" className="text-sm font-semibold text-strawberry text-center">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || otp.length !== 6}
              data-testid="signup-verify-button"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-choco py-3.5 font-bold text-cream hover:bg-strawberry disabled:opacity-50 transition-colors shadow-sm"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying & creating account...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Verify & Create Account
                </>
              )}
            </button>
          </form>

          <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setError("");
              }}
              className="font-semibold text-muted-foreground hover:text-choco flex items-center gap-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>

            <button
              type="button"
              disabled={resendCooldown > 0 || busy}
              onClick={handleResendOtp}
              className="font-bold text-strawberry hover:underline disabled:opacity-50 disabled:no-underline flex items-center gap-1.5"
            >
              <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
            </button>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
