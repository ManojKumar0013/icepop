import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  ArrowRight, 
  Check, 
  Clock, 
  Copy, 
  Gift, 
  HelpCircle, 
  Loader2, 
  LogIn, 
  Share2, 
  Sparkles, 
  UserPlus, 
  Users, 
  Wallet 
} from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { inr } from "@/lib/format";

export default function ReferralPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [friendCodeInput, setFriendCodeInput] = useState("");
  const [savingFriendCode, setSavingFriendCode] = useState(false);
  const [tab, setTab] = useState("all");

  const loadData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: res } = await api.get("/giftcards/referral");
      setData(res);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const completedList = useMemo(() => data?.completed_referrals || [], [data]);
  const pendingList = useMemo(() => data?.pending_referrals || [], [data]);

  const filteredFriends = useMemo(() => {
    if (tab === "completed") return completedList;
    if (tab === "pending") return pendingList;
    return [...completedList, ...pendingList];
  }, [tab, completedList, pendingList]);

  const code = data?.referral_code || "ICE10";
  const shareUrl = `${window.location.origin}/?ref=${code}`;
  const shareText = `Hey! Enjoy handcrafted real-fruit ice pops from ICEPOPS 🍧 Use my invite code *${code}* when signing up or ordering to get ₹10 credited to your ICEPOPS wallet after your first order! Order here: ${shareUrl}`;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast.success(`Invite code ${code} copied!`);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    toast.success("Referral link copied!");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const applyFriendCode = async (e) => {
    e.preventDefault();
    if (!friendCodeInput.trim()) return;
    setSavingFriendCode(true);
    try {
      const { data: res } = await api.post("/giftcards/referral/apply", { code: friendCodeInput.trim() });
      toast.success(res.message);
      setData((prev) => ({
        ...prev,
        referred_by_code: res.referred_by_code,
        referred_by_name: res.referred_by_name,
        referred_by_id: res.referred_by_id,
      }));
      setFriendCodeInput("");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSavingFriendCode(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream/30 py-10 px-4 sm:px-6 lg:px-8" data-testid="referral-page">
      <div className="mx-auto max-w-4xl space-y-8">
        
        {/* Header Hero */}
        <div className="overflow-hidden rounded-3xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-orange-50/50 to-pink-light/30 p-6 sm:p-10 shadow-sm text-center relative">
          <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-amber-400/20 blur-2xl" />
          <div className="pointer-events-none absolute -left-10 -bottom-10 h-36 w-36 rounded-full bg-pink-400/20 blur-2xl" />

          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3.5 py-1 text-xs font-bold text-amber-900 border border-amber-300/60 shadow-2xs">
            <Gift className="h-3.5 w-3.5 text-amber-600" /> Give ₹10, Get ₹10 Program
          </span>
          <h1 className="mt-3 font-display text-3xl sm:text-5xl font-black text-choco tracking-tight">
            Invite Friends & Earn Free Pops! 🍧
          </h1>
          <p className="mt-3 max-w-xl mx-auto text-sm sm:text-base text-choco/80 leading-relaxed font-medium">
            Share your personal invite code with friends. When they place their first order, both of you get{" "}
            <span className="font-bold text-emerald-800">₹10 credited directly into your ICEPOPS digital wallet</span>!
          </p>

          {/* If NOT logged in, show Call to Action */}
          {!user ? (
            <div className="mt-8 rounded-2xl bg-white/90 border border-amber-200/90 p-6 max-w-md mx-auto shadow-sm space-y-4">
              <p className="text-sm font-bold text-choco">
                Sign in to view your invite code and track your earnings:
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  to="/login?next=/refer"
                  data-testid="referral-login-btn"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-choco px-6 py-3 text-sm font-bold text-cream shadow hover:bg-choco/90 transition-all active:scale-95"
                >
                  <LogIn className="h-4 w-4" />
                  <span>Log in to your account</span>
                </Link>
                <Link
                  to="/signup?next=/refer"
                  data-testid="referral-signup-btn"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-strawberry px-6 py-3 text-sm font-bold text-white shadow hover:opacity-95 transition-all active:scale-95"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>Sign up (Get free pop)</span>
                </Link>
              </div>
            </div>
          ) : loading ? (
            <div className="mt-8 flex items-center justify-center gap-2 py-8 text-sm font-semibold text-choco/70">
              <Loader2 className="h-5 w-5 animate-spin text-choco" />
              <span>Loading your referral details...</span>
            </div>
          ) : (
            <>
              {/* Stats Grid */}
              <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto text-center">
                <div className="rounded-2xl bg-white p-3.5 border border-amber-200/90 shadow-2xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Joined</p>
                  <p className="font-display text-2xl sm:text-3xl font-black text-choco mt-0.5">
                    {data?.total_referrals || 0}
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-3.5 border border-emerald-300 shadow-2xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Completed</p>
                  <p className="font-display text-2xl sm:text-3xl font-black text-emerald-700 mt-0.5">
                    {data?.completed_count || 0}
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-3.5 border border-amber-300 shadow-2xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Pending</p>
                  <p className="font-display text-2xl sm:text-3xl font-black text-amber-600 mt-0.5">
                    {data?.pending_count || 0}
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-3.5 border border-emerald-200 shadow-2xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Earned</p>
                  <p className="font-display text-2xl sm:text-3xl font-black text-emerald-700 mt-0.5">
                    {inr(data?.total_earned_paise || 0)}
                  </p>
                </div>
              </div>

              {/* Code & Actions Box */}
              <div className="mt-8 max-w-xl mx-auto rounded-3xl bg-white p-4 sm:p-5 border-2 border-choco/15 shadow-sm space-y-3.5">
                <div className="flex items-center justify-between gap-3 bg-cream/50 rounded-2xl p-3 border border-border">
                  <div className="text-left">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Your Unique Invite Code
                    </span>
                    <span className="font-mono text-xl font-black text-choco tracking-widest">
                      {code}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={copyCode}
                    className="inline-flex items-center gap-1 rounded-xl bg-choco px-4 py-2 text-xs font-bold text-cream hover:bg-choco/90 transition-colors active:scale-95 shadow-xs"
                  >
                    {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedCode ? "Copied" : "Copy Code"}</span>
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2.5">
                  <button
                    type="button"
                    onClick={copyLink}
                    className="w-full flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-white border-2 border-border px-4 py-3 text-xs font-bold text-choco hover:border-choco shadow-xs transition-colors"
                  >
                    {copiedLink ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
                    <span>{copiedLink ? "Link Copied!" : "Copy Share Link"}</span>
                  </button>

                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-6 py-3 text-xs font-bold text-white shadow hover:opacity-95 active:scale-95 transition-all"
                  >
                    <span>Share on WhatsApp 💬</span>
                  </a>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Logged in: Referral Tracking & Friends List */}
        {user && data && (
          <div className="rounded-3xl border border-border bg-white p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <h2 className="font-display text-xl font-bold text-choco flex items-center gap-2">
                  <Users className="h-5 w-5 text-amber-600" />
                  Referral Tracking & Friends
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  See everyone who joined with your code, who completed their first order, and who is pending.
                </p>
              </div>

              {/* Filter Tabs */}
              <div className="inline-flex rounded-2xl bg-cream/70 p-1 border border-border shadow-2xs self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setTab("all")}
                  className={`rounded-xl px-3.5 py-1 text-xs font-bold transition-all ${
                    tab === "all" ? "bg-choco text-cream shadow-xs" : "text-choco/70 hover:text-choco"
                  }`}
                >
                  All ({data.total_referrals || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setTab("completed")}
                  className={`rounded-xl px-3.5 py-1 text-xs font-bold transition-all ${
                    tab === "completed" ? "bg-emerald-700 text-white shadow-xs" : "text-emerald-800 hover:text-emerald-950"
                  }`}
                >
                  Completed ({data.completed_count || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setTab("pending")}
                  className={`rounded-xl px-3.5 py-1 text-xs font-bold transition-all ${
                    tab === "pending" ? "bg-amber-600 text-white shadow-xs" : "text-amber-800 hover:text-amber-950"
                  }`}
                >
                  Pending ({data.pending_count || 0})
                </button>
              </div>
            </div>

            {/* Friends List */}
            {filteredFriends.length === 0 ? (
              <div className="rounded-2xl bg-cream/30 border border-border/80 p-8 text-center space-y-2">
                <Users className="h-8 w-8 text-choco/30 mx-auto" />
                <p className="text-sm font-semibold text-choco">
                  {tab === "completed"
                    ? "No completed referrals yet. Once a friend completes their first order, ₹10 will be credited to both your wallets!"
                    : tab === "pending"
                    ? "No pending referrals right now. Share your invite code above to get friends on board!"
                    : "No friends have joined yet. Share your invite code to start earning!"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredFriends.map((f, i) => (
                  <div
                    key={f.id || i}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 border border-border hover:border-amber-300 transition-colors shadow-2xs"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl font-bold text-sm ${
                          f.status === "completed" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {f.name ? f.name.charAt(0).toUpperCase() : "F"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-choco truncate">{f.name || "Friend"}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap mt-0.5">
                          {f.phone_masked && <span>{f.phone_masked}</span>}
                          {f.phone_masked && f.email_masked && <span>•</span>}
                          {f.email_masked && <span>{f.email_masked}</span>}
                          {f.order_number && (
                            <span className="font-semibold text-choco/80">• Order #{f.order_number}</span>
                          )}
                          {f.date && (
                            <span>
                              • {new Date(f.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      {f.status === "completed" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800 shadow-2xs">
                          <Check className="h-3 w-3" /> +₹10 Credited
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 shadow-2xs">
                          <Clock className="h-3 w-3" /> ₹10 Pending
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Have a friend's referral code? (Only before first order) */}
        {user && data && !data.has_completed_order && (
          <div
            data-testid="referral-have-code-card"
            className="rounded-3xl border-2 border-amber-300/80 bg-gradient-to-br from-amber-50/70 via-orange-50/40 to-cream p-6 shadow-xs"
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-amber-600 shrink-0" />
                <h3 className="font-display text-lg font-bold text-choco">
                  Have a Friend&apos;s Referral Code?
                </h3>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                ₹10 Bonus
              </span>
            </div>

            {data.referred_by_code ? (
              <div className="space-y-2">
                <div className="rounded-2xl border-2 border-emerald-400 bg-white px-4 py-3 shadow-xs">
                  <span className="font-mono text-base font-black tracking-wider text-emerald-800">
                    {data.referred_by_code}
                  </span>
                </div>
                <p className="text-xs sm:text-sm font-medium text-emerald-800 flex items-center gap-1.5">
                  <span>🎉</span>
                  <span>₹10 will be credited to both your wallets after your first order!</span>
                </p>
              </div>
            ) : (
              <form onSubmit={applyFriendCode} className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={friendCodeInput}
                    onChange={(e) => setFriendCodeInput(e.target.value.toUpperCase())}
                    placeholder="Enter friend's code (e.g. FRIEND10)"
                    data-testid="referral-friend-code-input"
                    className="flex-1 uppercase font-mono tracking-wider rounded-2xl border border-amber-300/80 bg-white px-4 py-3 text-sm font-bold text-choco placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="submit"
                    disabled={savingFriendCode || !friendCodeInput.trim()}
                    data-testid="referral-apply-code-btn"
                    className="shrink-0 rounded-2xl bg-choco px-6 py-3 text-sm font-bold text-cream hover:bg-choco/90 transition-colors disabled:opacity-50"
                  >
                    {savingFriendCode ? "Applying..." : "Apply Code"}
                  </button>
                </div>
                <p className="text-xs text-choco/75">
                  🎉 Both of you will get ₹10 credited to your digital wallet once your first order is placed!
                </p>
              </form>
            )}
          </div>
        )}

        {/* How It Works (3 Easy Steps) */}
        <div className="rounded-3xl border border-border bg-white p-6 sm:p-8 shadow-sm">
          <h3 className="font-display text-xl font-bold text-choco text-center mb-8">
            How Refer & Earn Works
          </h3>
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="text-center space-y-2 p-4 rounded-2xl bg-cream/40 border border-border/60">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-800 text-xl font-black shadow-xs">
                1
              </div>
              <h4 className="font-display text-base font-bold text-choco">Share Your Code</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Send your unique referral link or invite code to friends on WhatsApp, Instagram, or SMS.
              </p>
            </div>
            <div className="text-center space-y-2 p-4 rounded-2xl bg-cream/40 border border-border/60">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-pink-100 text-pink-800 text-xl font-black shadow-xs">
                2
              </div>
              <h4 className="font-display text-base font-bold text-choco">Friend Places Order</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your friend registers and places their first order of delicious handcrafted ice pops.
              </p>
            </div>
            <div className="text-center space-y-2 p-4 rounded-2xl bg-cream/40 border border-border/60">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-800 text-xl font-black shadow-xs">
                3
              </div>
              <h4 className="font-display text-base font-bold text-choco">Both Get ₹10</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                ₹10 is instantly credited to both your ICEPOPS digital wallets to spend on any future order!
              </p>
            </div>
          </div>
        </div>

        {/* Wallet Link Banner */}
        <div className="rounded-3xl bg-gradient-to-r from-choco via-choco/95 to-amber-950 p-6 sm:p-8 text-cream shadow-md flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-1.5 text-center sm:text-left">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-0.5 text-xs font-semibold text-pink">
              <Wallet className="h-3.5 w-3.5" /> Digital Wallet Ledger
            </span>
            <h4 className="font-display text-xl font-bold">Check your wallet balance & passbook</h4>
            <p className="text-xs text-cream/70 max-w-md">
              View your real-time wallet credits, debits, issued vouchers, and redemption history anytime.
            </p>
          </div>
          <Link
            to="/giftcards"
            className="shrink-0 inline-flex items-center gap-2 rounded-2xl bg-cream px-6 py-3.5 text-sm font-bold text-choco hover:bg-white transition-all shadow active:scale-95"
          >
            <span>Open Wallet Ledger</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

      </div>
    </div>
  );
}
