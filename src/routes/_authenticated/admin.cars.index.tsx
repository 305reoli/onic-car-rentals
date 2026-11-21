import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { photoUrl, type AdminVehicle as Vehicle } from "@/lib/vehicles";
import { effectiveMinDays } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { fieldCls } from "@/components/site/SearchBox";

import { inCategory, PUBLIC_CATEGORIES } from "@/lib/vehicles";
const CAT_LABEL = { suv: "SUV", sedan: "Sedan", luxury: "Luxury", convertible: "Convertible", sports: "Sports", exotics: "Exotics" } as const;

export const Route = createFileRoute("/_authenticated/admin/cars/")({ head: () => ({ meta: [{ title: "Fleet — Onic Car Rentals admin" }, { name: "description", content: "Manage vehicle listings and internal fleet codes." }, { property: "og:title", content: "Fleet — Onic Car Rentals admin" }, { property: "og:description", content: "Manage vehicle listings and internal fleet codes." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: CarsPage });

function CarsPage() {
  const qc = useQueryClient();
  const { data: cars = [] } = useQuery({ queryKey: ["admin-cars"], queryFn: async () => (await supabase.from("vehicles").select("*").order("city").order("sort_order")).data ?? [] });
  const { data: cities = [] } = useQuery({ queryKey: ["admin-cities"], queryFn: async () => (await supabase.from("cities").select("*").order("sort_order")).data ?? [] });
  const { data: st } = useQuery({ queryKey: ["admin-settings"], queryFn: async () => (await supabase.from("settings").select("*").eq("id", 1).single()).data });
  const minRaw = (st as { min_days_by_category?: unknown } | null | undefined)?.min_days_by_category;
  const PENDING = "Min days: pending owner decision (3 vs 1)"; // legacy tag; no car carries it after the owner decision
  const stripPending = (n: string | null) => (n ?? "").replace(PENDING, "").replace(/^\s*·\s*|\s*·\s*$/g, "").trim() || "";
  const [q, setQ] = useState("");
  const [city, setCity] = useState("all");
  const [owner, setOwner] = useState("all");
  const [cat, setCat] = useState("all");
  const [missing, setMissing] = useState(false);
  const needs = (v: Vehicle) => v.security_deposit_usd == null;
  const missingCount = cars.filter(needs).length;
  const [sel, setSel] = useState<Set<string>>(new Set());
  const bulkInstant = async (on: boolean) => {
    if (!sel.size) return;
    const { error } = await supabase.from("vehicles").update({ instant_full_booking: on, updated_at: new Date().toISOString() }).in("id", [...sel]);
    if (error) toast.error(error.message); else { toast.success(`${sel.size} car(s) updated`); setSel(new Set()); refresh(); }
  };
  const list = cars.filter((v) => (!missing || needs(v)) && (city === "all" || v.city === city) && (cat === "all" || inCategory(v, cat)) && (owner === "all" || (owner === "unset" ? v.owner_type == null : v.owner_type === owner)) && [v.name, v.internal_label, v.color, v.city].join(" ").toLowerCase().includes(q.toLowerCase()));
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin-cars"] }); qc.invalidateQueries({ queryKey: ["vehicles"] }); qc.invalidateQueries({ queryKey: ["vehicle"] }); };

  const patch = async (id: string, p: Partial<Vehicle>) => {
    const { error } = await supabase.from("vehicles").update({ ...p, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Saved"); refresh(); }
  };
  const duplicate = async (v: Vehicle) => {
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = v;
    const { error } = await supabase.from("vehicles").insert({ ...rest, internal_label: "", name: `${v.name} (copy)`, slug: `${v.slug}-copy-${Date.now().toString(36)}`, active: false, is_sample: false }).select("id").single();
    if (error) toast.error(error.message); else { toast.success("Duplicated (hidden)"); refresh(); }
  };
  const remove = async (id: string) => {
    const { data, error } = await supabase.from("vehicles").delete().eq("id", id).select("id");
    if (error) return void toast.error(error.message);
    if (!data?.length) return void toast.error("Car was not deleted (not permitted or already removed).");
    toast.success("Deleted"); refresh();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Cars</h1>
        <Button asChild><Link to="/admin/cars/$id" params={{ id: "new" }}><Plus />Add car</Link></Button>
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-[1fr_170px_150px_150px]">
        <input placeholder="Search cars…" className={fieldCls} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={fieldCls} value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="all">All cities</option>
          {cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <select className={fieldCls} value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="all">Any owner</option><option value="own">Own cars</option><option value="partner">Partner cars</option><option value="unset">Owner not set</option>
        </select>
        <select className={fieldCls} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">All categories</option>
          {PUBLIC_CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
        </select>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-full bg-amber-500/15 px-3 py-1 font-semibold text-amber-400">{missingCount} car{missingCount === 1 ? "" : "s"} still need deposit/min days</span>
        <label className="flex items-center gap-2 text-muted-foreground"><Switch checked={missing} onCheckedChange={setMissing} />Missing deposit / min days</label>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{sel.size} selected</span>
        <Button size="sm" variant="outline" onClick={() => setSel(new Set(list.map((v) => v.id)))}>Select all shown</Button>
        <Button size="sm" variant="outline" disabled={!sel.size} onClick={() => bulkInstant(true)}>Instant full booking: ON</Button>
        <Button size="sm" variant="outline" disabled={!sel.size} onClick={() => bulkInstant(false)}>Instant full booking: OFF</Button>
        {sel.size > 0 && <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Clear</Button>}
      </div>
      <div className="flex flex-col gap-3">
        {list.map((v) => (
          <div key={v.id} className="surface flex flex-wrap items-center gap-4 p-3">
            <input type="checkbox" aria-label={`Select ${v.name}`} className="size-4 accent-primary" checked={sel.has(v.id)} onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(v.id) : n.delete(v.id); return n; })} />
            <img src={photoUrl(v.photos[0])} alt="" className="h-16 w-24 shrink-0 rounded-xl object-cover" />
            <div className="min-w-40 flex-1">
              <div className="font-semibold">{v.name}{v.internal_label && <span className="ml-1 text-muted-foreground">{v.internal_label}</span>} {(v.internal_label || cars.filter((x) => x.city === v.city && x.name === v.name).length > 1) && <span className="ml-1 rounded-full border border-primary px-2 text-[10px] text-primary">Review duplicate</span>}{v.admin_note && <span className="ml-1 rounded-full bg-secondary px-2 text-[10px]" title={v.admin_note}>Confirm spec</span>}{v.is_sample && <span className="ml-1 rounded-full bg-secondary px-2 text-[10px]">SAMPLE</span>}{v.review_category && <span className="ml-1 rounded-full border border-primary px-2 text-[10px] text-primary">Review category</span>}{v.daily_price_usd == null && <span className="ml-1 rounded-full border border-primary px-2 text-[10px] text-primary">Missing price</span>}{v.instant_full_booking && <span className="ml-1 rounded-full bg-primary px-2 text-[10px] text-primary-foreground">Instant full booking</span>}</div>
              <div className="text-xs text-muted-foreground">{v.color} · {cities.find((c) => c.slug === v.city)?.name ?? v.city} · {CAT_LABEL[v.body_category as "suv"] ?? v.body_category}{v.is_convertible ? " + Convertible" : ""} · tier {v.category} · {v.owner_type === "partner" ? "Partner" : v.owner_type === "own" ? "Own" : "Owner not set"} · {v.confirmation_type === "instant" ? "Instant" : "On request"}</div>
            </div>
            <div className="w-24 text-xs text-muted-foreground">Deposit<div className="text-sm text-foreground">{v.security_deposit_usd != null ? `$${Number(v.security_deposit_usd).toLocaleString("en-US")}` : <span className="ml-1 rounded-full bg-amber-500/15 px-2 text-[10px] font-semibold text-amber-400">To fill</span>}</div></div>
            <div className="w-32 text-xs text-muted-foreground" data-testid="eff-min">Min days<div className="text-sm text-foreground">{(() => { const m = effectiveMinDays(v, minRaw); return `${m.n} (${m.source === "car" ? "car override" : "category default"})`; })()}</div>
              {v.admin_note?.includes(PENDING) && <div className="mt-1 flex gap-1"><span className="rounded-full bg-amber-500/15 px-2 text-[10px] font-semibold text-amber-400">Pending</span>
                <button className="rounded-full border border-border px-2 text-[10px] text-foreground hover:border-primary" onClick={() => patch(v.id, { min_days: 3, admin_note: stripPending(v.admin_note) })}>Keep 3</button>
                <button className="rounded-full border border-border px-2 text-[10px] text-foreground hover:border-primary" onClick={() => patch(v.id, { min_days: null, admin_note: stripPending(v.admin_note) })}>Use category default</button></div>}</div>
            <label className="text-xs text-muted-foreground">$/day
              <input type="number" defaultValue={v.daily_price_usd ?? ""} placeholder="on request" className="ml-1 h-9 w-24 rounded-full border border-border bg-background px-3 text-sm text-foreground"
                onBlur={(e) => { const val = e.target.value === "" ? null : Number(e.target.value); if (val !== v.daily_price_usd) patch(v.id, { daily_price_usd: val }); }} />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={v.active} onCheckedChange={(a) => patch(v.id, { active: a })} />{v.active ? "Shown" : "Hidden"}</label>
            <div className="flex gap-1">
              <Button asChild variant="ghost" size="icon" aria-label="Edit"><Link to="/admin/cars/$id" params={{ id: v.id }}><Pencil /></Link></Button>
              <Button variant="ghost" size="icon" aria-label="Duplicate" onClick={() => duplicate(v)}><Copy /></Button>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button variant="ghost" size="icon" aria-label="Delete"><Trash2 /></Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Delete {v.name}?</AlertDialogTitle><AlertDialogDescription>This removes the car from the site and catalog. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove(v.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="text-muted-foreground">No cars match.</p>}
      </div>
    </div>
  );
}
