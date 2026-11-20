import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { fieldCls } from "@/components/site/SearchBox";
import { durationTiers, promoOverlaps, promoStatus } from "@/lib/pricing";

export const Route = createFileRoute("/_authenticated/admin/promotions")({ component: PromotionsPage });

type Promo = { id: string; vehicle_id: string; pct: number; starts_on: string; ends_on: string; active: boolean };
const STATUS: Record<ReturnType<typeof promoStatus>, string> = { active: "Active", scheduled: "Scheduled", expired: "Expired", inactive: "Inactive" };
const friendly = (m: string) => m.includes("PROMO_OVERLAP") ? "This car already has a promotion overlapping these dates." : m.includes("PROMO_DATES") ? "End date must be on or after the start date." : m.includes("PROMO_PCT") ? "Percentage must be between 1 and 100." : m.includes("PROMO_PRICELESS") ? "Cars without a daily price cannot have promotions." : m;

function PromotionsPage() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-3xl">Promoções e Descontos</h1>
      <TierSection />
      <PromoSection />
    </div>
  );
}

function TierSection() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-tiers"], queryFn: async () => (await supabase.from("settings").select("duration_tiers").eq("id", 1).single()).data });
  const [t, setT] = useState({ two: "5", three: "10" });
  useEffect(() => { if (data) { const d = durationTiers(data.duration_tiers); setT({ two: String(d.two), three: String(d.three) }); } }, [data]);
  const save = async () => {
    const two = Number(t.two), three = Number(t.three);
    if (![two, three].every((n) => t.two !== "" && t.three !== "" && Number.isFinite(n) && n >= 0 && n <= 100)) return void toast.error("Each tier must be between 0 and 100.");
    const { error } = await supabase.from("settings").update({ duration_tiers: { two, three }, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) return void toast.error(error.message);
    toast.success("Multi-day tier saved");
    qc.invalidateQueries({ queryKey: ["admin-tiers"] }); qc.invalidateQueries({ queryKey: ["settings"] });
  };
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-xl">A. Multi-day discount (Sports + Exotics only)</h2>
      <p className="mt-1 text-sm text-muted-foreground">Applies to the rental rate only. December days are never discounted; the tier counts only non-December days.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="text-sm">2 days (%)<input className={fieldCls} type="number" min={0} max={100} value={t.two} onChange={(e) => setT({ ...t, two: e.target.value })} /></label>
        <label className="text-sm">3+ days (%)<input className={fieldCls} type="number" min={0} max={100} value={t.three} onChange={(e) => setT({ ...t, three: e.target.value })} /></label>
        <div className="flex items-end"><Button onClick={save}>Save tier</Button></div>
      </div>
    </section>
  );
}

