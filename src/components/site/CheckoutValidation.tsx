import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { checkoutValidationText, fmt, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const ValidationContext = createContext<{ errors: string[]; lang: Lang; compactErrors: boolean }>({ errors: [], lang: "pt", compactErrors: false });
export function CheckoutValidation({ errors, labels, lang, children, compactErrors = false }: { errors: string[]; labels: Record<string, string>; lang: Lang; children: ReactNode; compactErrors?: boolean }) {
  return <ValidationContext.Provider value={{ errors, lang, compactErrors }}>
    {errors.length > 0 && <div id="checkout-validation-banner" role="alert" data-testid="checkout-validation-alert" className="mb-5 rounded-xl border border-destructive bg-card p-4 text-sm text-destructive">{fmt(checkoutValidationText[lang].missing, { fields: [...new Set(errors.map(key => labels[key] ?? key))].join(", ") })}</div>}
    {children}
  </ValidationContext.Provider>;
}
export function ValidationField({ id, children, className }: { id: string; children: ReactNode; className?: string | undefined }) {
  const { errors, lang, compactErrors } = useContext(ValidationContext);
  const invalid = errors.includes(id);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelectorAll("input, select, button, iframe").forEach(control => {
      control.setAttribute("aria-invalid", String(invalid));
      if (invalid) control.setAttribute("aria-describedby", compactErrors ? "checkout-validation-banner" : `validation-${id}`);
      else if ([`validation-${id}`, "checkout-validation-banner"].includes(control.getAttribute("aria-describedby") ?? "")) control.removeAttribute("aria-describedby");
    });
  }, [invalid, children, id, compactErrors]);
  return <div ref={ref} data-validation-field={id} tabIndex={-1} className={cn("min-w-0", invalid && (compactErrors ? "rounded-2xl ring-1 ring-destructive/60" : "rounded-xl border border-destructive p-2 [&_input]:border-destructive! [&_select]:border-destructive! [&_button]:border-destructive!"), className)}>
    {children}{invalid && !compactErrors && <p id={`validation-${id}`} className="mt-1 text-xs text-destructive">{checkoutValidationText[lang].required}</p>}
  </div>;
}
export function focusCheckoutError(fields: string[]) {
  requestAnimationFrame(() => {
    const element = fields.map(id => document.querySelector<HTMLElement>(`[data-validation-field="${id}"]`)).find(el => el && el.getClientRects().length);
    if (!element) return;
    element.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    const control = element.querySelector<HTMLElement>('input:not([type="hidden"]):not(.hidden):not(:disabled), select:not(:disabled), button:not(:disabled), iframe');
    (control ?? element).focus({ preventScroll: true });
  });
}