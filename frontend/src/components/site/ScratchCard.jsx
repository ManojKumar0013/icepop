import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Trophy, Wallet, Gift, ArrowRight, CheckCircle2, Truck, Star, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { inr } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";

export function ScratchCard({ orderNumber, onClaimed }) {
  const { user, refreshUser } = useAuth();
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const [loading, setLoading] = useState(true);
  const [eligible, setEligible] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [rewardType, setRewardType] = useState(null);
  const [rewardTitle, setRewardTitle] = useState("");
  const [amountPaise, setAmountPaise] = useState(0);
  const [couponCode, setCouponCode] = useState("");
  const [stamps, setStamps] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [scratchProgress, setScratchProgress] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [copiedCoupon, setCopiedCoupon] = useState(false);

  // Fetch initial scratch card eligibility and status
  const checkStatus = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/orders/${orderNumber}/scratch-card`);
      if (data.eligible) {
        setEligible(true);
        if (data.reward_type) {
          setRewardType(data.reward_type);
          setRewardTitle(data.title || "₹5 Cashback");
          setAmountPaise(data.amount_paise || 500);
          setCouponCode(data.coupon_code || "");
          setStamps(data.stamps || 0);
        }
        if (data.claimed) {
          setClaimed(true);
          setRevealed(true);
        }
      } else {
        setEligible(false);
      }
    } catch {
      setEligible(false);
    } finally {
      setLoading(false);
    }
  }, [orderNumber]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Initialise canvas foil surface
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || revealed || claimed) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = rect.height * (window.devicePixelRatio || 1);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    const w = rect.width;
    const h = rect.height;

    // Metallic glitter gradient
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#F59E0B");
    grad.addColorStop(0.3, "#FDE68A");
    grad.addColorStop(0.5, "#D97706");
    grad.addColorStop(0.7, "#FEF3C7");
    grad.addColorStop(1, "#B45309");

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Decorative sparkles and texture
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    for (let i = 0; i < 40; i++) {
      const rx = (i * 37) % w;
      const ry = (i * 29) % h;
      ctx.beginPath();
      ctx.arc(rx, ry, (i % 3) + 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Foil text label
    ctx.fillStyle = "#78350F";
    ctx.font = "bold 15px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✨ SCRATCH TO REVEAL ✨", w / 2, h / 2 - 10);

    ctx.fillStyle = "#92400E";
    ctx.font = "600 11px Outfit, sans-serif";
    ctx.fillText("🪙 Win ₹5–₹10, Free Delivery, or +2 Stamps", w / 2, h / 2 + 14);
  }, [revealed, claimed]);

  useEffect(() => {
    if (eligible && !claimed) {
      const timer = setTimeout(initCanvas, 50);
      return () => clearTimeout(timer);
    }
  }, [eligible, claimed, initCanvas]);

  // Handle claim API
  const claimReward = useCallback(async () => {
    if (claiming || claimed) return;
    setClaiming(true);
    try {
      const { data } = await api.post(`/orders/${orderNumber}/scratch-card/claim`);
      if (data.ok) {
        setClaimed(true);
        setRevealed(true);
        setRewardType(data.reward_type || "cashback");
        setRewardTitle(data.title || "₹5 Cashback");
        setAmountPaise(data.amount_paise || 500);
        setCouponCode(data.coupon_code || "");
        setStamps(data.stamps || 0);

        toast.success(`🎉 ${data.message || `Won ${data.title}!`}`, {
          duration: 5000,
        });
        if (refreshUser) refreshUser();
        if (onClaimed) onClaimed(data);
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setClaiming(false);
    }
  }, [orderNumber, claiming, claimed, refreshUser, onClaimed]);

  // Scratch progress calculation
  const checkScratchPercentage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || revealed || claiming) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imgData.data;
    let transparent = 0;
    const step = 32;
    const total = pixels.length / (4 * step);

    for (let i = 3; i < pixels.length; i += 4 * step) {
      if (pixels[i] === 0) transparent++;
    }

    const pct = Math.round((transparent / total) * 100);
    setScratchProgress(pct);

    if (pct >= 40 && !revealed && !claiming) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setRevealed(true);
      claimReward();
    }
  }, [revealed, claiming, claimReward]);

  const scratch = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas || revealed || claiming) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const ctx = canvas.getContext("2d");

    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = 36;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    lastPos.current = { x, y };
  };

  const handlePointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || revealed) return;
    const rect = canvas.getBoundingClientRect();
    isDrawing.current = true;
    lastPos.current = {
      x: (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left,
      y: (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top,
    };
  };

  const handlePointerMove = (e) => {
    if (!isDrawing.current || revealed) return;
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    scratch(clientX, clientY);
    checkScratchPercentage();
  };

  const handlePointerUp = () => {
    isDrawing.current = false;
    checkScratchPercentage();
  };

  const copyCoupon = () => {
    if (!couponCode) return;
    navigator.clipboard.writeText(couponCode);
    setCopiedCoupon(true);
    toast.success("Coupon code copied!");
    setTimeout(() => setCopiedCoupon(false), 2000);
  };

  if (loading || !eligible || !rewardType) return null;

  return (
    <div
      data-testid="post-order-scratch-card"
      className="relative overflow-hidden rounded-3xl border-2 border-amber-400/50 bg-gradient-to-br from-amber-500/10 via-amber-100/40 to-orange-50 p-5 shadow-md transition-all"
    >
      {/* Decorative background sparkles */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-400/20 blur-xl" />
      <div className="pointer-events-none absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-orange-400/20 blur-xl" />

      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-orange-400 text-white shadow-sm">
            <Gift className="h-4 w-4" />
          </div>
          <div>
            <h4 className="font-display text-sm font-extrabold text-amber-950">
              {claimed ? "Reward Unlocked!" : "Mystery Order Reward"}
            </h4>
            <p className="text-[11px] font-semibold text-amber-800/80">
              {claimed
                ? rewardType === "free_delivery"
                  ? "Free Delivery Coupon Generated"
                  : rewardType === "loyalty_stamps"
                  ? "+2 Loyalty Stamps Credited"
                  : "Credited to your Digital Wallet"
                : "Scratch with mouse or finger to unlock"}
            </p>
          </div>
        </div>
        {claimed && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" /> Claimed
          </span>
        )}
      </div>

      {/* Scratch Box Container */}
      <div
        ref={containerRef}
        className="relative mx-auto h-40 w-full max-w-sm select-none overflow-hidden rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-orange-100 shadow-inner"
      >
        {/* Underlying Prize Card (revealed when scratched) */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center">
          {rewardType === "free_delivery" ? (
            <>
              <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-sky-200/60 text-sky-700 shadow-sm">
                <Truck className="h-6 w-6 text-sky-600 animate-bounce" />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800">
                Special Delivery Perk
              </p>
              <p className="font-display text-lg font-black text-sky-950">
                Free Delivery on Next Order 🚚
              </p>
              {couponCode && (
                <button
                  type="button"
                  onClick={copyCoupon}
                  className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-mono font-bold text-choco border border-sky-300 shadow-xs hover:bg-sky-50 active:scale-95 transition-all"
                >
                  <span>{couponCode}</span>
                  {copiedCoupon ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                </button>
              )}
            </>
          ) : rewardType === "loyalty_stamps" ? (
            <>
              <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-pink-200/60 text-pink-700 shadow-sm">
                <Star className="h-6 w-6 text-strawberry animate-bounce" />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-pink-800">
                Loyalty Stamp Perk
              </p>
              <p className="font-display text-2xl font-black text-strawberry">
                +2 Loyalty Stamps ⭐
              </p>
              <p className="mt-1 text-[11px] font-semibold text-choco/75">
                Closer to your next free water popsicle!
              </p>
            </>
          ) : (
            <>
              <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-amber-200/60 text-amber-700 shadow-sm">
                <Trophy className="h-6 w-6 text-amber-600 animate-bounce" />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                Instant Wallet Cashback
              </p>
              <p className="font-display text-3xl font-black text-amber-950">
                {rewardTitle || inr(amountPaise)}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-amber-900/80">
                {claimed ? "🎉 Added to your ICEPOPS Digital Wallet!" : "Revealing reward..."}
              </p>
            </>
          )}
        </div>

        {/* Canvas Scratch Foil Layer */}
        {!claimed && (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
          />
        )}
      </div>

      {/* Progress & Quick Action */}
      {!claimed ? (
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-amber-900">
            {scratchProgress > 0 ? (
              <span>Scratched: <b>{scratchProgress}%</b></span>
            ) : (
              <span>Tip: Rub over the card to scratch</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              const canvas = canvasRef.current;
              if (canvas) {
                const ctx = canvas.getContext("2d");
                ctx.clearRect(0, 0, canvas.width, canvas.height);
              }
              setRevealed(true);
              claimReward();
            }}
            disabled={claiming}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-amber-700 active:scale-95 transition-all"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {claiming ? "Claiming..." : "Instant Reveal 🪄"}
          </button>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-3 pt-1 border-t border-amber-200/60">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-950">
            <Wallet className="h-4 w-4 text-amber-700" />
            <span>
              {rewardType === "free_delivery"
                ? "Use code on your next order"
                : rewardType === "loyalty_stamps"
                ? "View your stamp card"
                : "Use balance on next order"}
            </span>
          </div>
          <Link
            to="/giftcards"
            className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-choco shadow-xs border border-amber-300 hover:bg-amber-50 transition-colors"
          >
            <span>View Wallet</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
