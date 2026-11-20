import { upsellConfig, upsellPricing, visibleAddonKeys } from "@/lib/checkoutExtras";
import { PriceOnRequestPanel, PricelessWhatsApp } from "@/components/site/PriceOnRequest";
import { useDeliveryQuote, encodeLegs } from "@/hooks/useDeliveryQuote";
import { DeliveryLegs, DeliveryLegSummary } from "@/components/site/DeliveryLegs";
import { checkoutPackageText } from "@/lib/i18n";
import { locLeg } from "@/lib/searchLocation";
import { sameCityDeliveryOnly, type DeliveryLeg } from "@/lib/pricing";
import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { metaTrack } from "@/lib/metaPixel";
import { trackFunnel } from "@/lib/funnel";
import { toast } from "sonner";
import { Check, ChevronLeft } from "lucide-react";
import { bookedDaysQuery, settingsQuery, vehicleQuery } from "@/lib/queries";
import { ownerText, fmt, minDaysMsg, minRentalLabel, t, waLink, type Lang } from "@/lib/i18n";
import { abs, faqJsonLd, productJsonLd, seoHead } from "@/lib/seo";
import { carFaq, toPairs } from "@/lib/faqContent";
import { useLang } from "@/hooks/use-lang";
import { resolveServiceCity, description, highlightsFor, carMileageLine, hasDailyPrice, photoUrl, photoSrcSet, sizedPhoto, GALLERY_SIZES, GALLERY_WIDTHS } from "@/lib/vehicles";
import { useCities } from "@/hooks/use-cities";
import { citiesQuery } from "@/lib/queries";
import { effectiveMinDays, dueAtBooking, paymentMode, embedsFee, allInPrice, canBookOnline, computeQuote, crossCell, crossConfig, crossFromDaily, crossPrice, DEFAULT_SETTINGS, deliveryConfig, deliveryTier, matchingFees, feeName, usd, usd2, routeLegFee, durationLabel, rentalRateText, promoLabels } from "@/lib/pricing";
import { dailyCharges } from "@/lib/deliveryText";
import { bookingSearch } from "@/lib/search";
import { Container, FaqList, PageError, googleReviewsQuery } from "@/components/site/Sections";
import { PriceTag } from "@/components/site/CarCard";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { enUS, es, ptBR } from "date-fns/locale";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { publicPath } from "@/lib/publicRoutes";
import { discoveryKey, internalPath } from "@/lib/publicRoutes";
import { modelKey, modelLabel } from "@/lib/discovery";
import { aeoUi, conciergeText } from "@/lib/i18n";
import { carMeta } from "@/lib/aeo";
import { CarEditorial } from "@/components/site/CarEditorial";
import { FleetBase } from "@/components/site/FleetBase";
import { DateTimeField } from "@/components/site/DateTimeField";
import { GoogleRatingBadge, InstagramStrip, NoHiddenFeesBadge } from "@/components/site/Conversion";
import { convText, waMessage } from "@/lib/i18n";
import { useWaContext } from "@/lib/waContext";
import { Scarcity } from "@/components/site/Scarcity";
import { modelScarcityQuery } from "@/lib/scarcityQuery";
import { SelectedDateSimilarModels } from "@/components/site/SimilarModels";

