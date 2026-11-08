import { Check } from "lucide-react";
import { istDateTime } from "@/lib/format";
import { useLang } from "@/context/LangContext";

const FLOW = {
  delivery: ["pending_confirmation", "accepted", "preparing", "out_for_delivery", "delivered"],
  pickup: ["pending_confirmation", "accepted", "preparing", "ready_for_pickup", "delivered"],
};
const LABELS = {
  pending_confirmation: "Pending confirmation", accepted: "Accepted", preparing: "Preparing",
  ready_for_pickup: "Ready for pickup", out_for_delivery: "Out for delivery", delivered: "Delivered",
};

export const StatusTimeline = ({ order }) => {
  const terminal = ["cancelled", "refund_pending", "refunded"].includes(order.status);
  const steps = FLOW[order.fulfilment_type];
  const reached = new Map(order.history.map((h) => [h.to_status, h.created_at]));
  const currentIdx = steps.indexOf(order.status);
  const { lang, t } = useLang();

  if (terminal) {
    return (
      <ol data-testid="order-status-timeline" className="space-y-3">
        {order.history.map((h, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className={`mt-1 h-3 w-3 rounded-full ${["cancelled", "refund_pending", "refunded"].includes(h.to_status) ? "bg-strawberry" : "bg-choco"}`} />
            <div><p className="font-semibold">{lang === "te" ? t(h.to_status) : h.label}</p><p className="text-xs text-muted-foreground">{istDateTime(h.created_at)}{h.note ? ` · ${h.note}` : ""}</p></div>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol data-testid="order-status-timeline" className="relative space-y-6">
      {steps.map((s, i) => {
        const done = i <= currentIdx;
        return (
          <li key={s} className="relative flex gap-4" data-testid={`timeline-step-${s}`}>
            {i < steps.length - 1 && <span className={`absolute left-[15px] top-8 h-[calc(100%-4px)] w-0.5 ${i < currentIdx ? "bg-choco" : "bg-border"}`} />}
            <span className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 transition-colors ${done ? "border-choco bg-choco text-cream" : "border-border bg-white"} ${i === currentIdx ? "ring-4 ring-pink/60" : ""}`}>
              {done ? <Check className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-border" />}
            </span>
            <div>
              <p className={`font-semibold ${done ? "" : "text-muted-foreground"}`}>{lang === "te" ? t(s) : LABELS[s]}</p>
              {reached.get(s) && <p className="text-xs text-muted-foreground">{istDateTime(reached.get(s))}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
};
