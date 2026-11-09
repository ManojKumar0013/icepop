import { useEffect, useState, useCallback } from "react";
import { Bike, Navigation, Phone, CheckCircle2, ShieldCheck, MapPin, Package, RefreshCw, KeyRound, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatPaise } from "@/lib/utils";

export default function RiderPortal() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [riderName, setRiderName] = useState(() => user?.name || localStorage.getItem("icepops_rider_name") || "");
  const [riderPhone, setRiderPhone] = useState(() => user?.phone || localStorage.getItem("icepops_rider_phone") || "");
  const [activeTab, setActiveTab] = useState("active");
  const [verifyingOrder, setVerifyingOrder] = useState(null);
  const [otpInput, setOtpInput] = useState("");
  const [verifyNote, setVerifyNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user?.name && !riderName) setRiderName(user.name);
    if (user?.phone && !riderPhone) setRiderPhone(user.phone);
  }, [user, riderName, riderPhone]);

  const saveRiderProfile = (name, phone) => {
    setRiderName(name);
    setRiderPhone(phone);
    localStorage.setItem("icepops_rider_name", name);
    localStorage.setItem("icepops_rider_phone", phone);
  };

  const loadOrders = useCallback(async () => {
    try {
      const { data } = await api.get("/rider/orders");
      setOrders(data.orders || []);
    } catch {
      toast.error("Failed to load delivery orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 15000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  const handleClaim = async (orderNumber) => {
    const finalName = riderName.trim() || user?.name || "Delivery Partner";
    const finalPhone = riderPhone.trim() || user?.phone || "";
    if (!finalPhone) {
      toast.error("Please enter your mobile phone number in your profile above");
      return;
    }
    saveRiderProfile(finalName, finalPhone);

    try {
      await api.post(`/rider/orders/${orderNumber}/claim`, {
        rider_name: finalName,
        rider_phone: finalPhone,
      });
      toast.success(`You claimed Order #${orderNumber}! Drive safely.`);
      loadOrders();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not claim order");
    }
  };

  const handleVerifyDelivery = async () => {
    if (!otpInput.trim() || otpInput.trim().length < 4) {
      toast.error("Please enter the 4-digit code provided by the customer");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post(`/rider/orders/${verifyingOrder.order_number}/verify-delivery`, {
        otp: otpInput.trim(),
        note: verifyNote.trim() || undefined,
      });
      toast.success(data.message || "Delivery confirmed!");
      setVerifyingOrder(null);
      setOtpInput("");
      setVerifyNote("");
      loadOrders();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Invalid OTP");
    } finally {
      setSubmitting(false);
    }
  };

  const activeDeliveries = orders.filter((o) => ["ready_for_pickup", "out_for_delivery"].includes(o.status));
  const completedDeliveries = orders.filter((o) => o.status === "delivered");

  return (
    <div className="min-h-screen bg-cream/50 py-8 px-4 sm:px-6 max-w-3xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="rounded-3xl bg-choco text-cream p-6 shadow-md space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-strawberry text-white">
              <Bike className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold">Delivery Partner Portal</h1>
              <p className="text-xs text-cream/70">Navigate, manage deliveries & verify 4-digit customer OTPs</p>
            </div>
          </div>
          <button
            onClick={loadOrders}
            className="grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            title="Refresh Deliveries"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {/* Rider Profile Card */}
        <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm border border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" /> Authorized Delivery Partner
            </p>
            <p className="font-display font-bold text-cream text-base mt-0.5">{user?.name || riderName}</p>
            <p className="text-xs text-cream/70">{user?.email}</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-cream/80 font-semibold flex items-center gap-1">
              <Phone className="h-3.5 w-3.5 text-strawberry" /> Phone:
            </span>
            <input
              type="tel"
              value={riderPhone}
              onChange={(e) => saveRiderProfile(user?.name || riderName, e.target.value)}
              placeholder="Your Phone Number"
              className="rounded-xl bg-white/20 px-3 py-1.5 text-cream placeholder-cream/40 focus:outline-none focus:ring-1 focus:ring-strawberry max-w-[150px]"
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("active")}
          className={`flex-1 py-3 rounded-2xl text-xs font-bold transition-all ${
            activeTab === "active" ? "bg-strawberry text-white shadow-sm" : "bg-white text-choco/70 hover:bg-pink-light"
          }`}
        >
          Active Deliveries ({activeDeliveries.length})
        </button>
        <button
          onClick={() => setActiveTab("completed")}
          className={`flex-1 py-3 rounded-2xl text-xs font-bold transition-all ${
            activeTab === "completed" ? "bg-choco text-cream shadow-sm" : "bg-white text-choco/70 hover:bg-pink-light"
          }`}
        >
          Delivered ({completedDeliveries.length})
        </button>
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {(activeTab === "active" ? activeDeliveries : completedDeliveries).map((order) => {
          const isOut = order.status === "out_for_delivery";
          const isDelivered = order.status === "delivered";
          const isCod = (order.payment_method === "cod" || order.payment_method === "pay_on_delivery") && order.payment_status !== "paid";

          return (
            <div
              key={order.order_number}
              className="rounded-3xl bg-white p-5 border border-border shadow-sm space-y-4 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-lg text-choco">#{order.order_number}</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        isDelivered
                          ? "bg-emerald-100 text-emerald-800"
                          : isOut
                          ? "bg-sky-100 text-sky-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {order.status.replace(/_/g, " ").toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-choco/90 mt-1">{order.customer_name}</p>
                </div>

                <div className="text-right">
                  <span className="font-display font-bold text-base text-choco block">
                    {formatPaise(order.total_paise)}
                  </span>
                  <span
                    className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      isCod ? "bg-red-100 text-red-700" : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {isCod ? "Collect Cash (COD)" : order.payment_method === "wallet" ? "Paid via Wallet" : "Paid Online"}
                  </span>
                </div>
              </div>

              {/* Delivery Address & Navigation */}
              <div className="rounded-2xl bg-cream/40 p-3.5 space-y-2 text-xs text-choco/80">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-strawberry shrink-0 mt-0.5" />
                  <span className="font-medium">{order.full_address}</span>
                </div>

                {order.delivery_instructions && (
                  <div className="flex items-start gap-2 text-amber-800 bg-amber-50 p-2 rounded-xl border border-amber-200/60">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>Instructions: {order.delivery_instructions}</span>
                  </div>
                )}
              </div>

              {/* Items Summary */}
              <div className="text-xs space-y-1">
                <p className="font-bold text-choco/50 uppercase tracking-wider text-[10px]">Popsicle Items:</p>
                <div className="flex flex-wrap gap-1.5">
                  {order.items.map((it, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 rounded-lg bg-pink-light/60 px-2.5 py-1 text-choco font-semibold"
                    >
                      <Package className="h-3 w-3 text-strawberry" />
                      {it.quantity}x {it.product_name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-wrap gap-2 border-t border-border">
                <a
                  href={order.google_maps_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-sky-50 text-sky-700 border border-sky-200/80 py-2.5 text-xs font-bold hover:bg-sky-100 transition-colors"
                >
                  <Navigation className="h-4 w-4" /> Google Maps
                </a>

                <a
                  href={`tel:${order.customer_phone}`}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200/80 py-2.5 text-xs font-bold hover:bg-emerald-100 transition-colors"
                >
                  <Phone className="h-4 w-4" /> Call Customer
                </a>

                {!isDelivered && (
                  <>
                    {!isOut ? (
                      <button
                        onClick={() => handleClaim(order.order_number)}
                        className="w-full rounded-2xl bg-strawberry py-3 text-xs font-bold text-white shadow-sm hover:bg-strawberry/90 transition-all"
                      >
                        Claim & Start Delivery
                      </button>
                    ) : (
                      <button
                        onClick={() => setVerifyingOrder(order)}
                        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-choco py-3 text-xs font-bold text-cream shadow-sm hover:bg-choco/90 transition-all"
                      >
                        <KeyRound className="h-4 w-4 text-amber-400" /> Enter 4-Digit Customer OTP & Finish
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}

        {(activeTab === "active" ? activeDeliveries : completedDeliveries).length === 0 && (
          <div className="rounded-3xl bg-white p-12 text-center border border-border">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500 mb-2" />
            <h3 className="font-display text-base font-bold text-choco">No Orders in this Section</h3>
            <p className="text-xs text-choco/60 mt-1">Check back soon as new delivery orders come in.</p>
          </div>
        )}
      </div>

      {/* OTP Verification Modal */}
      {verifyingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-border space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-choco font-bold font-display text-lg">
                <ShieldCheck className="h-5 w-5 text-strawberry" /> Verify Delivery
              </div>
              <button onClick={() => setVerifyingOrder(null)} className="text-choco/40 hover:text-choco text-sm">
                ✕
              </button>
            </div>

            <p className="text-xs text-choco/70">
              Ask <span className="font-bold text-choco">{verifyingOrder.customer_name}</span> for the 4-digit Delivery
              OTP displayed on their ICEPOPS screen or SMS.
            </p>

            {(verifyingOrder.payment_method === "cod" || verifyingOrder.payment_method === "pay_on_delivery") && verifyingOrder.payment_status !== "paid" && (
              <div className="rounded-2xl bg-red-50 border border-red-200 p-3 text-xs text-red-800 space-y-1">
                <p className="font-bold">⚠️ Cash on Delivery (COD)</p>
                <p>Collect {formatPaise(verifyingOrder.total_paise)} before handing over the frozen box.</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-choco block text-center">Enter 4-Digit OTP</label>
              <input
                type="text"
                maxLength={4}
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ""))}
                placeholder="••••"
                className="w-full rounded-2xl border-2 border-strawberry bg-cream/30 py-3 text-center text-3xl font-mono font-bold tracking-widest text-choco focus:outline-none focus:ring-2 focus:ring-strawberry"
                autoFocus
              />
            </div>

            <div>
              <label className="text-[11px] text-choco/60 block mb-1">Optional Rider Note</label>
              <input
                type="text"
                value={verifyNote}
                onChange={(e) => setVerifyNote(e.target.value)}
                placeholder="Handed over to security, at door, etc."
                className="w-full rounded-xl border border-border px-3 py-2 text-xs"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setVerifyingOrder(null)}
                className="flex-1 rounded-2xl border border-border py-2.5 text-xs font-bold text-choco hover:bg-cream"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyDelivery}
                disabled={submitting || otpInput.length < 4}
                className="flex-1 rounded-2xl bg-strawberry py-2.5 text-xs font-bold text-white shadow-md hover:bg-strawberry/90 disabled:opacity-50"
              >
                {submitting ? "Verifying..." : "Confirm & Complete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
