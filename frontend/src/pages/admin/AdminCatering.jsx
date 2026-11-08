import { useEffect, useState } from "react";
import { Calendar, Phone, MessageSquare, MapPin, Users, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatPaise } from "@/lib/utils";

const STATUS_COLORS = {
  new: "bg-blue-100 text-blue-800 border-blue-200",
  contacted: "bg-amber-100 text-amber-800 border-amber-200",
  quote_sent: "bg-purple-100 text-purple-800 border-purple-200",
  confirmed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  completed: "bg-gray-100 text-gray-800 border-gray-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};

export default function AdminCatering() {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [editingInquiry, setEditingInquiry] = useState(null);
  const [quoteRupees, setQuoteRupees] = useState("");
  const [depositRupees, setDepositRupees] = useState("");
  const [statusVal, setStatusVal] = useState("new");
  const [notesVal, setNotesVal] = useState("");

  const loadInquiries = async () => {
    try {
      const { data } = await api.get("/catering/admin/inquiries");
      setInquiries(data.inquiries || []);
    } catch {
      toast.error("Failed to load catering inquiries");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInquiries();
  }, []);

  const openEdit = (inq) => {
    setEditingInquiry(inq);
    setQuoteRupees(inq.quote_paise ? String(inq.quote_paise / 100) : "");
    setDepositRupees(inq.deposit_paise ? String(inq.deposit_paise / 100) : "");
    setStatusVal(inq.status);
    setNotesVal(inq.notes || "");
  };

  const handleSave = async () => {
    if (!editingInquiry) return;
    try {
      await api.patch(`/catering/admin/inquiries/${editingInquiry.id}`, {
        status: statusVal,
        quote_paise: quoteRupees ? Math.round(Number(quoteRupees) * 100) : null,
        deposit_paise: depositRupees ? Math.round(Number(depositRupees) * 100) : null,
        notes: notesVal,
      });
      toast.success("Inquiry updated successfully");
      setEditingInquiry(null);
      loadInquiries();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Update failed");
    }
  };

  const filtered = inquiries.filter((i) => {
    if (activeTab === "all") return true;
    if (activeTab === "pending") return ["new", "contacted", "quote_sent"].includes(i.status);
    if (activeTab === "confirmed") return i.status === "confirmed";
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-choco">Party Box & Catering Requests</h1>
          <p className="text-sm text-choco/70">Manage party assortment orders, bulk event bookings & quotes</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("all")}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-colors ${
            activeTab === "all" ? "bg-choco text-cream" : "bg-white text-choco/70 hover:bg-pink-light"
          }`}
        >
          All Inquiries ({inquiries.length})
        </button>
        <button
          onClick={() => setActiveTab("pending")}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-colors ${
            activeTab === "pending" ? "bg-amber-500 text-white" : "bg-white text-choco/70 hover:bg-pink-light"
          }`}
        >
          Action Required ({inquiries.filter((i) => ["new", "contacted", "quote_sent"].includes(i.status)).length})
        </button>
        <button
          onClick={() => setActiveTab("confirmed")}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-colors ${
            activeTab === "confirmed" ? "bg-emerald-600 text-white" : "bg-white text-choco/70 hover:bg-pink-light"
          }`}
        >
          Confirmed Bookings ({inquiries.filter((i) => i.status === "confirmed").length})
        </button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-3xl bg-white p-12 text-center border border-border">
          <Calendar className="mx-auto h-10 w-10 text-choco/40 mb-2" />
          <p className="font-semibold text-choco">No catering inquiries found</p>
          <p className="text-xs text-choco/60 mt-1">New requests from the Party Packs page will show up here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((inq) => {
            const cleanPhone = inq.customer_phone.replace(/\D/g, "");
            const whatsappUrl = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(
              `Hi ${inq.customer_name}, thank you for inquiring about ICEPOPS catering for your ${inq.event_type} on ${inq.event_date}!`
            )}`;
            return (
              <div
                key={inq.id}
                className="rounded-3xl bg-white p-5 border border-border shadow-sm flex flex-col justify-between hover:shadow-md transition-all space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-display font-bold text-lg text-choco">{inq.customer_name}</span>
                      <p className="text-xs text-choco/60 flex items-center gap-1.5 mt-0.5">
                        <Users className="h-3.5 w-3.5 text-choco/40" />
                        {inq.event_type} • {inq.guest_count} Guests
                      </p>
                    </div>
                    <span
                      className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold border ${
                        STATUS_COLORS[inq.status] || "bg-gray-100"
                      }`}
                    >
                      {inq.status.replace(/_/g, " ").toUpperCase()}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-choco/80 bg-cream/40 p-3 rounded-2xl">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-strawberry" />
                      <span>Event: {inq.event_date}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-amber-500" />
                      <span>{inq.box_size} Pops Box</span>
                    </div>
                    <div className="col-span-2 flex items-start gap-1.5 pt-1 border-t border-border/40">
                      <MapPin className="h-4 w-4 text-choco/50 shrink-0 mt-0.5" />
                      <span className="line-clamp-1">{inq.delivery_address}</span>
                    </div>
                  </div>

                  {inq.flavours && inq.flavours.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[11px] font-bold text-choco/60 mb-1">Selected Flavours:</p>
                      <div className="flex flex-wrap gap-1">
                        {inq.flavours.map((fl, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-pink-light text-choco text-xs font-medium"
                          >
                            <span>{fl.name}</span>
                            <span className="font-bold">({fl.quantity})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {inq.notes && (
                    <p className="mt-2 text-xs italic text-choco/70 bg-cream/20 p-2 rounded-xl">
                      "{inq.notes}"
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-choco/60 block">Quote Amount:</span>
                    <span className="font-bold text-choco text-sm">
                      {inq.quote_paise ? formatPaise(inq.quote_paise) : "Pending Quote"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                      title="Chat on WhatsApp"
                    >
                      <MessageSquare className="h-4 w-4" />
                    </a>
                    <a
                      href={`tel:${inq.customer_phone}`}
                      className="grid h-8 w-8 place-items-center rounded-xl bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors"
                      title="Call Customer"
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                    <button
                      onClick={() => openEdit(inq)}
                      className="px-3 py-1.5 rounded-xl bg-choco text-cream text-xs font-bold hover:bg-choco/90 transition-colors"
                    >
                      Manage
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit / Quote Modal */}
      {editingInquiry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-border space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg text-choco">Manage Inquiry #{editingInquiry.id}</h2>
              <button onClick={() => setEditingInquiry(null)} className="text-choco/50 hover:text-choco">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-choco/60 block mb-1">Status</label>
                <select
                  value={statusVal}
                  onChange={(e) => setStatusVal(e.target.value)}
                  className="w-full rounded-xl border border-border px-3 py-2 bg-white font-medium"
                >
                  <option value="new">New Inquiry</option>
                  <option value="contacted">Contacted via Phone/WA</option>
                  <option value="quote_sent">Quote Sent</option>
                  <option value="confirmed">Confirmed / Paid</option>
                  <option value="completed">Completed / Dispatched</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-choco/60 block mb-1">Quote Total (₹)</label>
                  <input
                    type="number"
                    value={quoteRupees}
                    onChange={(e) => setQuoteRupees(e.target.value)}
                    className="w-full rounded-xl border border-border px-3 py-2 font-bold"
                  />
                </div>
                <div>
                  <label className="text-choco/60 block mb-1">Deposit Paid (₹)</label>
                  <input
                    type="number"
                    value={depositRupees}
                    onChange={(e) => setDepositRupees(e.target.value)}
                    className="w-full rounded-xl border border-border px-3 py-2 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-choco/60 block mb-1">Admin Notes</label>
                <textarea
                  rows="3"
                  value={notesVal}
                  onChange={(e) => setNotesVal(e.target.value)}
                  placeholder="Special dry-ice instructions, delivery schedule, etc."
                  className="w-full rounded-xl border border-border p-2.5"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setEditingInquiry(null)}
                className="flex-1 rounded-xl border border-border py-2 text-xs font-bold text-choco hover:bg-cream"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 rounded-xl bg-strawberry py-2 text-xs font-bold text-white hover:bg-strawberry/90"
              >
                Save Updates
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
