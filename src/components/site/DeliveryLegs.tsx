import { ValidationField } from "./CheckoutValidation";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, MapPin, Plane, Home } from "lucide-react";
import { suggestDeliveryAddress, beginDeliverySession } from "@/services/delivery.functions";
import { deliveryLegText, deliveryAdminText, deliveryRowText, type Lang } from "@/lib/i18n";
import { bookingBase, deliveryCities, deliveryConfig, mcoRoundTripFree, usd2, type DeliveryLeg } from "@/lib/pricing";
import { relocationNotice } from "@/lib/relocation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { fieldCls } from "./SearchBox";
import { cn } from "@/lib/utils";
export type LegResult = DeliveryLeg & { direction: "pickup" | "return"; fee: number | null; fixedFee: number | null; localFee: number | null; interCity: boolean; status: string };
type OptionPrices = Record<string, { pickup: number | null; airport: number | null; address: number | null }>;
const cityName = (c: string) => c === "fort-lauderdale" ? "Fort Lauderdale" : c === "orlando" ? "Orlando" : c === "miami" ? "Miami" : "Tampa";
const feeText = (fee: number | null | undefined, lang: Lang) => fee == null ? deliveryAdminText[lang].pending : fee === 0 ? deliveryRowText[lang].free : usd2(fee);
export function DeliveryLegSummary({ legs, lang, free = false, base }: { legs: LegResult[]; lang: Lang; free?: boolean; base?: string }) {
 const t = deliveryLegText[lang];
 // Orlando MCO round trip: one explicit "Delivery: Free" line instead of per-leg charges.
 if (free) return <div className="flex justify-between gap-3" data-testid="sum-delivery-free"><span>{t.deliveryWord}</span><span className="shrink-0">{deliveryRowText[lang].free}</span></div>;
 return <>{legs.map(l => <div key={l.direction} className="space-y-1" data-testid={`sum-delivery-${l.direction}`}><div className="flex justify-between gap-3"><span>{l.direction === "pickup" ? t.pickupLine : t.returnLine} · {cityName(l.city)} {l.type === "airport" ? deliveryConfig(null).airports[l.city]?.code : ""}</span><span className="shrink-0">{l.fee == null ? deliveryAdminText[lang].pending : usd2(l.fee)}</span></div>{base && relocationNotice(base, l, lang) && <p className="text-xs text-muted-foreground" data-testid={`relocation-${l.direction}`}>{relocationNotice(base, l, lang)}</p>}</div>)}</>;
}
export function DeliveryLegs({ hideFlight = false, base, exotic, allowsOneWay = true, lang, raw, pickup, ret, same, onPickup, onReturn, onSame, legs, optionPrices }: { base: string; exotic: boolean; allowsOneWay?: boolean; lang: Lang; raw: unknown; pickup: DeliveryLeg; ret: DeliveryLeg; same: boolean; onPickup: (v: DeliveryLeg) => void; onReturn: (v: DeliveryLeg) => void; onSame: (v: boolean) => void; legs: LegResult[]; optionPrices?: OptionPrices | undefined; hideFlight?: boolean }) {
 const t = deliveryLegText[lang], row = deliveryRowText[lang], [expanded, expand] = useState(false);
 const [prices, setPrices] = useState<OptionPrices>({});
 useEffect(() => { if (optionPrices) setPrices(optionPrices); }, [optionPrices]);
 const begin = useServerFn(beginDeliverySession);
 useEffect(() => { begin().catch(() => {}); }, []);
 useEffect(() => { if (!allowsOneWay && ret.city !== pickup.city) onReturn({ city: pickup.city, type: pickup.type }); }, [allowsOneWay, pickup.city, ret.city]);
 const returnResult = legs.find(l => l.direction === "return");
 const chosenReturn = same ? pickup : ret;
 const cfg = deliveryConfig(raw);
 const returnName = same ? t.same : `${cityName(ret.city)} · ${ret.type === "pickup" ? row.base : ret.type === "airport" ? t.airport : t.address}`;
 const returnHelper = chosenReturn.type === "pickup" ? cfg.bases[chosenReturn.city]?.address : chosenReturn.type === "airport" ? `${cfg.airports[chosenReturn.city]?.code ?? ""} · ${row.airportHelp}` : chosenReturn.address || row.addressHelp;
 return <section className="mb-6 space-y-3" data-testid="delivery-step">
  <section className="rounded-2xl border border-border bg-card p-3 sm:p-4" data-testid="pickup-block">
   <h2 className="mb-3 text-base font-semibold">{row.pickup}</h2>
   <LegEditor hideFlight={hideFlight} direction="pickup" base={base} exotic={exotic} lang={lang} raw={raw} value={pickup} onChange={onPickup} result={legs.find(l => l.direction === "pickup")} prices={prices[`pickup:${pickup.city}`]} />
  </section>
  <section className="rounded-2xl border border-border bg-card p-3 sm:p-4" data-testid="return-block">
   <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-base font-semibold">{row.return}</h2><Button variant="outline" aria-expanded={expanded} onClick={() => { if (!expanded) { onSame(false); onReturn({ ...(same ? pickup : ret) }); } expand(!expanded); }}>{t.change}</Button></div>
   {exotic && <p className="mb-3 text-xs text-muted-foreground">{deliveryAdminText[lang].sameCity}</p>}
   {mcoRoundTripFree(base, pickup, chosenReturn) && base === "orlando" && <p className="mb-3 text-xs text-muted-foreground" data-testid="mco-free-note">{t.mcoFree}</p>}
   {mcoRoundTripFree(base, pickup, chosenReturn) && base === "miami" && <p className="mb-3 text-xs text-muted-foreground" data-testid="mia-free-note">{t.miaFree}</p>}
   {!allowsOneWay && <p className="mb-3 text-xs text-muted-foreground" data-testid="same-city-note">{deliveryAdminText[lang].locked}</p>}
   {!expanded ? <ValidationField id="returnAddress"><div className="delivery-option flex min-h-16 items-center gap-3 rounded-xl bg-primary px-3 py-3 text-primary-foreground" data-testid="return-collapsed"><Check className="size-4 shrink-0" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{returnName}</span><span className="mt-1 block break-words text-xs font-normal">{returnHelper}</span></span><span className="max-w-[32%] shrink-0 text-right text-xs font-semibold">{feeText(returnResult?.fee, lang)}</span></div></ValidationField> : <>
    <label className="mb-3 flex min-h-11 cursor-pointer items-center gap-3 text-sm"><Checkbox aria-label={t.same} checked={same} onCheckedChange={v => onSame(v === true)} />{t.same}</label>
    {!same && <LegEditor hideFlight={hideFlight} direction="return" lockedCity={!allowsOneWay ? pickup.city : undefined} base={base} exotic={exotic} lang={lang} raw={raw} value={ret} onChange={onReturn} result={returnResult} prices={prices[`return:${ret.city}`]} />}
   </>}
  </section>
 </section>;
}
function LegEditor({ hideFlight, direction, lockedCity, base, exotic, lang, raw, value, onChange, result, prices }: { hideFlight?: boolean; direction: "pickup" | "return"; lockedCity?: string | undefined; base: string; exotic: boolean; lang: Lang; raw: unknown; value: DeliveryLeg; onChange: (v: DeliveryLeg) => void; result?: LegResult | undefined; prices?: OptionPrices[string] | undefined }) {
 const t = deliveryLegText[lang], row = deliveryRowText[lang], cfg = deliveryConfig(raw), suggest = useServerFn(suggestDeliveryAddress), token = useRef("");
 const [suggestions, setSuggestions] = useState<{ address: string; placeId: string }[]>([]), [error, setError] = useState(false);
 const blocked = exotic && value.city !== base;
 const blockedText = base === "miami" ? t.blocked : `${t.pending}: ${cfg.bases[base]?.address ?? base}`;
 useEffect(() => {
  setSuggestions([]); setError(false);
  if (blocked || value.type !== "address" || value.placeId || (value.address?.length ?? 0) < 3) return;
  if (!token.current) token.current = crypto.randomUUID();
  let live = true;
  const timer = setTimeout(() => suggest({ data: { q: value.address ?? "", city: value.city, sessionToken: token.current } }).then(r => { if (live) { setSuggestions(r); setError(!r.length); } }).catch(() => { if (live) setError(true); }), 300);
  return () => { live = false; clearTimeout(timer); };
 }, [value.address, value.city, value.type, value.placeId, blocked]);
 const matches = result?.city === value.city && result?.type === value.type;
 return <section className="space-y-3" data-testid={`delivery-${direction}`}>
  <ValidationField id={`${direction}Location`}><label className="block text-xs text-muted-foreground">{t.city}<select data-testid={`${direction}-city`} disabled={!!lockedCity} aria-label={direction === "pickup" ? row.pickupCity : row.returnCity} className={cn(fieldCls, "mt-1")} value={value.city} onChange={e => onChange({ city: e.target.value, type: bookingBase(e.target.value) === e.target.value ? "pickup" : "airport" })}>{(lockedCity ? [lockedCity] : exotic ? [base] : deliveryCities(base)).map(c => <option key={c} value={c}>{cityName(c)}</option>)}</select></label></ValidationField>
  {blocked ? <p role="alert" className="text-sm text-destructive" data-testid="exotic-pickup-only">{deliveryAdminText[lang].sameCity}</p> : <>
   <div className="delivery-options grid grid-cols-1 gap-2">
    {([...(bookingBase(value.city) === value.city ? ["pickup" as const] : []), "airport" as const, "address" as const]).map(type => {
     const selected = value.type === type;
     const Icon = type === "pickup" ? MapPin : type === "airport" ? Plane : Home;
     const exact = selected && matches && (type !== "address" || !!value.placeId);
     const price = exact ? feeText(result?.fee, lang) : feeText(prices?.[type], lang);
     const helper = type === "pickup" ? cfg.bases[value.city]?.address : type === "airport" ? row.airportHelp : row.addressHelp;
     return <Button key={type} data-testid={`${direction}-${type}`} aria-pressed={selected} variant={selected ? "default" : "outline"} className="delivery-option h-auto min-h-16 w-full justify-start gap-3 rounded-xl px-3 py-3 text-left whitespace-normal" onClick={() => onChange({ city: value.city, type })}>
      {selected ? <Check className="size-4 shrink-0" /> : <Icon className="size-4 shrink-0" />}
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{type === "pickup" ? row.base : type === "airport" ? `${t.airport} ${cfg.airports[value.city]?.code ?? ""}` : t.address}</span><span className={cn("mt-1 block break-words text-xs font-normal", !selected && "text-muted-foreground")}>{helper}</span>{exotic && type === "airport" && <span className="mt-1 block break-words text-xs font-semibold" data-testid={`${direction}-airport-luggage-note`}>{t.exoticLuggage}</span>}</span>
      <span data-testid={`${direction}-${type}-row-price`} className="max-w-[32%] shrink-0 text-right text-xs font-semibold">{price}</span>
     </Button>;
    })}
   </div>
   {value.type === "airport" && !hideFlight && <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-muted-foreground">{t.airline}<input className={cn(fieldCls,"mt-1")} value={value.flightAirline ?? ""} onChange={e => onChange({ ...value, flightAirline: e.target.value })} /></label><label className="text-xs text-muted-foreground">{t.flight}<input className={cn(fieldCls,"mt-1")} value={value.flightNumber ?? ""} onChange={e => onChange({ ...value, flightNumber: e.target.value })} /></label></div>}
   {value.type === "address" && <ValidationField id={`${direction}Address`}><div><input data-testid={`${direction}-address`} aria-label={t.address} className={fieldCls} value={value.address ?? ""} placeholder={t.select} autoComplete="off" onChange={e => onChange({ ...value, address: e.target.value, placeId: undefined })} />{suggestions.length > 0 && <ul className="mt-1 border border-border bg-card">{suggestions.map(s => <li key={s.placeId}><Button variant="ghost" className="h-auto min-h-12 w-full justify-start whitespace-normal text-left" onClick={() => { onChange({ ...value, ...s, sessionToken: token.current }); setSuggestions([]); token.current = ""; }}>{s.address}</Button></li>)}</ul>}<p className="mt-2 text-xs text-muted-foreground">{error ? t.unavailable : value.placeId ? "Google ✓" : t.select}</p></div></ValidationField>}
   <span className="sr-only" data-testid={`${direction}-price`}>{feeText(result?.fee, lang)}</span>
  </>}
 </section>;
}

/** Checkout: Step 1 locations chosen on the car page, shown as a confirmed summary with a Change link. */
export function LegsConfirmed({ lang, raw, pickup, ret, legs, free, onEdit }: { lang: Lang; raw: unknown; pickup: DeliveryLeg; ret: DeliveryLeg; legs: LegResult[]; free: boolean; onEdit: () => void }) {
 const t = deliveryLegText[lang], row = deliveryRowText[lang], cfg = deliveryConfig(raw);
 const place = (l: DeliveryLeg) => `${cityName(l.city)} · ${l.type === "pickup" ? row.base : l.type === "airport" ? `${t.airport} ${cfg.airports[l.city]?.code ?? ""}` : (l.address || t.address)}`;
 const fee = (d: "pickup" | "return") => free ? row.free : feeText(legs.find(l => l.direction === d)?.fee, lang);
 return <section className="mb-6 rounded-2xl border border-border bg-card p-4" data-testid="legs-confirmed">
  <div className="mb-2 flex items-center justify-between gap-3"><h2 className="text-base font-semibold">{row.pickup.replace(/^1 - /, "")} / {row.return.replace(/^2 - /, "")}</h2><Button variant="outline" onClick={onEdit} data-testid="legs-edit">{t.change}</Button></div>
  {([["pickup", pickup, t.pickup], ["return", ret, t.return]] as const).map(([d, l, label]) => <div key={d} className="flex justify-between gap-3 py-1 text-sm"><span><span className="text-muted-foreground">{label}:</span> {place(l)}</span><span className="shrink-0 font-semibold">{fee(d)}</span></div>)}
 </section>;
}
