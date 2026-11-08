import { useEffect, useState, useRef } from "react";
import { Search, Plus, Minus, Trash2, Printer, CreditCard, Banknote, QrCode, CheckCircle2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatPaise } from "@/lib/utils";

export default function AdminPOS() {
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState("Counter Customer");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discountRupees, setDiscountRupees] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [cashTendered, setCashTendered] = useState("");
  const [loading, setLoading] = useState(false);
  const [dailySummary, setDailySummary] = useState(null);
  const [completedOrder, setCompletedOrder] = useState(null);
  const receiptRef = useRef(null);

  const loadCatalog = async () => {
    try {
      const { data } = await api.get("/catalog");
      setCategories(data.categories || []);
    } catch {
      toast.error("Failed to load catalog");
    }
  };

  const loadSummary = async () => {
    try {
      const { data } = await api.get("/admin/pos/daily-summary");
      setDailySummary(data);
    } catch {
      // non-fatal
    }
  };

  useEffect(() => {
    loadCatalog();
    loadSummary();
  }, []);

  const allProducts = categories.flatMap((c) =>
    (c.products || []).map((p) => ({ ...p, category_name: c.name }))
  );

  const filteredProducts = allProducts.filter((p) => {
    const matchesCat = activeCategory === "all" || p.category_name.toLowerCase() === activeCategory.toLowerCase();
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const addToCart = (product, variant) => {
    const targetVariant = variant || product.variants?.[0];
    if (!targetVariant) return;

    setCart((prev) => {
      const exists = prev.find((item) => item.variant_id === targetVariant.id);
      if (exists) {
        return prev.map((item) =>
          item.variant_id === targetVariant.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev,
        {
          variant_id: targetVariant.id,
          product_name: product.name,
          variant_name: targetVariant.name,
          price_paise: targetVariant.price_paise,
          quantity: 1,
        },
      ];
    });
  };

  const updateQuantity = (variant_id, delta) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.variant_id === variant_id) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean)
    );
  };

  const removeFromCart = (variant_id) => {
    setCart((prev) => prev.filter((item) => item.variant_id !== variant_id));
  };

  const clearCart = () => {
    setCart([]);
    setDiscountRupees(0);
    setCashTendered("");
    setCompletedOrder(null);
  };

  const subtotalPaise = cart.reduce((sum, item) => sum + item.price_paise * item.quantity, 0);
  const discountPaise = Math.min(subtotalPaise, Math.max(0, Number(discountRupees || 0) * 100));
  const totalPaise = Math.max(0, subtotalPaise - discountPaise);
  const totalRupees = totalPaise / 100;
  const changeDuePaise = cashTendered ? Math.max(0, Number(cashTendered) * 100 - totalPaise) : 0;

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        items: cart.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })),
        payment_method: paymentMethod,
        customer_name: customerName || "Counter Customer",
        customer_phone: customerPhone || "9999999999",
        discount_paise: discountPaise,
      };
      const { data } = await api.post("/admin/pos/order", payload);
      setCompletedOrder(data);
      toast.success(`Order ${data.order_number} confirmed!`);
      loadSummary();
      loadCatalog();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Checkout failed");
    } finally {
      setLoading(false);
    }
  };

  const printReceipt = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Daily Snapshot */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-choco">Counter POS & Express Billing</h1>
          <p className="text-sm text-choco/70">Instant touch-billing, stock deduction & thermal slip generator</p>
        </div>
        {dailySummary && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 shadow-sm border border-border">
            <div className="px-3 py-1 text-xs">
              <span className="text-choco/60 block">Today's Sales</span>
              <span className="font-bold text-choco text-base">{formatPaise(dailySummary.total_sales_paise)}</span>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="px-3 py-1 text-xs">
              <span className="text-choco/60 block">Cash</span>
              <span className="font-bold text-emerald-600">{formatPaise(dailySummary.cash_paise)}</span>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="px-3 py-1 text-xs">
              <span className="text-choco/60 block">UPI QR</span>
              <span className="font-bold text-sky-600">{formatPaise(dailySummary.upi_paise)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Product Selection Grid */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-choco/40" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search popsicle flavours..."
                className="w-full rounded-2xl border border-border bg-white pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-strawberry"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1 max-w-[280px] sm:max-w-md no-scrollbar">
              <button
                onClick={() => setActiveCategory("all")}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeCategory === "all" ? "bg-strawberry text-white" : "bg-white text-choco/70 hover:bg-pink-light"
                }`}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCategory(c.name)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    activeCategory.toLowerCase() === c.name.toLowerCase()
                      ? "bg-strawberry text-white"
                      : "bg-white text-choco/70 hover:bg-pink-light"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[640px] overflow-y-auto pr-1">
            {filteredProducts.map((p) => {
              const mainVar = p.variants?.[0];
              const inStock = mainVar?.inventory ? mainVar.inventory.quantity > 0 : true;
              return (
                <button
                  key={p.id}
                  onClick={() => addToCart(p, mainVar)}
                  disabled={!inStock}
                  className={`group flex flex-col justify-between rounded-2xl border bg-white p-3.5 text-left transition-all hover:shadow-md hover:border-strawberry ${
                    !inStock ? "opacity-50 cursor-not-allowed" : "cursor-pointer active:scale-95"
                  }`}
                >
                  <div>
                    {p.images?.[0] ? (
                      <img
                        src={p.images[0]}
                        alt={p.name}
                        className="h-24 w-full rounded-xl object-cover mb-2 bg-cream/50"
                      />
                    ) : (
                      <div className="h-24 w-full rounded-xl bg-pink-light/40 flex items-center justify-center mb-2 text-2xl">
                        🍡
                      </div>
                    )}
                    <h3 className="font-semibold text-choco text-sm leading-snug line-clamp-2">{p.name}</h3>
                    <p className="text-xs text-choco/50 mt-0.5">{p.category_name}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-border/50">
                    <span className="font-bold text-choco text-sm">
                      {mainVar ? formatPaise(mainVar.price_paise) : "₹--"}
                    </span>
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-pink text-strawberry group-hover:bg-strawberry group-hover:text-white transition-colors">
                      <Plus className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Bill & Checkout Console */}
        <div className="lg:col-span-5 rounded-3xl bg-white p-5 border border-border shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <h2 className="font-display font-bold text-choco text-lg">Active Bill</h2>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs font-semibold text-red-500 hover:text-red-700 flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" /> Clear
              </button>
            )}
          </div>

          {/* Customer Quick Info */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-choco/60 block mb-1">Customer Name</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full rounded-xl border border-border px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-strawberry"
                placeholder="Counter Walk-in"
              />
            </div>
            <div>
              <label className="text-choco/60 block mb-1">Phone (for loyalty/SMS)</label>
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full rounded-xl border border-border px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-strawberry"
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Cart Item Rows */}
          <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
            {cart.length === 0 ? (
              <div className="text-center py-10 text-choco/40 text-sm">
                No items added yet. Tap flavours from the menu on the left.
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.variant_id}
                  className="flex items-center justify-between rounded-xl bg-cream/40 p-2.5 text-xs"
                >
                  <div className="flex-1 pr-2">
                    <p className="font-semibold text-choco">{item.product_name}</p>
                    <p className="text-choco/50">{formatPaise(item.price_paise)} each</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(item.variant_id, -1)}
                      className="grid h-6 w-6 place-items-center rounded-lg bg-white border border-border text-choco active:bg-pink"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="font-bold text-choco w-4 text-center">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.variant_id, 1)}
                      className="grid h-6 w-6 place-items-center rounded-lg bg-white border border-border text-choco active:bg-pink"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <span className="font-bold text-choco w-14 text-right">
                      {formatPaise(item.price_paise * item.quantity)}
                    </span>
                    <button
                      onClick={() => removeFromCart(item.variant_id)}
                      className="text-red-400 hover:text-red-600 pl-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Totals & Discounts */}
          <div className="space-y-2 pt-3 border-t border-border text-xs">
            <div className="flex justify-between text-choco/70">
              <span>Subtotal</span>
              <span>{formatPaise(subtotalPaise)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-choco/70">Special Discount (₹)</span>
              <input
                type="number"
                min="0"
                value={discountRupees}
                onChange={(e) => setDiscountRupees(e.target.value)}
                className="w-20 rounded-lg border border-border px-2 py-1 text-right text-xs focus:ring-1 focus:ring-strawberry"
              />
            </div>
            <div className="flex justify-between text-base font-bold text-choco pt-1 border-t border-border/60">
              <span>Payable Total</span>
              <span className="text-strawberry">{formatPaise(totalPaise)}</span>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-semibold text-choco block">Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod("cash")}
                className={`flex flex-col items-center justify-center p-2 rounded-2xl border text-xs font-bold transition-all ${
                  paymentMethod === "cash"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                    : "border-border text-choco/70 hover:bg-cream"
                }`}
              >
                <Banknote className="h-4 w-4 mb-1" /> Cash
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("upi_qr")}
                className={`flex flex-col items-center justify-center p-2 rounded-2xl border text-xs font-bold transition-all ${
                  paymentMethod === "upi_qr"
                    ? "border-sky-500 bg-sky-50 text-sky-800"
                    : "border-border text-choco/70 hover:bg-cream"
                }`}
              >
                <QrCode className="h-4 w-4 mb-1" /> Dynamic UPI
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("card")}
                className={`flex flex-col items-center justify-center p-2 rounded-2xl border text-xs font-bold transition-all ${
                  paymentMethod === "card"
                    ? "border-purple-500 bg-purple-50 text-purple-800"
                    : "border-border text-choco/70 hover:bg-cream"
                }`}
              >
                <CreditCard className="h-4 w-4 mb-1" /> POS Card
              </button>
            </div>
          </div>

          {/* Quick Cash Tender Calculator */}
          {paymentMethod === "cash" && (
            <div className="rounded-2xl bg-cream/40 p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-choco/70">Cash Received (₹)</span>
                <input
                  type="number"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  placeholder={totalRupees ? `${totalRupees}` : "0"}
                  className="w-24 rounded-lg border border-border px-2 py-1 text-right text-xs font-bold"
                />
              </div>
              <div className="flex gap-1.5">
                {[100, 200, 500].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setCashTendered(String(amt))}
                    className="flex-1 py-1 rounded-lg bg-white border border-border text-[11px] font-semibold text-choco/80 active:bg-pink"
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>
              {cashTendered && Number(cashTendered) * 100 >= totalPaise && (
                <div className="flex justify-between text-emerald-700 font-bold pt-1 border-t border-border/40">
                  <span>Change to Return:</span>
                  <span>{formatPaise(changeDuePaise)}</span>
                </div>
              )}
            </div>
          )}

          {/* Checkout Button */}
          <button
            onClick={handleCheckout}
            disabled={loading || cart.length === 0}
            className="w-full rounded-2xl bg-strawberry py-3.5 text-center text-sm font-bold text-white shadow-md hover:bg-strawberry/90 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? "Processing..." : `Complete & Charge ${formatPaise(totalPaise)}`}
          </button>
        </div>
      </div>

      {/* Completed Order Modal & Thermal Slip */}
      {completedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-border space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-600 font-bold">
                <CheckCircle2 className="h-6 w-6" /> Sale Recorded!
              </div>
              <button onClick={() => setCompletedOrder(null)} className="text-choco/50 hover:text-choco text-sm">
                ✕ Close
              </button>
            </div>

            {/* UPI QR Display if upi_qr selected */}
            {completedOrder.payment_method === "upi_qr" && (
              <div className="flex flex-col items-center text-center p-4 rounded-2xl bg-sky-50 border border-sky-100">
                <p className="text-xs text-sky-800 font-semibold mb-2">Customer scans via PhonePe, GPay, Paytm</p>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                    completedOrder.upi_qr_string
                  )}`}
                  alt="UPI QR Code"
                  className="h-44 w-44 rounded-xl border border-white shadow-sm bg-white p-2"
                />
                <p className="text-sm font-bold text-sky-900 mt-2">{formatPaise(completedOrder.total_paise)}</p>
              </div>
            )}

            {/* Thermal Printable Receipt Preview */}
            <div
              ref={receiptRef}
              className="rounded-2xl border border-dashed border-border bg-cream/30 p-4 font-mono text-xs text-choco space-y-2 select-text"
            >
              <div className="text-center border-b border-border/60 pb-2">
                <p className="font-bold text-sm tracking-wide">{completedOrder.receipt.business_name}</p>
                <p className="text-[11px] text-choco/70">{completedOrder.receipt.address}</p>
                <p className="text-[10px] text-choco/60">FSSAI: {completedOrder.receipt.fssai}</p>
              </div>
              <div className="flex justify-between text-[11px]">
                <span>Order: {completedOrder.order_number}</span>
                <span>{completedOrder.receipt.date}</span>
              </div>
              <div className="border-t border-b border-border/40 py-1 space-y-1">
                {completedOrder.receipt.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>
                      {it.quantity}x {it.product_name}
                    </span>
                    <span>₹{(it.line_total_paise / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-0.5 text-right pt-1">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{completedOrder.receipt.subtotal}</span>
                </div>
                {completedOrder.receipt.discount !== "₹0.00" && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount:</span>
                    <span>-{completedOrder.receipt.discount}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm pt-1 border-t border-border/40">
                  <span>PAID ({completedOrder.receipt.payment}):</span>
                  <span>{completedOrder.receipt.total}</span>
                </div>
              </div>
              <p className="text-center text-[10px] text-choco/60 pt-2">Thank you for chilling with us!</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={printReceipt}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-choco/30 py-2.5 text-xs font-bold text-choco hover:bg-cream"
              >
                <Printer className="h-4 w-4" /> Print Thermal Slip
              </button>
              <button
                onClick={clearCart}
                className="flex-1 rounded-2xl bg-choco py-2.5 text-xs font-bold text-cream hover:bg-choco/90"
              >
                Next Customer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
