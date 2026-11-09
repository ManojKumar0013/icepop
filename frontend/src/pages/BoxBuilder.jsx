import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CreditCard,
  Flame,
  Gift,
  HelpCircle,
  Info,
  Minus,
  Package,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Shuffle,
  Sparkles,
  Trash2,
  Truck,
  X,
  Zap
} from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { inr } from "@/lib/format";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { useStore } from "@/context/StoreContext";
import { PageLoader } from "@/components/site/Guards";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";
const loadRazorpayScript = () =>
  new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Failed to load Razorpay SDK"));
    document.body.appendChild(s);
  });

const BOX_PRESETS = [
  {
    id: 6,
    name: "Party 6-Pack Box",
    capacity: 6,
    tag: "Most Popular 🔥",
    description: "Perfect for family movie nights & weekend sharing",
    bonus: "Free Sub-Zero Thermal Insulation",
  },
  {
    id: 12,
    name: "Family Jumbo 12-Pack",
    capacity: 12,
    tag: "Best Value • Max Savings 🎉",
    description: "Ideal for birthday treats, pool parties & weekend feasts",
    bonus: "Free Premium Cooler Bag + Dry Ice Pack",
  },
];

export default function BoxBuilder() {
  const navigate = useNavigate();
  const { addMany } = useCart();
  const { user, setUser } = useAuth();
  const store = useStore();

  const [boxSize, setBoxSize] = useState(6);
  const [selectedPops, setSelectedPops] = useState([]); // Array of { product, variant }
  const [products, setProducts] = useState(null);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Express Checkout Modal States
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [fulfilment, setFulfilment] = useState("delivery");
  const [riderTipPaise, setRiderTipPaise] = useState(0);
  const [contact, setContact] = useState({
    name: user?.name || "",
    phone: user?.phone || "",
    email: user?.email && !user.email.endsWith("@customer.icepops.in") ? user.email : "",
  });
  const [address, setAddress] = useState({
    line1: "",
    line2: "",
    area: "Banjara Hills",
    city: "Hyderabad",
    pincode: store?.delivery_pincodes?.[0] || "500034",
    instructions: "",
  });

  // Load catalog products and categories
  useEffect(() => {
    api.get("/catalog/categories").then(({ data }) => setCategories(data)).catch(() => {});
    api.get("/catalog/products").then(({ data }) => setProducts(data)).catch(() => setProducts([]));
  }, []);

  // Update contact when user context loads
  useEffect(() => {
    if (user) {
      setContact((prev) => ({
        name: prev.name || user.name || "",
        phone: prev.phone || user.phone || "",
        email: prev.email || (user.email && !user.email.endsWith("@customer.icepops.in") ? user.email : ""),
      }));
    }
  }, [user]);

  // Flattened flavours with their single-stick variants
  const availableFlavours = useMemo(() => {
    if (!products) return [];
    return products
      .map((p) => {
        const singleVar = p.variants?.find((v) => v.in_stock) || p.variants?.[0];
        return {
          product: p,
          variant: singleVar,
        };
      })
      .filter((f) => f.variant && f.variant.in_stock);
  }, [products]);

  // Filtered flavours for tray
  const filteredFlavours = useMemo(() => {
    return availableFlavours.filter((f) => {
      const matchCat = !activeCategory || f.product.category_slug === activeCategory;
      const matchQuery =
        !searchQuery ||
        f.product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (f.product.description && f.product.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchQuery;
    });
  }, [availableFlavours, activeCategory, searchQuery]);

  // Box slot capacity
  const capacity = boxSize;
  const isFull = selectedPops.length >= capacity;
  const remainingSlots = Math.max(0, capacity - selectedPops.length);

  // Grouped selected items for calculating totals
  const groupedSelected = useMemo(() => {
    const map = new Map();
    selectedPops.forEach((item) => {
      const vid = item.variant.id;
      if (!map.has(vid)) {
        map.set(vid, { ...item, count: 0 });
      }
      map.get(vid).count += 1;
    });
    return Array.from(map.values());
  }, [selectedPops]);

  // Box Pricing calculation
  const subtotalPaise = useMemo(() => {
    return selectedPops.reduce((sum, item) => sum + (item.variant?.price_paise || 2000), 0);
  }, [selectedPops]);

  // Box Discount: special perk for building a box
  const boxSavingsPaise = useMemo(() => {
    if (selectedPops.length === 0) return 0;
    // Bundle discount: ₹20 savings on 6-pack, ₹50 on 12-pack
    return boxSize === 6 ? Math.min(2000, Math.floor(subtotalPaise * 0.15)) : Math.min(5000, Math.floor(subtotalPaise * 0.20));
  }, [selectedPops.length, boxSize, subtotalPaise]);

  const finalBoxPricePaise = Math.max(0, subtotalPaise - boxSavingsPaise);

  // Add flavour to box
  const addFlavour = (item) => {
    if (selectedPops.length >= capacity) {
      toast.warning(`Your ${boxSize}-pack box is full!`, {
        description: `Remove a pop to swap or switch to the ${boxSize === 6 ? "12-pack box" : "checkout"}.`,
      });
      return;
    }
    setSelectedPops((prev) => [...prev, item]);
    toast.success(`Added ${item.product.name} to slot #${selectedPops.length + 1}`);
  };

  // Remove specific instance by index
  const removeAtIndex = (index) => {
    setSelectedPops((prev) => prev.filter((_, i) => i !== index));
  };

  // Remove one instance of variant
  const removeFlavour = (variantId) => {
    const idx = selectedPops.findIndex((item) => item.variant.id === variantId);
    if (idx !== -1) {
      removeAtIndex(idx);
    }
  };

  // Clear all
  const clearBox = () => {
    if (selectedPops.length === 0) return;
    setSelectedPops([]);
    toast.info("Box emptied");
  };

  // Auto Fill / Surprise Me with bestsellers
  const autoFillBestsellers = () => {
    if (availableFlavours.length === 0) return;
    const needed = capacity - selectedPops.length;
    if (needed <= 0) {
      toast.info("Your box is already full!");
      return;
    }

    // Prioritise bestsellers or cycle popular items
    const bestsellers = availableFlavours.filter((f) => f.product.is_bestseller);
    const pool = bestsellers.length ? bestsellers : availableFlavours;
    const additions = [];
    for (let i = 0; i < needed; i++) {
      const pick = pool[i % pool.length];
      additions.push(pick);
    }

    setSelectedPops((prev) => [...prev, ...additions]);
    toast.success(`Auto-filled ${needed} delicious popular popsicles!`);
  };

  // Add Custom Box to Regular Cart
  const handleAddToCart = () => {
    if (selectedPops.length === 0) {
      toast.error("Please add at least 1 ice pop to your box!");
      return;
    }
    const cartLines = groupedSelected.map((g) => ({
      variant_id: g.variant.id,
      quantity: g.count,
    }));
    addMany(cartLines);
    toast.success(`🎉 Custom ${boxSize}-Pack Box (${selectedPops.length} pops) added to Cart!`, {
      action: {
        label: "View Cart",
        onClick: () => navigate("/cart"),
      },
    });
  };

  // Open 1-Click Express Razorpay Checkout Modal
  const handleStartExpressCheckout = () => {
    if (selectedPops.length === 0) {
      toast.error("Please add at least 1 ice pop to your box!");
      return;
    }
    if (selectedPops.length < capacity) {
      const confirmIncomplete = window.confirm(
        `Your box has ${selectedPops.length} of ${capacity} pops. Would you like to proceed with ${selectedPops.length} pops? (Tip: You can click 'Surprise Me' to fill all slots!)`
      );
      if (!confirmIncomplete) return;
    }
    setShowCheckoutModal(true);
  };

  // Execute Razorpay Test Mode Order Submission
  const executeRazorpayOrder = async (e) => {
    e.preventDefault();
    if (!contact.name.trim()) return toast.error("Please enter your name");
    if (!contact.phone.trim() || contact.phone.replace(/\D/g, "").length < 10) {
      return toast.error("Please enter a valid 10-digit mobile number");
    }
    if (fulfilment === "delivery" && !address.line1.trim()) {
      return toast.error("Please enter your delivery street address");
    }

    setSubmittingOrder(true);
    try {
      // 1. Create order lines payload
      const orderLines = groupedSelected.map((g) => ({
        variant_id: g.variant.id,
        quantity: g.count,
      }));

      const orderPayload = {
        items: orderLines,
        fulfilment_type: fulfilment,
        customer_name: contact.name.trim(),
        customer_phone: contact.phone.trim(),
        customer_email: contact.email.trim() || null,
        address_line1: fulfilment === "delivery" ? address.line1.trim() : null,
        address_line2: fulfilment === "delivery" ? address.line2.trim() || null : null,
        area: fulfilment === "delivery" ? address.area.trim() : null,
        city: fulfilment === "delivery" ? address.city.trim() : null,
        pincode: fulfilment === "delivery" ? address.pincode.trim() : null,
        delivery_instructions: address.instructions?.trim() || null,
        payment_method: "online",
        tip_paise: fulfilment === "delivery" ? riderTipPaise : 0,
        referral_code: localStorage.getItem("icepops_referral") || null,
        idempotency_key: `box-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      };

      // 2. Submit order to backend
      const { data: orderData } = await api.post("/orders", orderPayload);

      // Save token if guest session was generated
      if (orderData.token) {
        localStorage.setItem("icepops_token", orderData.token);
      }
      if (orderData.user && setUser) {
        setUser(orderData.user);
      }

      // 3. Load Razorpay script
      await loadRazorpayScript();

      // 4. Create Razorpay Test Order via backend
      const { data: rzpData } = await api.post("/payments/razorpay/order", {
        order_number: orderData.order_number,
      });

      // 5. Launch Razorpay Test Mode Modal
      const rzpInstance = new window.Razorpay({
        key: rzpData.key_id,
        order_id: rzpData.razorpay_order_id,
        amount: rzpData.amount,
        currency: rzpData.currency || "INR",
        name: rzpData.name || "ICEPOPS Parlour",
        description: `Custom ${boxSize}-Pack Box (${selectedPops.length} Ice Pops)`,
        prefill: {
          name: contact.name,
          contact: `+91${contact.phone.replace(/\D/g, "").slice(-10)}`,
          email: contact.email || undefined,
        },
        theme: { color: "#3D2314" },
        handler: async (paymentResponse) => {
          try {
            // Verify payment
            await api.post("/payments/razorpay/verify", {
              order_number: orderData.order_number,
              razorpay_order_id: paymentResponse.razorpay_order_id,
              razorpay_payment_id: paymentResponse.razorpay_payment_id,
              razorpay_signature: paymentResponse.razorpay_signature,
            });

            toast.success("Payment Received! Box Order Confirmed 🚀", {
              description: "Scratch your post-payment reward card to reveal instant cashback!",
            });

            setShowCheckoutModal(false);
            navigate(`/orders/${orderData.order_number}?placed=1`);
          } catch (verifyErr) {
            toast.error(errMsg(verifyErr));
            navigate(`/orders/${orderData.order_number}?placed=1&pay=1`);
          } finally {
            setSubmittingOrder(false);
          }
        },
        modal: {
          ondismiss: () => {
            setSubmittingOrder(false);
            toast.info("Payment window closed. You can complete payment on the order confirmation page.");
            setShowCheckoutModal(false);
            navigate(`/orders/${orderData.order_number}?placed=1&pay=1`);
          },
        },
      });

      rzpInstance.on("payment.failed", (failResp) => {
        setSubmittingOrder(false);
        toast.error(failResp?.error?.description || "Payment failed. Please try again.");
      });

      rzpInstance.open();
    } catch (err) {
      toast.error(errMsg(err));
      setSubmittingOrder(false);
    }
  };

  if (!products) return <PageLoader />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8" data-testid="box-builder-page">
      {/* Top Breadcrumb & Header */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          to="/menu"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-choco transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Menu
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-light px-3.5 py-1 text-xs font-bold text-strawberry">
          <Sparkles className="h-3.5 w-3.5" /> Interactive Custom Box Builder
        </span>
      </div>

      <div className="mb-8">
        <h1 className="font-display text-3xl font-black tracking-tight sm:text-4xl text-choco">
          Build Your Custom Ice Pop Box 🎁
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Mix & match your favourite real-fruit flavours into an insulated sub-zero chiller box.
          Packs arrive rock-solid at your doorstep with instant test payment and mystery cashback!
        </p>
      </div>

      {/* Step 1: Choose Box Size */}
      <div className="mb-10">
        <div className="mb-4 flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-choco text-xs font-bold text-cream">
            1
          </span>
          <h2 className="font-display text-lg font-bold text-choco">Select Box Size</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {BOX_PRESETS.map((preset) => {
            const isSelected = boxSize === preset.capacity;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setBoxSize(preset.capacity);
                  if (selectedPops.length > preset.capacity) {
                    setSelectedPops((prev) => prev.slice(0, preset.capacity));
                  }
                }}
                className={`relative flex flex-col justify-between rounded-3xl p-6 text-left transition-all ${
                  isSelected
                    ? "border-2 border-choco bg-gradient-to-br from-amber-50/80 via-white to-pink-light/40 shadow-lg scale-[1.01]"
                    : "border border-border bg-white hover:border-choco/50 hover:shadow-md"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="rounded-full bg-strawberry/10 px-2.5 py-0.5 text-xs font-bold text-strawberry">
                      {preset.tag}
                    </span>
                    {isSelected && (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-choco text-cream">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                  <h3 className="font-display text-xl font-extrabold text-choco">{preset.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{preset.description}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs font-bold">
                  <span className="text-emerald-700 flex items-center gap-1">
                    <ShieldCheck className="h-4 w-4" /> {preset.bonus}
                  </span>
                  <span className="rounded-full bg-choco/10 px-2.5 py-1 text-choco">
                    Holds {preset.capacity} Pops
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Interactive Cooler Box (Left/Top) + Flavour Selector (Right/Bottom) */}
      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left Column: The Sub-Zero Cooler Box Visualization (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="sticky top-20 rounded-3xl border-2 border-choco/80 bg-gradient-to-b from-sky-50/50 via-white to-cream/30 p-6 shadow-xl">
            {/* Cooler Box Header */}
            <div className="mb-4 flex items-center justify-between">
              <div>
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-800">
                  ❄️ –18°C Thermal Insulated Box
                </span>
                <h3 className="font-display text-lg font-extrabold text-choco mt-1">
                  Your Chiller Box Slots
                </h3>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  isFull ? "bg-emerald-100 text-emerald-800" : "bg-choco/10 text-choco"
                }`}
              >
                {selectedPops.length} / {capacity} Filled
              </span>
            </div>

            {/* Capacity Progress Bar */}
            <div className="mb-6 h-2.5 w-full overflow-hidden rounded-full bg-muted/60">
              <div
                className={`h-full transition-all duration-300 ${
                  isFull
                    ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                    : "bg-gradient-to-r from-mango to-strawberry"
                }`}
                style={{ width: `${(selectedPops.length / capacity) * 100}%` }}
              />
            </div>

            {/* The Cooler Box Slots Grid */}
            <div
              className={`grid gap-2.5 ${
                boxSize === 6 ? "grid-cols-3" : "grid-cols-3 sm:grid-cols-4"
              }`}
            >
              {Array.from({ length: capacity }).map((_, index) => {
                const item = selectedPops[index];
                if (item) {
                  return (
                    <div
                      key={`slot-filled-${index}-${item.variant.id}`}
                      className="group relative flex flex-col items-center justify-between rounded-2xl border-2 border-choco/30 bg-white p-2.5 shadow-xs transition-all hover:border-strawberry"
                    >
                      <button
                        type="button"
                        onClick={() => removeAtIndex(index)}
                        title="Remove pop from slot"
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-strawberry text-white shadow hover:scale-110 transition-transform"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <div className="h-14 w-14 overflow-hidden rounded-xl bg-cream-deep">
                        <img
                          src={item.product.image_url}
                          alt={item.product.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <p className="mt-1.5 line-clamp-1 w-full text-center text-[11px] font-bold text-choco">
                        {item.product.name}
                      </p>
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        {inr(item.variant.price_paise)}
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={`slot-empty-${index}`}
                    className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-sky-300/80 bg-sky-50/40 p-3 text-center transition-colors hover:border-sky-400"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                      <Plus className="h-4 w-4" />
                    </div>
                    <span className="mt-1 text-[10px] font-bold text-sky-700">Slot #{index + 1}</span>
                    <span className="text-[9px] text-sky-900/60">Empty</span>
                  </div>
                );
              })}
            </div>

            {/* Quick Box Controls */}
            <div className="mt-6 flex items-center justify-between gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={autoFillBestsellers}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-100 px-3 py-1.5 text-xs font-bold text-sky-900 hover:bg-sky-200 transition-colors"
              >
                <Shuffle className="h-3.5 w-3.5" />
                <span>Surprise Me (Auto-Fill)</span>
              </button>
              {selectedPops.length > 0 && (
                <button
                  type="button"
                  onClick={clearBox}
                  className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-strawberry transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear All
                </button>
              )}
            </div>

            {/* Price & Action Summary */}
            <div className="mt-6 rounded-2xl bg-cream p-4 space-y-2 border border-choco/10">
              <div className="flex justify-between text-xs text-muted-foreground font-semibold">
                <span>Items Subtotal ({selectedPops.length} pops)</span>
                <span>{inr(subtotalPaise)}</span>
              </div>
              {boxSavingsPaise > 0 && (
                <div className="flex justify-between text-xs text-emerald-700 font-bold">
                  <span>Box Bundle Savings</span>
                  <span>–{inr(boxSavingsPaise)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs text-sky-800 font-bold">
                <span>Thermal Packaging</span>
                <span className="uppercase text-[10px] bg-sky-200/60 px-2 py-0.5 rounded-md">FREE</span>
              </div>
              <div className="pt-2 border-t border-choco/10 flex justify-between items-baseline">
                <span className="font-display font-extrabold text-choco">Total Box Price</span>
                <span className="font-display text-2xl font-black text-choco">
                  {inr(finalBoxPricePaise)}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-5 space-y-2.5">
              <button
                type="button"
                onClick={handleStartExpressCheckout}
                disabled={selectedPops.length === 0}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-strawberry py-3.5 px-4 font-display font-extrabold text-white shadow-md hover:bg-strawberry/90 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none transition-all"
              >
                <Zap className="h-4 w-4 fill-white" />
                <span>Express Checkout (Razorpay Test Mode ⚡)</span>
              </button>

              <button
                type="button"
                onClick={handleAddToCart}
                disabled={selectedPops.length === 0}
                className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-choco bg-white py-3 px-4 font-bold text-choco hover:bg-choco hover:text-cream active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none transition-all text-sm"
              >
                <ShoppingBag className="h-4 w-4" />
                <span>Add Custom Box to Cart</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Flavour Selection Tray (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-choco text-xs font-bold text-cream">
                2
              </span>
              <h2 className="font-display text-lg font-bold text-choco">Choose Your Flavours</h2>
            </div>

            {/* Search Filter */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search flavours..."
                className="w-full rounded-full border border-border bg-white py-2 pl-9 pr-4 text-xs outline-none focus:ring-2 focus:ring-pink"
              />
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="no-scrollbar -mx-2 flex gap-2 overflow-x-auto px-2">
            <button
              type="button"
              onClick={() => setActiveCategory("")}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                !activeCategory ? "bg-choco text-cream" : "bg-white border border-border hover:border-choco"
              }`}
            >
              All Flavours
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCategory(c.slug)}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors shrink-0 ${
                  activeCategory === c.slug
                    ? "bg-choco text-cream"
                    : "bg-white border border-border hover:border-choco"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Flavour Cards Grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            {filteredFlavours.map(({ product, variant }) => {
              const inBoxCount = selectedPops.filter((p) => p.variant.id === variant.id).length;

              return (
                <div
                  key={product.id}
                  className="flex flex-col justify-between overflow-hidden rounded-3xl border border-border bg-white p-4 shadow-xs transition-shadow hover:shadow-md"
                >
                  <div className="flex gap-3">
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-cream-deep">
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="h-full w-full object-cover"
                      />
                      {product.is_bestseller && (
                        <span className="absolute bottom-1 left-1 rounded-md bg-mango px-1.5 py-0.5 text-[9px] font-bold text-white">
                          Hot
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-strawberry">
                        {product.category_name}
                      </span>
                      <h4 className="font-display text-sm font-extrabold text-choco truncate">
                        {product.name}
                      </h4>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground leading-snug">
                        {product.description}
                      </p>
                      <p className="mt-1 font-display text-xs font-black text-choco">
                        {inr(variant.price_paise)}
                      </p>
                    </div>
                  </div>

                  {/* Add / Quantity Stepper */}
                  <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5">
                    <span className="text-[11px] font-semibold text-choco/70">
                      {inBoxCount > 0 ? (
                        <span className="font-bold text-strawberry">
                          {inBoxCount} in your box
                        </span>
                      ) : (
                        "Ready to add"
                      )}
                    </span>

                    {inBoxCount > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => removeFlavour(variant.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-white text-choco hover:bg-muted active:scale-95 transition-all"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-5 text-center text-xs font-bold text-choco">
                          {inBoxCount}
                        </span>
                        <button
                          type="button"
                          onClick={() => addFlavour({ product, variant })}
                          disabled={isFull}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-choco text-cream hover:bg-strawberry active:scale-95 disabled:opacity-40 transition-all"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => addFlavour({ product, variant })}
                        disabled={isFull}
                        className="inline-flex items-center gap-1 rounded-full bg-choco px-3.5 py-1.5 text-xs font-bold text-cream hover:bg-strawberry active:scale-95 disabled:opacity-40 transition-all"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add to Box</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Express Checkout Modal with Razorpay Test Mode */}
      <Dialog open={showCheckoutModal} onOpenChange={setShowCheckoutModal}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl p-6">
          <DialogHeader className="mb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-strawberry text-white">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="font-display text-xl font-extrabold text-choco">
                  1-Click Express Checkout
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  Secured with Razorpay Test Mode Simulator (UPI, Card, Netbanking)
                </p>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={executeRazorpayOrder} className="space-y-4">
            {/* Box Order Summary Pill */}
            <div className="rounded-2xl bg-amber-50/70 border border-amber-200/80 p-3.5 flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-amber-950">
                  Custom {boxSize}-Pack Box ({selectedPops.length} Ice Pops)
                </span>
                <p className="text-[11px] text-amber-900/70 truncate max-w-xs mt-0.5">
                  {groupedSelected.map((g) => `${g.count}x ${g.product.name}`).join(", ")}
                </p>
              </div>
              <span className="font-display text-base font-black text-amber-950">
                {inr(finalBoxPricePaise)}
              </span>
            </div>

            {/* Fulfilment Toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFulfilment("delivery")}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-bold border transition-all ${
                  fulfilment === "delivery"
                    ? "border-choco bg-choco text-cream shadow-xs"
                    : "border-border bg-white text-choco hover:bg-muted"
                }`}
              >
                <Truck className="h-3.5 w-3.5" /> Doorstep Delivery
              </button>
              <button
                type="button"
                onClick={() => setFulfilment("pickup")}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-bold border transition-all ${
                  fulfilment === "pickup"
                    ? "border-choco bg-choco text-cream shadow-xs"
                    : "border-border bg-white text-choco hover:bg-muted"
                }`}
              >
                <Package className="h-3.5 w-3.5" /> Parlour Pickup
              </button>
            </div>

            {/* Customer Contact */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
                  Your Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={contact.name}
                  onChange={(e) => setContact({ ...contact, name: e.target.value })}
                  placeholder="e.g. Ramesh Reddy"
                  className="w-full rounded-xl border border-border bg-white px-3.5 py-2 text-xs outline-none focus:ring-2 focus:ring-pink"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
                  WhatsApp / Phone Number *
                </label>
                <input
                  type="tel"
                  required
                  value={contact.phone}
                  onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                  placeholder="10-digit mobile number"
                  className="w-full rounded-xl border border-border bg-white px-3.5 py-2 text-xs outline-none focus:ring-2 focus:ring-pink"
                />
              </div>
            </div>

            {/* Delivery Address fields */}
            {fulfilment === "delivery" && (
              <div className="space-y-3 rounded-2xl border border-border bg-cream/30 p-3.5">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
                    Street Address / Flat No. *
                  </label>
                  <input
                    type="text"
                    required
                    value={address.line1}
                    onChange={(e) => setAddress({ ...address, line1: e.target.value })}
                    placeholder="House/Flat number, building, street"
                    className="w-full rounded-xl border border-border bg-white px-3.5 py-2 text-xs outline-none focus:ring-2 focus:ring-pink"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
                      Area
                    </label>
                    <input
                      type="text"
                      required
                      value={address.area}
                      onChange={(e) => setAddress({ ...address, area: e.target.value })}
                      placeholder="e.g. Banjara Hills"
                      className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-pink"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      required
                      value={address.city}
                      onChange={(e) => setAddress({ ...address, city: e.target.value })}
                      className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-pink"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
                      PIN Code
                    </label>
                    <input
                      type="text"
                      required
                      value={address.pincode}
                      onChange={(e) => setAddress({ ...address, pincode: e.target.value })}
                      className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-pink"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Delivery Partner Tip (when delivery) */}
            {fulfilment === "delivery" && (
              <div className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-choco flex items-center gap-1.5">
                    ☀️ Delivery Partner Tip
                  </span>
                  <span className="text-[10px] text-muted-foreground">100% to rider</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "No tip", val: 0 },
                    { label: "₹10 😊", val: 1000 },
                    { label: "₹20 🥤", val: 2000 },
                    { label: "₹30 🦸", val: 3000 },
                  ].map((p) => (
                    <button
                      key={p.val}
                      type="button"
                      onClick={() => setRiderTipPaise(p.val)}
                      className={`rounded-full px-3 py-1 text-xs font-bold border transition-all ${
                        riderTipPaise === p.val
                          ? "border-choco bg-choco text-cream shadow-xs"
                          : "border-border bg-white text-choco hover:border-choco/60"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Razorpay Test Simulation Info */}
            <div className="rounded-2xl bg-sky-50 border border-sky-200/80 p-3 text-xs text-sky-900 flex items-center gap-2">
              <CreditCard className="h-4 w-4 shrink-0 text-sky-700" />
              <span>
                Razorpay Test Mode is active. You can simulate instant UPI, Card or Netbanking approval with 1 click.
              </span>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={submittingOrder}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-choco py-3.5 px-4 font-display font-extrabold text-cream shadow-lg hover:bg-strawberry active:scale-[0.99] disabled:opacity-50 transition-all text-sm"
            >
              <Zap className="h-4 w-4 fill-cream" />
              <span>
                {submittingOrder
                  ? "Launching Razorpay Test Checkout..."
                  : `Pay ${inr(finalBoxPricePaise + (fulfilment === "delivery" ? riderTipPaise : 0))} via Razorpay Test Mode`}
              </span>
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
