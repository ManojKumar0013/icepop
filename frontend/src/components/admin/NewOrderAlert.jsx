import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { inr } from "@/lib/format";

const KEY = "icepops_order_sound";
let ctx;

export const playDing = () => {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  [880, 1320].forEach((f, i) => {
    const t = ctx.currentTime + i * 0.18;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.65);
  });
};

export const NewOrderAlert = () => {
  const [on, setOn] = useState(() => localStorage.getItem(KEY) !== "off");
  const seen = useRef(null);
  const onRef = useRef(on);
  const nav = useNavigate();

  useEffect(() => {
    onRef.current = on;
    localStorage.setItem(KEY, on ? "on" : "off");
  }, [on]);

  useEffect(() => {
    const handleNewOrder = (o) => {
      if (seen.current && seen.current.has(o.order_number)) return;
      if (!seen.current) seen.current = new Set();
      seen.current.add(o.order_number);
      if (onRef.current) { try { playDing(); } catch { /* audio blocked */ } }
      toast.success(`New order ${o.order_number}`, {
        description: `${o.customer_name} · ${inr(o.total_paise)} · ${o.fulfilment_type === "delivery" ? "Delivery" : "Pickup"}`,
        duration: 15000,
        action: { label: "Open", onClick: () => nav(`/admin/orders?open=${o.order_number}`) },
      });
    };

    // Real-time Server-Sent Events (instant push)
    let es = null;
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || "";
      es = new EventSource(`${backendUrl}/api/orders/events`, { withCredentials: true });
      es.addEventListener("order_update", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.event === "placed") {
            handleNewOrder(data);
          }
        } catch { /* parse error */ }
      });
    } catch { /* SSE unsupported */ }

    // Backup polling check (30s)
    const check = () => api.get("/admin/orders", { params: { status: "pending_confirmation", limit: 50 } }).then(({ data }) => {
      const fresh = seen.current ? data.filter((o) => !seen.current.has(o.order_number)) : [];
      seen.current = new Set(data.map((o) => o.order_number));
      if (!fresh.length) return;
      fresh.forEach(handleNewOrder);
    }).catch(() => {});

    check();
    const t = setInterval(check, 30000);
    return () => {
      clearInterval(t);
      if (es) es.close();
    };
  }, [nav]);

  const toggle = () => {
    const next = !on;
    setOn(next);
    if (next) { try { playDing(); } catch { /* audio blocked */ } }
  };

  return (
    <button type="button" onClick={toggle} data-testid="admin-order-sound-toggle" aria-pressed={on}
      className={`mx-3 mt-3 flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors md:w-[calc(100%-1.5rem)] ${on ? "bg-white/10 text-cream" : "text-cream/50 hover:bg-white/10"}`}>
      {on ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
      <span className="whitespace-nowrap">New order sound: {on ? "On" : "Off"}</span>
    </button>
  );
};
