import { useEffect, useState } from "react";
import { Sparkles, Check, Calendar, Clock, MapPin, Pause, Play, X, ShieldCheck, HeartHandshake } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatPaise } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export default function Subscriptions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [mySubs, setMySubs] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [preferredDay, setPreferredDay] = useState("Saturday");
  const [preferredTime, setPreferredTime] = useState("Evening (5-8 PM)");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadPlans = async () => {
    try {
      const { data } = await api.get("/subscriptions/plans");
      setPlans(data.plans || []);
    } catch {
      // non-fatal
    }
  };

  const loadMySubs = async () => {
    if (!user) return;
    try {
      const { data } = await api.get("/subscriptions/mine");
      setMySubs(data.subscriptions || []);
    } catch {
      // non-fatal
    }
  };

  useEffect(() => {
    loadPlans();
    loadMySubs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleStartSubscribe = (plan) => {
    if (!user) {
      toast.info("Please log in or sign up to start your Popsicle Club membership");
      navigate("/login");
      return;
    }
    setSelectedPlan(plan);
  };

  const handleConfirmSubscribe = async (e) => {
    e.preventDefault();
    if (!deliveryAddress.trim()) {
      toast.error("Please enter your delivery address");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post("/subscriptions", {
        plan_name: selectedPlan.name,
        frequency: selectedPlan.frequency,
        box_size: selectedPlan.box_size,
        price_paise: selectedPlan.price_paise,
        preferred_day: preferredDay,
        preferred_time: preferredTime,
        delivery_address: deliveryAddress.trim(),
      });
      toast.success(data.message || "Subscription activated!");
      setSelectedPlan(null);
      loadMySubs();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not activate subscription");
    } finally {
      setSubmitting(false);
    }
  };

  const togglePause = async (subId, isPaused) => {
    try {
      const endpoint = isPaused ? `/subscriptions/${subId}/resume` : `/subscriptions/${subId}/pause`;
      await api.patch(endpoint);
      toast.success(isPaused ? "Deliveries resumed!" : "Deliveries paused");
      loadMySubs();
    } catch {
      toast.error("Action failed");
    }
  };

  const cancelSub = async (subId) => {
    if (!window.confirm("Are you sure you want to cancel this subscription?")) return;
    try {
      await api.delete(`/subscriptions/${subId}`);
      toast.success("Subscription cancelled");
      loadMySubs();
    } catch {
      toast.error("Could not cancel");
    }
  };

  return (
    <div className="min-h-screen bg-cream/30 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-pink-light px-4 py-1.5 text-xs font-bold text-strawberry">
            <Sparkles className="h-4 w-4" /> Weekly Popsicle Club
          </div>
          <h1 className="font-display text-3xl sm:text-5xl font-extrabold text-choco tracking-tight">
            Fresh Artisan Popsicles, Every Weekend at Your Door.
          </h1>
          <p className="mx-auto max-w-2xl text-base text-choco/70">
            Never run out of pure fruit chill. Choose your preferred box size and delivery time — pause, skip, or cancel
            with 1 tap whenever you're traveling.
          </p>
        </div>

        {/* User's Active Memberships */}
        {user && mySubs.length > 0 && (
          <div className="rounded-3xl bg-white p-6 sm:p-8 border border-border shadow-sm space-y-4">
            <h2 className="font-display text-xl font-bold text-choco">Your Club Memberships</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {mySubs.map((sub) => {
                const isPaused = sub.status === "paused";
                const isCancelled = sub.status === "cancelled";
                return (
                  <div
                    key={sub.id}
                    className="rounded-2xl border border-border bg-cream/30 p-5 flex flex-col justify-between space-y-4"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-display font-bold text-choco text-lg">{sub.plan_name}</h3>
                          <span className="text-xs text-choco/60">
                            {sub.box_size} Pops / {sub.frequency}
                          </span>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            isCancelled
                              ? "bg-gray-200 text-gray-700"
                              : isPaused
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {sub.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="mt-3 space-y-1.5 text-xs text-choco/80">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-strawberry" />
                          <span>
                            Next delivery:{" "}
                            <strong className="text-choco">{sub.next_delivery_date || "N/A"}</strong> ({sub.preferred_day})
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-choco/50" />
                          <span>Preferred Slot: {sub.preferred_time}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-choco/50" />
                          <span className="line-clamp-1">{sub.delivery_address}</span>
                        </div>
                      </div>
                    </div>

                    {!isCancelled && (
                      <div className="pt-3 border-t border-border flex items-center justify-between text-xs font-bold">
                        <button
                          onClick={() => togglePause(sub.id, isPaused)}
                          className="flex items-center gap-1.5 text-choco/70 hover:text-choco"
                        >
                          {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                          {isPaused ? "Resume Deliveries" : "Pause Deliveries"}
                        </button>
                        <button
                          onClick={() => cancelSub(sub.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          Cancel Plan
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Subscription Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col justify-between rounded-3xl p-6 transition-all border-2 ${
                plan.popular
                  ? "border-strawberry bg-white shadow-xl scale-[1.02]"
                  : "border-border bg-white/80 hover:bg-white"
              }`}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-strawberry px-3 py-0.5 text-[11px] font-bold text-white shadow-sm">
                  {plan.badge}
                </span>
              )}

              <div>
                <h3 className="font-display text-2xl font-bold text-choco">{plan.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="font-display text-4xl font-extrabold text-choco">
                    {formatPaise(plan.price_paise)}
                  </span>
                  <span className="text-xs text-choco/60">/ {plan.frequency}</span>
                </div>
                <p className="mt-2 text-xs text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md inline-block">
                  {plan.box_size} Handcrafted Popsicles per box
                </p>

                <ul className="mt-6 space-y-2.5 text-xs text-choco/80">
                  {plan.perks.map((perk, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{perk}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                onClick={() => handleStartSubscribe(plan)}
                className={`mt-8 w-full rounded-2xl py-3 text-xs font-bold shadow-sm transition-all ${
                  plan.popular
                    ? "bg-strawberry text-white hover:bg-strawberry/90"
                    : "bg-choco text-cream hover:bg-choco/90"
                }`}
              >
                Join {plan.name}
              </button>
            </div>
          ))}
        </div>

        {/* Trust & Guarantee Banner */}
        <div className="rounded-3xl bg-pink-light/50 p-6 sm:p-8 border border-pink-light flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-1 text-center sm:text-left">
            <h3 className="font-display text-lg font-bold text-choco flex items-center justify-center sm:justify-start gap-2">
              <ShieldCheck className="h-5 w-5 text-strawberry" /> 100% Cold-Chain Melt-Free Guarantee
            </h3>
            <p className="text-xs text-choco/70 max-w-xl">
              If any popsicle arrives softened or less than perfectly frozen, we replace your entire box instantly for
              free, no questions asked.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-choco/80 bg-white/70 px-4 py-2 rounded-2xl">
            <HeartHandshake className="h-4 w-4 text-emerald-600" />
            <span>Zero lock-in commitments</span>
          </div>
        </div>

        {/* Subscribe Confirmation Modal */}
        {selectedPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-border space-y-5 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display font-bold text-xl text-choco">{selectedPlan.name}</h2>
                  <p className="text-xs text-choco/60">
                    {formatPaise(selectedPlan.price_paise)} / {selectedPlan.frequency}
                  </p>
                </div>
                <button onClick={() => setSelectedPlan(null)} className="text-choco/50 hover:text-choco">
                  ✕
                </button>
              </div>

              <form onSubmit={handleConfirmSubscribe} className="space-y-4 text-xs">
                <div>
                  <label className="text-choco/80 font-bold block mb-1">Preferred Delivery Day</label>
                  <div className="grid grid-cols-3 gap-2">
                    {["Friday", "Saturday", "Sunday"].map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setPreferredDay(day)}
                        className={`py-2 rounded-xl border text-center font-bold transition-colors ${
                          preferredDay === day
                            ? "border-strawberry bg-pink-light text-strawberry"
                            : "border-border text-choco/70 hover:bg-cream"
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-choco/80 font-bold block mb-1">Preferred Time Window</label>
                  <select
                    value={preferredTime}
                    onChange={(e) => setPreferredTime(e.target.value)}
                    className="w-full rounded-xl border border-border px-3 py-2 bg-white"
                  >
                    <option value="Morning (10 AM - 1 PM)">Morning (10 AM - 1 PM)</option>
                    <option value="Afternoon (2 PM - 5 PM)">Afternoon (2 PM - 5 PM)</option>
                    <option value="Evening (5 PM - 8 PM)">Evening (5 PM - 8 PM)</option>
                  </select>
                </div>

                <div>
                  <label className="text-choco/80 font-bold block mb-1">Doorstep Delivery Address *</label>
                  <textarea
                    rows="2"
                    required
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="House/Flat number, building name, street, area & PIN code"
                    className="w-full rounded-xl border border-border p-3 text-xs focus:ring-1 focus:ring-strawberry"
                  />
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPlan(null)}
                    className="flex-1 rounded-2xl border border-border py-2.5 font-bold text-choco hover:bg-cream"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 rounded-2xl bg-strawberry py-2.5 font-bold text-white shadow-md hover:bg-strawberry/90 disabled:opacity-50"
                  >
                    {submitting ? "Activating..." : "Confirm & Subscribe"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
