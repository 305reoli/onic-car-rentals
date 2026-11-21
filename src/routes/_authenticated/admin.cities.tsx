import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { CityRow, DeliveryLocation } from "@/lib/vehicles";
import { categoryCover, inCategory, photoUrl, PUBLIC_CATEGORIES, type Vehicle } from "@/lib/vehicles";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { fieldCls } from "@/components/site/SearchBox";
import { CITY_COVERS } from "@/lib/cityCovers";

export const Route = createFileRoute("/_authenticated/admin/cities")({
  head: () => ({ meta: [{ title: "Delivery cities — Onic Car Rentals admin" }, { name: "description", content: "Manage Onic delivery cities, locations and service coverage." }, { property: "og:title", content: "Delivery cities — Onic Car Rentals admin" }, { property: "og:description", content: "Manage Onic delivery cities, locations and service coverage." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: CitiesPage,
});

function CitiesPage() {
  const { data = [] } = useQuery({ queryKey: ["admin-cities"], queryFn: async () => (await supabase.from("cities").select("*").order("sort_order")).data ?? [] });
  const { data: cars = [] } = useQuery({ queryKey: ["admin-car-cities"], queryFn: async () => (await supabase.from("vehicles").select("city, name, body_category, is_convertible, photos, daily_price_usd").eq("active", true)).data ?? [] });
  const qc = useQueryClient();
  const add = async () => {
    const name = prompt("City name?");
    if (!name) return;
    const slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { error } = await supabase.from("cities").insert({ name, slug, sort_order: data.length + 1, fleet_from_city: slug, delivery_locations: [{ key: "hotel", en: "Hotel or address", pt: "Hotel ou endereço", es: "Hotel o dirección" }] });
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-cities"] }); qc.invalidateQueries({ queryKey: ["cities"] });
  };
  return (
    <div>
      <div className="mb-6 flex items-center justify-between"><h1 className="font-display text-3xl">Cities</h1><Button onClick={add}><Plus />Add city</Button></div>
      <div className="flex flex-col gap-4">{data.map((c) => <CityEditor key={c.id} city={c} cities={data} cars={cars} countFor={(slug) => cars.filter((v) => v.city === slug).length} />)}</div>
    </div>
  );
}

type CoverCar = { city: string; name: string; body_category: string; is_convertible: boolean; photos: string[]; daily_price_usd: number | null };
function CityEditor({ city, cities, cars, countFor }: { city: CityRow; cities: CityRow[]; cars: CoverCar[]; countFor: (slug: string) => number }) {
  const qc = useQueryClient();
  const [c, setC] = useState(city);
  const [covers, setCovers] = useState<Record<string, string>>((city.category_covers as Record<string, string>) ?? {});
  const [locs, setLocs] = useState<DeliveryLocation[]>((city.delivery_locations as unknown as DeliveryLocation[]) ?? []);
  const set = (k: keyof CityRow) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setC((x) => ({ ...x, [k]: k === "sort_order" ? Number(e.target.value) : e.target.value }));

  const save = async () => {
    const { error } = await supabase.from("cities").update({
      name: c.name, sort_order: c.sort_order, active: c.active, hero_photo: c.hero_photo,
      description_en: c.description_en, description_pt: c.description_pt, description_es: c.description_es,
      fleet_from_city: c.fleet_from_city || c.slug,
      delivery_fee_usd: c.delivery_fee_usd != null && String(c.delivery_fee_usd) !== "" && Number(c.delivery_fee_usd) > 0 ? Number(c.delivery_fee_usd) : null,
      delivery_locations: locs.filter((l) => l.key && l.en),
      category_covers: Object.fromEntries(Object.entries(covers).filter(([, v]) => v)),
    }).eq("id", c.id);
    if (error) return void toast.error(error.message);
    toast.success(`${c.name} saved`);
    qc.invalidateQueries({ queryKey: ["cities"] });
  };
  const uploadHero = async (f: File) => {
    const path = `cities/${c.slug}-${Date.now()}.${f.type === "image/png" ? "png" : "jpg"}`;
    const { error } = await supabase.storage.from("vehicle-photos").upload(path, f, { contentType: f.type });
    if (error) return void toast.error(error.message);
    setC((x) => ({ ...x, hero_photo: path }));
  };

  return (
    <div className="surface grid gap-4 p-5 md:grid-cols-[200px_1fr]">
      <label className="cursor-pointer">
        <img src={photoUrl(c.hero_photo)} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" />
        <span className="mt-1 block text-xs text-muted-foreground">{CITY_COVERS[c.slug] ? "Fallback photo (change)" : "Change hero photo"}</span>
        {CITY_COVERS[c.slug] && (
          <span className="mt-2 block">
            <span className="mb-1 inline-block rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase text-primary-foreground">AI cover — {CITY_COVERS[c.slug]!.status}</span>
            <img src={CITY_COVERS[c.slug]!.jpg.w800} alt="" className="aspect-[3/2] w-full rounded-xl object-cover" style={{ objectPosition: CITY_COVERS[c.slug]!.position }} />
            <span className="block text-[10px] text-muted-foreground">Shown on city cards + city header. Swap after review; the photo above is the fallback.</span>
          </span>
        )}
        <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => e.target.files?.[0] && uploadHero(e.target.files[0])} />
      </label>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[1fr_90px_auto] items-end gap-3">
          <label className="text-xs text-muted-foreground">Name<input className={fieldCls} value={c.name} onChange={set("name")} /></label>
          <label className="text-xs text-muted-foreground">Order<input type="number" className={fieldCls} value={c.sort_order} onChange={set("sort_order")} /></label>
          <label className="flex items-center gap-2 pb-3 text-xs text-muted-foreground"><Switch checked={c.active} onCheckedChange={(v) => setC((x) => ({ ...x, active: v }))} />Visible</label>
        </div>
        <div className="text-xs text-muted-foreground">URL: /{c.slug}</div>
        <div className="grid grid-cols-2 items-end gap-3">
          <label className="text-xs text-muted-foreground">Fleet from (cars listed on this city's pages)
            <select className={fieldCls} value={c.fleet_from_city || c.slug} onChange={(e) => setC((x) => ({ ...x, fleet_from_city: e.target.value }))}>
              {cities.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">Delivery fee (USD, optional — empty = none)
            <input type="number" min={0} className={fieldCls} value={c.delivery_fee_usd ?? ""} onChange={(e) => setC((x) => ({ ...x, delivery_fee_usd: e.target.value === "" ? null : Number(e.target.value) }))} />
          </label>
        </div>
        <div className="text-xs text-muted-foreground">Shows {countFor(c.fleet_from_city || c.slug)} active cars</div>
        {(["description_en", "description_pt", "description_es"] as const).map((k) => (
          <label key={k} className="text-xs text-muted-foreground">Description {k.slice(-2).toUpperCase()}<textarea rows={2} className={`${fieldCls} h-auto py-2`} value={c[k]} onChange={set(k)} /></label>
        ))}
        <CategoryCovers slug={c.slug} fleet={cars.filter((v) => v.city === (c.fleet_from_city || c.slug))} covers={covers} setCovers={setCovers} />
        <div className="text-xs font-semibold">Delivery locations (EN / PT / ES)</div>
        {locs.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
            {(["en", "pt", "es"] as const).map((lg) => (
              <input key={lg} placeholder={lg.toUpperCase()} className={`${fieldCls} h-10`} value={l[lg]} onChange={(e) => setLocs((xs) => xs.map((x, j) => j === i ? { ...x, [lg]: e.target.value, key: x.key || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_") } : x))} />
            ))}
            <Button variant="ghost" size="icon" onClick={() => setLocs((xs) => xs.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 /></Button>
          </div>
        ))}
        <div className="flex justify-between">
          <Button variant="outline" size="sm" onClick={() => setLocs((xs) => [...xs, { key: "", en: "", pt: "", es: "" }])}><Plus />Location</Button>
          <Button onClick={save}>Save</Button>
        </div>
      </div>
    </div>
  );
}

/** Category tile covers: default = most expensive car's first photo; owner can pick another car photo or upload. Saved with the city. */
function CategoryCovers({ slug, fleet, covers, setCovers }: { slug: string; fleet: CoverCar[]; covers: Record<string, string>; setCovers: React.Dispatch<React.SetStateAction<Record<string, string>>> }) {
  const [open, setOpen] = useState<string | null>(null);
  const upload = async (cat: string, f: File) => {
    const path = `cities/${slug}-${cat}-${Date.now()}.${f.type === "image/png" ? "png" : "jpg"}`;
    const { error } = await supabase.storage.from("vehicle-photos").upload(path, f, { contentType: f.type });
    if (error) return void toast.error(error.message);
    setCovers((x) => ({ ...x, [cat]: path }));
  };
  return (
    <div>
      <div className="mb-2 text-xs font-semibold">Category covers (save the city after changing)</div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {PUBLIC_CATEGORIES.map((cat) => {
          const inCat = fleet.filter((v) => inCategory(v, cat));
          if (!inCat.length) return null;
          const def = categoryCover(undefined, inCat as unknown as Vehicle[], cat);
          const cur = covers[cat] || def;
          return (
            <div key={cat} className="text-xs">
              <img src={photoUrl(cur)} alt="" className="aspect-[3/2] w-full rounded-lg object-cover" />
              <div className="mt-1 flex items-center justify-between gap-1">
                <span className="font-semibold capitalize">{cat} · {inCat.length}{covers[cat] ? "" : " · default"}</span>
                <span className="flex gap-2">
                  <button type="button" className="cursor-pointer text-primary" onClick={() => setOpen(open === cat ? null : cat)}>Pick</button>
                  <label className="cursor-pointer text-primary">Upload<input type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => e.target.files?.[0] && upload(cat, e.target.files[0])} /></label>
                  {covers[cat] && <button type="button" className="cursor-pointer text-muted-foreground" onClick={() => setCovers((x) => ({ ...x, [cat]: "" }))}>Reset</button>}
                </span>
              </div>
              {open === cat && (
                <div className="mt-2 grid max-h-48 grid-cols-3 gap-1 overflow-y-auto">
                  {inCat.flatMap((v) => v.photos.map((p) => (
                    <button type="button" key={p} title={v.name} className="cursor-pointer" onClick={() => { setCovers((x) => ({ ...x, [cat]: p })); setOpen(null); }}>
                      <img src={photoUrl(p)} alt={v.name} className="aspect-[3/2] w-full rounded object-cover" loading="lazy" />
                    </button>
                  )))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