export const Route = createFileRoute("/$lang/cars/$city/$slug")({
  validateSearch: bookingSearch,
  loaderDeps: ({ search }) => ({ svc: search.city, pickup: search.pickup, ret: search.ret }),
  loader: async ({ context, params, deps }) => {
    // Reviews only decorate the page: awaited for the server render, fetched in the background on in-app navigation.
    const reviews = context.queryClient.ensureQueryData(googleReviewsQuery()).catch(() => null);
    const [v, st, cities, serverReviews] = await Promise.all([
      context.queryClient.ensureQueryData(vehicleQuery(params.city, params.slug)),
      context.queryClient.ensureQueryData(settingsQuery()),
      context.queryClient.ensureQueryData(citiesQuery()),
      typeof window === "undefined" ? reviews : null,
    ]);
    const rv = (serverReviews ?? context.queryClient.getQueryData(googleReviewsQuery().queryKey) ?? null) as { rating: number | null; total: number | null; reviews: { author: string; rating: number; text: string }[] } | null;
    const reviewData = rv ? { rating: rv.rating, total: rv.total, reviews: (rv.reviews ?? []).slice(0, 10).map((r) => ({ author: r.author, rating: r.rating, text: r.text })) } : null;
    const cityLabel = cities.find((c) => c.slug === params.city)?.name ?? params.city;
    if (!v) throw notFound();
    if (deps.pickup && deps.ret) await context.queryClient.ensureQueryData(modelScarcityQuery(v.id, deps.pickup, deps.ret));
    // Offer price: all-in "from" daily when the car is shown in a city served from another fleet.
    const cell = deps.svc ? crossCell(v.city, deps.svc, v, crossConfig((st as { delivery_config?: { cross?: unknown } }).delivery_config?.cross)) : null;
    const price = cell ? crossFromDaily(v.daily_price_usd, cell, crossConfig((st as { delivery_config?: { cross?: unknown } }).delivery_config?.cross)) : v.daily_price_usd;
    const svcLabel = deps.svc ? cities.find((c) => c.slug === deps.svc)?.name : undefined;
    const svcSlug = resolveServiceCity(cities, deps.svc, v.city)?.slug ?? v.city;
    const faqCell = crossCell(v.city, svcSlug, v, crossConfig((st as { delivery_config?: { cross?: unknown } }).delivery_config?.cross));
    const faq = carFaq(params.lang as Lang, v, st as never, faqCell, svcSlug, svcLabel ?? cityLabel);
    return { modelPath: discoveryKey("model", v.city, modelKey(v)), modelName: modelLabel(v), faq, name: v.name, brand: v.brand, city: svcLabel ?? cityLabel, desc: description(v, params.lang as Lang), reviewData, photos: v.photos, photo: v.photos[0] ?? null, price, category: v.body_category, minDays: effectiveMinDays(v, (st as { min_days_by_category?: unknown }).min_days_by_category).n };
  },
  head: ({ params, loaderData }) => {
    const lang = params.lang as Lang;
    const tr = t(lang);
    const d = loaderData;
    const path = `/cars/${params.city}/${params.slug}`;
    if (!d) return seoHead({ lang, path, title: "Unavailable — Onic Car Rentals", description: "", noindex: true });
    const title = fmt(tr.seo.carTitle, { car: d.name, city: d.city });
    const image = d.photo ? photoUrl(d.photo) : null;
    const lcpSet = d.photo ? photoSrcSet(d.photo, GALLERY_WIDTHS) : undefined;
    const sh = seoHead({
      lang, path, type: "product", homeLabel: tr.seo.home, image,
      title: `${title} | Onic Car Rentals`,
      description: carMeta(lang, d.name, d.city, d.price),
      crumbs: [[d.city, `/${params.city}`], [tr.categories[d.category as keyof typeof tr.categories] ?? d.category, `/${params.city}/${d.category}`], ...(lang === "pt" ? [[d.modelName, `/${d.modelPath}`] as [string, string]] : []), [d.name, path]],
      jsonLd: [productJsonLd(d.name, d.photos.map(photoUrl), abs(publicPath(lang, path)), d.price, { description: d.desc, brand: d.brand, reviews: d.reviewData }), faqJsonLd(toPairs(d.faq))],
    });
    // First gallery photo is the LCP: preload the same responsive candidates the <img> uses.
    return lcpSet ? { ...sh, links: [...(sh.links ?? []), { rel: "preload", as: "image", href: sizedPhoto(d.photo, 828), imageSrcSet: lcpSet, imageSizes: GALLERY_SIZES, fetchPriority: "high" }] } : sh;
  },
  component: CarPage,
  errorComponent: PageError,
  notFoundComponent: () => <PageError error={new Error("Car not found")} />,
});

const addDaysLocal = (v: string, n: number) => { const d = new Date(v); d.setDate(d.getDate() + n); return toLocalInput(d); };
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const dayKey = (d: Date) => toLocalInput(d).slice(0, 10);

