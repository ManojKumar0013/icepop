import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errMsg } from "@/lib/api";
import { PageLoader } from "@/components/site/Guards";
import { inr } from "@/lib/format";
import { Check, ImageUpload, Lbl, adminInput } from "@/pages/admin/AdminKit";

const call = async (fn, ok, setD) => {
  try {
    const { data } = await fn();
    setD(data);
    toast.success(ok);
    return true;
  } catch (e) {
    toast.error(errMsg(e));
    return false;
  }
};

const Business = ({ d, setD }) => {
  const [f, setF] = useState(d);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const txt = (k, label, testid, props = {}) => <Lbl label={label}><input className={adminInput} value={f[k] ?? ""} onChange={(e) => set(k)(e.target.value)} data-testid={testid} {...props} /></Lbl>;
  const rupees = (k, label, testid) => <Lbl label={label}><input type="number" min="0" className={adminInput} value={f[k] / 100} onChange={(e) => set(k)(Math.round(Number(e.target.value) * 100))} data-testid={testid} /></Lbl>;
  const save = () => call(() => api.put("/admin/settings", { ...f, map_embed_url: f.map_embed_url || null, logo_url: f.logo_url || null }), "Business details saved", setD);
  return (
    <div className="space-y-5" data-testid="settings-business">
      <Lbl label="Logo"><ImageUpload value={f.logo_url} onChange={set("logo_url")} testid="logo-upload" clearable /></Lbl>
      <div className="grid gap-3 sm:grid-cols-2">
        {txt("business_name", "Business name", "settings-name-input", { required: true })}{txt("tagline", "Tagline", "settings-tagline-input")}
        {txt("phone", "Phone", "settings-phone-input")}{txt("whatsapp", "WhatsApp", "settings-whatsapp-input")}
        {txt("email", "Email", "settings-email-input")}{txt("address_line", "Street address", "settings-address-input")}
        {txt("city", "City", "settings-city-input")}{txt("state", "State", "settings-state-input")}
        {txt("pincode", "PIN code", "settings-pincode-input")}{txt("fssai_number", "FSSAI licence number", "settings-fssai-input")}
        {txt("gstin", "GSTIN (optional)", "settings-gstin-input")}{txt("map_embed_url", "Google Maps embed link", "settings-map-input", { placeholder: "https://www.google.com/maps/embed?pb=..." })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {rupees("default_delivery_fee_paise", "Default delivery fee ₹", "settings-delivery-fee-input")}
        {rupees("min_delivery_order_paise", "Minimum order for delivery ₹", "settings-min-delivery-input")}
      </div>
      <div className="flex flex-wrap gap-5">
        <Check label="Delivery available" checked={f.delivery_enabled} onChange={set("delivery_enabled")} testid="settings-delivery-enabled" />
        <Check label="Pickup available" checked={f.pickup_enabled} onChange={set("pickup_enabled")} testid="settings-pickup-enabled" />
        {f.payment_methods.map((m) => (
          <Check key={m.code} label={m.label} checked={m.enabled} testid={`settings-payment-${m.code}`} onChange={(v) => set("payment_methods")(f.payment_methods.map((x) => (x.code === m.code ? { ...x, enabled: v } : x)))} />
        ))}
      </div>
      <div className="space-y-2 rounded-2xl bg-pink-light p-4">
        <Check label="Temporarily closed (stop taking new orders)" checked={f.is_temporarily_closed} onChange={set("is_temporarily_closed")} testid="settings-closed-checkbox" />
        {f.is_temporarily_closed && <input className={adminInput} placeholder="Message for customers, e.g. Closed for maintenance until Monday" value={f.closure_message || ""} onChange={(e) => set("closure_message")(e.target.value)} data-testid="settings-closure-message" />}
      </div>
      <div className="space-y-2 rounded-2xl border border-amber-300 bg-amber-50 p-4">
        <Check label="Rush hour mode (pause incoming orders temporarily during peak rushes)" checked={f.rush_mode} onChange={set("rush_mode")} testid="settings-rush-checkbox" />
        {f.rush_mode && <input className={adminInput} placeholder="Message for customers, e.g. High rush at parlour right now — orders paused for 15 mins" value={f.rush_message || ""} onChange={(e) => set("rush_message")(e.target.value)} data-testid="settings-rush-message" />}
      </div>
      <button onClick={save} data-testid="settings-save-button" className="rounded-full bg-choco px-6 py-3 text-sm font-bold text-cream">Save business details</button>
    </div>
  );
};

const Hours = ({ d, setD }) => {
  const [hours, setHours] = useState(d.hours);
  const [hol, setHol] = useState({ date: "", reason: "" });
  const upd = (i, k, v) => setHours(hours.map((h, j) => (j === i ? { ...h, [k]: v } : h)));
  return (
    <div className="space-y-6" data-testid="settings-hours">
      <div className="space-y-2">
        {hours.map((h, i) => (
          <div key={h.weekday} className="flex flex-wrap items-center gap-3 text-sm" data-testid={`hours-row-${h.weekday}`}>
            <span className="w-24 font-bold">{h.day}</span>
            <input type="time" className={`${adminInput} w-32`} value={h.open} disabled={h.is_closed} onChange={(e) => upd(i, "open", e.target.value)} data-testid={`hours-open-${h.weekday}`} />
            <span>to</span>
            <input type="time" className={`${adminInput} w-32`} value={h.close} disabled={h.is_closed} onChange={(e) => upd(i, "close", e.target.value)} data-testid={`hours-close-${h.weekday}`} />
            <Check label="Closed all day" checked={h.is_closed} onChange={(v) => upd(i, "is_closed", v)} testid={`hours-closed-${h.weekday}`} />
          </div>
        ))}
        <button onClick={() => call(() => api.put("/admin/hours", hours), "Opening hours saved", setD)} data-testid="hours-save-button" className="rounded-full bg-choco px-6 py-3 text-sm font-bold text-cream">Save hours</button>
      </div>
      <div className="space-y-3">
        <h3 className="font-display font-bold">Holidays</h3>
        <div className="flex flex-wrap gap-2">
          <input type="date" className={`${adminInput} w-44`} value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} data-testid="holiday-date-input" />
          <input className={`${adminInput} w-64`} placeholder="Reason, e.g. Diwali" value={hol.reason} onChange={(e) => setHol({ ...hol, reason: e.target.value })} data-testid="holiday-reason-input" />
          <button onClick={async () => (await call(() => api.post("/admin/holidays", hol), "Holiday added", setD)) && setHol({ date: "", reason: "" })} data-testid="holiday-add-button" className="rounded-full bg-choco px-5 text-sm font-bold text-cream">Add</button>
        </div>
        {d.holidays.length === 0 ? <p className="text-sm text-muted-foreground">No holidays set.</p> : d.holidays.map((h) => (
          <p key={h.id} className="flex items-center gap-3 text-sm" data-testid={`holiday-${h.date}`}><b>{h.date}</b>{h.reason}<button aria-label="Remove holiday" onClick={() => call(() => api.delete(`/admin/holidays/${h.id}`), "Holiday removed", setD)}><Trash2 className="h-4 w-4 text-strawberry" /></button></p>
        ))}
      </div>
    </div>
  );
};

