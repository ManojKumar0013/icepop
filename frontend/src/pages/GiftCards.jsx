import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Gift,
  Sparkles,
  Check,
  Copy,
  Share2,
  Wallet,
  ArrowRight,
  CreditCard,
  ShieldCheck,
  Loader2,
  Search,
  Filter,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Smartphone,
  Info,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatPaise } from "@/lib/utils";
import { istDateTime } from "@/lib/format";

const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";
const loadScript = () =>
  new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.onload = resolve;
    s.onerror = () => reject(new Error("load"));
    document.body.appendChild(s);
  });

const PRESET_AMOUNTS = [250, 500, 1000, 2000];

const CARD_THEMES = [
  {
    id: "strawberry",
    name: "Strawberry Sunset",
    gradient: "from-rose-500 via-pink-500 to-amber-300",
    swatch: "bg-gradient-to-r from-rose-500 to-pink-500",
    emoji: "🍡",
  },
  {
    id: "mango",
    name: "Mango Sorbet",
    gradient: "from-amber-500 via-orange-400 to-yellow-300",
    swatch: "bg-gradient-to-r from-amber-500 to-orange-400",
    emoji: "🥭",
  },
  {
    id: "blueberry",
    name: "Blueberry Frost",
    gradient: "from-indigo-600 via-purple-500 to-sky-400",
    swatch: "bg-gradient-to-r from-indigo-600 to-sky-400",
    emoji: "🫐",
  },
  {
    id: "choco",
    name: "Choco Royale",
    gradient: "from-amber-950 via-stone-800 to-amber-700",
    swatch: "bg-gradient-to-r from-amber-950 to-amber-700",
    emoji: "🍫",
  },
  {
    id: "kiwi",
    name: "Matcha Mint",
    gradient: "from-emerald-600 via-teal-500 to-lime-300",
    swatch: "bg-gradient-to-r from-emerald-600 to-lime-400",
    emoji: "🥝",
  },
];