function CarPage() {
  const { city, slug } = Route.useParams();
  const search = Route.useSearch();
  const { lang, tr } = useLang();
  const { data: v } = useSuspenseQuery(vehicleQuery(city, slug));
  const { data: settings } = useSuspenseQuery(settingsQuery());
  const carFaqItems = Route.useLoaderData().faq;
  const { data: booked = [], isSuccess: bookedReady } = useQuery({ ...bookedDaysQuery(v!.id), enabled: !!v });
  const upsells = upsellConfig((settings as { delivery_config?: { upsells?: unknown } }).delivery_config?.upsells);
  const s = { ...DEFAULT_SETTINGS, ...settings, ...upsellPricing(upsells) };

  const cityRow = resolveServiceCity(useCities(), search.city, v!.city);
  const serviceCity = cityRow && cityRow.slug !== v!.city ? cityRow.slug : undefined;
  const [photo, setPhoto] = useState(0);
  const [pickup, setPickup] = useState(search.pickup ?? "");
  const [ret, setRet] = useState(search.ret ?? "");
  const [datesPicked, setDatesPicked] = useState(false);
  const [addons, setAddons] = useState({ insurance: false, hotelCheckin: false, luggageCar: false, babySeat: false, prepaidFuel: false, vipDelivery: false });
  const [chosenFees, setChosenFees] = useState<string[]>([]);
  const metaSent = useRef("");
  useEffect(() => { if (metaSent.current === slug) return; metaSent.current = slug; metaTrack("ViewContent", { content_type: "product", content_ids: [slug] }); trackFunnel("car_page_view", { car: slug, city: v!.city, currency: "USD", price: v!.daily_price_usd ?? null }, slug); }, [slug]);

  useEffect(() => {
    if (!pickup) {
      const p = new Date(); p.setDate(p.getDate() + 1); p.setHours(10, 0, 0, 0);
      const r = new Date(p); r.setDate(r.getDate() + Math.max(3, effectiveMinDays(v!, (settings as { min_days_by_category?: unknown }).min_days_by_category).n));
      setPickup(toLocalInput(p)); setRet(toLocalInput(r));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rawCfg = (settings as { delivery_config?: unknown }).delivery_config;
  const crossCfg = crossConfig((rawCfg as { cross?: unknown } | null)?.cross);
  const svcSlug = cityRow?.slug ?? v!.city;
  // Step 1 on the car page: the same pickup/return controls and server quote as checkout.
  const searchLeg = (() => { const l = locLeg(search.loc, v!.city, rawCfg); if (!l || l.city !== v!.city) return null; if (sameCityDeliveryOnly(v!) && l.type === "airport") return null; return l; })();
  const dlv = useDeliveryQuote(v!, svcSlug, { pickup: searchLeg ?? { city: v!.city, type: "pickup" }, ret: searchLeg ?? ({ city: v!.city, type: "pickup" } as DeliveryLeg), same: true });
  const cell0 = crossCell(v!.city, svcSlug, v!, crossCfg);
  const cell = cell0 && !cell0.pickupOnly && cell0.offered ? cell0 : null;
  const notServed = !!cell0 && !cell0.offered;
  // Delivery + return to the service city, from the same per-leg fixed fields checkout charges.
  const legFee = cell ? routeLegFee(v!, svcSlug, rawCfg) : null;
  const crossFee = cell ? (legFee == null ? { status: "quote_pending" as const, fee: null } : { status: "priced" as const, fee: legFee * 2 }) : null;
  const vehicle = { ...v!, svc: cell ? { cross: true, fee: crossFee?.fee ?? null, quote: crossFee?.status === "quote_pending", fromDaily: crossFromDaily(v!.daily_price_usd, cell, crossCfg), referenceDays: crossCfg.reference_days } : undefined };
  const effAddons = { ...addons, insurance: false };
  const custom = matchingFees(deliveryConfig(rawCfg).custom_fees, { body_category: vehicle.body_category, exotic: deliveryTier(vehicle) === "exotic" }, svcSlug);
  const optionalFees = custom.filter((f) => f.mode === "optional");
  const minN = effectiveMinDays(vehicle, (settings as { min_days_by_category?: unknown }).min_days_by_category).n;
  const pickupD = pickup ? new Date(pickup) : null;
  const retD = ret ? new Date(ret) : null;
  const quote = pickupD && retD ? computeQuote(vehicle, pickupD, retD, effAddons, s, dlv.deliveryFee, dlv.dOk?.embeddedFee ?? 0, { exotic: deliveryTier(vehicle) === "exotic", deliveryPending: dlv.deliveryPending, fees: deliveryConfig(rawCfg).fees, customFees: custom, chosenFees }) : null;
  void allInPrice;

  const issue = useMemo(() => {
    if (notServed) return { msg: tr.car.unavailable, wa: true };
    if (!pickupD || !retD) return null;
    if (retD <= pickupD) return { msg: tr.car.invalidDates, wa: false };
    if (!canBookOnline(new Date(), pickupD, s)) return { msg: fmt(tr.car.tooSoon, { h: s.min_lead_time_hours }), wa: true };
    if (quote && quote.days < minN) return { msg: minDaysMsg(tr, minN), wa: false };
    const set = new Set(booked);
    const d = new Date(pickupD); d.setHours(0, 0, 0, 0);
    while (d <= retD) { if (set.has(dayKey(d))) return { msg: tr.car.unavailable, wa: true, booked: true }; d.setDate(d.getDate() + 1); }
    return null;
  }, [pickup, ret, booked, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const cityName = cityRow?.name ?? vehicle.city;
  const priceless = !hasDailyPrice(vehicle);
  // Dates count as "searched" only when they came from the URL (not the page's default suggestion).
  const waText = waMessage(lang, { kind: "car", car: vehicle.name, city: cityName, pickup: search.pickup ? pickup : undefined, ret: search.ret ? ret : undefined });
  useWaContext(waText);
  const cv = convText[lang];
  const tx = checkoutPackageText[lang];

  const navigate = Route.useNavigate();
  // User-chosen dates go to the URL so the sticky search and checkout stay in sync.
  const setDates = (p: string, r: string) => {
    setDatesPicked(true);
    setPickup(p); setRet(r);
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, pickup: p || undefined, ret: r || undefined }), replace: true, resetScroll: false } as never);
  };
  const [calStep, setCalStep] = useState<0 | 1>(0);
  const withTime = (day: Date, from: string, h: string) => `${dayKey(day)}T${from.slice(11, 16) || h}`;
  const onCalDay = (day: Date) => {
    const k = dayKey(day);
    if (calStep === 0 || !pickup || k <= pickup.slice(0, 10)) {
      const p = withTime(day, pickup, "10:00");
      const keepRet = ret && ret.slice(0, 10) > k ? ret : "";
      setDates(p, keepRet); setCalStep(1); return;
    }
    const set = new Set(booked);
    const d = new Date(pickup.slice(0, 10) + "T00:00");
    while (dayKey(d) <= k) { if (set.has(dayKey(d))) { toast.error(tr.car.unavailable); return; } d.setDate(d.getDate() + 1); }
    setDates(pickup, withTime(day, ret, pickup.slice(11, 16) || "10:00")); setCalStep(0);
  };
  const selFrom = pickup ? new Date(pickup.slice(0, 10) + "T00:00") : undefined;
  const selTo = ret ? new Date(ret.slice(0, 10) + "T00:00") : undefined;
  const onContinue = () => {
    if (priceless) return;
    if (issue) { toast.error(issue.msg); return; }
    if (!bookedReady) return; // availability (site + SistemaGestao blocks) not loaded yet
    navigate({ to: "/$lang/checkout/$city/$slug", params: { lang, city, slug }, search: { city: serviceCity, pickup, ret, loc: search.loc, hotel: addons.hotelCheckin, lug: addons.luggageCar, seat: addons.babySeat, fuel: addons.prepaidFuel, vip: addons.vipDelivery, dl: encodeLegs(dlv.pickupLeg, dlv.returnLeg, dlv.sameReturn), ...(chosenFees.length ? { fees: chosenFees.join(",") } : {}) } });
  };

  const photos = vehicle.photos.length ? vehicle.photos.slice(0, 12) : [""];
  const bookedDates = booked.map((k) => new Date(`${k}T12:00:00`));
  // First load: never flash "To be confirmed" while dates/delivery are still resolving.
  const calculating = !quote || dlv.dqBusy || (!dlv.dq && !dlv.dOk);
  const totalLabel = calculating ? <span className="animate-pulse text-muted-foreground" data-testid="total-calculating">{cv.calculating}</span> : quote?.total != null ? usd2(quote.total) : tr.car.toBeConfirmed;

  return (
    <div className="car-detail-content pb-28 md:pb-0">
      <Container className="py-6">
        {lang === "pt" && <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap gap-2 text-sm text-muted-foreground">
          <Link to="/$lang" params={{ lang }}>{tr.seo.home}</Link> / <Link to="/$lang/$city" params={{ lang, city: vehicle.city }}>{cityName}</Link> / <Link to="/$lang/$city/$category" params={{ lang, city: vehicle.city, category: vehicle.body_category }}>{tr.categories[vehicle.body_category as "suv"]}</Link> / <Link to={internalPath(publicPath("pt", discoveryKey("model", vehicle.city, modelKey(vehicle))))}>{modelLabel(vehicle)}</Link> / <span>{vehicle.name}</span>
        </nav>}
        <Link to="/$lang/$city/$category" params={{ lang, city: cityRow?.slug ?? vehicle.city, category: vehicle.body_category }} search={{ pickup: search.pickup, ret: search.ret, loc: search.loc }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
          <ChevronLeft className="size-4" />{cityName} › {tr.categories[vehicle.body_category as "suv"] ?? ""}
        </Link>
      </Container>
      <Container className="grid gap-8 lg:grid-cols-[1fr_420px] lg:gap-x-10">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1" data-testid="car-essentials">
          <div className="surface relative aspect-[3/2] overflow-hidden">
            <img src={sizedPhoto(photos[photo], 828)} srcSet={photoSrcSet(photos[photo], GALLERY_WIDTHS)} sizes={GALLERY_SIZES} alt={fmt(tr.seo.photoOf, { car: vehicle.name, city: cityRow?.name ?? vehicle.city, n: photo + 1, total: photos.length })} width={1600} height={1068} loading="eager" fetchPriority={photo === 0 ? "high" : "auto"} decoding="async" className="absolute inset-0 size-full object-cover" />
          </div>
          {photos.length > 1 && (
            <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto max-sm:grid max-sm:grid-cols-3 max-sm:gap-2 max-sm:overflow-visible">
              {photos.map((p, i) => (
                <button key={i} onClick={() => setPhoto(i)} className={cn("aspect-[3/2] w-28 shrink-0 cursor-pointer overflow-hidden rounded-xl border-2 max-sm:w-full", i === photo ? "border-primary" : "border-transparent opacity-70")}>
                  <img src={sizedPhoto(p, 240)} alt={fmt(tr.seo.photoOf, { car: vehicle.name, city: cityRow?.name ?? vehicle.city, n: i + 1, total: photos.length })} loading="lazy" decoding="async" width={112} height={75} className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <h1 className="font-display mt-6 text-4xl md:text-6xl">{fmt(aeoUi[lang].carH1, { car: vehicle.name, city: cityName })}</h1>
          <div className="mt-3"><PriceTag v={vehicle} size="lg" search={{ pickup, ret }} />{!priceless && <p className="mt-1 text-xs text-muted-foreground">{tr.delivery.taxNote}</p>}</div>
          <dl className="mt-4 flex flex-col gap-2 border-y border-border py-4 text-sm" data-testid="rate-box">
            <div className="flex flex-wrap justify-between gap-2"><dt>{ownerText[lang].rate}</dt><dd>{priceless ? tr.fleet.priceOnRequest : `${usd2(vehicle.daily_price_usd)}${tr.fleet.perDay}`}</dd></div>
            <div><dt className="sr-only">{tr.car.mileage}</dt><dd>{carMileageLine(vehicle, lang)}</dd></div>
          </dl>
          <div className="mt-3"><GoogleRatingBadge /></div>
          {paymentMode(vehicle, (settings as { payment_modes?: unknown }).payment_modes) === "full" && <p className="mt-3 text-sm font-medium text-primary" data-testid="full-payment-note">{cv.badgeFull}</p>}






        </div>

        <aside id="book" className="lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          {priceless ? <PriceOnRequestPanel lang={lang} car={vehicle.name} city={cityName} /> : <div className="surface flex flex-col gap-4 p-5">
            <FleetBase city={vehicle.city} lang={lang} />
            <Scarcity vehicleId={vehicle.id} pickup={search.pickup ? pickup : ""} ret={search.ret ? ret : ""} lang={lang} />
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 text-xs text-muted-foreground">{tr.car.pickup}
                <DateTimeField lang={lang} label={tr.car.pickup} value={pickup} onChange={(p) => setDates(p, ret)} /></div>
              <div className="col-span-2 text-xs text-muted-foreground">{tr.car.ret}
                <DateTimeField lang={lang} label={tr.car.ret} value={ret} onChange={(r) => setDates(pickup, r)} min={pickup ? addDaysLocal(pickup, minN) : undefined} /></div>
            </div>
            <DeliveryLegs base={vehicle.city} exotic={sameCityDeliveryOnly(vehicle)} allowsOneWay={vehicle.allows_one_way} lang={lang} raw={rawCfg} pickup={dlv.pickupLeg} ret={dlv.returnLeg} same={dlv.sameReturn} onPickup={dlv.setPickupLeg} onReturn={dlv.setReturnLeg} onSame={dlv.setSameReturn} legs={dlv.shownLegs ?? []} optionPrices={dlv.optPrices} />
              <p className="text-xs text-muted-foreground" data-testid="min-rental">{minRentalLabel(tr, minN)}</p>
              <p className="text-sm text-muted-foreground" data-testid="service-line">{conciergeText[lang].carLine}</p>
            <div data-testid="car-addons">
              <div className="mb-2 text-sm font-semibold">{tr.car.addons}</div>
              {visibleAddonKeys(upsells).map((k) => { const label = k === "hotelCheckin" ? tr.car.hotel : k === "luggageCar" ? tr.car.luggage : k === "prepaidFuel" ? tx.fuel : k === "vipDelivery" ? tx.vip : tx.baby; const price = k === "babySeat" ? tx.confirmPrice : `${usd(k === "hotelCheckin" ? s.addon_hotel_checkin : k === "luggageCar" ? s.addon_luggage_car : k === "prepaidFuel" ? upsells.prepaidFuel : upsells.vipDelivery)} ${cv.perRental}`; return (
                <label key={k} className="flex cursor-pointer items-center gap-3 border-b border-border py-3 text-sm last:border-0" data-testid={`car-addon-${k}`}>
                  <Checkbox checked={addons[k]} onCheckedChange={(c) => setAddons((a) => ({ ...a, [k]: !!c }))} />
                  <span className="flex-1">{label}</span><span className="text-muted-foreground">{price}</span>
                </label>
              ); })}
              {optionalFees.map((f) => (
                <label key={f.id} className="flex cursor-pointer items-center gap-3 border-b border-border py-3 text-sm last:border-0" data-testid="opt-fee">
                  <Checkbox checked={chosenFees.includes(f.id)} onCheckedChange={(c) => setChosenFees((x) => (c ? [...x, f.id] : x.filter((i) => i !== f.id)))} />
                  <span className="flex-1">{feeName(f, lang)}</span>
                  <span className="text-muted-foreground">{f.type === "percent" ? `${f.amount}%` : `${usd2(f.amount)}${f.type === "per_day" ? tr.delivery.perDay : ` ${cv.perRental}`}`}</span>
                </label>
              ))}
            </div>

            {quote && (
              <div className="rounded-2xl bg-background p-4 text-sm">
                <div className="mb-2 font-semibold">{tr.car.summary}</div>
                <Row l={`${tr.delivery.rental} (${quote.days} ${tr.car.days}: ${rentalRateText(quote, tr.delivery.perDay, convText[lang]) ?? tr.fleet.priceOnRequest})`} r={quote.base != null ? usd2(quote.base)! : tr.car.toBeConfirmed} />
                {durationLabel(quote, convText[lang]) && <Row l={durationLabel(quote, convText[lang])!} r={`−${usd2(quote.durationDiscount)}`} />}
                {promoLabels(quote, convText[lang]).map((p) => <Row key={p.label} l={p.label} r={`−${usd2(p.amount)}`} />)}
                {quote.basicInsurance > 0 && <Row l={`${tr.delivery.basicInsurance} (${quote.days} × ${usd2(quote.basicInsurance / quote.days)})`} r={usd2(quote.basicInsurance)!} />}
                {quote.tolls > 0 && <Row l={`${tr.delivery.tolls} (${quote.days} × ${usd2(quote.tolls / quote.days)})`} r={usd2(quote.tolls)!} />}
                {quote.solidWaste > 0 && <Row l={`Solid Waste (${Math.min(quote.days, 30)} × ${usd2(quote.solidWaste / Math.min(quote.days, 30))})`} r={usd2(quote.solidWaste)!} />}
                {deliveryTier(vehicle) === "exotic" && <p className="py-1 text-xs text-muted-foreground" data-testid="exotic-note">{cv.exoticNote}</p>}
                {dlv.shownLegs && <DeliveryLegSummary base={vehicle.city} lang={lang} legs={dlv.shownLegs} free={dlv.mcoFree} />}
                {addons.babySeat && <Row l={tx.baby} r={quote.babySeat > 0 ? usd2(quote.babySeat)! : tx.confirmPrice} />}
                {quote.prepaidFuel > 0 && <Row l={tx.fuel} r={usd2(quote.prepaidFuel)!} />}
                {quote.vipDelivery > 0 && <Row l={tx.vip} r={usd2(quote.vipDelivery)!} />}
                {quote.hotelCheckin > 0 && <Row l={tr.car.hotel} r={usd(quote.hotelCheckin)!} />}
                {quote.luggageCar > 0 && <Row l={tr.car.luggage} r={usd(quote.luggageCar)!} />}
                {quote.customFees.filter((f) => f.taxable).map((f) => <Row key={f.id} l={feeName(f, lang)} r={usd2(f.amount)!} />)}
                {quote.subtotal != null && <Row l={tr.delivery.subtotal} r={usd2(quote.subtotal)!} />}
                {quote.tax != null && <Row l={`${tr.delivery.tax} ${quote.taxRate}%`} r={usd2(quote.tax)!} />}
                {quote.customFees.filter((f) => !f.taxable).map((f) => <Row key={f.id} l={feeName(f, lang)} r={usd2(f.amount)!} />)}
                <div className="mt-2 flex justify-between border-t border-border pt-2 font-display text-lg"><span>{tr.car.total}</span><span>{totalLabel}</span></div>
                <NoHiddenFeesBadge className="mt-1.5" />
              </div>
            )}

            {issue && <p className="text-sm text-destructive">{issue.msg}</p>}
            {issue?.wa ? (
              <Button asChild variant="whatsapp" size="lg"><a href={waLink(waText)} target="_blank" rel="noreferrer">WhatsApp</a></Button>
            ) : (
              <Button size="lg" onClick={onContinue} disabled={(!!issue && !issue.wa) || !bookedReady}>{tr.car.continue}</Button>
            )}
            <a href={waLink(waText)} target="_blank" rel="noreferrer" className="text-center text-sm text-muted-foreground hover:text-primary">{tr.car.talk}</a>
          </div>}
          <SelectedDateSimilarModels datesSelected={datesPicked || (!!search.pickup && !!search.ret)} bookedIssue={issue?.booked === true} current={vehicle} search={{ ...search, pickup, ret, ...(datesPicked ? { dl: encodeLegs(dlv.pickupLeg, dlv.returnLeg, dlv.sameReturn) } : {}) }} lang={lang} settings={settings} />
        </aside>
        <div className="min-w-0 lg:col-start-1 lg:row-start-2" data-testid="car-details">
          {!priceless && <section className="mt-0" data-testid="car-availability">
            <h2 className="font-display mb-4 text-2xl">{tr.car.availability}</h2>
            <div className="surface inline-block p-3">
              <Calendar
                mode="range"
                locale={{ en: enUS, pt: ptBR, es }[lang]}
                numberOfMonths={1}
                {...(selFrom ? { selected: { from: selFrom, to: selTo && selTo >= selFrom ? selTo : undefined }, defaultMonth: selFrom } : {})}
                onSelect={() => {}}
                onDayClick={(day, m) => { if (!m["disabled"]) onCalDay(day); }}
                data-testid="avail-calendar"
                disabled={[{ before: new Date() }, ...bookedDates]}
                modifiers={{ booked: bookedDates }}
                modifiersClassNames={{ booked: "line-through text-muted-foreground opacity-60" }}
              />
              <p className="px-3 pb-2 text-xs text-muted-foreground"><span className="line-through">15</span> = {tr.car.booked}</p>
            </div>
          </section>}
          <section className={priceless ? "mt-0" : "mt-10"} data-testid="car-rules">
            <h2 className="font-display mb-4 text-2xl">{tr.car.rules}</h2>
            <dl className="surface grid grid-cols-2 gap-px overflow-hidden bg-border md:grid-cols-4">
              {[
                [tr.car.minAge, `${vehicle.min_age}+`], [tr.car.minDays, String(minN)],
                [tr.car.mileage, carMileageLine(vehicle, lang)], ...(vehicle.security_deposit_usd != null ? [[tr.car.deposit, usd(vehicle.security_deposit_usd)!]] : []),
              ].map(([k, val]) => (
                <div key={k} className="bg-card p-4"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-1 font-semibold">{val}</dd></div>
              ))}
            </dl>
          </section>
          <section className="mt-10">
            <h2 className="font-display mb-3 text-2xl">{tr.car.description}</h2>
            <p className="text-muted-foreground" data-testid="car-description">{description(vehicle, lang)}</p>
            {highlightsFor(vehicle, lang).length > 0 && (
              <><h3 className="mt-6 text-sm font-semibold uppercase tracking-widest text-muted-foreground">{tr.car.keyFeatures}</h3><ul className="mt-3 flex flex-wrap gap-2">{highlightsFor(vehicle, lang).map((h) => <li key={h} className="rounded-full bg-secondary px-3 py-1 text-xs">{h}</li>)}</ul></>
            )}
          </section>
          <CarEditorial vehicle={vehicle} cityName={cityName} />
          <section className="mt-10">
            <h2 className="font-display mb-4 text-2xl">{aeoUi[lang].why}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {tr.car.included_items.map((x) => <li key={x} className="flex items-center gap-2 text-sm"><Check className="size-4 text-primary" />{x}</li>)}
            </ul>
            {deliveryTier(vehicle) !== "exotic" && dailyCharges(rawCfg).any && (
              <p className="mt-4 text-sm text-muted-foreground" data-testid="charged-per-day"><span className="font-semibold text-foreground">{tr.car.chargedTitle}:</span> {fmt(tr.car.chargedLine, { ins: dailyCharges(rawCfg).ins, toll: dailyCharges(rawCfg).toll })}</p>
            )}
          </section>
        </div>
      </Container>

      <InstagramStrip />
      <section className="py-16" aria-labelledby="car-faq">
        <Container className="max-w-3xl">
          <h2 id="car-faq" className="font-display mb-6 text-2xl md:text-3xl">{tr.faq.title}</h2>
          <FaqList items={carFaqItems} />
        </Container>
      </section>

      {priceless ? <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-4 border-t border-border bg-card px-5 py-3 md:hidden"><div className="font-display text-lg text-primary">{tr.fleet.priceOnRequest}</div><PricelessWhatsApp lang={lang} car={vehicle.name} city={cityName} size="sm" /></div> :
      <div data-testid="car-sticky" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-[minmax(0,1fr)_minmax(0,1.65fr)] items-center gap-3 border-t border-border bg-card px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{usd2(vehicle.daily_price_usd)}{tr.fleet.perDay} · {tr.car.total}</div>
          <div className="font-display text-lg">{totalLabel}</div>
        </div>
        <Button className="min-h-11 whitespace-normal px-3 py-2 text-sm" onClick={onContinue} disabled={!!issue || !bookedReady}>{tr.car.continue}</Button>
      </div>}
    </div>
  );
}

function Row({ l, r, accent }: { l: string; r: string; accent?: boolean }) {
  return <div className="flex justify-between py-1 text-muted-foreground"><span>{l}</span><span className={accent ? "text-primary" : "text-foreground"}>{r}</span></div>;
}
