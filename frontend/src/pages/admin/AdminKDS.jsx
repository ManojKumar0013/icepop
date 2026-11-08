import { useEffect, useState, useCallback } from "react";
import { Clock, CheckCircle2, Bike, Store, Volume2, VolumeX, RefreshCw, AlertCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

function playDing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // browser audio permissions
  }
}

function ElapsedTimer({ createdAt }) {
  const [minutes, setMinutes] = useState(0);

  useEffect(() => {
    const update = () => {
      const diffMs = Date.now() - new Date(createdAt).getTime();
      setMinutes(Math.max(0, Math.floor(diffMs / 60000)));
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [createdAt]);

  const color =
    minutes >= 20 ? "bg-red-500 text-white" : minutes >= 10 ? "bg-amber-400 text-choco" : "bg-emerald-500 text-white";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${color}`}>
      <Clock className="h-3 w-3" /> {minutes}m ago
    </span>
  );
}

export default function AdminKDS() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [filter, setFilter] = useState("all");

  const loadOrders = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/orders?limit=100");
      // Only keep orders actively in kitchen pipeline
      const active = (data.orders || []).filter((o) =>
        ["pending_confirmation", "confirmed", "preparing", "ready_for_pickup"].includes(o.status)
      );
      setOrders(active);
    } catch {
      // ignore transient errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 10000);

    // Listen to real-time SSE stream
    const sse = new EventSource("/api/orders/events");
    sse.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.event === "placed" || payload?.event === "status_changed") {
          loadOrders();
          if (soundEnabled) playDing();
          toast.info(`Kitchen Update: Order #${payload.order_number}`);
        }
      } catch {
        // ignore
      }
    };

    return () => {
      clearInterval(interval);
      sse.close();
    };
  }, [loadOrders, soundEnabled]);

  const updateStatus = async (orderNumber, nextStatus, note = "") => {
    try {
      await api.patch(`/admin/orders/${orderNumber}/status`, { status: nextStatus, note });
      toast.success(`Order #${orderNumber} moved to ${nextStatus.replace(/_/g, " ")}`);
      loadOrders();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Status update failed");
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (filter === "confirmed") return o.status === "confirmed" || o.status === "pending_confirmation";
    if (filter === "preparing") return o.status === "preparing";
    if (filter === "ready") return o.status === "ready_for_pickup";
    return true;
  });

  return (
    <div className="space-y-6">
      {/* KDS Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-choco text-cream p-5 rounded-3xl shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold tracking-wide">Deep-Freeze & Kitchen Display (KDS)</h1>
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>
          <p className="text-xs text-cream/70 mt-1">
            Real-time live freeze line, packaging queue & order dispatch
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              soundEnabled ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-cream/50"
            }`}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            {soundEnabled ? "Audio Ding ON" : "Audio Muted"}
          </button>
          <button
            onClick={loadOrders}
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-colors ${
            filter === "all" ? "bg-choco text-cream" : "bg-white text-choco/70 hover:bg-pink-light"
          }`}
        >
          Active Queue ({orders.length})
        </button>
        <button
          onClick={() => setFilter("confirmed")}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-colors ${
            filter === "confirmed" ? "bg-strawberry text-white" : "bg-white text-choco/70 hover:bg-pink-light"
          }`}
        >
          To Pack ({orders.filter((o) => ["confirmed", "pending_confirmation"].includes(o.status)).length})
        </button>
        <button
          onClick={() => setFilter("preparing")}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-colors ${
            filter === "preparing" ? "bg-amber-500 text-white" : "bg-white text-choco/70 hover:bg-pink-light"
          }`}
        >
          In Freezer ({orders.filter((o) => o.status === "preparing").length})
        </button>
        <button
          onClick={() => setFilter("ready")}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-colors ${
            filter === "ready" ? "bg-emerald-600 text-white" : "bg-white text-choco/70 hover:bg-pink-light"
          }`}
        >
          Packed & Ready ({orders.filter((o) => o.status === "ready_for_pickup").length})
        </button>
      </div>

      {/* Cards Grid */}
      {filteredOrders.length === 0 ? (
        <div className="rounded-3xl bg-white p-16 text-center border border-border">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500 mb-3" />
          <h3 className="font-display text-lg font-bold text-choco">Kitchen is All Caught Up!</h3>
          <p className="text-sm text-choco/60 mt-1">All active popsicle orders have been packed and handed over.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredOrders.map((order) => {
            const isDelivery = order.fulfilment_type === "delivery";
            return (
              <div
                key={order.order_number}
                className="flex flex-col justify-between rounded-3xl bg-white p-5 border-2 border-border shadow-sm hover:shadow-md transition-all"
              >
                <div>
                  {/* Top order row */}
                  <div className="flex items-start justify-between pb-3 border-b border-border">
                    <div>
                      <span className="font-display font-bold text-lg text-choco block">
                        #{order.order_number}
                      </span>
                      <span className="text-xs text-choco/60 font-semibold">{order.customer_name}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <ElapsedTimer createdAt={order.created_at} />
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isDelivery ? "bg-sky-100 text-sky-800" : "bg-purple-100 text-purple-800"
                        }`}
                      >
                        {isDelivery ? <Bike className="h-3 w-3" /> : <Store className="h-3 w-3" />}
                        {isDelivery ? "Doorstep Delivery" : "Store Pickup"}
                      </span>
                    </div>
                  </div>

                  {/* Packing Instruction Warning */}
                  {order.delivery_instructions && (
                    <div className="mt-2 flex items-start gap-1.5 rounded-xl bg-amber-50 p-2 text-xs text-amber-800 font-medium">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                      <span>{order.delivery_instructions}</span>
                    </div>
                  )}

                  {/* Items List */}
                  <div className="my-4 space-y-2">
                    <p className="text-[11px] font-bold text-choco/50 uppercase tracking-wider">
                      Flavours to Pack ({order.items.reduce((s, i) => s + i.quantity, 0)} Sticks):
                    </p>
                    <div className="space-y-1.5">
                      {order.items.map((it, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-xl bg-cream/40 px-3 py-2 text-xs"
                        >
                          <span className="font-semibold text-choco">{it.product_name}</span>
                          <span className="grid h-6 w-6 place-items-center rounded-lg bg-choco text-cream font-bold text-xs">
                            {it.quantity}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom Action Button Bar */}
                <div className="pt-3 border-t border-border mt-2">
                  {order.status === "pending_confirmation" && (
                    <button
                      onClick={() => updateStatus(order.order_number, "confirmed", "Confirmed by kitchen")}
                      className="w-full rounded-2xl bg-strawberry py-2.5 text-xs font-bold text-white hover:bg-strawberry/90 active:scale-95 transition-all"
                    >
                      Accept Order & Begin
                    </button>
                  )}
                  {order.status === "confirmed" && (
                    <button
                      onClick={() => updateStatus(order.order_number, "preparing", "Popsicles pulled from deep-freeze")}
                      className="w-full rounded-2xl bg-amber-500 py-2.5 text-xs font-bold text-white hover:bg-amber-600 active:scale-95 transition-all"
                    >
                      Pull From Deep-Freeze
                    </button>
                  )}
                  {order.status === "preparing" && (
                    <button
                      onClick={() =>
                        updateStatus(
                          order.order_number,
                          "ready_for_pickup",
                          "Packed in thermal dry-ice box, waiting for rider"
                        )
                      }
                      className="w-full rounded-2xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 active:scale-95 transition-all"
                    >
                      Pack in Thermal Box & Mark Ready
                    </button>
                  )}
                  {order.status === "ready_for_pickup" && (
                    <div className="flex gap-2">
                      {isDelivery ? (
                        <button
                          onClick={() =>
                            updateStatus(order.order_number, "out_for_delivery", "Handed over to delivery rider")
                          }
                          className="flex-1 rounded-2xl bg-sky-600 py-2.5 text-xs font-bold text-white hover:bg-sky-700 active:scale-95 transition-all"
                        >
                          Hand Over to Rider
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            updateStatus(order.order_number, "delivered", "Collected by customer at shop")
                          }
                          className="flex-1 rounded-2xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 active:scale-95 transition-all"
                        >
                          Hand Over to Customer
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
