import { useEffect, useState } from "react";
import { Sparkles, Check, Plus, Minus, Calendar, Users, MapPin, Phone, Mail, CheckCircle2, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatPaise } from "@/lib/utils";

export default function Catering() {
  const [packages, setPackages] = useState([]);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [products, setProducts] = useState([]);
  const [flavourCounts, setFlavourCounts] = useState({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [eventType, setEventType] = useState("Birthday Party");
  const [eventDate, setEventDate] = useState("");
  const [guestCount, setGuestCount] = useState(30);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmedInquiry, setConfirmedInquiry] = useState(null);

  useEffect(() => {
    api.get("/catering/packages").then(({ data }) => {
      setPackages(data.packages || []);
      if (data.packages?.length > 1) {
        setSelectedPackage(data.packages[1]); // Default to 50 pack
      } else if (data.packages?.length > 0) {
        setSelectedPackage(data.packages[0]);
      }
    }).catch(() => {});

    api.get("/catalog").then(({ data }) => {
      const all = (data.categories || []).flatMap((c) => c.products || []);
      setProducts(all);
    }).catch(() => {});
  }, []);

  const totalCapacity = selectedPackage?.box_size || 50;
  const currentTotalAllocated = Object.values(flavourCounts).reduce((s, c) => s + (Number(c) || 0), 0);
  const remaining = totalCapacity - currentTotalAllocated;

  const updateFlavour = (flavourName, delta) => {
    const cur = flavourCounts[flavourName] || 0;
    const next = cur + delta;
    if (next < 0) return;
    if (delta > 0 && remaining <= 0) {
      toast.error(`You have already chosen all ${totalCapacity} pops for this box size.`);
      return;
    }
    setFlavourCounts((prev) => ({ ...prev, [flavourName]: next }));
  };

  const autoDistribute = () => {
    if (products.length === 0) return;
    const popularFlavours = products.slice(0, 5);
    const perFlavour = Math.floor(totalCapacity / popularFlavours.length);
    const extra = totalCapacity % popularFlavours.length;
    const newCounts = {};
    popularFlavours.forEach((p, idx) => {
      newCounts[p.name] = perFlavour + (idx === 0 ? extra : 0);
    });
    setFlavourCounts(newCounts);
    toast.success("Flavours evenly distributed across our top bestsellers!");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !address.trim() || !eventDate) {
      toast.error("Please fill in your name, phone, address, and event date.");
      return;
    }
    setSubmitting(true);
    try {
      const flavoursPayload = Object.entries(flavourCounts)
        .filter(([_, q]) => q > 0)
        .map(([name, quantity]) => ({ name, quantity }));

      const { data } = await api.post("/catering/inquiry", {
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        customer_email: email.trim() || undefined,
        event_type: eventType,
        event_date: eventDate,
        guest_count: Number(guestCount),
        box_size: totalCapacity,
        flavours: flavoursPayload,
        delivery_address: address.trim(),
        notes: notes.trim() || undefined,
      });

      setConfirmedInquiry(data);
      toast.success("Party Box Inquiry Submitted!");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not submit inquiry");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream/30 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-pink-light px-4 py-1.5 text-xs font-bold text-strawberry">
            <Sparkles className="h-4 w-4" /> Bulk Party Boxes & Event Catering
          </div>
          <h1 className="font-display text-3xl sm:text-5xl font-extrabold text-choco tracking-tight">
            Freeze the Fun at Your Next Celebration!
          </h1>
          <p className="mx-auto max-w-2xl text-base text-choco/70">
            Handcrafted natural fruit ice pops delivered in commercial dry-ice thermo boxes. Stays frozen solid for 4–6+
            hours without needing electricity. Perfect for birthdays, sangeets, house parties, and corporate treat days!
          </p>
        </div>

        {/* Package Tiers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {packages.map((pkg) => {
            const isSelected = selectedPackage?.id === pkg.id;
            return (
              <div
                key={pkg.id}
                onClick={() => {
                  setSelectedPackage(pkg);
                  setFlavourCounts({});
                }}
                className={`relative flex flex-col justify-between rounded-3xl p-6 cursor-pointer transition-all border-2 ${
                  isSelected
                    ? "border-strawberry bg-white shadow-xl scale-[1.02]"
                    : "border-border bg-white/70 hover:bg-white hover:border-strawberry/40"
                }`}
              >
                {pkg.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-strawberry px-3 py-1 text-[11px] font-bold text-white shadow-sm">
                    Most Popular Choice
                  </span>
                )}
                <div>
                  <h3 className="font-display text-xl font-bold text-choco">{pkg.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="font-display text-3xl font-extrabold text-choco">
                      {formatPaise(pkg.price_paise)}
                    </span>
                    <span className="text-xs text-choco/60">/ {pkg.box_size} pops</span>
                  </div>
                  <span className="inline-block mt-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                    Save {pkg.discount_pct}% vs individual price
                  </span>
                  <p className="mt-3 text-xs text-choco/70 leading-relaxed">{pkg.ideal_for}</p>

                  <ul className="mt-5 space-y-2 text-xs text-choco/80">
                    {pkg.inclusions.map((inc, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{inc}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  className={`mt-6 w-full rounded-2xl py-2.5 text-xs font-bold transition-all ${
                    isSelected ? "bg-strawberry text-white" : "bg-cream text-choco hover:bg-pink-light"
                  }`}
                >
                  {isSelected ? "Selected Package" : "Select this Size"}
                </button>
              </div>
            );
          })}
        </div>

        {/* Flavour Mixer Console */}
        <div className="rounded-3xl bg-white p-6 sm:p-8 border border-border shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-choco">
                Customize Your {totalCapacity}-Pop Assortment
              </h2>
              <p className="text-xs text-choco/70">
                Mix and match your favourite popsicles or tap Auto-Fill for our chef-curated bestsellers.
              </p>
            </div>
            <button
              type="button"
              onClick={autoDistribute}
              className="flex items-center gap-1.5 rounded-full border border-strawberry/40 bg-pink-light px-4 py-2 text-xs font-bold text-strawberry hover:bg-strawberry hover:text-white transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" /> Auto-Fill Bestsellers
            </button>
          </div>

          {/* Allocation Progress Bar */}
          <div className="rounded-2xl bg-cream/40 p-4 space-y-2">
            <div className="flex justify-between text-xs font-bold text-choco">
              <span>
                Allocated: {currentTotalAllocated} of {totalCapacity} Pops
              </span>
              <span className={remaining === 0 ? "text-emerald-600" : "text-amber-600"}>
                {remaining === 0 ? "Box Ready! 🎉" : `${remaining} sticks remaining`}
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-border overflow-hidden">
              <div
                className="h-full bg-strawberry transition-all duration-300"
                style={{ width: `${Math.min(100, (currentTotalAllocated / totalCapacity) * 100)}%` }}
              />
            </div>
          </div>

          {/* Flavours Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {products.map((p) => {
              const qty = flavourCounts[p.name] || 0;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-2xl border border-border bg-white p-3 hover:border-strawberry/40 transition-colors"
                >
                  <div className="flex-1 pr-2">
                    <p className="font-semibold text-choco text-xs line-clamp-1">{p.name}</p>
                    <p className="text-[10px] text-choco/50">100% Real Fruit</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateFlavour(p.name, -1)}
                      disabled={qty === 0}
                      className="grid h-7 w-7 place-items-center rounded-lg border border-border bg-cream/50 text-choco hover:bg-pink-light disabled:opacity-30"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-5 text-center font-bold text-choco text-xs">{qty}</span>
                    <button
                      type="button"
                      onClick={() => updateFlavour(p.name, 1)}
                      disabled={remaining <= 0}
                      className="grid h-7 w-7 place-items-center rounded-lg border border-border bg-cream/50 text-choco hover:bg-pink-light disabled:opacity-30"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Booking Form */}
        <div className="rounded-3xl bg-white p-6 sm:p-8 border border-border shadow-sm space-y-6">
          <h2 className="font-display text-2xl font-bold text-choco">Event & Delivery Details</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-choco block mb-1">Your Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full rounded-2xl border border-border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-strawberry"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-choco block mb-1">WhatsApp / Phone *</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  className="w-full rounded-2xl border border-border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-strawberry"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-choco block mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="For quote receipt"
                  className="w-full rounded-2xl border border-border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-strawberry"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-choco block mb-1">Event Type *</label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="w-full rounded-2xl border border-border px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-strawberry"
                >
                  <option value="Birthday Party">Kids' / Adult Birthday Party</option>
                  <option value="Wedding / Sangeet">Wedding, Sangeet or Reception</option>
                  <option value="Corporate Event">Corporate Event / Office Treat</option>
                  <option value="House Party">House Party / Get Together</option>
                  <option value="School / College Fest">School or College Fest</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-choco block mb-1">Event Date *</label>
                <input
                  type="date"
                  required
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full rounded-2xl border border-border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-strawberry"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-choco block mb-1">Estimated Guest Count</label>
                <input
                  type="number"
                  min="5"
                  value={guestCount}
                  onChange={(e) => setGuestCount(e.target.value)}
                  className="w-full rounded-2xl border border-border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-strawberry"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-choco block mb-1">Venue / Delivery Address *</label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Apartment, Street, Landmark, Area & PIN code"
                  className="w-full rounded-2xl border border-border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-strawberry"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-choco block mb-1">Special Notes / Time of Serving</label>
                <textarea
                  rows="2"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Please deliver by 4:30 PM with dry-ice so it's ready for cake cutting at 6 PM."
                  className="w-full rounded-2xl border border-border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-strawberry"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <span className="text-xs text-choco/60 block">Estimated Package Price:</span>
                <span className="font-display text-2xl font-extrabold text-strawberry">
                  {selectedPackage ? formatPaise(selectedPackage.price_paise) : "₹--"}
                </span>
                <span className="text-xs text-choco/50 ml-2">including thermo-box & dry ice</span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="rounded-2xl bg-strawberry px-8 py-3.5 font-bold text-white shadow-md hover:bg-strawberry/90 active:scale-95 transition-all disabled:opacity-50"
              >
                {submitting ? "Submitting Inquiry..." : "Submit Party Box Request 🎉"}
              </button>
            </div>
          </form>
        </div>

        {/* Confirmation Modal */}
        {confirmedInquiry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl border border-border text-center space-y-4 animate-in fade-in zoom-in-95">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                <PackageCheck className="h-8 w-8" />
              </div>
              <h2 className="font-display text-2xl font-bold text-choco">Party Box Inquiry Received!</h2>
              <p className="text-sm text-choco/70">
                Inquiry Ref: <span className="font-mono font-bold text-choco">#{confirmedInquiry.inquiry_id}</span>
              </p>
              <p className="text-xs text-choco/60 leading-relaxed bg-cream/40 p-3 rounded-2xl">
                {confirmedInquiry.message ||
                  "Our event concierge team will call or WhatsApp you shortly to confirm flavours and delivery timing."}
              </p>
              <button
                onClick={() => setConfirmedInquiry(null)}
                className="w-full rounded-2xl bg-choco py-3 text-xs font-bold text-cream hover:bg-choco/90"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
