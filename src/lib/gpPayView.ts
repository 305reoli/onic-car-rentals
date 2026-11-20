// Pure text model for the Global Pays payment option (tested). BRL figures only from the provider quote.
import { fmt } from "@/lib/i18n";
import { usd2 } from "@/lib/pricing";
export type GpQuote = { amountUsd: number; pix: GpQuoteOption | null; card1x: GpQuoteOption | null; installments: { n: number; each: number; total: number; interest: boolean }[] };
export type GpQuoteOption = { totalUsd: number; feeUsd: number; exchange: number; brl: number };

export type GpText = { gpCharge: string; gpSignal: string; gpFull: string; gpApproval: string; quoteTitle: string; pix: string; card1x: string; inst: string; rate: string; fee: string; quoteNote: string; noQuote: string };
const brl = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function gpPayView(t: GpText, amount: number | null, mode: "full" | "signal", quote: GpQuote | null) {
  const charge = amount != null ? `${t.gpCharge}: ${usd2(amount)} USD` : "";
  const nature = t.gpFull;
  if (!quote) return { charge, nature, approval: t.gpApproval, quoteLines: [] as string[], quoteNote: t.noQuote };
  const line = (label: string, o: { brl: number; exchange: number; feeUsd: number } | null) =>
    o ? `${label}: R$ ${brl(o.brl)} · ${fmt(t.rate, { r: o.exchange.toFixed(4) })}${o.feeUsd > 0 ? ` · ${fmt(t.fee, { f: o.feeUsd.toFixed(2) })}` : ""}` : null;
  const top = [...quote.installments].sort((a, b) => b.n - a.n)[0];
  const lines = [line(t.pix, quote.pix), line(t.card1x, quote.card1x), top && top.n > 1 ? fmt(t.inst, { n: top.n, each: brl(top.each), total: brl(top.total) }) : null].filter((x): x is string => !!x);
  return { charge, nature, approval: t.gpApproval, quoteLines: lines, quoteNote: t.quoteNote };
}
