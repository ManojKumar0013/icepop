import { useNavigate } from "react-router-dom";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/context/CartContext";

export const ReorderButton = ({ order, compact = false }) => {
  const { addMany } = useCart();
  const navigate = useNavigate();
  const reorder = (e) => {
    e.preventDefault();
    e.stopPropagation();
    addMany(order.items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })));
    toast.success("Items added to your cart", { description: "Prices and offers are recalculated for today." });
    navigate("/cart");
  };
  return (
    <button type="button" onClick={reorder} data-testid={`reorder-${order.order_number}`}
      className={`flex items-center justify-center gap-1.5 rounded-full bg-pink font-bold text-choco transition-transform hover:-translate-y-0.5 ${compact ? "px-3 py-1.5 text-xs" : "w-full py-3 text-sm"}`}>
      <RotateCcw className={compact ? "h-3 w-3" : "h-4 w-4"} />Reorder
    </button>
  );
};
