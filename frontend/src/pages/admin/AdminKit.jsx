import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";

export const adminInput = "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink";

export const ImageUpload = ({ value, onChange, testid = "image-upload", clearable = false }) => {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Image must be 5 MB or smaller.");
    const fd = new FormData();
    fd.append("file", file);
    setBusy(true);
    try {
      const { data } = await api.post("/admin/uploads", fd);
      onChange(data.url);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-3">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-cream-deep">
        {value && <img src={value} alt="Preview" data-testid={`${testid}-preview`} className="h-full w-full object-cover" />}
      </div>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pick} data-testid={`${testid}-input`} />
      <button type="button" onClick={() => ref.current?.click()} disabled={busy} data-testid={`${testid}-button`}
        className="flex items-center gap-2 rounded-full border border-choco px-4 py-2 text-sm font-bold disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{value ? "Change image" : "Upload image"}
      </button>
      {clearable && value && <button type="button" onClick={() => onChange(null)} data-testid={`${testid}-remove`} className="text-sm font-bold text-strawberry">Remove</button>}
    </div>
  );
};

export const Check = ({ label, checked, onChange, testid }) => (
  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} data-testid={testid} className="h-4 w-4 accent-[#3D2314]" />{label}</label>
);

export const Lbl = ({ label, children, className = "" }) => (
  <label className={`block space-y-1 ${className}`}><span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>
);
