import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, ShoppingBag, Zap } from "lucide-react";
import { useCart } from "@/context/CartContext";

export function FloatingCartBar() {
  const { count } = useCart();
  const location = useLocation();
  const navigate = useNavigate();

  // Hide on cart, checkout, admin, or auth pages
  const isExcluded =
    ["/cart", "/checkout", "/login", "/signup", "/admin", "/rider"].some((path) =>
      location.pathname.startsWith(path)
    );

  if (count <= 0 || isExcluded) return null;

  return (
    <div className="fixed bottom-4 left-0 right-0 z-40 px-4 sm:px-6 pointer-events-none animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="mx-auto max-w-xl rounded-full bg-choco/95 text-cream px-4 py-2.5 sm:px-5 sm:py-3 shadow-2xl backdrop-blur-md border border-white/20 flex items-center justify-between gap-3 pointer-events-auto">
        {/* Left: Item Count info */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-strawberry text-white shadow-sm">
            <ShoppingBag className="h-4 w-4" />
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-black text-strawberry shadow">
              {count}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-display text-sm font-bold leading-tight text-white truncate">
              {count} {count === 1 ? "item" : "items"} in your cart
            </p>
            <p className="text-[11px] text-cream/70 hidden sm:block">
              Freshly handcrafted • Packed sub-zero
            </p>
          </div>
        </div>

        {/* Right: Go to Cart & Buy Now Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => navigate("/cart")}
            className="rounded-full bg-white/15 px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs font-bold text-cream hover:bg-white/25 active:scale-95 transition-all flex items-center gap-1.5"
          >
            <span>Go to Cart</span>
          </button>
          <button
            type="button"
            onClick={() => navigate("/checkout")}
            className="rounded-full bg-strawberry px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs font-bold text-white shadow-md hover:bg-strawberry/90 active:scale-95 transition-all flex items-center gap-1"
          >
            <Zap className="h-3.5 w-3.5 fill-current" />
            <span>Buy Now</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
