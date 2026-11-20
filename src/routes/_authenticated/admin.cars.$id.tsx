import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, GripVertical, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { withDepositDefault, insuranceDeductible, CATEGORIES, PRIMARY_CATEGORIES, photoUrl, type AdminVehicle as Vehicle } from "@/lib/vehicles";
import { effectiveMinDays, minDaysMap, effectiveDeliveryPrices, sameCityDeliveryOnly, type FixedDeliveryPrices, deliveryOverrides } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { fieldCls } from "@/components/site/SearchBox";
import { cn } from "@/lib/utils";
import { useLang } from "@/hooks/use-lang";
import { deliveryAdminText } from "@/lib/i18n";
import { useServerFn } from "@tanstack/react-start";
import { flushVehicleFleetSync } from "@/services/fleet-sync.functions";

export const Route = createFileRoute("/_authenticated/admin/cars/$id")({ head: () => ({ meta: [{ title: "Edit car — Onic Car Rentals admin" }, { name: "description", content: "Owner vehicle details and fixed delivery prices." }, { property: "og:title", content: "Edit car — Onic Car Rentals admin" }, { property: "og:description", content: "Owner vehicle details and fixed delivery prices." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: CarEditor });

type Form = Omit<Vehicle, "id" | "created_at" | "updated_at">;
const EMPTY: Form = {
  delivery_pricing: null, allows_one_way: true, slug: "", name: "", brand: "", model: "", city: "miami", catalog_group: "luxury_sport_exotic", category: "exotic", body_category: "suv", is_convertible: false, review_category: false, instant_full_booking: false, insurance_override: "inherit", delivery_tier_override: "inherit", payment_mode: "inherit", color: "",
  seats: 4, bags: 2, doors: 2, hp: null, transmission: "Automatic", daily_price_usd: null, min_days: null, mileage_limit: "", extra_mile_price_usd: null,
  min_age: 25, security_deposit_usd: null, insurance_deductible_usd: null, prereservation_amount_usd: null, confirmation_type: "on_request", owner_type: null, internal_label: "", admin_note: "",
  description_en: "", description_pt: "", description_es: "", highlights: [], highlights_pt: [], highlights_es: [], photos: [], blocked_dates: [], is_sample: false, sort_order: 0, active: false,
};
const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function CarEditor() {
  const flushFleet = useServerFn(flushVehicleFleetSync);
  const { id } = Route.useParams();
  const { lang } = useLang();
  const dt = deliveryAdminText[lang];
  const isNew = id === "new";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: cities = [] } = useQuery({ queryKey: ["admin-cities"], queryFn: async () => (await supabase.from("cities").select("*").order("sort_order")).data ?? [] });
  const { data: settings } = useQuery({ queryKey: ["admin-settings"], queryFn: async () => (await supabase.from("settings").select("*").eq("id", 1).single()).data });
  const { data: existing } = useQuery({ queryKey: ["admin-car", id], enabled: !isNew, queryFn: async () => (await supabase.from("vehicles").select("*").eq("id", id).single()).data });
  const { data: partner } = useQuery({ queryKey: ["admin-partner", id], enabled: !isNew, queryFn: async () => (await supabase.from("vehicle_partners").select("partner_name").eq("vehicle_id", id).maybeSingle()).data });
  const [f, setF] = useState<Form>(EMPTY);
  const [partnerName, setPartnerName] = useState("");
  useEffect(() => { if (partner) setPartnerName(partner.partner_name); }, [partner]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (existing) { const { id: _i, created_at: _c, updated_at: _u, ...rest } = existing; setF(withDepositDefault(rest)); } }, [existing]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const num = (k: keyof Form, nullable = false) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, (e.target.value === "" ? (nullable ? null : 0) : Number(e.target.value)) as never);
  const txt = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(k, e.target.value as never);

  const upload = async (files: FileList | File[]) => {
    const list = [...files].filter((x) => ["image/jpeg", "image/png", "image/webp"].includes(x.type));
    if (f.photos.length + list.length > 12) toast.error("Maximum 12 photos");
    setUploading(true);
    const added: string[] = [];
    for (const file of list.slice(0, 12 - f.photos.length)) {
      const path = `cars/${f.slug || "new"}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
      const { error } = await supabase.storage.from("vehicle-photos").upload(path, file, { contentType: file.type });
      if (error) toast.error(error.message); else added.push(path);
    }
    setUploading(false);
    setF((x) => ({ ...x, photos: [...x.photos, ...added] }));
  };
  const move = (from: number, to: number) => setF((x) => { const p = [...x.photos]; const [m] = p.splice(from, 1); p.splice(to, 0, m!); return { ...x, photos: p }; });

  const save = async () => {
    if (!f.name || !f.city) return void toast.error("Name and city are required");
    if (f.security_deposit_usd != null && !(Number(f.security_deposit_usd) > 0)) return void toast.error("Security deposit must be a positive amount (every car has a deposit). Leave it empty if you haven't decided yet.");
    const dp = effectiveDeliveryPrices(f, settings?.delivery_config);
    if (Object.values(dp).some(x => !Number.isFinite(x) || x < 0)) return void toast.error(dt.invalid);
    const payload = { ...f, internal_label: f.internal_label.trim(), slug: f.slug || slugify(f.name), updated_at: new Date().toISOString() };
    setSaving(true);
    const { data: saved, error } = isNew ? await supabase.from("vehicles").insert(payload).select("id").single() : await supabase.from("vehicles").update(payload).eq("id", id).select("id").single();
    if (!error && saved) {
      const name = f.owner_type === "partner" ? partnerName.trim() : "";
      if (name) await supabase.from("vehicle_partners").upsert({ vehicle_id: saved.id, partner_name: name, updated_at: new Date().toISOString() });
      else await supabase.from("vehicle_partners").delete().eq("vehicle_id", saved.id);
      // Durable queue is created by the vehicle-write trigger, even if this browser closes.
      void flushFleet({ data: { id: saved.id } }).catch(() => console.info("Fleet sync queued for retry"));
    }
    setSaving(false);
    if (error) return void toast.error(error.message.includes("vehicles_internal_label") ? "That internal code is already used by another car" : error.message.includes("duplicate") ? "That URL name (slug) is already used" : error.message);
    toast.success("Saved — live on the site and catalog");
    qc.invalidateQueries({ queryKey: ["admin-cars"] }); qc.invalidateQueries({ queryKey: ["vehicles"] }); qc.invalidateQueries({ queryKey: ["vehicle"] }); qc.invalidateQueries({ queryKey: ["booked"] });
    navigate({ to: "/admin/cars" });
  };

  const blocked = f.blocked_dates.map((d) => new Date(`${d}T12:00:00`));

  return (
    <div className="max-w-3xl">
      <Link to="/admin/cars" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="size-4" />Cars</Link>
      <h1 className="font-display mb-6 text-3xl">{isNew ? "Add car" : f.name}</h1>

      <Section title="Photos (up to 12, drag to reorder — first is the cover)">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
          className="grid grid-cols-3 gap-3 sm:grid-cols-4"
        >
          {f.photos.map((p, i) => (
            <div key={p + i} draggable onDragStart={() => setDragIdx(i)} onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.stopPropagation(); if (dragIdx !== null && dragIdx !== i) move(dragIdx, i); setDragIdx(null); }}
              className={cn("group relative aspect-[4/3] cursor-grab overflow-hidden rounded-xl border-2", i === 0 ? "border-primary" : "border-transparent")}>
              <img src={photoUrl(p)} alt="" className="size-full object-cover" />
              <GripVertical className="absolute left-1 top-1 size-4 text-foreground drop-shadow" />
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-background/80 p-1">
                <button className="cursor-pointer px-2 text-xs disabled:opacity-30" disabled={i === 0} onClick={() => move(i, i - 1)}>←</button>
                <button className="cursor-pointer px-2" onClick={() => set("photos", f.photos.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="size-4" /></button>
                <button className="cursor-pointer px-2 text-xs disabled:opacity-30" disabled={i === f.photos.length - 1} onClick={() => move(i, i + 1)}>→</button>
              </div>
            </div>
          ))}
          {f.photos.length < 12 && (
            <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-xs text-muted-foreground hover:border-primary">
              <Upload className="size-5" />{uploading ? "Uploading…" : "Drop or tap"}
              <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
            </label>
          )}
        </div>
      </Section>

      <Section title="Basics">
        <Grid>
          <F label="Name"><input className={fieldCls} value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value, slug: isNew ? slugify(e.target.value) : x.slug }))} /></F>
          <F label="URL name (slug)"><input className={fieldCls} value={f.slug} onChange={txt("slug")} /></F>
          <F label="Brand"><input className={fieldCls} value={f.brand} onChange={txt("brand")} /></F>
          <F label="Model (no year)"><input className={fieldCls} value={f.model} onChange={txt("model")} /></F>
          <F label="City"><select className={fieldCls} value={f.city} onChange={txt("city")}>{cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></F>
          <F label="Color"><input className={fieldCls} value={f.color} onChange={txt("color")} /></F>
          <F label="Catalog group"><select className={fieldCls} value={f.catalog_group} onChange={txt("catalog_group")}><option value="standard_family">Standard / Family</option><option value="luxury_sport_exotic">Luxury · Sport · Exotic</option></select></F>
          <F label="Public category"><select className={fieldCls} value={f.body_category} onChange={txt("body_category")}>{PRIMARY_CATEGORIES.map((c) => <option key={c} value={c}>{c === "suv" ? "SUV" : c[0]!.toUpperCase() + c.slice(1)}</option>)}</select></F>
          <F label="Catalog tier (internal reference)"><select className={fieldCls} value={f.category} onChange={txt("category")}>{CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}</select></F>
          <F label="Internal code (unique, admin only)"><input className={fieldCls} value={f.internal_label} onChange={txt("internal_label")} /></F>
          <F label="Sort order"><input type="number" className={fieldCls} value={f.sort_order} onChange={num("sort_order")} /></F>
        </Grid>
        <label className="mt-4 flex items-center gap-2 text-sm"><Switch checked={f.is_convertible} onCheckedChange={(v) => set("is_convertible", v)} />Convertible tag (also listed under Convertible)</label>
        <label className="mt-2 flex items-center gap-2 text-sm"><Switch checked={f.review_category} onCheckedChange={(v) => set("review_category", v)} />Review category (admin reminder)</label>
        <label className="mt-2 flex items-center gap-2 text-sm"><Switch checked={f.instant_full_booking} onCheckedChange={(v) => set("instant_full_booking", v)} />Instant full booking (own car) — admin only, never shown publicly</label>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-muted-foreground">Supplemental insurance
            <select className={fieldCls} value={f.insurance_override} onChange={(e) => set("insurance_override", e.target.value)}>
              <option value="inherit">Inherit from category</option><option value="on">Offered</option><option value="off">Not offered</option></select></label>
          <label className="flex flex-col gap-1 text-sm text-muted-foreground">Delivery pricing tier
            <select className={fieldCls} value={f.delivery_tier_override} onChange={(e) => set("delivery_tier_override", e.target.value)}>
              <option value="inherit">From category (Exotics = Exotic)</option><option value="standard">Standard</option><option value="exotic">Exotic</option></select></label>

        </div>
        <label className="mt-4 flex items-center gap-2 text-sm"><Switch checked={f.active} onCheckedChange={(v) => set("active", v)} />Show on site & catalog</label>
      </Section>

      <Section title={dt.title}>
        <p className="mb-4 text-xs text-muted-foreground">{dt.inherit}</p>
        <Grid>{(["ownCityAddress", ...(!sameCityDeliveryOnly(f) ? ["otherBase", "servedCity"] : [])] as (keyof FixedDeliveryPrices)[]).map(key => {
          const city = key === "ownCityAddress" ? (f.city === "miami" ? "Miami" : "Orlando") : key === "otherBase" ? (f.city === "miami" ? "Orlando" : "Miami") : f.city === "miami" ? "Fort Lauderdale" : "Tampa";
          const label = sameCityDeliveryOnly(f) ? dt.exoticFixed : (key === "ownCityAddress" ? dt.ownLabel : dt.cityLabel).replace("{city}", city);
          const stored = (f.delivery_pricing ?? {}) as { v2?: Partial<FixedDeliveryPrices> };
          const overrides = deliveryOverrides(f.delivery_pricing);
          return <F key={key} label={label}><input data-testid={`car-delivery-${key}`} aria-label={label} type="number" min={0} step="0.01" className={fieldCls} placeholder={String(effectiveDeliveryPrices({ ...f, delivery_pricing: null }, settings?.delivery_config)[key])} value={overrides[key] ?? (sameCityDeliveryOnly(f) ? effectiveDeliveryPrices(f, settings?.delivery_config).ownCityAddress : "")} onChange={e => set("delivery_pricing", { ...stored, v2: { ...overrides, [key]: e.target.value === "" ? null : Number(e.target.value) } } as never)} /></F>;
        })}</Grid>
        {sameCityDeliveryOnly(f) && <p className="mt-3 text-xs text-muted-foreground">{dt.sameCity}</p>}
        <label className="mt-4 flex min-h-11 items-center gap-3 text-sm"><Switch aria-label={dt.oneWay} checked={f.allows_one_way} onCheckedChange={value => set("allows_one_way", value)} />{dt.oneWay}</label>
      </Section>

      <Section title="Specs">
        <Grid>
          <F label="Seats"><input type="number" className={fieldCls} value={f.seats} onChange={num("seats")} /></F>
          <F label="Bags"><input type="number" className={fieldCls} value={f.bags} onChange={num("bags")} /></F>
          <F label="Doors"><input type="number" className={fieldCls} value={f.doors} onChange={num("doors")} /></F>
          <F label="Horsepower"><input type="number" className={fieldCls} value={f.hp ?? ""} onChange={num("hp", true)} /></F>
          <F label="Transmission"><input className={fieldCls} value={f.transmission} onChange={txt("transmission")} /></F>
          {(["highlights", "highlights_pt", "highlights_es"] as const).map((k) => (
            <F key={k} label={`Key features ${k === "highlights" ? "EN" : k.slice(-2).toUpperCase()} (one per line)`}><textarea rows={4} className={`${fieldCls} h-auto py-2`} value={f[k].join("\n")} onChange={(e) => set(k, e.target.value.split("\n").map((s) => s.trimStart()))} onBlur={() => set(k, f[k].map((s) => s.trim()).filter(Boolean))} /></F>
          ))}
        </Grid>
      </Section>

      <Section title="Price & rules (all optional — fill in any time)">
        <Grid>
          <F label="Daily price USD (empty = Price on request)"><input type="number" inputMode="decimal" className={fieldCls} value={f.daily_price_usd ?? ""} onChange={num("daily_price_usd", true)} /></F>
          <F label="Security deposit (USD)"><input type="number" inputMode="decimal" min={1} placeholder="To fill" className={fieldCls} value={f.security_deposit_usd ?? ""} onChange={num("security_deposit_usd", true)} />{f.security_deposit_usd == null && <span className="mt-1 inline-block rounded-full bg-amber-500/15 px-2 text-[11px] text-amber-400">To fill</span>}</F>
          <F label="Insurance deductible USD (admin only; empty = category rule)"><input type="number" inputMode="decimal" min={0} className={fieldCls} value={f.insurance_deductible_usd ?? ""} placeholder={`Category rule (${insuranceDeductible({ name: f.name, body_category: f.body_category })})`} onChange={num("insurance_deductible_usd", true)} /></F>
          <F label="Minimum days"><><input type="number" inputMode="numeric" min={1} className={fieldCls} value={f.min_days ?? ""} placeholder={`Category default (${minDaysMap((settings as { min_days_by_category?: unknown } | null | undefined)?.min_days_by_category)[f.body_category] ?? 3})`} onChange={(e) => set("min_days", e.target.value === "" ? null : Math.max(1, Number(e.target.value) || 1))} /><span className="mt-1 inline-block text-[11px] text-muted-foreground" data-testid="eff-min">Effective: {(() => { const m = effectiveMinDays(f, (settings as { min_days_by_category?: unknown } | null | undefined)?.min_days_by_category); return `${m.n} (${m.source === "car" ? "car override" : "category default"})`; })()}</span></></F>
          <F label={`Mileage ("unlimited", e.g. 100 mi/day, or empty)`}><input className={fieldCls} value={f.mileage_limit} onChange={txt("mileage_limit")} /></F>
          <F label="Extra-mile price USD (empty = US$ 7/mile)"><input type="number" inputMode="decimal" min={0} step="0.01" className={fieldCls} value={f.extra_mile_price_usd ?? ""} onChange={num("extra_mile_price_usd", true)} /></F>
          <F label="Minimum age"><input type="number" inputMode="numeric" className={fieldCls} value={f.min_age} onChange={(e) => set("min_age", Number(e.target.value) || 21)} /></F>
          <F label="Owner type (internal)"><select className={fieldCls} value={f.owner_type ?? ""} onChange={(e) => { const o = (e.target.value || null) as "own" | "partner" | null; setF((x) => ({ ...x, owner_type: o, confirmation_type: o === "own" ? "instant" : o === "partner" ? "on_request" : x.confirmation_type })); }}><option value="">Not set</option><option value="own">Own car</option><option value="partner">Partner car</option></select></F>
          <F label="Confirmation (default from owner type — can override)"><select className={fieldCls} value={f.confirmation_type} onChange={txt("confirmation_type")}><option value="instant">Instant confirmation</option><option value="on_request">On request · within 24h</option></select></F>
          {f.owner_type === "partner" && <F label="Partner name (internal — never shown publicly)"><input className={fieldCls} value={partnerName} onChange={(e) => setPartnerName(e.target.value)} /></F>}
        </Grid>
        <p className="mt-3 text-sm text-primary">{f.daily_price_usd == null ? "No daily price yet — the site shows “Price on request”." : "All cars: customers pay 100% of the rental total at booking through Stripe or Global Pays. The pickup security deposit is separate."}</p>
      </Section>

      <Section title="Admin note (internal — never shown publicly)">
        <textarea rows={2} className={`${fieldCls} h-auto py-2`} placeholder="e.g. Confirm trim/spec: …" value={f.admin_note} onChange={txt("admin_note")} />
      </Section>

      <Section title="Description">
        {(["description_en", "description_pt", "description_es"] as const).map((k) => (
          <F key={k} label={k.slice(-2).toUpperCase()}><textarea rows={3} className={`${fieldCls} h-auto py-2`} value={f[k]} onChange={txt(k)} /></F>
        ))}
      </Section>

      <Section title="Blocked dates (tap days to block/unblock)">
        <Calendar mode="multiple" selected={blocked} onSelect={(ds) => set("blocked_dates", (ds ?? []).map((d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)).sort())} />
      </Section>

      <div className="sticky bottom-20 mt-6 md:bottom-4"><Button size="xl" className="w-full" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save car"}</Button></div>
    </div>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="surface mb-5 p-5"><h2 className="mb-4 font-semibold">{title}</h2>{children}</section>
);
const Grid = ({ children }: { children: React.ReactNode }) => <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1 text-xs text-muted-foreground">{label}{children}</label>
);
