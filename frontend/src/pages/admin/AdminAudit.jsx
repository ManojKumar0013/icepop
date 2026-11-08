import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageLoader } from "@/components/site/Guards";
import { istDateTime } from "@/lib/format";

export default function AdminAudit() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api.get("/admin/audit-logs").then(({ data }) => setRows(data)).catch(() => setRows([]));
  }, []);
  if (!rows) return <PageLoader />;
  return (
    <div className="space-y-6" data-testid="admin-audit">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Audit log</h1>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="audit-empty">No admin changes recorded yet.</p> : (
        <div className="overflow-x-auto rounded-3xl border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-cream-deep text-left text-xs uppercase tracking-wider"><tr><th className="p-3">When</th><th className="p-3">Who</th><th className="p-3">Action</th><th className="p-3">Target</th><th className="p-3">Details</th></tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} data-testid={`audit-row-${r.id}`}>
                  <td className="whitespace-nowrap p-3">{istDateTime(r.created_at)}</td><td className="p-3">{r.actor}</td>
                  <td className="p-3 font-semibold">{r.action.replaceAll("_", " ")}</td><td className="p-3">{r.entity} {r.entity_id}</td>
                  <td className="max-w-xs truncate p-3 font-mono text-xs" title={JSON.stringify(r.details)}>{JSON.stringify(r.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
