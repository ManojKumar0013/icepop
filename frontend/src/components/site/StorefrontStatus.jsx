import { Loader2 } from "lucide-react";
import { useLang } from "@/context/LangContext";

export function StorefrontStatus({ request, label, testid }) {
  const { t } = useLang();

  return (
    <div className="rounded-3xl border-2 border-dashed border-border bg-white/60 p-8 text-center text-sm text-muted-foreground" data-testid={testid}>
      {request.error ? (
        <>
          <p role="alert">{t("We couldn’t load this information.")}</p>
          <button type="button" onClick={request.retry} className="mt-2 font-bold text-strawberry hover:underline">{t("Try again")}</button>
        </>
      ) : (
        <p role="status" className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t(label)}
        </p>
      )}
    </div>
  );
}
