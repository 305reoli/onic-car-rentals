import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dismissOrphan, listPaymentProblems, recoverPayment } from "@/services/admin.functions";
import { usd2 } from "@/lib/pricing";

/** Admin: paid Stripe payments that did not become a booking, with an idempotent Recover action. */
export function PaymentProblems() {
  const list = useServerFn(listPaymentProblems), recover = useServerFn(recoverPayment), dismiss = useServerFn(dismissOrphan);
  const qc = useQueryClient();
  const { data, isPending, isError } = useQuery({ queryKey: ["payment-problems"], queryFn: () => list(), refetchInterval: 60000 });
  const [busy, setBusy] = useState("");
  const run = async (key: string, input: { orphanId?: string; bookingId?: string }) => {
    if (!window.confirm("Create the booking from this verified paid payment? This never creates a duplicate.")) return;
    setBusy(key);
    const r = await recover({ data: input }).catch((e) => ({ ok: false as const, error: String(e?.message ?? e) }));
    setBusy("");
    if (r.ok) { toast.success(r.outcome === "already" ? "Booking already existed" : "Booking created"); qc.invalidateQueries(); } else toast.error(r.error);
  };
  const count = (data?.orphans.length ?? 0) + (data?.stuck.length ?? 0);
  return (
    <section className={`surface flex flex-col gap-3 p-5 text-sm ${count ? "border-destructive" : ""}`} data-testid="payment-problems">
      <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" />Orphaned payments / Failed booking creation {count ? `(${count})` : ""}</div>
      {isPending ? <p>…</p> : isError ? <p className="text-destructive">Could not load.</p> : !count ? <p className="text-muted-foreground">None — every paid payment has a booking.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-left">
          <thead className="text-xs text-muted-foreground"><tr><th className="p-2">Date</th><th className="p-2">Customer</th><th className="p-2">Amount</th><th className="p-2">Stripe</th><th className="p-2">Reason</th><th className="p-2" /></tr></thead>
          <tbody>
            {data!.orphans.map((o) => <tr key={o.id} className="border-t border-border align-top"><td className="p-2">{new Date(o.created_at).toLocaleString()}</td><td className="p-2">{o.customer_name ?? "—"}<br /><span className="text-xs text-muted-foreground">{o.customer_email ?? ""}</span></td><td className="p-2">{o.amount_usd == null ? "—" : usd2(Number(o.amount_usd))}</td><td className="p-2 font-mono text-xs">{o.stripe_session_id ?? ""}<br />{o.stripe_payment_intent_id ?? ""}</td><td className="p-2">{o.reason}</td><td className="flex flex-col gap-1 p-2"><Button size="sm" disabled={busy === o.id} onClick={() => run(o.id, { orphanId: o.id })}>Recover booking</Button><Button size="sm" variant="outline" onClick={async () => { if (window.confirm("Hide this record (e.g. refunded in Stripe)?")) { await dismiss({ data: { id: o.id } }); qc.invalidateQueries({ queryKey: ["payment-problems"] }); } }}>Dismiss</Button></td></tr>)}
            {data!.stuck.map((b) => <tr key={b.id} className="border-t border-border align-top"><td className="p-2">{new Date(b.created_at).toLocaleString()}</td><td className="p-2">{b.first_name} {b.last_name}<br /><span className="text-xs text-muted-foreground">{b.email}</span></td><td className="p-2">{usd2(Number(b.paid_amount_usd ?? b.prereservation_amount_usd))}</td><td className="p-2 font-mono text-xs">{b.stripe_session_id ?? ""}<br />{b.stripe_payment_intent_id ?? ""}</td><td className="p-2">Paid in Stripe ({b.stripe_status}) but booking still unfinished — {b.vehicle_name} · {b.id.slice(0, 8)}</td><td className="p-2"><Button size="sm" disabled={busy === b.id} onClick={() => run(b.id, { bookingId: b.id })}>Recover booking</Button></td></tr>)}
          </tbody>
        </table></div>
      )}
    </section>
  );
}
