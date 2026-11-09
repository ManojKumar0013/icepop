import { useEffect, useMemo, useState } from "react";
import { Check, Clock, Copy, Gift, MapPin, Pencil, Plus, Share2, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { StampCard, useLoyalty } from "@/components/site/StampCard";
import { inr } from "@/lib/format";

const MyStamps = () => {
  const l = useLoyalty();
  return l?.enabled ? <div className="md:col-span-2"><StampCard l={l} /></div> : null;
};

const ReferralCard = () => {
  const [data, setData] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [friendCodeInput, setFriendCodeInput] = useState("");
  const [savingFriendCode, setSavingFriendCode] = useState(false);
  const [tab, setTab] = useState("all");

  const loadData = () => {
    api.get("/giftcards/referral").then(({ data }) => setData(data)).catch(() => {});
  };

  useEffect(() => {
    loadData();
  }, []);

  const completedList = useMemo(() => data?.completed_referrals || [], [data]);
  const pendingList = useMemo(() => data?.pending_referrals || [], [data]);

  const filteredFriends = useMemo(() => {
    if (tab === "completed") return completedList;
    if (tab === "pending") return pendingList;
    return [...completedList, ...pendingList];
  }, [tab, completedList, pendingList]);

  if (!data) return null;

  const code = data.referral_code || "ICE10";
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
    <div id="referral" data-testid="referral-section" className="md:col-span-2 space-y-4">
      {/* 1. User's Own Share & Earn Card */}
      <div className="overflow-hidden rounded-3xl border-2 border-amber-300/80 bg-gradient-to-br from-amber-50/90 via-orange-50/40 to-pink-light/30 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
              <Gift className="h-3.5 w-3.5 text-amber-600" /> Refer & Earn ₹10 Each
            </span>
            <h2 className="font-display text-2xl font-black text-choco">
              Invite Friends, Both Get ₹10! 🍧
            </h2>
            <p className="text-xs sm:text-sm text-choco/80 leading-relaxed">
              Share your personal invite code with friends. When they place their first order, both of you get <b>₹10 credited directly into your ICEPOPS digital wallet</b>! (Credited automatically upon their first order).
            </p>
          </div>

          {/* Stats Pills: Total, Completed, Pending, Wallet Earned */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-2.5 shrink-0">
            <div className="rounded-2xl bg-white p-3 border border-amber-200/80 text-center min-w-[95px] shadow-xs">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Joined</p>
              <p className="font-display text-2xl font-black text-choco mt-0.5">{data.total_referrals || 0}</p>
            </div>
            <div className="rounded-2xl bg-white p-3 border border-emerald-300 text-center min-w-[95px] shadow-xs">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Completed</p>
              <p className="font-display text-2xl font-black text-emerald-700 mt-0.5">{data.completed_count || 0}</p>
            </div>
            <div className="rounded-2xl bg-white p-3 border border-amber-300 text-center min-w-[95px] shadow-xs">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Pending</p>
              <p className="font-display text-2xl font-black text-amber-600 mt-0.5">{data.pending_count || 0}</p>
            </div>
            <div className="rounded-2xl bg-white p-3 border border-amber-200/80 text-center min-w-[95px] shadow-xs">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Earned</p>
              <p className="font-display text-2xl font-black text-emerald-700 mt-0.5">{inr(data.total_earned_paise || 0)}</p>
            </div>
          </div>
        </div>

        {/* Code & Actions Box */}
        <div className="mt-6 pt-5 border-t border-amber-200/70 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1 flex items-center justify-between rounded-2xl bg-white border-2 border-choco/20 px-4 py-2.5 shadow-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">Your Invite Code</span>
              <span className="font-mono text-base font-black text-choco tracking-wider">{code}</span>
            </div>
            <button
              type="button"
              onClick={copyCode}
              className="inline-flex items-center gap-1 rounded-xl bg-choco/10 px-3 py-1.5 text-xs font-bold text-choco hover:bg-choco hover:text-cream transition-colors"
            >
              {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedCode ? "Copied" : "Copy Code"}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={copyLink}
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white border border-border px-4 py-3 text-xs font-bold text-choco hover:border-choco shadow-xs transition-colors"
          >
            {copiedLink ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
            <span>{copiedLink ? "Link Copied!" : "Copy Share Link"}</span>
          </button>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-5 py-3 text-xs font-bold text-white shadow hover:opacity-95 active:scale-95 transition-all"
          >
            <span>Share on WhatsApp 💬</span>
          </a>
        </div>

        {/* Referral Tracking: Who are they? Completed vs Pending Friends List */}
        <div className="mt-6 pt-5 border-t border-amber-200/70">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5">
            <div>
              <h3 className="font-display text-base font-bold text-choco flex items-center gap-2">
                <Users className="h-4 w-4 text-amber-600" />
                Referral Tracking & Friends
              </h3>
              <p className="text-xs text-choco/75 mt-0.5">
                See who joined with your code, who completed their first order, and who is pending.
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="inline-flex rounded-2xl bg-white/90 p-1 border border-amber-200/80 shadow-2xs self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setTab("all")}
                className={`rounded-xl px-3 py-1 text-xs font-bold transition-all ${
                  tab === "all"
                    ? "bg-choco text-cream shadow-xs"
                    : "text-choco/70 hover:text-choco"
                }`}
              >
                All ({data.total_referrals || 0})
              </button>
              <button
                type="button"
                onClick={() => setTab("completed")}
                className={`rounded-xl px-3 py-1 text-xs font-bold transition-all ${
                  tab === "completed"
                    ? "bg-emerald-700 text-white shadow-xs"
                    : "text-emerald-800 hover:text-emerald-950"
                }`}
              >
                Completed ({data.completed_count || 0})
              </button>
              <button
                type="button"
                onClick={() => setTab("pending")}
                className={`rounded-xl px-3 py-1 text-xs font-bold transition-all ${
                  tab === "pending"
                    ? "bg-amber-600 text-white shadow-xs"
                    : "text-amber-800 hover:text-amber-950"
                }`}
              >
                Pending ({data.pending_count || 0})
              </button>
            </div>
          </div>

          {/* Friends List Items */}
          {filteredFriends.length === 0 ? (
            <div className="rounded-2xl bg-white/60 border border-amber-200/60 p-5 text-center">
              <p className="text-xs sm:text-sm font-semibold text-choco/70">
                {tab === "completed"
                  ? "No completed referrals yet. Once a friend places their first order, ₹10 will be credited to both your wallets!"
                  : tab === "pending"
                  ? "No pending referrals right now. Share your invite code with more friends!"
                  : "No friends have joined yet. Share your invite code above to get started!"}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {filteredFriends.map((f, i) => (
                <div
                  key={f.id || i}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3.5 border border-amber-200/70 shadow-2xs hover:border-amber-300 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl font-bold text-sm ${
                        f.status === "completed"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {f.name ? f.name.charAt(0).toUpperCase() : "F"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-choco truncate">
                        {f.name || "Friend"}
                      </p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        {f.phone_masked && <span>{f.phone_masked}</span>}
                        {f.phone_masked && f.email_masked && <span>•</span>}
                        {f.email_masked && <span>{f.email_masked}</span>}
                        {f.order_number && (
                          <span className="font-semibold text-choco/80">
                            • Order #{f.order_number}
                          </span>
                        )}
                        {f.date && (
                          <span>• {new Date(f.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
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
      </div>

      {/* 2. Have a Friend's Referral Code? (ONLY visible before first completed order) */}
      {!data.has_completed_order && (
        <div
          data-testid="have-referral-code-card"
          className="rounded-3xl border-2 border-amber-300/80 bg-gradient-to-br from-amber-50/70 via-orange-50/40 to-cream p-5 sm:p-6 shadow-xs"
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-amber-600 shrink-0" />
              <h3 className="font-display text-base sm:text-lg font-bold text-choco">
                Have a Friend&apos;s Referral Code?
              </h3>
            </div>
            <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
              ₹10 Bonus
            </span>
          </div>

          {data.referred_by_code ? (
            <div className="space-y-2">
              <div className="rounded-2xl border-2 border-emerald-400 bg-white px-4 py-2.5 sm:py-3 shadow-xs">
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
                  data-testid="friend-code-input"
                  className="flex-1 uppercase font-mono tracking-wider rounded-2xl border border-amber-300/80 bg-white px-4 py-2.5 sm:py-3 text-sm font-bold text-choco placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="submit"
                  disabled={savingFriendCode || !friendCodeInput.trim()}
                  data-testid="apply-friend-code-button"
                  className="shrink-0 rounded-2xl bg-choco px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-cream hover:bg-choco/90 transition-colors disabled:opacity-50"
                >
                  {savingFriendCode ? "Applying..." : "Apply"}
                </button>
              </div>
              <p className="text-xs text-choco/75">
                🎉 Both of you will get ₹10 credited to your wallet once your first order is placed!
              </p>
            </form>
          )}
        </div>
      )}
    </div>
  );
};

const inputCls = "w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-pink";
const BLANK = { label: "Home", name: "", phone: "", line1: "", line2: "", area: "", city: "", pincode: "", instructions: "", is_default: false };

const AddressForm = ({ initial, onSaved }) => {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = async (e) => {
    e.preventDefault();
    try {
      if (f.id) await api.put(`/account/addresses/${f.id}`, f);
      else await api.post("/account/addresses", f);
      toast.success("Address saved");
      onSaved();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };
  const inp = (k, label, props = {}) => <input aria-label={label} placeholder={label} data-testid={`address-${k}-input`} className={inputCls} value={f[k] || ""} onChange={set(k)} {...props} />;
  return (
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
      {inp("label", "Label (Home, Work…)", { maxLength: 30 })}{inp("name", "Name", { required: true })}
      {inp("phone", "Mobile number", { required: true, inputMode: "tel" })}{inp("pincode", "PIN code", { required: true, inputMode: "numeric", maxLength: 6 })}
      <div className="sm:col-span-2">{inp("line1", "House / flat, street", { required: true })}</div>
      {inp("line2", "Landmark (optional)")}{inp("area", "Area / locality", { required: true })}
      {inp("city", "City", { required: true })}{inp("instructions", "Delivery instructions (optional)")}
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.is_default} onChange={set("is_default")} data-testid="address-default-checkbox" />Make this my default address</label>
      <button data-testid="address-save-button" className="rounded-full bg-choco py-3 font-bold text-cream sm:col-span-2">Save address</button>
    </form>
  );
};

const Profile = () => {
  const { user, setUser } = useAuth();
  const [f, setF] = useState({ name: user.name, phone: user.phone || "" });
  const save = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.patch("/auth/me", { name: f.name, phone: f.phone || null });
      setUser(data);
      toast.success("Profile updated");
    } catch (err) {
      toast.error(errMsg(err));
    }
  };
  return (
    <form onSubmit={save} className="space-y-4 rounded-3xl border border-border bg-white p-6 sm:p-8" data-testid="profile-form">
      <h2 className="font-display text-xl font-bold">Profile</h2>
      <p className="text-sm text-muted-foreground" data-testid="profile-email">{user.email}</p>
      <input aria-label="Name" data-testid="profile-name-input" className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input aria-label="Mobile number" placeholder="Mobile number" data-testid="profile-phone-input" className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      <button data-testid="profile-save-button" className="rounded-full bg-choco px-6 py-3 text-sm font-bold text-cream">Save changes</button>
    </form>
  );
};

export default function Account() {
  const [addresses, setAddresses] = useState([]);
  const [editing, setEditing] = useState(null);
  const load = () => api.get("/account/addresses").then(({ data }) => setAddresses(data)).catch(() => {});
  useEffect(() => {
    load();
    if (window.location.hash === "#referral") {
      setTimeout(() => {
        document.getElementById("referral")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    }
  }, []);
  const remove = async (id) => {
    if (!window.confirm("Delete this address?")) return;
    await api.delete(`/account/addresses/${id}`);
    load();
  };
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-10 sm:px-6 md:grid-cols-[360px_1fr] lg:px-8" data-testid="account-page">
      <h1 className="font-display text-4xl font-extrabold tracking-tight md:col-span-2">My account</h1>
      <ReferralCard />
      <MyStamps />
      <Profile />
      <section className="rounded-3xl border border-border bg-white p-6 sm:p-8">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Saved addresses</h2>
          <button data-testid="address-add-button" onClick={() => setEditing(BLANK)} className="flex items-center gap-1 rounded-full bg-pink-light px-4 py-2 text-sm font-bold"><Plus className="h-4 w-4" />Add</button>
        </div>
        {addresses.length === 0 && <p className="text-sm text-muted-foreground" data-testid="addresses-empty">No saved addresses yet.</p>}
        <ul className="space-y-3">
          {addresses.map((a) => (
            <li key={a.id} data-testid={`address-card-${a.id}`} className="flex gap-3 rounded-2xl border border-border p-4 text-sm">
              <MapPin className="h-4 w-4 shrink-0 text-strawberry" />
              <div className="flex-1"><p className="font-bold">{a.label}{a.is_default && <span className="ml-2 rounded-full bg-pistachio/15 px-2 py-0.5 text-[10px] text-pistachio">DEFAULT</span>}</p><p>{a.name}, {a.phone}</p><p className="text-muted-foreground">{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.area}, {a.city} {a.pincode}</p></div>
              <button aria-label="Edit address" data-testid={`address-edit-${a.id}`} onClick={() => setEditing(a)}><Pencil className="h-4 w-4" /></button>
              <button aria-label="Delete address" data-testid={`address-delete-${a.id}`} onClick={() => remove(a.id)}><Trash2 className="h-4 w-4 text-strawberry" /></button>
            </li>
          ))}
        </ul>
      </section>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit address" : "New address"}</DialogTitle></DialogHeader>
          {editing && <AddressForm initial={editing} onSaved={() => { setEditing(null); load(); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