function PromoSection() {
  const qc = useQueryClient();
  const { data: cars = [] } = useQuery({ queryKey: ["admin-promo-cars"], queryFn: async () => (await supabase.from("vehicles").select("id, name, city, slug, daily_price_usd").order("city").order("name")).data ?? [] });
  const { data: promos = [] } = useQuery({ queryKey: ["admin-promos"], queryFn: async () => ((await supabase.from("vehicle_promotions").select("*").order("starts_on", { ascending: false })).data ?? []) as Promo[] });
  const priced = cars.filter((c) => Number(c.daily_price_usd) > 0);
  const carLabel = (id: string) => { const c = cars.find((x) => x.id === id); return c ? `${c.name} — ${c.city} — ${c.slug}` : id.slice(0, 8); };
  const empty = { id: "", vehicle_id: "", pct: "", starts_on: "", ends_on: "", active: true };
  const [f, setF] = useState(empty);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin-promos"] }); qc.invalidateQueries({ queryKey: ["settings"] }); };

  const save = async () => {
    const pct = Number(f.pct);
    if (!f.vehicle_id) return void toast.error("Choose a car.");
    if (!Number.isInteger(pct) || pct < 1 || pct > 100) return void toast.error("Percentage must be a whole number between 1 and 100.");
    if (!f.starts_on || !f.ends_on) return void toast.error("Choose start and end dates.");
    if (f.ends_on < f.starts_on) return void toast.error("End date must be on or after the start date.");
    if (f.active && promos.some((p) => p.id !== f.id && p.active && p.vehicle_id === f.vehicle_id && promoOverlaps(p, f))) return void toast.error("This car already has a promotion overlapping these dates.");
    const row = { vehicle_id: f.vehicle_id, pct, starts_on: f.starts_on, ends_on: f.ends_on, active: f.active };
    const { error } = f.id ? await supabase.from("vehicle_promotions").update(row).eq("id", f.id) : await supabase.from("vehicle_promotions").insert(row);
    if (error) return void toast.error(friendly(error.message));
    toast.success(f.id ? "Promotion updated" : "Promotion created");
    setF(empty); refresh();
  };
  const toggle = async (p: Promo) => {
    const { error } = await supabase.from("vehicle_promotions").update({ active: !p.active }).eq("id", p.id);
    if (error) return void toast.error(friendly(error.message));
    refresh();
  };
  // In-app confirmation: the browser's native confirm() is silently suppressed in embedded/sandboxed contexts.
  const [pending, setPending] = useState<Promo | null>(null);
  const remove = async (p: Promo) => {
    setPending(null);
    const { data, error } = await supabase.from("vehicle_promotions").delete().eq("id", p.id).select("id");
    if (error) return void toast.error(`Could not delete promotion: ${friendly(error.message)}`);
    if (!data?.length) return void toast.error("Could not delete promotion: not permitted or already removed.");
    toast.success("Promotion deleted");
    refresh();
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-xl">B. Per-car promotions</h2>
      <p className="mt-1 text-sm text-muted-foreground">Rental rate only, dates inclusive. December days are never discounted. On each day the higher of the promotion and the multi-day tier applies — never both.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <label className="text-sm md:col-span-2">Car<select className={fieldCls} value={f.vehicle_id} onChange={(e) => setF({ ...f, vehicle_id: e.target.value })}>
          <option value="">Choose a car…</option>
          {priced.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.city} — {c.slug}</option>)}
        </select></label>
        <label className="text-sm">Discount (%)<input className={fieldCls} type="number" min={1} max={100} value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} /></label>
        <label className="text-sm">Start<input className={fieldCls} type="date" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} /></label>
        <label className="text-sm">End (inclusive)<input className={fieldCls} type="date" value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} /></label>
      </div>
      <div className="mt-3 flex gap-2"><Button onClick={save}>{f.id ? "Save changes" : "Create promotion"}</Button>{f.id && <Button variant="outline" onClick={() => setF(empty)}>Cancel</Button>}</div>

      <div className="mt-6 flex flex-col gap-2">
        {promos.length === 0 && <p className="text-sm text-muted-foreground">No promotions yet.</p>}
        {promos.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
            <div><div className="font-medium">{carLabel(p.vehicle_id)}</div><div className="text-muted-foreground">−{p.pct}% · {p.starts_on} → {p.ends_on}</div></div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{STATUS[promoStatus(p)]}</span>
              <label className="flex items-center gap-1 text-xs">On<Switch checked={p.active} onCheckedChange={() => toggle(p)} /></label>
              <Button size="sm" variant="outline" onClick={() => setF({ id: p.id, vehicle_id: p.vehicle_id, pct: String(p.pct), starts_on: p.starts_on, ends_on: p.ends_on, active: p.active })}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => setPending(p)} aria-label="Delete promotion"><Trash2 className="size-4" /></Button>
            </div>
          </div>
        ))}
      </div>
      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete promotion?</AlertDialogTitle>
            <AlertDialogDescription>{pending ? `Delete the ${pending.pct}% promotion for ${carLabel(pending.vehicle_id)} (${pending.starts_on} → ${pending.ends_on})? This cannot be undone.` : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pending && remove(pending)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete promotion?</AlertDialogTitle>
            <AlertDialogDescription>{pending ? `Delete the ${pending.pct}% promotion for ${carLabel(pending.vehicle_id)} (${pending.starts_on} → ${pending.ends_on})? This cannot be undone.` : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pending && remove(pending)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
