import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { PageLoader } from "@/components/site/Guards";
import { Stars } from "@/components/site/Reviews";
import { istDateTime } from "@/lib/format";

const TABS = [["pending", "To approve"], ["approved", "Published"], ["hidden", "Hidden"], ["", "All"]];
const STATUS = { pending: "bg-mango/20", approved: "bg-pistachio/20 text-pistachio", hidden: "bg-muted text-muted-foreground" };

const ReviewRow = ({ r, onSaved }) => {
  const [reply, setReply] = useState(r.reply || "");
  const save = async (body, msg) => {
    try {
      await api.patch(`/admin/reviews/${r.id}`, body);
      toast.success(msg);
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <div data-testid={`admin-review-${r.id}`} className="space-y-3 rounded-3xl border border-border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3"><Stars value={r.rating} /><span className="text-sm font-bold">{r.customer_name}</span></div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${STATUS[r.status]}`}>{r.status}</span>
      </div>
      <p className="text-sm">{r.comment || <i className="text-muted-foreground">No comment</i>}</p>
      <p className="text-xs text-muted-foreground">Order {r.order_number} · {r.products.join(", ")} · {istDateTime(r.created_at)}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input data-testid={`admin-review-reply-${r.id}`} value={reply} maxLength={300} onChange={(e) => setReply(e.target.value)} placeholder="Write a public reply (optional)"
          className="min-w-0 flex-1 rounded-xl border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink" />
        <button data-testid={`admin-review-save-reply-${r.id}`} onClick={() => save({ reply }, "Reply saved")} className="rounded-full border border-choco px-4 py-2 text-xs font-bold">Save reply</button>
      </div>
      <div className="flex gap-2">
        {r.status !== "approved" && <button data-testid={`admin-review-approve-${r.id}`} onClick={() => save({ status: "approved", reply }, "Review published")} className="rounded-full bg-pistachio px-4 py-2 text-xs font-bold text-white">Approve</button>}
        {r.status !== "hidden" && <button data-testid={`admin-review-hide-${r.id}`} onClick={() => save({ status: "hidden" }, "Review hidden")} className="rounded-full border-2 border-strawberry px-4 py-2 text-xs font-bold text-strawberry">Hide</button>}
      </div>
    </div>
  );
};

export default function AdminReviews() {
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState(null);
  const load = () => api.get("/admin/reviews", { params: { status: tab || undefined } }).then(({ data }) => setRows(data)).catch(() => setRows([]));
  useEffect(() => {
    setRows(null);
    load();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-3xl space-y-6" data-testid="admin-reviews">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Reviews</h1>
        <p className="text-sm text-muted-foreground">New reviews stay hidden until you approve them. Only the customer's first name is shown publicly.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map(([k, l]) => <button key={k} data-testid={`admin-reviews-tab-${k || "all"}`} onClick={() => setTab(k)} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === k ? "bg-choco text-cream" : "border border-border"}`}>{l}</button>)}
      </div>
      {!rows ? <PageLoader /> : rows.length ? rows.map((r) => <ReviewRow key={r.id} r={r} onSaved={load} />)
        : <p data-testid="admin-reviews-empty" className="rounded-3xl border-2 border-dashed border-border p-10 text-center text-sm text-muted-foreground">No reviews here yet.</p>}
    </div>
  );
}