export default function GiftCards() {
  const { user } = useAuth();
  const [amountRupees, setAmountRupees] = useState(500);
  const [isCustomAmount, setIsCustomAmount] = useState(false);
  const [customAmountInput, setCustomAmountInput] = useState("");
  const [selectedTheme, setSelectedTheme] = useState(CARD_THEMES[0]);

  const [senderName, setSenderName] = useState(user?.name || "");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [message, setMessage] = useState("Enjoy some delicious handcrafted ice pops on me!");
  const [submitting, setSubmitting] = useState(false);
  const [issuedCard, setIssuedCard] = useState(null);

  // Check / Redeem state
  const [checkCode, setCheckCode] = useState("");
  const [cardDetails, setCardDetails] = useState(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [checking, setChecking] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemingRowCode, setRedeemingRowCode] = useState(null);

  // Table & Ledger state
  const [activeTab, setActiveTab] = useState("vouchers"); // "vouchers" | "wallet"
  const [vouchers, setVouchers] = useState([]);
  const [walletHistory, setWalletHistory] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "active" | "redeemed"

  // Sync sender name when user logs in
  useEffect(() => {
    if (user?.name && !senderName) {
      setSenderName(user.name);
    }
  }, [user, senderName]);

  const loadWallet = async () => {
    if (!user) return;
    try {
      const { data } = await api.get("/giftcards/wallet");
      setWalletBalance(data.wallet_balance_paise || 0);
    } catch {
      // non-fatal
    }
  };

  const loadVouchers = async () => {
    if (!user) return;
    try {
      const { data } = await api.get("/giftcards/my-vouchers");
      setVouchers(Array.isArray(data) ? data : []);
    } catch {
      setVouchers([]);
    }
  };

  const loadWalletHistory = async () => {
    if (!user) return;
    try {
      const { data } = await api.get("/giftcards/wallet/history");
      setWalletHistory(Array.isArray(data) ? data : []);
    } catch {
      setWalletHistory([]);
    }
  };

  const refreshAll = async () => {
    setLoadingData(true);
    await Promise.allSettled([loadWallet(), loadVouchers(), loadWalletHistory()]);
    setLoadingData(false);
  };

  useEffect(() => {
    if (user) {
      refreshAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleCustomAmountChange = (e) => {
    const val = e.target.value.replace(/\D/g, "");
    setCustomAmountInput(val);
    const num = Number(val);
    if (num > 0) {
      setAmountRupees(num);
    }
  };

  const handlePurchase = async (e) => {
    e.preventDefault();
    if (!senderName.trim() || !recipientName.trim()) {
      toast.error("Please enter both sender and recipient names");
      return;
    }

    const finalAmount = isCustomAmount ? Number(customAmountInput) : Number(amountRupees);
    if (!finalAmount || finalAmount < 50 || finalAmount > 10000) {
      toast.error("Please enter a voucher amount between ₹50 and ₹10,000");
      return;
    }

    setSubmitting(true);
    try {
      await loadScript();
      const amount_paise = finalAmount * 100;

      // 1. Create Razorpay Order
      const { data: orderData } = await api.post("/giftcards/razorpay/order", {
        amount_paise,
        sender_name: senderName.trim(),
        recipient_name: recipientName.trim(),
        recipient_phone: recipientPhone.trim() || undefined,
        message: message.trim() || undefined,
      });

      // 2. Open Razorpay Payment Window
      const rzp = new window.Razorpay({
        key: orderData.key_id,
        order_id: orderData.razorpay_order_id,
        amount: orderData.amount,
        currency: orderData.currency,
        name: orderData.name,
        description: orderData.description,
        prefill: orderData.prefill,
        theme: { color: "#3D2314" },
        handler: async (resp) => {
          try {
            toast.loading("Verifying payment & generating voucher...", { id: "gc-verify" });
            const { data: card } = await api.post("/giftcards/razorpay/verify", {
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
              amount_paise,
              sender_name: senderName.trim(),
              recipient_name: recipientName.trim(),
              recipient_phone: recipientPhone.trim() || undefined,
              message: message.trim() || undefined,
            });
            toast.dismiss("gc-verify");
            setIssuedCard(card);
            toast.success("Payment received! Gift voucher generated.");
            refreshAll();
          } catch (err) {
            toast.dismiss("gc-verify");
            toast.error(err?.response?.data?.detail || "Payment verification failed");
          } finally {
            setSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => {
            setSubmitting(false);
            toast.info("Payment was cancelled. No money was charged.");
          },
        },
      });

      rzp.on("payment.failed", (r) => {
        setSubmitting(false);
        toast.error(r?.error?.description || "Payment failed. Please try again.");
      });

      rzp.open();
    } catch (err) {
      setSubmitting(false);
      toast.error(
        err?.message === "load"
          ? "Could not open Razorpay payment window. Please check your internet connection."
          : (err?.response?.data?.detail || "Could not start payment. Please try again.")
      );
    }
  };

  const handleCheck = async () => {
    if (!checkCode.trim()) return;
    setChecking(true);
    try {
      const { data } = await api.get(`/giftcards/check/${checkCode.trim()}`);
      setCardDetails(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Card not found or already redeemed");
      setCardDetails(null);
    } finally {
      setChecking(false);
    }
  };

  const handleRedeem = async () => {
    if (!user) {
      toast.error("Please log in to redeem gift cards into your wallet balance");
      return;
    }
    setRedeeming(true);
    try {
      const codeToRedeem = (cardDetails?.code || checkCode).trim();
      const { data } = await api.post("/giftcards/redeem", { code: codeToRedeem });
      toast.success(data.message || "Gift card redeemed to your wallet!");
      setCardDetails(null);
      setCheckCode("");
      refreshAll();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Redemption failed");
    } finally {
      setRedeeming(false);
    }
  };

  const handleQuickRedeem = async (code) => {
    if (!user) {
      toast.error("Please log in to redeem gift cards");
      return;
    }
    setRedeemingRowCode(code);
    try {
      const { data } = await api.post("/giftcards/redeem", { code: code.trim() });
      toast.success(data.message || `Code ${code} redeemed to your wallet!`);
      refreshAll();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Redemption failed");
    } finally {
      setRedeemingRowCode(null);
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    toast.success(`Code ${code} copied to clipboard!`);
  };

  const shareWhatsApp = (code, amt, to) => {
    const text = `Hey ${to || "friend"}! 🍡 I just sent you an ICEPOPS gift voucher worth ₹${amt}. Use voucher code *${code}* at checkout on ICEPOPS to treat yourself to delicious handcrafted ice pops!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  // Filtered Vouchers
  const filteredVouchers = useMemo(() => {
    return vouchers.filter((v) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        v.code.toLowerCase().includes(q) ||
        (v.recipient_name && v.recipient_name.toLowerCase().includes(q)) ||
        (v.sender_name && v.sender_name.toLowerCase().includes(q)) ||
        (v.message && v.message.toLowerCase().includes(q));

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && v.is_active && v.balance_paise > 0) ||
        (statusFilter === "redeemed" && (!v.is_active || v.balance_paise === 0));

      return matchesSearch && matchesStatus;
    });
  }, [vouchers, searchQuery, statusFilter]);

  // Filtered Wallet Transactions
  const filteredTransactions = useMemo(() => {
    return walletHistory.filter((t) => {
      const q = searchQuery.toLowerCase().trim();
      return (
        !q ||
        (t.reference && t.reference.toLowerCase().includes(q)) ||
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q))
      );
    });
  }, [walletHistory, searchQuery]);

  // Calculated Stats
  const activeVouchersCount = useMemo(
    () => vouchers.filter((v) => v.is_active && v.balance_paise > 0).length,
    [vouchers]
  );
  const totalActiveBalance = useMemo(
    () => vouchers.filter((v) => v.is_active).reduce((sum, v) => sum + (v.balance_paise || 0), 0),
    [vouchers]
  );

  return (
    <div className="min-h-screen bg-cream/30 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-12">
        {/* Header & Quick Stats */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-pink-light px-4 py-1.5 text-xs font-bold text-strawberry">
            <Gift className="h-4 w-4" /> Digital Gift Vouchers & Store Credit Hub
          </div>
          <h1 className="font-display text-3xl sm:text-5xl font-extrabold text-choco tracking-tight">
            Give the Sweet Gift of Chilled Happiness.
          </h1>
          <p className="mx-auto max-w-2xl text-base text-choco/70">
            Instant digital vouchers delivered via WhatsApp or email. Valid on all our handcrafted fruit popsicles,
            boxes, and counter orders with zero expiration.
          </p>

          {/* Quick Metrics Cards */}
          <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto text-left">
            <div className="rounded-2xl bg-white border border-border p-4 shadow-sm flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-choco/60 block uppercase">Wallet Balance</span>
                <span className="text-xl font-display font-extrabold text-emerald-700">
                  {formatPaise(walletBalance)}
                </span>
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-border p-4 shadow-sm flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-pink-light text-strawberry flex items-center justify-center shrink-0">
                <Gift className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-choco/60 block uppercase">Active Vouchers</span>
                <span className="text-xl font-display font-extrabold text-choco">
                  {activeVouchersCount}{" "}
                  <span className="text-xs font-normal text-choco/60">
                    ({formatPaise(totalActiveBalance)})
                  </span>
                </span>
              </div>
            </div>

            <Link
              to="/refer"
              className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-300/80 p-4 shadow-sm flex items-center justify-between gap-3 hover:border-amber-400 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-amber-900 block uppercase">Refer & Earn ₹10</span>
                  <span className="text-xs font-bold text-choco block">
                    Invite friends, both get ₹10 wallet cash
                  </span>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-choco/60 group-hover:translate-x-1 transition-transform shrink-0" />
            </Link>
          </div>
        </div>

        {/* Top Grid: Card Designer & Purchase Form */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Interactive Card Preview & Theme Picker */}
          <div className="lg:col-span-5 space-y-6">
            <div
              className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${selectedTheme.gradient} p-6 sm:p-8 text-white shadow-xl aspect-[1.6/1] flex flex-col justify-between transition-all duration-300`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-display font-extrabold text-2xl tracking-wider">ICEPOPS</span>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">
                    Digital Gift Voucher
                  </p>
                </div>
                <span className="text-3xl">{selectedTheme.emoji}</span>
              </div>

              <div className="my-auto space-y-1">
                <span className="font-display text-4xl sm:text-5xl font-black tracking-tight">
                  ₹{amountRupees || "0"}
                </span>
                <p className="text-xs font-medium text-white/90 line-clamp-2 italic">
                  "{message || "Enjoy delicious gourmet ice pops!"}"
                </p>
              </div>

              <div className="flex items-end justify-between border-t border-white/20 pt-3 text-xs">
                <div>
                  <span className="text-[10px] text-white/70 block uppercase">For:</span>
                  <span className="font-bold">{recipientName || "Friend / Family"}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-white/70 block uppercase">From:</span>
                  <span className="font-bold">{senderName || "You"}</span>
                </div>
              </div>
            </div>

            {/* Theme Picker */}
            <div className="rounded-2xl bg-white p-4 border border-border shadow-sm flex items-center justify-between">
              <span className="text-xs font-bold text-choco">Card Theme:</span>
              <div className="flex items-center gap-2">
                {CARD_THEMES.map((th) => (
                  <button
                    key={th.id}
                    type="button"
                    title={th.name}
                    onClick={() => setSelectedTheme(th)}
                    className={`h-7 w-7 rounded-full ${th.swatch} transition-all ${
                      selectedTheme.id === th.id
                        ? "ring-2 ring-strawberry ring-offset-2 scale-110 shadow"
                        : "opacity-70 hover:opacity-100"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Check Existing Card Balance Box */}
            <div className="rounded-3xl bg-white p-6 border border-border shadow-sm space-y-4">
              <h3 className="font-display font-bold text-choco text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-strawberry" /> Check Card Balance or Redeem
              </h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={checkCode}
                  onChange={(e) => setCheckCode(e.target.value.toUpperCase())}
                  placeholder="e.g. POPS-7B42F1"
                  className="flex-1 rounded-2xl border border-border px-3 py-2 text-xs font-mono font-bold uppercase focus:ring-1 focus:ring-strawberry"
                />
                <button
                  type="button"
                  onClick={handleCheck}
                  disabled={checking}
                  className="rounded-2xl bg-choco px-4 py-2 text-xs font-bold text-cream hover:bg-choco/90 disabled:opacity-50"
                >
                  {checking ? "Checking..." : "Verify"}
                </button>
              </div>

              {cardDetails && (
                <div className="rounded-2xl bg-cream/40 p-4 border border-border text-xs space-y-2 animate-in fade-in">
                  <div className="flex justify-between font-bold text-choco">
                    <span>Card Balance:</span>
                    <span className="text-emerald-700 text-sm">{formatPaise(cardDetails.balance_paise)}</span>
                  </div>
                  <p className="text-choco/60 text-[11px]">
                    From {cardDetails.sender_name} for {cardDetails.recipient_name}
                  </p>
                  <button
                    onClick={handleRedeem}
                    disabled={redeeming || cardDetails.balance_paise <= 0}
                    className="w-full mt-2 rounded-xl bg-strawberry py-2 text-xs font-bold text-white shadow-sm hover:bg-strawberry/90 disabled:opacity-50"
                  >
                    {redeeming
                      ? "Crediting..."
                      : cardDetails.balance_paise > 0
                      ? `Add ${formatPaise(cardDetails.balance_paise)} to My Wallet`
                      : "Already Redeemed"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right: Purchase Form */}
          <div className="lg:col-span-7 rounded-3xl bg-white p-6 sm:p-8 border border-border shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold text-choco">Send a Digital Voucher</h2>
              <span className="text-xs text-choco/60 font-medium">Valid forever • Zero fees</span>
            </div>

            <form onSubmit={handlePurchase} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-choco">Select Voucher Value</label>
                  {isCustomAmount && (
                    <span className="text-[11px] text-choco/60">Min ₹50 • Max ₹10,000</span>
                  )}
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {PRESET_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        setIsCustomAmount(false);
                        setAmountRupees(amt);
                      }}
                      className={`py-2.5 rounded-2xl border text-sm font-bold transition-all ${
                        !isCustomAmount && amountRupees === amt
                          ? "border-strawberry bg-pink-light text-strawberry shadow-sm scale-105"
                          : "border-border text-choco/70 hover:bg-cream"
                      }`}
                    >
                      ₹{amt}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomAmount(true);
                      if (!customAmountInput) {
                        setCustomAmountInput(String(amountRupees || 500));
                      }
                    }}
                    className={`py-2.5 rounded-2xl border text-sm font-bold transition-all ${
                      isCustomAmount
                        ? "border-strawberry bg-pink-light text-strawberry shadow-sm scale-105"
                        : "border-border text-choco/70 hover:bg-cream"
                    }`}
                  >
                    Custom
                  </button>
                </div>

                {isCustomAmount && (
                  <div className="mt-3 flex items-center gap-2 animate-in fade-in">
                    <span className="text-sm font-bold text-choco">₹</span>
                    <input
                      type="number"
                      min="50"
                      max="10000"
                      value={customAmountInput}
                      onChange={handleCustomAmountChange}
                      placeholder="Enter amount (e.g. 750)"
                      className="w-full rounded-2xl border border-border px-4 py-2 text-sm font-bold focus:ring-1 focus:ring-strawberry"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-choco block mb-1">Your Name *</label>
                  <input
                    type="text"
                    required
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="Sender name"
                    className="w-full rounded-2xl border border-border px-4 py-2.5 text-sm focus:ring-1 focus:ring-strawberry"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-choco block mb-1">Recipient's Name *</label>
                  <input
                    type="text"
                    required
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Lucky friend's name"
                    className="w-full rounded-2xl border border-border px-4 py-2.5 text-sm focus:ring-1 focus:ring-strawberry"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-choco block mb-1">
                    Recipient WhatsApp / Phone (optional)
                  </label>
                  <input
                    type="tel"
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    placeholder="For direct SMS / WhatsApp delivery"
                    className="w-full rounded-2xl border border-border px-4 py-2.5 text-sm focus:ring-1 focus:ring-strawberry"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-choco block mb-1">Personal Message</label>
                  <textarea
                    rows="2"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full rounded-2xl border border-border p-3 text-sm focus:ring-1 focus:ring-strawberry"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-between">
                <div>
                  <span className="text-xs text-choco/60 block">Payable Total:</span>
                  <span className="font-display text-2xl font-extrabold text-choco">₹{amountRupees}</span>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-2xl bg-strawberry px-8 py-3.5 text-sm font-bold text-white shadow-md hover:bg-strawberry/90 active:scale-95 transition-all disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? "Opening Razorpay..." : `Purchase Voucher (₹${amountRupees})`}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* REAL-WORLD TABLE: Gift Vouchers & Digital Wallet Ledger */}
        <div className="rounded-3xl bg-white border border-border shadow-sm overflow-hidden">
          {/* Table Header & Controls */}
          <div className="p-6 border-b border-border space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-choco">
                  Vouchers & Digital Wallet Ledger
                </h2>
                <p className="text-xs text-choco/70 mt-0.5">
                  Real-time record of all issued gift cards, received gifts, and digital wallet credits & debits.
                </p>
              </div>

              {/* Refresh button */}
              <button
                type="button"
                onClick={refreshAll}
                disabled={loadingData}
                className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-bold text-choco hover:bg-cream active:scale-95 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingData ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>
            </div>

            {/* Tab Switcher & Search Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2">
              {/* Tab Pills */}
              <div className="flex items-center gap-2 bg-cream/50 p-1.5 rounded-2xl border border-border w-fit">
                <button
                  type="button"
                  onClick={() => setActiveTab("vouchers")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTab === "vouchers"
                      ? "bg-white text-choco shadow-sm"
                      : "text-choco/70 hover:text-choco"
                  }`}
                >
                  <Gift className="h-3.5 w-3.5 text-strawberry" />
                  <span>My Gift Vouchers</span>
                  <span
                    className={`ml-1 px-2 py-0.5 rounded-full text-[10px] ${
                      activeTab === "vouchers"
                        ? "bg-pink-light text-strawberry font-bold"
                        : "bg-black/5 text-choco/60"
                    }`}
                  >
                    {vouchers.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("wallet")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTab === "wallet"
                      ? "bg-white text-choco shadow-sm"
                      : "text-choco/70 hover:text-choco"
                  }`}
                >
                  <Wallet className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Wallet Passbook & Statements</span>
                  <span
                    className={`ml-1 px-2 py-0.5 rounded-full text-[10px] ${
                      activeTab === "wallet"
                        ? "bg-emerald-50 text-emerald-700 font-bold"
                        : "bg-black/5 text-choco/60"
                    }`}
                  >
                    {walletHistory.length}
                  </span>
                </button>
              </div>

              {/* Search & Filters */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-choco/40" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={
                      activeTab === "vouchers"
                        ? "Search code, recipient, sender..."
                        : "Search reference or order..."
                    }
                    className="w-full rounded-2xl border border-border pl-8 pr-3 py-1.5 text-xs text-choco placeholder:text-choco/40 focus:ring-1 focus:ring-strawberry"
                  />
                </div>

                {activeTab === "vouchers" && (
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-2xl border border-border px-3 py-1.5 text-xs font-bold text-choco bg-white focus:ring-1 focus:ring-strawberry"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active Only</option>
                    <option value="redeemed">Redeemed Only</option>
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* TAB 1: Vouchers Table */}
          {activeTab === "vouchers" && (
            <div className="overflow-x-auto">
              {!user ? (
                <div className="p-12 text-center space-y-3">
                  <Gift className="h-10 w-10 text-choco/30 mx-auto" />
                  <h3 className="font-display font-bold text-choco text-base">Please log in to view your vouchers</h3>
                  <p className="text-xs text-choco/60 max-w-sm mx-auto">
                    Log in with your mobile number or email to view all gift cards you've sent or received, and manage your wallet balance.
                  </p>
                </div>
              ) : filteredVouchers.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <Gift className="h-10 w-10 text-choco/30 mx-auto" />
                  <h3 className="font-display font-bold text-choco text-base">No gift vouchers found</h3>
                  <p className="text-xs text-choco/60 max-w-sm mx-auto">
                    {searchQuery
                      ? "No vouchers match your search. Try resetting the search filter."
                      : "You haven't issued or received any gift cards yet. Send one above to treat a friend!"}
                  </p>
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-cream/40 text-[11px] font-bold text-choco/60 uppercase tracking-wider border-b border-border">
                    <tr>
                      <th className="py-3 px-4">Voucher Code</th>
                      <th className="py-3 px-4">Initial Value</th>
                      <th className="py-3 px-4">Balance</th>
                      <th className="py-3 px-4">From / To</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Issued On</th>
                      <th className="py-3 px-4 text-right">Quick Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredVouchers.map((v) => {
                      const isActive = v.is_active && v.balance_paise > 0;
                      const isRedeemingThis = redeemingRowCode === v.code;
                      return (
                        <tr key={v.id || v.code} className="hover:bg-cream/20 transition-colors">
                          {/* Code */}
                          <td className="py-3.5 px-4 font-mono font-bold">
                            <div className="inline-flex items-center gap-1.5 rounded-xl bg-pink-light/60 px-2.5 py-1 text-strawberry border border-pink-light">
                              <span>{v.code}</span>
                              <button
                                type="button"
                                title="Copy voucher code"
                                onClick={() => copyCode(v.code)}
                                className="text-strawberry/70 hover:text-strawberry"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                            </div>
                          </td>

                          {/* Initial Value */}
                          <td className="py-3.5 px-4 font-bold text-choco">
                            {formatPaise(v.amount_paise)}
                          </td>

                          {/* Available Balance */}
                          <td className="py-3.5 px-4 font-bold">
                            {isActive ? (
                              <span className="text-emerald-700 font-extrabold">
                                {formatPaise(v.balance_paise)}
                              </span>
                            ) : (
                              <span className="text-choco/40 line-through">
                                {formatPaise(v.balance_paise)}
                              </span>
                            )}
                          </td>

                          {/* From / To */}
                          <td className="py-3.5 px-4">
                            <div className="space-y-0.5">
                              <span className="text-choco font-semibold block">
                                To: {v.recipient_name}
                              </span>
                              <span className="text-[10px] text-choco/60 block">
                                From: {v.sender_name}
                              </span>
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4">
                            {isActive ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                Active & Valid
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-stone-100 text-stone-600 border border-stone-200">
                                <Check className="h-3 w-3 text-stone-500" />
                                Fully Redeemed
                              </span>
                            )}
                          </td>

                          {/* Issued Date */}
                          <td className="py-3.5 px-4 text-choco/70 whitespace-nowrap">
                            {istDateTime(v.created_at)}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5 justify-end">
                              <button
                                type="button"
                                title="Share on WhatsApp"
                                onClick={() =>
                                  shareWhatsApp(v.code, v.amount_paise / 100, v.recipient_name)
                                }
                                className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 active:scale-95 transition-all"
                              >
                                <Share2 className="h-3 w-3" />
                                <span className="hidden sm:inline">WhatsApp</span>
                              </button>

                              {isActive ? (
                                <button
                                  type="button"
                                  disabled={isRedeemingThis}
                                  onClick={() => handleQuickRedeem(v.code)}
                                  className="inline-flex items-center gap-1 rounded-xl bg-strawberry px-3 py-1.5 text-[11px] font-bold text-white hover:bg-strawberry/90 active:scale-95 shadow-sm transition-all disabled:opacity-50"
                                >
                                  {isRedeemingThis ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Wallet className="h-3 w-3" />
                                  )}
                                  <span>Redeem to Wallet</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-choco/40 italic px-2">
                                  Credited to Wallet
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TAB 2: Wallet History Table */}
          {activeTab === "wallet" && (
            <div className="overflow-x-auto">
              {!user ? (
                <div className="p-12 text-center space-y-3">
                  <Wallet className="h-10 w-10 text-choco/30 mx-auto" />
                  <h3 className="font-display font-bold text-choco text-base">Please log in to view wallet statement</h3>
                  <p className="text-xs text-choco/60 max-w-sm mx-auto">
                    Your wallet balance is linked to your verified account.
                  </p>
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <Wallet className="h-10 w-10 text-choco/30 mx-auto" />
                  <h3 className="font-display font-bold text-choco text-base">No wallet transactions yet</h3>
                  <p className="text-xs text-choco/60 max-w-sm mx-auto">
                    Redeem a gift voucher or earn loyalty cashbacks to see your statement entries here.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-cream/40 text-[11px] font-bold text-choco/60 uppercase tracking-wider border-b border-border">
                    <tr>
                      <th className="py-3 px-4">Transaction / Ref</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Activity & Particulars</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredTransactions.map((tx) => {
                      const isCredit = tx.type === "credit";
                      return (
                        <tr key={tx.id} className="hover:bg-cream/20 transition-colors">
                          {/* Reference */}
                          <td className="py-3.5 px-4 font-mono font-bold">
                            <span className="rounded-xl bg-cream px-2.5 py-1 text-choco border border-border">
                              {tx.reference || "N/A"}
                            </span>
                          </td>

                          {/* Type */}
                          <td className="py-3.5 px-4">
                            {isCredit ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <ArrowDownLeft className="h-3 w-3 text-emerald-600" />
                                CREDIT
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                <ArrowUpRight className="h-3 w-3 text-rose-600" />
                                DEBIT
                              </span>
                            )}
                          </td>

                          {/* Title & Description */}
                          <td className="py-3.5 px-4">
                            <div className="space-y-0.5">
                              <span className="text-choco font-bold block">{tx.title}</span>
                              <span className="text-[10px] text-choco/60 block">{tx.description}</span>
                            </div>
                          </td>

                          {/* Amount */}
                          <td className="py-3.5 px-4 font-extrabold text-sm">
                            {isCredit ? (
                              <span className="text-emerald-700">+{formatPaise(tx.amount_paise)}</span>
                            ) : (
                              <span className="text-rose-700">-{formatPaise(tx.amount_paise)}</span>
                            )}
                          </td>

                          {/* Date */}
                          <td className="py-3.5 px-4 text-choco/70 whitespace-nowrap">
                            {istDateTime(tx.created_at)}
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4 text-right">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              Completed
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Issued Voucher Modal */}
        {issuedCard && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-border text-center space-y-5 animate-in fade-in zoom-in-95">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-pink-light text-strawberry">
                <Gift className="h-8 w-8" />
              </div>

              <h2 className="font-display text-2xl font-bold text-choco">Gift Voucher Generated!</h2>
              <p className="text-xs text-choco/70">
                Share this unique 12-character code with{" "}
                <span className="font-bold text-choco">{issuedCard.recipient_name}</span>.
              </p>

              <div className="rounded-2xl border-2 border-dashed border-strawberry bg-pink-light/30 p-4 space-y-1">
                <span className="text-[10px] uppercase font-bold text-choco/60 block">Gift Voucher Code</span>
                <span className="font-mono text-2xl font-black text-strawberry tracking-widest block select-all">
                  {issuedCard.code}
                </span>
                <span className="text-xs font-bold text-choco block">
                  Value: {formatPaise(issuedCard.amount_paise)}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => copyCode(issuedCard.code)}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl border border-border py-2.5 text-xs font-bold text-choco hover:bg-cream"
                >
                  <Copy className="h-4 w-4" /> Copy Code
                </button>
                <button
                  type="button"
                  onClick={() =>
                    shareWhatsApp(issuedCard.code, issuedCard.amount_paise / 100, issuedCard.recipient_name)
                  }
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  <Share2 className="h-4 w-4" /> WhatsApp
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIssuedCard(null)}
                className="w-full rounded-2xl bg-choco py-2.5 text-xs font-bold text-cream hover:bg-choco/90"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
