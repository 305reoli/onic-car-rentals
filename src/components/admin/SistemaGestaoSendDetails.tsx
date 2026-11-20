import { sistemagestaoSendText, type Lang } from "@/lib/i18n";
type Send = { created_at: string; detail: unknown };
export const agreementTotalOf = (d: Record<string, unknown>): number | undefined => typeof d["agreement_total"] === "number" ? d["agreement_total"] : typeof d["agreement_total_cents"] === "number" ? Number(d["agreement_total_cents"]) / 100 : undefined;
const value = (x: unknown): string => x === undefined || x === null ? "—" : typeof x === "object" ? JSON.stringify(x) : String(x);
export function SistemaGestaoSendDetails({ sends, lang }: { sends: Send[]; lang: Lang }) {
  const tx = sistemagestaoSendText[lang];
  if (!sends.length) return null;
  return <div className="mt-3 w-full space-y-2 text-foreground" data-testid="sistemagestao-send-details">
    {sends.map((send, index) => {
      const d = (send.detail ?? {}) as Record<string, unknown>;
      return <details key={`${send.created_at}-${index}`} open={index === 0} className="border-t border-border pt-2">
        <summary className="cursor-pointer text-muted-foreground">{tx.send} · {new Date(send.created_at).toLocaleString()} · {d["ok"] === true ? tx.received : tx.failed}{d["duplicate"] === true ? ` · ${tx.duplicate}` : ""}</summary>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          {([ ["documents_received", tx.documentsReceived], ["documents_stored", tx.documentsStored], ["agreement_status", tx.agreementStatus], ["agreement_number", tx.agreementNumber], ["agreement_total", tx.agreementTotal], ["email_sent", tx.emailSent], ["email_recipient", tx.recipient], ["needs_owner_attention", tx.attention], ["reason", tx.reason] ] as const).map(([key, label]) => <div key={key} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="break-words">{key === "agreement_total" && agreementTotalOf(d) !== undefined ? `$${agreementTotalOf(d)!.toFixed(2)} USD` : value(d[key])}</dd></div>)}
        </dl>
      </details>;
    })}
  </div>;
}