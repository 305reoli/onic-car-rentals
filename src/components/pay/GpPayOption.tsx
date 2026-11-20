import { ShieldCheck } from "lucide-react";
import { gpPayView, type GpQuote, type GpText } from "@/lib/gpPayView";

export function GpPayOption({ t, amount, mode, quote, hideApproval = false, hideAmount = false }: { t: GpText; amount: number | null; mode: "full" | "signal"; quote: GpQuote | null | "loading"; hideApproval?: boolean; hideAmount?: boolean }) {
  const v = gpPayView(t, amount, mode, quote === "loading" ? null : quote);
  return (
    <div className="rounded-2xl border border-border p-4 text-sm" data-testid="gp-pay">
      {!hideAmount && <div className="font-display text-xl text-primary" data-testid="gp-amount">{v.charge}</div>}
      <p className="mt-2 font-semibold" data-testid="gp-nature">{v.nature}</p>
      {!hideApproval && <p className="mt-1 text-muted-foreground">{v.approval}</p>}
      {quote === "loading" ? <p className="mt-3 text-muted-foreground">…</p> : (
        <div className="mt-3" data-testid="gp-quote">
          {v.quoteLines.length > 0 && <div className="font-semibold">{t.quoteTitle}</div>}
          {v.quoteLines.map((l) => <p key={l}>{l}</p>)}
          <p className="mt-1 flex gap-2 text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-primary" />{v.quoteNote}</p>
        </div>
      )}
    </div>
  );
}
