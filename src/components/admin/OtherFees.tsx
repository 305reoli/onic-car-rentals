import { useState } from "react";
import { GripVertical, Trash2, Plus } from "lucide-react";
import type { CustomFee } from "@/lib/pricing";
import { fieldCls } from "@/components/site/SearchBox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CATS = ["suv", "sedan", "luxury", "sports", "exotics"];
const CITIES: [string, string][] = [["orlando", "Orlando"], ["tampa", "Tampa"], ["miami", "Miami"], ["fort-lauderdale", "Fort Lauderdale"]];
const blank = (): CustomFee => ({ id: crypto.randomUUID(), name_en: "", name_pt: "", name_es: "", type: "fixed", amount: 0, pct_base: "subtotal", applies: "all", categories: [], cities: [], mode: "mandatory", taxable: true, active: true });

/** "Other fees" list: add / edit / delete / drag to reorder. Saved with the Delivery & add-ons settings. */
export function OtherFees({ fees, onChange }: { fees: CustomFee[]; onChange: (f: CustomFee[]) => void }) {
  const [drag, setDrag] = useState<number | null>(null);
  const set = (i: number, patch: Partial<CustomFee>) => onChange(fees.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const sel = cn(fieldCls, "h-10");
  return (
    <section className="flex flex-col gap-3" data-testid="other-fees">
      <h3 className="font-semibold">Other fees</h3>
      <p className="text-xs text-muted-foreground">Optional extra lines in checkout. Percentages are computed after all other lines. Changes apply to new checkouts only; existing bookings keep their stored fees.</p>
      {fees.length === 0 && <p className="text-xs text-muted-foreground">No other fees.</p>}
      {fees.map((f, i) => (
        <div key={f.id} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()}
          onDrop={() => { if (drag == null || drag === i) return; const n = [...fees]; const [m] = n.splice(drag, 1); n.splice(i, 0, m!); onChange(n); setDrag(null); }}
          className={cn("flex flex-col gap-3 rounded-2xl border border-border p-4", !f.active && "opacity-60")} data-testid="fee-row">
          <div className="flex items-center gap-2">
            <GripVertical className="size-4 cursor-grab text-muted-foreground" aria-label="Drag to reorder" />
            <span className="flex-1 font-semibold">{f.name_en || "New fee"}</span>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.active} onChange={(e) => set(i, { active: e.target.checked })} />Active</label>
            <button type="button" aria-label="Delete fee" className="text-destructive" onClick={() => onChange(fees.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {(["en", "pt", "es"] as const).map((l) => (
              <label key={l} className="flex flex-col gap-1 text-xs text-muted-foreground">Name ({l.toUpperCase()}{l === "en" ? ", required" : ", empty = EN"})
                <input className={sel} value={f[`name_${l}`]} aria-label={`Fee name ${l}`} onChange={(e) => set(i, { [`name_${l}`]: e.target.value } as Partial<CustomFee>)} /></label>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Type
              <select className={sel} value={f.type} aria-label="Fee type" onChange={(e) => set(i, { type: e.target.value as CustomFee["type"] })}>
                <option value="fixed">Fixed per booking ($)</option><option value="per_day">Per day ($ × days)</option><option value="percent">Percentage (%)</option>
              </select></label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">{f.type === "percent" ? "Rate (%)" : "Amount (USD)"}
              <input type="number" min={0} step="any" className={sel} value={f.amount} aria-label="Fee amount" onChange={(e) => set(i, { amount: Number(e.target.value) })} /></label>
            {f.type === "percent" && (
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">Percentage of
                <select className={sel} value={f.pct_base} aria-label="Percentage base" onChange={(e) => set(i, { pct_base: e.target.value as CustomFee["pct_base"] })}>
                  <option value="subtotal">Subtotal before tax</option><option value="rental">Rental only</option>
                </select></label>
            )}
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Mode
              <select className={sel} value={f.mode} aria-label="Fee mode" onChange={(e) => set(i, { mode: e.target.value as CustomFee["mode"] })}>
                <option value="mandatory">Mandatory (always added)</option><option value="optional">Optional (customer ticks it)</option>
              </select></label>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Applies to
              <select className={sel} value={f.applies} aria-label="Applies to" onChange={(e) => set(i, { applies: e.target.value as CustomFee["applies"] })}>
                <option value="all">All cars</option><option value="non_exotic">Non-exotic only</option><option value="exotic">Exotic only</option><option value="categories">Specific categories</option>
              </select></label>
            <label className="flex items-center gap-2 self-end pb-2 text-xs"><input type="checkbox" checked={f.taxable} onChange={(e) => set(i, { taxable: e.target.checked })} />Taxable (added before tax; off = added after tax)</label>
          </div>
          {f.applies === "categories" && (
            <div className="flex flex-wrap gap-4 text-xs">{CATS.map((c) => <label key={c} className="flex items-center gap-2"><input type="checkbox" checked={f.categories.includes(c)} onChange={() => set(i, { categories: toggle(f.categories, c) })} />{c}</label>)}</div>
          )}
          <div className="flex flex-wrap gap-4 text-xs"><span className="text-muted-foreground">Service cities (none ticked = all):</span>
            {CITIES.map(([k, n]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={f.cities.includes(k)} onChange={() => set(i, { cities: toggle(f.cities, k) })} />{n}</label>)}</div>
        </div>
      ))}
      <Button type="button" variant="outline" className="self-start" onClick={() => onChange([...fees, blank()])}><Plus className="size-4" />Add fee</Button>
    </section>
  );
}
