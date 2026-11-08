import { useEffect, useState } from "react";
import { Gift, Sparkles, Check, Copy, Share2, Wallet, ArrowRight, CreditCard, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatPaise } from "@/lib/utils";

const PRESET_AMOUNTS = [250, 500, 1000, 2000];

export default function GiftCards() {
  const { user } = useAuth();
  const [amountRupees, setAmountRupees] = useState(500);
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

  const loadWallet = async () => {
    if (!user) return;
    try {
      const { data } = await api.get("/giftcards/wallet");
      setWalletBalance(data.wallet_balance_paise || 0);
    } catch {
      // non-fatal
    }
  };

  useEffect(() => {
    loadWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handlePurchase = async (e) => {
    e.preventDefault();
    if (!senderName.trim() || !recipientName.trim()) {
      toast.error("Please enter both sender and recipient names");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post("/giftcards/purchase", {
        sender_name: senderName.trim(),
        recipient_name: recipientName.trim(),
        recipient_phone: recipientPhone.trim() || undefined,
        message: message.trim() || undefined,
        amount_paise: Number(amountRupees) * 100,
      });
      setIssuedCard(data);
      toast.success("Gift Card Generated!");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not generate gift card");
    } finally {
      setSubmitting(false);
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
      const { data } = await api.post("/giftcards/redeem", {
        code: (cardDetails?.code || checkCode).trim(),
      });
      toast.success(data.message || "Gift card redeemed to your wallet!");
      setCardDetails(null);
      setCheckCode("");
      loadWallet();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Redemption failed");
    } finally {
      setRedeeming(false);
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    toast.success("Code copied to clipboard!");
  };

  const shareWhatsApp = (code, amt, to) => {
    const text = `Hey ${to}! 🍡 I just sent you an ICEPOPS gift voucher worth ₹${amt}. Use voucher code ${code} at checkout to treat yourself to delicious handcrafted ice pops!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-cream/30 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-pink-light px-4 py-1.5 text-xs font-bold text-strawberry">
            <Gift className="h-4 w-4" /> Digital Gift Vouchers & Store Credit
          </div>
          <h1 className="font-display text-3xl sm:text-5xl font-extrabold text-choco tracking-tight">
            Give the Sweet Gift of Chilled Happiness.
          </h1>
          <p className="mx-auto max-w-2xl text-base text-choco/70">
            Instant digital vouchers delivered via WhatsApp or email. Valid on all our handcrafted fruit popsicles,
            boxes, and counter orders with zero expiration.
          </p>

          {user && (
            <div className="inline-flex items-center gap-2 rounded-2xl bg-white border border-border px-5 py-2.5 shadow-sm text-sm font-semibold text-choco">
              <Wallet className="h-4 w-4 text-emerald-600" />
              <span>Your Current Wallet Balance:</span>
              <span className="font-bold text-emerald-700">{formatPaise(walletBalance)}</span>
            </div>
          )}
        </div>

        {/* Main Grid: Card Designer & Form */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Interactive Card Preview */}
          <div className="lg:col-span-5 space-y-6">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-strawberry via-pink to-amber-300 p-6 sm:p-8 text-white shadow-xl aspect-[1.6/1] flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-display font-extrabold text-2xl tracking-wider">ICEPOPS</span>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">Gift Voucher</p>
                </div>
                <span className="text-3xl">🍡</span>
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
                  className="rounded-2xl bg-choco px-4 py-2 text-xs font-bold text-cream hover:bg-choco/90"
                >
                  {checking ? "Checking..." : "Verify"}
                </button>
              </div>

              {cardDetails && (
                <div className="rounded-2xl bg-cream/40 p-4 border border-border text-xs space-y-2">
                  <div className="flex justify-between font-bold text-choco">
                    <span>Card Balance:</span>
                    <span className="text-emerald-700 text-sm">{formatPaise(cardDetails.balance_paise)}</span>
                  </div>
                  <p className="text-choco/60 text-[11px]">
                    From {cardDetails.sender_name} for {cardDetails.recipient_name}
                  </p>
                  <button
                    onClick={handleRedeem}
                    disabled={redeeming}
                    className="w-full mt-2 rounded-xl bg-strawberry py-2 text-xs font-bold text-white shadow-sm hover:bg-strawberry/90 disabled:opacity-50"
                  >
                    {redeeming ? "Crediting..." : `Add ${formatPaise(cardDetails.balance_paise)} to My Wallet`}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right: Purchase Form */}
          <div className="lg:col-span-7 rounded-3xl bg-white p-6 sm:p-8 border border-border shadow-sm space-y-6">
            <h2 className="font-display text-2xl font-bold text-choco">Send a Digital Voucher</h2>

            <form onSubmit={handlePurchase} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-choco block mb-2">Select Voucher Value</label>
                <div className="grid grid-cols-4 gap-2">
                  {PRESET_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setAmountRupees(amt)}
                      className={`py-2.5 rounded-2xl border text-sm font-bold transition-all ${
                        amountRupees === amt
                          ? "border-strawberry bg-pink-light text-strawberry shadow-sm scale-105"
                          : "border-border text-choco/70 hover:bg-cream"
                      }`}
                    >
                      ₹{amt}
                    </button>
                  ))}
                </div>
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
                  className="rounded-2xl bg-strawberry px-8 py-3.5 text-sm font-bold text-white shadow-md hover:bg-strawberry/90 active:scale-95 transition-all disabled:opacity-50"
                >
                  {submitting ? "Issuing..." : `Purchase Voucher (₹${amountRupees})`}
                </button>
              </div>
            </form>
          </div>
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
                  onClick={() => copyCode(issuedCard.code)}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl border border-border py-2.5 text-xs font-bold text-choco hover:bg-cream"
                >
                  <Copy className="h-4 w-4" /> Copy Code
                </button>
                <button
                  onClick={() =>
                    shareWhatsApp(issuedCard.code, issuedCard.amount_paise / 100, issuedCard.recipient_name)
                  }
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  <Share2 className="h-4 w-4" /> WhatsApp
                </button>
              </div>

              <button
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
