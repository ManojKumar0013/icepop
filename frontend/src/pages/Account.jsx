import { useEffect, useState } from "react";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { StampCard, useLoyalty } from "@/components/site/StampCard";

const MyStamps = () => {
  const l = useLoyalty();
  return l?.enabled ? <div className="md:col-span-2"><StampCard l={l} /></div> : null;
};

const inputCls = "w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-pink";
const BLANK = { label: "Home", name: "", phone: "", line1: "", line2: "", area: "", city: "", pincode: "", instructions: "", is_default: false };

const AddressForm = ({ initial, onSaved }) => {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = async (e) => {
    e.preventDefault();
    try {
      if (f.id) await api.put(`/account/addresses/${f.id}`, f);
      else await api.post("/account/addresses", f);
      toast.success("Address saved");
      onSaved();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };
  const inp = (k, label, props = {}) => <input aria-label={label} placeholder={label} data-testid={`address-${k}-input`} className={inputCls} value={f[k] || ""} onChange={set(k)} {...props} />;
  return (
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
      {inp("label", "Label (Home, Work…)", { maxLength: 30 })}{inp("name", "Name", { required: true })}
      {inp("phone", "Mobile number", { required: true, inputMode: "tel" })}{inp("pincode", "PIN code", { required: true, inputMode: "numeric", maxLength: 6 })}
      <div className="sm:col-span-2">{inp("line1", "House / flat, street", { required: true })}</div>
      {inp("line2", "Landmark (optional)")}{inp("area", "Area / locality", { required: true })}
      {inp("city", "City", { required: true })}{inp("instructions", "Delivery instructions (optional)")}
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.is_default} onChange={set("is_default")} data-testid="address-default-checkbox" />Make this my default address</label>
      <button data-testid="address-save-button" className="rounded-full bg-choco py-3 font-bold text-cream sm:col-span-2">Save address</button>
    </form>
  );
};

const Profile = () => {
  const { user, setUser } = useAuth();
  const [f, setF] = useState({ name: user.name, phone: user.phone || "" });
  const save = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.patch("/auth/me", { name: f.name, phone: f.phone || null });
      setUser(data);
      toast.success("Profile updated");
    } catch (err) {
      toast.error(errMsg(err));
    }
  };
  return (
    <form onSubmit={save} className="space-y-4 rounded-3xl border border-border bg-white p-6 sm:p-8" data-testid="profile-form">
      <h2 className="font-display text-xl font-bold">Profile</h2>
      <p className="text-sm text-muted-foreground" data-testid="profile-email">{user.email}</p>
      <input aria-label="Name" data-testid="profile-name-input" className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input aria-label="Mobile number" placeholder="Mobile number" data-testid="profile-phone-input" className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      <button data-testid="profile-save-button" className="rounded-full bg-choco px-6 py-3 text-sm font-bold text-cream">Save changes</button>
    </form>
  );
};

export default function Account() {
  const [addresses, setAddresses] = useState([]);
  const [editing, setEditing] = useState(null);
  const load = () => api.get("/account/addresses").then(({ data }) => setAddresses(data)).catch(() => {});
  useEffect(() => {
    load();
  }, []);
  const remove = async (id) => {
    if (!window.confirm("Delete this address?")) return;
    await api.delete(`/account/addresses/${id}`);
    load();
  };
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-10 sm:px-6 md:grid-cols-[360px_1fr] lg:px-8" data-testid="account-page">
      <h1 className="font-display text-4xl font-extrabold tracking-tight md:col-span-2">My account</h1>
      <MyStamps />
      <Profile />
      <section className="rounded-3xl border border-border bg-white p-6 sm:p-8">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Saved addresses</h2>
          <button data-testid="address-add-button" onClick={() => setEditing(BLANK)} className="flex items-center gap-1 rounded-full bg-pink-light px-4 py-2 text-sm font-bold"><Plus className="h-4 w-4" />Add</button>
        </div>
        {addresses.length === 0 && <p className="text-sm text-muted-foreground" data-testid="addresses-empty">No saved addresses yet.</p>}
        <ul className="space-y-3">
          {addresses.map((a) => (
            <li key={a.id} data-testid={`address-card-${a.id}`} className="flex gap-3 rounded-2xl border border-border p-4 text-sm">
              <MapPin className="h-4 w-4 shrink-0 text-strawberry" />
              <div className="flex-1"><p className="font-bold">{a.label}{a.is_default && <span className="ml-2 rounded-full bg-pistachio/15 px-2 py-0.5 text-[10px] text-pistachio">DEFAULT</span>}</p><p>{a.name}, {a.phone}</p><p className="text-muted-foreground">{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.area}, {a.city} {a.pincode}</p></div>
              <button aria-label="Edit address" data-testid={`address-edit-${a.id}`} onClick={() => setEditing(a)}><Pencil className="h-4 w-4" /></button>
              <button aria-label="Delete address" data-testid={`address-delete-${a.id}`} onClick={() => remove(a.id)}><Trash2 className="h-4 w-4 text-strawberry" /></button>
            </li>
          ))}
        </ul>
      </section>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit address" : "New address"}</DialogTitle></DialogHeader>
          {editing && <AddressForm initial={editing} onSaved={() => { setEditing(null); load(); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