const Zones = ({ d, setD }) => {
  const [z, setZ] = useState({ name: "", pincode: "", fee: "" });
  const add = async () => {
    const ok = await call(() => api.post("/admin/zones", { name: z.name, pincode: z.pincode, delivery_fee_paise: z.fee === "" ? null : Math.round(Number(z.fee) * 100), is_active: true }), "Delivery PIN added", setD);
    if (ok) setZ({ name: "", pincode: "", fee: "" });
  };
  const toggle = (zone) => call(() => api.put(`/admin/zones/${zone.id}`, { ...zone, is_active: !zone.is_active }), zone.is_active ? "PIN paused" : "PIN active", setD);
  return (
    <div className="space-y-4" data-testid="settings-zones">
      <p className="text-sm text-muted-foreground">Customers can only choose delivery for these PIN codes. Leave the fee empty to use the default fee ({inr(d.default_delivery_fee_paise)}).</p>
      <div className="flex flex-wrap gap-2">
        <input className={`${adminInput} w-56`} placeholder="Area name" value={z.name} onChange={(e) => setZ({ ...z, name: e.target.value })} data-testid="zone-name-input" />
        <input className={`${adminInput} w-32`} placeholder="PIN code" inputMode="numeric" maxLength={6} value={z.pincode} onChange={(e) => setZ({ ...z, pincode: e.target.value.replace(/\D/g, "") })} data-testid="zone-pincode-input" />
        <input type="number" min="0" className={`${adminInput} w-32`} placeholder="Fee ₹" value={z.fee} onChange={(e) => setZ({ ...z, fee: e.target.value })} data-testid="zone-fee-input" />
        <button onClick={add} data-testid="zone-add-button" className="rounded-full bg-choco px-5 text-sm font-bold text-cream">Add PIN</button>
      </div>
      <ul className="divide-y divide-border rounded-2xl border border-border bg-white">
        {d.zones.map((zone) => (
          <li key={zone.id} className="flex flex-wrap items-center gap-3 p-3 text-sm" data-testid={`zone-row-${zone.pincode}`}>
            <b className="w-20">{zone.pincode}</b><span className="flex-1">{zone.name}</span>
            <span>{zone.delivery_fee_paise == null ? "Default fee" : inr(zone.delivery_fee_paise)}</span>
            <button onClick={() => toggle(zone)} data-testid={`zone-toggle-${zone.pincode}`} className={`rounded-full px-3 py-1 text-xs font-bold ${zone.is_active ? "bg-green-100 text-green-800" : "bg-stone-200"}`}>{zone.is_active ? "Active" : "Paused"}</button>
            <button aria-label="Remove PIN" onClick={() => window.confirm(`Remove ${zone.pincode}?`) && call(() => api.delete(`/admin/zones/${zone.id}`), "PIN removed", setD)} data-testid={`zone-delete-${zone.pincode}`}><Trash2 className="h-4 w-4 text-strawberry" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
};

const PolicyEditor = ({ p, setD }) => {
  const [f, setF] = useState(p);
  return (
    <details className="rounded-2xl border border-border bg-white p-4" data-testid={`policy-editor-${p.slug}`}>
      <summary className="cursor-pointer font-bold">{p.title}</summary>
      <div className="mt-3 space-y-2">
        <input className={adminInput} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid={`policy-title-${p.slug}`} />
        <textarea rows={8} className={adminInput} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} data-testid={`policy-content-${p.slug}`} />
        <button onClick={() => call(() => api.put(`/admin/policies/${p.slug}`, { title: f.title, content: f.content }), "Page saved", setD)} data-testid={`policy-save-${p.slug}`} className="rounded-full bg-choco px-5 py-2 text-sm font-bold text-cream">Save page</button>
      </div>
    </details>
  );
};

const Reviews = ({ d, setD }) => {
  const [list, setList] = useState(d.testimonials);
  const save = () => call(() => api.put("/admin/settings", { ...d, testimonials: list.filter((t) => t.name && t.text) }), "Reviews saved", setD);
  return (
    <div className="space-y-3" data-testid="settings-reviews">
      <p className="text-sm text-muted-foreground">Only add genuine reviews you have permission to show.</p>
      {list.map((t, i) => (
        <div key={i} className="flex gap-2">
          <input className={`${adminInput} w-40`} placeholder="Name" value={t.name} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} data-testid={`review-name-${i}`} />
          <input className={adminInput} placeholder="What they said" value={t.text} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} data-testid={`review-text-${i}`} />
          <button aria-label="Remove review" onClick={() => setList(list.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-strawberry" /></button>
        </div>
      ))}
      <div className="flex gap-2">
        <button onClick={() => setList([...list, { name: "", text: "" }])} data-testid="review-add-button" className="rounded-full border border-choco px-4 py-2 text-sm font-bold">+ Add review</button>
        <button onClick={save} data-testid="reviews-save-button" className="rounded-full bg-choco px-5 py-2 text-sm font-bold text-cream">Save reviews</button>
      </div>
    </div>
  );
};

export default function AdminSettings() {
  const [d, setD] = useState(null);
  useEffect(() => {
    api.get("/admin/settings").then(({ data }) => setD(data)).catch(() => {});
  }, []);
  if (!d) return <PageLoader />;
  return (
    <div className="max-w-4xl space-y-6" data-testid="admin-settings">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Business settings</h1>
        <span data-testid="settings-store-status" className={`rounded-full px-3 py-1 text-xs font-bold ${d.status.open ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>{d.status.open ? "Open now" : d.status.reason}</span>
      </div>
      <Tabs defaultValue="business">
        <TabsList className="flex h-auto flex-wrap justify-start rounded-2xl bg-muted p-1">
          {[["business", "Business"], ["hours", "Hours & holidays"], ["zones", "Delivery PIN codes"], ["policies", "Policy pages"], ["reviews", "Reviews"]].map(([k, l]) => <TabsTrigger key={k} value={k} data-testid={`settings-tab-${k}`} className="rounded-xl">{l}</TabsTrigger>)}
        </TabsList>
        <div className="mt-4 rounded-3xl border border-border bg-white p-6">
          <TabsContent value="business"><Business d={d} setD={setD} /></TabsContent>
          <TabsContent value="hours"><Hours d={d} setD={setD} /></TabsContent>
          <TabsContent value="zones"><Zones d={d} setD={setD} /></TabsContent>
          <TabsContent value="policies" className="space-y-3">{d.policies.map((p) => <PolicyEditor key={p.slug} p={p} setD={setD} />)}</TabsContent>
          <TabsContent value="reviews"><Reviews d={d} setD={setD} /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
