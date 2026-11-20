import { CreditCard } from "lucide-react";
import { paymentOptionText, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Familiar method marks use the site's tokens, without fetching third-party media. */
function CardMarks() {
  return <span className="flex flex-wrap items-center gap-3 text-foreground" aria-label="Visa, Mastercard, Amex">
    <span className="text-xs font-bold italic">VISA</span>
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold"><span className="relative inline-flex h-4 w-6" aria-hidden="true"><span className="absolute left-0 size-4 rounded-full border border-foreground" /><span className="absolute right-0 size-4 rounded-full border border-foreground bg-foreground/20" /></span>Mastercard</span>
    <span className="border border-border px-1 py-0.5 text-[10px] font-bold">AMEX</span>
  </span>;
}

function PixMark() {
  return <svg viewBox="0 0 24 24" className="size-7 shrink-0 text-primary" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 3 3-2 3 2 6 6 2 3-2 3-6 6-3 2-3-2-6-6-2-3 2-3Z" /><path d="M3 8h4l5 5 5-5h4M3 16h4l5-5 5 5h4" /></svg>;
}

export function PaymentMethodCards({ lang, value, onChange, legend, hideMarks = false }: { lang: Lang; value: "card" | "gp"; onChange: (value: "card" | "gp") => void; legend: string; hideMarks?: boolean }) {
  const tx = paymentOptionText[lang];
  return <fieldset className="grid gap-3 text-sm" data-testid="pay-methods">
    <legend className="mb-3 font-semibold">{legend}</legend>
    {(["card", "gp"] as const).map(method => {
      const selected = value === method;
      const gp = method === "gp";
      return <label key={method} data-testid={`payment-option-${method}`} className={cn("flex min-h-32 cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-ring", selected ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/50")}>
        <input type="radio" name="payMethod" checked={selected} onChange={() => onChange(method)} data-testid={`pay-${method}`} className="mt-1 size-4 shrink-0 accent-primary" />
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="flex items-center gap-2">{gp ? <PixMark /> : <CreditCard className="size-6 shrink-0 text-primary" aria-hidden="true" />}<span className="text-base font-semibold leading-snug text-foreground">{gp ? <><strong className="text-lg font-bold text-primary">{tx.pix}</strong> {tx.gpTitle}</> : tx.stripeTitle}</span></span>
          {gp && <span className="w-fit max-w-full rounded-lg bg-checkout-action px-3 py-2 text-sm font-bold leading-snug text-checkout-action-foreground">{tx.installments}</span>}
          <span className="text-xs leading-relaxed text-muted-foreground">{gp ? tx.gpBenefit : tx.stripeBenefit}</span>
          {!hideMarks && <span className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2"><CardMarks /><span className="text-[11px] text-muted-foreground">({gp ? "Global Pays" : "Stripe"})</span></span>}
        </span>
      </label>;
    })}
  </fieldset>;
}