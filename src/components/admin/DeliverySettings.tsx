import { useEffect, useState } from "react";
import { OtherFees } from "@/components/admin/OtherFees";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fieldCls } from "@/components/site/SearchBox";
import { crossConfig, deliveryConfig, type CrossCell, type CrossConfig, type CrossTier, type DeliveryConfig, type FixedDeliveryPrices } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { setFleetBase } from "@/services/admin.functions";
import { upsellConfig } from "@/lib/checkoutExtras";
import { checkoutPackageText, deliveryAdminText } from "@/lib/i18n";
import { useLang } from "@/hooks/use-lang";

type Cfg = DeliveryConfig & { cross: CrossConfig };
const CITY = { orlando: "Orlando", tampa: "Tampa", miami: "Miami", "fort-lauderdale": "Fort Lauderdale" } as Record<string, string>;
const CATS = ["suv", "sedan", "luxury", "sports", "exotics"] as const;
const TIERS: CrossTier[] = ["standard", "exotic"];
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

/** Settings → "Delivery & add-ons". Changes apply to new checkouts only; existing bookings keep their stored fee. */
export function DeliverySettings() {
  const { lang } = useLang();
  const tx = checkoutPackageText[lang];
  const dt = deliveryAdminText[lang];
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-delivery"], queryFn: async () => (await supabase.from("settings").select("delivery_config, addon_insurance_per_day").eq("id", 1).single()).data });
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [ins, setIns] = useState("35");
  const [upsells, setUpsells] = useState(upsellConfig(null));
  useEffect(() => {
    if (!data) return;
    const raw = data.delivery_config as { cross?: unknown } | null;
    setCfg({ ...deliveryConfig(raw), cross: crossConfig(raw?.cross) });
    setIns(String(data.addon_insurance_per_day));
    setUpsells(upsellConfig((raw as { upsells?: unknown } | null)?.upsells));
  }, [data]);
  if (!cfg) return null;
  const up = (f: (c: Cfg) => void) => setCfg((c) => { if (!c) return c; const n = structuredClone(c); f(n); return n; });
  const num = (label: string, value: number | null, onChange: (v: number | null) => void, allowEmpty = false) => (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">{label}
      <input type="number" min={0} step="any" className={cn(fieldCls, "h-10")} value={value ?? ""} placeholder={allowEmpty ? "quote" : ""} onChange={(e) => onChange(allowEmpty ? numOrNull(e.target.value) : Number(e.target.value))} /></label>
  );
  const save = async () => {
    if (cfg.custom_fees.some((f) => !f.name_en.trim())) return void toast.error("Every other fee needs an English name");
    if (Object.values(cfg.fixed_delivery).some(p => Object.values(p).some(x => !Number.isFinite(x) || x < 0))) return void toast.error(dt.invalid);
    const cur = (await supabase.from("settings").select("delivery_config").eq("id", 1).single()).data?.delivery_config as { bases?: unknown; fixed_delivery?: unknown } | null;
    const { error } = await supabase.from("settings").update({ delivery_config: { ...cfg, fixed_delivery: (cur as { fixed_delivery?: unknown } | null)?.fixed_delivery, fixed_delivery_v2: cfg.fixed_delivery, upsells, bases: cur?.bases ?? cfg.bases } as never, addon_insurance_per_day: Number(ins), updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) return void toast.error(error.message);
    toast.success("Saved — applies to new checkouts only");
    qc.invalidateQueries({ queryKey: ["settings"] }); qc.invalidateQueries({ queryKey: ["admin-delivery"] });
  };
  return (
    <div className="surface mb-6 flex flex-col gap-6 p-6 text-sm" data-testid="delivery-settings">
      <h2 className="font-semibold text-foreground">Delivery & add-ons</h2>

      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">Base address per fleet (distance is measured from here)</h3>
        <p className="text-xs text-muted-foreground">Saving a base looks the address up and stores its coordinates. New quotes, city-to-city prices and the public address use it; existing bookings keep their stored fee.</p>
        {Object.entries(cfg.bases).map(([k, b]) => <BaseEditor key={k} fleet={k} base={b} onSaved={() => qc.invalidateQueries({ queryKey: ["admin-delivery"] })} />)}
        <BaseLog />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">Airport terminal per service city</h3>
        {Object.entries(cfg.airports).map(([k, a]) => (
          <div key={k} className="grid gap-2 sm:grid-cols-[70px_1fr_100px_100px]">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">{CITY[k] ?? k}<input className={cn(fieldCls, "h-10")} value={a.code} onChange={(e) => up((c) => { c.airports[k]!.code = e.target.value.toUpperCase(); })} /></label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Terminal<input className={cn(fieldCls, "h-10")} value={a.terminal} onChange={(e) => up((c) => { c.airports[k]!.terminal = e.target.value; })} /></label>
            {num("Lat", a.lat, (v) => up((c) => { c.airports[k]!.lat = v ?? 0; }))}
            {num("Lng", a.lng, (v) => up((c) => { c.airports[k]!.lng = v ?? 0; }))}
          </div>
        ))}
      </section>

      <section className="space-y-4" data-testid="address-delivery-defaults"><h3 className="font-semibold">{dt.defaults}</h3>{(["regular", "sports", "exotic"] as const).map(category => <div key={category} className="grid gap-3 sm:grid-cols-3"><h4 className="font-semibold sm:col-span-3">{dt[category]}</h4>{(["ownCityAddress", ...(category !== "exotic" ? ["otherBase", "servedCity"] : [])] as (keyof FixedDeliveryPrices)[]).map(key => <div key={key}>{num(category === "exotic" ? dt.exoticFixed : dt[key], cfg.fixed_delivery[category][key], value => up(c => { c.fixed_delivery[category][key] = value ?? 0; }))}</div>)}{category === "exotic" && <p className="text-xs text-muted-foreground sm:col-span-3">{dt.sameCity}</p>}</div>)}</section>

      <section className="grid gap-3 sm:grid-cols-2">
        <h3 className="font-semibold sm:col-span-2">Checkout fees</h3>
        {num("Tax rate (%) — applies to: every booking", cfg.fees.tax_rate_pct, (v) => up((c) => { c.fees.tax_rate_pct = v ?? 0; }))}
        {num("Basic insurance ($/day) — applies to: non-exotic", cfg.fees.basic_insurance_per_day, (v) => up((c) => { c.fees.basic_insurance_per_day = v ?? 0; }))}
        {num("Toll ($/day) — applies to: non-exotic", cfg.fees.toll_per_day, (v) => up((c) => { c.fees.toll_per_day = v ?? 0; }))}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">Supplemental insurance</h3>
        {num("Price (USD per day)", Number(ins), (v) => setIns(String(v ?? 0)))}
        <div className="flex flex-wrap gap-4">
          {CATS.map((k) => (
            <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={!!cfg.insurance_by_category[k]} onChange={(e) => up((c) => { c.insurance_by_category[k] = e.target.checked; })} />Offered for {k}</label>
          ))}
        </div>
      </section>

      <OtherFees fees={cfg.custom_fees} onChange={(f) => up((c) => { c.custom_fees = f; })} />
      <section className="grid gap-3 sm:grid-cols-2" data-testid="upsell-settings"><h3 className="font-semibold sm:col-span-2">{tx.baby} / {tx.coverage}</h3>{num(`${tx.baby} (USD)`, upsells.babySeat, (value) => setUpsells((prev) => ({ ...prev, babySeat: value ?? 0 })), true)}{num(`${tx.fuel} (USD, per rental)`, upsells.prepaidFuel, (value) => setUpsells((prev) => ({ ...prev, prepaidFuel: value ?? 0 })), true)}{num(`${tx.vip} (USD, per rental)`, upsells.vipDelivery, (value) => setUpsells((prev) => ({ ...prev, vipDelivery: value ?? 0 })), true)}{num(`${tx.coverage} (USD/day)`, upsells.coveragePrice, (value) => setUpsells((prev) => ({ ...prev, coveragePrice: value ?? 0 })), true)}<label className="flex items-center gap-2 text-sm sm:col-span-2" data-testid="luggage-car-active"><input type="checkbox" checked={upsells.luggageCarActive} onChange={(e) => setUpsells((prev) => ({ ...prev, luggageCarActive: e.target.checked }))} />Extra luggage car active (shown to clients) — price is set in Settings</label>{(["pt", "en", "es"] as const).map((locale) => <label key={locale} className="text-xs text-muted-foreground">{locale.toUpperCase()}<input className={fieldCls} placeholder={checkoutPackageText[locale].coverage} value={upsells.coverageLabel[locale]} onChange={(e) => setUpsells((prev) => ({ ...prev, coverageLabel: { ...prev.coverageLabel, [locale]: e.target.value } }))} /></label>)}</section>

      <Button size="lg" onClick={save}>Save delivery & add-ons</Button>
    </div>
  );
}

function BaseEditor({ fleet, base, onSaved }: { fleet: string; base: { address: string; lat: number; lng: number }; onSaved: () => void }) {
  const save = useServerFn(setFleetBase);
  const [addr, setAddr] = useState(base.address);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setAddr(base.address), [base.address]);
  return (
    <div className="flex flex-col gap-2" data-testid={`base-${fleet}`}>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">{CITY[fleet] ?? fleet} fleet base
        <div className="flex gap-2">
          <input className={cn(fieldCls, "h-10")} value={addr} onChange={(e) => setAddr(e.target.value)} aria-label={`${CITY[fleet] ?? fleet} base address`} />
          <Button type="button" variant="outline" disabled={busy || addr.trim() === base.address} onClick={async () => {
            setBusy(true); setRes(null);
            try {
              const r = await save({ data: { fleet, address: addr } });
              if (r.ok) { setRes({ ok: true, text: `Saved. Located as: ${r.resolved} (${r.base.lat}, ${r.base.lng})` }); toast.success("Base saved"); onSaved(); }
              else { setRes({ ok: false, text: r.error }); setAddr(base.address); toast.error(r.error); }
            } catch (e) { setRes({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
          }}>{busy ? "Locating…" : "Save base"}</Button>
        </div>
      </label>
      <p className="text-xs text-muted-foreground">Current: {base.address} · {base.lat}, {base.lng}</p>
      {res && <p className={cn("text-xs", res.ok ? "text-primary" : "text-destructive")} data-testid={`base-${fleet}-result`}>{res.text}</p>}
    </div>
  );
}

function BaseLog() {
  const { data } = useQuery({ queryKey: ["admin-delivery", "base-log"], queryFn: async () => (await supabase.from("fleet_base_changes").select("*").order("changed_at", { ascending: false }).limit(10)).data ?? [] });
  if (!data?.length) return null;
  return (
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Base change log</summary>
      <ul className="mt-2 flex flex-col gap-1">{data.map((r) => (
        <li key={r.id}>{new Date(r.changed_at).toLocaleString()} · {r.changed_by_email || r.changed_by} · {CITY[r.fleet] ?? r.fleet}: {(r.old_base as { address?: string } | null)?.address ?? "—"} → {(r.new_base as { address?: string }).address}</li>
      ))}</ul>
    </details>
  );
}
