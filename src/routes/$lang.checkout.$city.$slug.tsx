import { NotFoundPage } from "@/components/site/NotFoundPage";
import { MeasureOneCard } from "@/components/site/MeasureOneCard";
import { CheckoutValidation, ValidationField, focusCheckoutError } from "@/components/site/CheckoutValidation";
import { modelScarcityQuery } from "@/lib/scarcityQuery";
import { checkoutInvalidFields } from "@/lib/checkoutValidation";
import { checkoutValidationText, deliveryRowText, deliveryLegText } from "@/lib/i18n";
import { ownerText } from "@/lib/i18n";
import { conciergeText } from "@/lib/i18n";
import { DeliveryLegs, DeliveryLegSummary, LegsConfirmed } from "@/components/site/DeliveryLegs";
import { decodeLegs, useDeliveryQuote } from "@/hooks/useDeliveryQuote";
import { BookingNextSteps } from "@/components/site/BookingNextSteps";
import { RentalTerms } from "@/components/site/RentalTerms";
import { bookingBase, sameCityDeliveryOnly, type DeliveryLeg } from "@/lib/pricing";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { metaAllowed, metaCookies, metaReady, metaTrack } from "@/lib/metaPixel";
import { trackFunnel, trackPurchase, type Purchase } from "@/lib/funnel";
import { storedAttribution } from "@/lib/attribution";
import { useEffect, useRef, useState } from "react";
import { CardForm, PaymentTestModeBanner } from "@/components/pay/CardForm";
import { Check, ChevronDown, Upload, ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { settingsQuery, vehicleQuery } from "@/lib/queries";
import { detectDeliveryCity } from "@/lib/deliveryCity";
import { interCityLabel } from "@/lib/deliveryText";
import { t, fmt, globalPaysLabel, minDaysMsg, recoveryText, type Lang } from "@/lib/i18n";
import { captureCheckout } from "@/services/checkout-recovery.functions";
import { getUnavailableIds } from "@/services/catalog.functions";
import { useLang } from "@/hooks/use-lang";
import { useCities } from "@/hooks/use-cities";
import { effectiveMinDays, locationMinDays, rentalDays, dueAtBooking, paymentMode, computeQuote, crossCell, crossConfig, DEFAULT_SETTINGS, deliveryConfig, deliveryTier, matchingFees, feeName, usd, usd2, durationLabel, rentalRateText, promoLabels, type CrossMode } from "@/lib/pricing";
import { quoteDelivery, suggestDeliveryAddress } from "@/services/delivery.functions";
import { photoUrl } from "@/lib/vehicles";
import { InsuranceUpload } from "@/components/site/InsuranceUpload";
import { measureOneLink, type InsuranceChoice } from "@/lib/insurance";
import { attachDocuments, confirmHold, createPrereservation, getBooking, getDocumentUploadUrls, getStripePublic, submitPrereservation } from "@/services/booking.functions";
import { BirthDateField, DateTimeField } from "@/components/site/DateTimeField";
import { CancellationSummary, NoHiddenFeesBadge, PaymentBadges } from "@/components/site/Conversion";
import { convText, waMessage } from "@/lib/i18n";
import { useWaContext } from "@/lib/waContext";
import { countryOptions } from "@/lib/countries";
import { locLeg } from "@/lib/searchLocation";
import { getCheckoutFlow, getGpOption, getGpQuote, payInstant, startGpRequest, startInstantCheckout } from "@/services/instant.functions";
import { GpPayOption } from "@/components/pay/GpPayOption";
import { PaymentMethodCards } from "@/components/pay/PaymentMethodCards";
import { Container, PageError } from "@/components/site/Sections";
import { fieldCls as baseFieldCls } from "@/components/site/SearchBox";
const fieldCls = cn(baseFieldCls, "text-base");
import { citiesQuery } from "@/lib/queries";
import { resolveServiceCity, hasDailyPrice } from "@/lib/vehicles";
import { PriceOnRequestPanel } from "@/components/site/PriceOnRequest";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { DocumentUploadCard } from "@/components/site/DocumentUploadCard";
import { checkoutPackageText } from "@/lib/i18n";
import { driverFromDocuments, type DocumentResults } from "@/lib/documentCheck";
import { checkUploadedDocument } from "@/services/document-ai.functions";
import { startIdentity, checkIdentity } from "@/services/identity.functions";
import { docMode, documentsComplete, identitySubmitted, requiredUploads } from "@/lib/identity";
import { identityText, insuranceText, checkoutDocumentText } from "@/lib/i18n";
import { resizeChildSeats, upsellConfig, upsellPricing, type ChildSeats, type HotelLogistics, type LuggageLogistics } from "@/lib/checkoutExtras";

type CheckoutSearch = { city?: string | undefined; pickup?: string | undefined; ret?: string | undefined; loc?: string | undefined; rloc?: string | undefined; ins?: boolean | undefined; hotel?: boolean | undefined; lug?: boolean | undefined; seat?: boolean | undefined; fuel?: boolean | undefined; vip?: boolean | undefined; dl?: string | undefined; fees?: string | undefined };

function CheckoutGate() {
  const { unavailable, priceless, carName, cityLabel } = Route.useLoaderData();
  const { lang, city, slug } = Route.useParams();
  // Hard guard: a car without a daily price never renders driver/payment forms or a $0 total.
  if (priceless) return <Container className="max-w-md py-24"><PriceOnRequestPanel lang={lang as Lang} car={carName} city={cityLabel}><Link to="/$lang/cars/$city/$slug" params={{ lang, city, slug }} className="text-center text-sm text-primary hover:underline" data-testid="priceless-back">{t(lang as Lang).fleet.backToCar}</Link></PriceOnRequestPanel></Container>;
  if (!unavailable) return <Checkout />;
  const tr = t(lang as Lang);
  return <Container className="py-24 text-center"><p className="text-muted-foreground" data-testid="checkout-unavailable">{tr.car.unavailable}</p><Link to="/$lang/fleet" params={{ lang }} search={{ city } as never} className="mt-6 inline-block text-primary hover:underline">{tr.nav.fleet}</Link></Container>;
}

export const Route = createFileRoute("/$lang/checkout/$city/$slug")({
  validateSearch: (s: Record<string, unknown>): CheckoutSearch => ({
    city: typeof s["city"] === "string" ? s["city"] : undefined,
    pickup: typeof s["pickup"] === "string" ? s["pickup"] : undefined,
    ret: typeof s["ret"] === "string" ? s["ret"] : undefined,
    loc: typeof s["loc"] === "string" ? s["loc"] : undefined,
    rloc: typeof s["rloc"] === "string" ? s["rloc"] : undefined,
    ins: undefined, // Ignore legacy supplemental-insurance links.
    hotel: s["hotel"] === true || s["hotel"] === "true",
    lug: s["lug"] === true || s["lug"] === "true",
    seat: s["seat"] === true || s["seat"] === "true",
    fuel: s["fuel"] === true || s["fuel"] === "true",
    vip: s["vip"] === true || s["vip"] === "true",
    dl: typeof s["dl"] === "string" && s["dl"].length <= 1500 ? s["dl"] : undefined,
    fees: typeof s["fees"] === "string" && s["fees"] ? s["fees"].slice(0, 400) : undefined,
  }),
  loaderDeps: ({ search }) => ({ pickup: search.pickup, ret: search.ret }),
  loader: async ({ context, params, deps }) => {
    const [v, , unavailable] = await Promise.all([
      context.queryClient.ensureQueryData(vehicleQuery(params.city, params.slug)),
      context.queryClient.ensureQueryData(settingsQuery()),
      deps.pickup && deps.ret ? getUnavailableIds({ data: { city: params.city, pickup: deps.pickup, ret: deps.ret } }) : Promise.resolve([] as string[]),
    ]);
    if (!v) throw notFound();
    if (!hasDailyPrice(v)) return { unavailable: false, priceless: true, carName: v.name, cityLabel: ((await context.queryClient.ensureQueryData(citiesQuery())) as { slug: string; name: string }[]).find((c) => c.slug === v.city)?.name ?? v.city };
    if (deps.pickup && deps.ret) await context.queryClient.ensureQueryData(modelScarcityQuery(v.id, deps.pickup, deps.ret));
    // Booked dates are a normal state, not a server error: show a friendly message instead of a 500.
    return { unavailable: unavailable.includes(v.id), priceless: false, carName: v.name, cityLabel: v.city };
  },
  head: () => ({ meta: [{ title: "Booking — Onic Car Rentals" }, { name: "description", content: "Complete your Onic Car Rentals booking with an itemized payment summary." }, { property: "og:title", content: "Booking — Onic Car Rentals" }, { property: "og:description", content: "Complete your Onic Car Rentals booking with an itemized payment summary." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
  component: CheckoutGate,
  errorComponent: PageError,
  notFoundComponent: NotFoundPage,
});

type Driver = { firstName: string; lastName: string; email: string; phone: string; country: string; dateOfBirth: string; address: string; flightNumber: string; licenseNumber?: string; licenseExpiry?: string; passportNumber?: string };
type DocKey = "licenseFront" | "licenseBack" | "passport" | "secondLicense" | "addLicenseFront" | "addLicenseBack" | "addPassport" | "insurancePolicy";
const ADD_KEYS = ["addLicenseFront", "addLicenseBack", "addPassport"] as const;
const REQUIRED: DocKey[] = ["licenseFront", "licenseBack", "passport"];
const DOC_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif"];
const extOf = (f: File) => { const t = f.type || ""; if (t === "application/pdf" || /\.pdf$/i.test(f.name)) return "pdf"; if (t.includes("png")) return "png"; if (t.includes("heic") || /\.heic$/i.test(f.name)) return "heic"; if (t.includes("heif") || /\.heif$/i.test(f.name)) return "heif"; return "jpg"; };

function Checkout() {
  const navigate = useNavigate();
  const { city, slug } = Route.useParams();
  const search = Route.useSearch();
  const { lang, tr } = useLang();
  const c = tr.checkout;
  const { data: v } = useSuspenseQuery(vehicleQuery(city, slug));
  const { data: settings } = useSuspenseQuery(settingsQuery());
  const cities = useCities();
  const cityRow = resolveServiceCity(cities, search.city, city);
  if (!v) throw notFound();
  const vehicle = v;
  const upsells = upsellConfig(((settings as { delivery_config?: { upsells?: unknown } }).delivery_config)?.upsells);
  const tx = checkoutPackageText[lang];
  const s = { ...DEFAULT_SETTINGS, ...settings, ...upsellPricing(upsells) };
  const [extraChoices] = useState({ insurance: false, hotelCheckin: !!search.hotel, luggageCar: !!search.lug && upsells.luggageCarActive, babySeat: !!search.seat, coverage: false, prepaidFuel: !!search.fuel, vipDelivery: !!search.vip });
  const [childSeats, setChildSeats] = useState<ChildSeats | undefined>(() => (search.seat ? resizeChildSeats(undefined, 1) : undefined));
  const [luggageLogistics, setLuggageLogistics] = useState<LuggageLogistics>({ pickupPoint: "MCO", pickupAddress: "", deliveryAddress: "", pickupTime: "" });
  const [hotelLogistics, setHotelLogistics] = useState<HotelLogistics>({ hotelName: "", hotelAddress: "", arrivalTime: "" });
  const rawCfg = (settings as { delivery_config?: unknown }).delivery_config;
  const dcfg = deliveryConfig(rawCfg);
  const svcCity = bookingBase(cityRow?.slug ?? city);
  const cell = crossCell(vehicle.city, svcCity, vehicle, crossConfig((rawCfg as { cross?: unknown } | null)?.cross));
  const tier = deliveryTier(vehicle);
  const airportInfo = dcfg.airports[svcCity];

  const exoticCar = deliveryTier(vehicle) === "exotic";
  const custom = matchingFees(deliveryConfig(rawCfg).custom_fees, { body_category: vehicle.body_category, exotic: exoticCar }, svcCity);
  const chosenFees = (search.fees ?? "").split(",").filter((id) => custom.some((f) => f.id === id && f.mode === "optional"));
  const addons = { ...extraChoices, insurance: false, coverage: false, childSeats: extraChoices.babySeat ? childSeats : undefined, ...(extraChoices.luggageCar ? { luggageLogistics } : {}), ...(extraChoices.hotelCheckin ? { hotelLogistics } : {}), fees: chosenFees };
  // Rental dates live in checkout state so "Change" can edit them without losing anything typed.
  const [dates, setDates] = useState({ pickup: search.pickup ?? "", ret: search.ret ?? "" });
  const [draftDates, setDraftDates] = useState(dates);
  const pickup = dates.pickup ? new Date(dates.pickup) : null;
  const ret = dates.ret ? new Date(dates.ret) : null;
  // Location chosen in search arrives pre-selected (same place for the return); the car's own restrictions still apply.
  const searchLeg = (() => { const l = locLeg(search.loc, vehicle.city, rawCfg); if (!l || l.city !== vehicle.city) return null; if (sameCityDeliveryOnly(vehicle) && l.type === "airport") return null; return l; })();
  const handed = decodeLegs(search.dl);
  const dlv = useDeliveryQuote(vehicle, svcCity, handed ?? { pickup: searchLeg ?? { city: vehicle.city, type: "pickup" }, ret: locLeg(search.rloc ?? search.loc, vehicle.city, rawCfg) && searchLeg ? (locLeg(search.rloc ?? search.loc, vehicle.city, rawCfg) as DeliveryLeg) : { city: vehicle.city, type: "pickup" }, same: true });
  const { pickupLeg, setPickupLeg, returnLeg, setReturnLeg, sameReturn, setSameReturn, dq, dqBusy, dOk, optPrices, shownLegs, deliveryFee, deliveryPending, deliveryChoice, mcoFree } = dlv;
  // Locations chosen on the car page arrive confirmed; the customer can still reopen them.
  const [editLegs, setEditLegs] = useState(!handed);
  const carMin = effectiveMinDays(vehicle, (settings as { min_days_by_category?: unknown }).min_days_by_category).n;
  const orlandoMin = locationMinDays(cityRow?.slug ?? city);
  const minN = Math.max(carMin, orlandoMin);
  const shortMsg = () => orlandoMin > carMin ? tr.search.orlandoMin : minDaysMsg(tr, minN);
  const tooShort = !!(pickup && ret && rentalDays(pickup, ret) < minN);
  const quote = pickup && ret && !tooShort ? computeQuote(vehicle, pickup, ret, addons, s, deliveryFee, dOk?.embeddedFee ?? 0, { exotic: exoticCar, deliveryPending, fees: deliveryConfig(rawCfg).fees, customFees: custom, chosenFees }) : null;
  const due = quote ? dueAtBooking(quote, paymentMode(vehicle, (settings as { payment_modes?: unknown }).payment_modes)) : null;

  const [step, setStep] = useState(0);
  const [preparedKey, setPreparedKey] = useState("");
  const [captureToken, setCaptureToken] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const cv = convText[lang];
  const cityLabel = cities.find((x) => x.slug === (cityRow?.slug ?? city))?.name ?? city;
  useWaContext(dates.pickup && dates.ret ? waMessage(lang, { kind: "checkout", car: vehicle.name, city: cityLabel, pickup: dates.pickup, ret: dates.ret, total: quote?.total ?? null, step }) : waMessage(lang, { kind: "car", car: vehicle.name, city: cityLabel }));
  const attach = useServerFn(attachDocuments);
  const countries = countryOptions(lang);
  const [summaryOpen, setSummaryOpen] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const update = () => setSummaryOpen(desktop.matches);
    update(); desktop.addEventListener("change", update);
    return () => desktop.removeEventListener("change", update);
  }, []);
  const [busy, setBusy] = useState(false);
  const [driver, setDriver] = useState<Driver>({ firstName: "", lastName: "", email: "", phone: "", country: "", dateOfBirth: "", address: "", flightNumber: "" });
  const [uploaded, setUploaded] = useState<Partial<Record<DocKey, string>>>({});
  const [uploadSession, setUploadSession] = useState<{ folder: string; capability: string } | null>(null);
  const [docBusy, setDocBusy] = useState<Partial<Record<DocKey, boolean>>>({});
  const [docMessage, setDocMessage] = useState<Partial<Record<DocKey, string>>>({});
  const [docResults, setDocResults] = useState<DocumentResults>({});
  const analyze = useServerFn(checkUploadedDocument);
  const [insuranceChoice, setInsuranceChoice] = useState<InsuranceChoice | null>(null);
  const [files, setFiles] = useState<Partial<Record<DocKey, File>>>({});
  // Additional driver (first one free — no price line). Unchecked = nothing about him is sent or stored on the booking.
  const [addDriverOn, setAddDriverOn] = useState(false);
  const [addDriverName, setAddDriverName] = useState("");
  const [docs, setDocs] = useState<{ folder: string } | null>(null);
  // Licence issuing country decides the Documents step: Brazil = uploads as before; others = Stripe Identity (+ passport unless USA).
  const [licenseCountry, setLicenseCountry] = useState("");
  const mode = docMode(licenseCountry);
  const [idv, setIdv] = useState<{ sessionId: string; ref: string; status: string; url: string | null } | null>(null);
  const [idvBusy, setIdvBusy] = useState(false);
  // Once Stripe reports the submission (processing/verified), progression is latched for that session: the final
  // result arrives later by webhook and never traps the client in checkout.
  const [idvSubmittedId, setIdvSubmittedId] = useState<string | null>(null);
  useEffect(() => { if (idv && identitySubmitted(idv.status)) setIdvSubmittedId(idv.sessionId); }, [idv?.sessionId, idv?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const idvGate = !idv ? null : idv.status === "verified" ? "verified" : idvSubmittedId === idv.sessionId ? "processing" : idv.status;
  const idt = identityText[lang];
  const documentCopy = checkoutDocumentText[lang];
  const startIdv = useServerFn(startIdentity);
  const checkIdv = useServerFn(checkIdentity);
  const [res, setRes] = useState<{ token: string; amount: number; mode?: string; clientSecret: string | null; stripeConnected: boolean; stripeMode: "sandbox" | "live" } | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [waOptIn, setWaOptIn] = useState(false);
  const [done, setDone] = useState(false);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  useEffect(() => {
    if (!done || !purchase) return;
    let live = true;
    void metaReady().then(() => { if (live) trackPurchase(purchase); });
    return () => { live = false; };
  }, [done, purchase]);

  const uploadUrls = useServerFn(getDocumentUploadUrls);
  const create = useServerFn(createPrereservation);
  const capture = useServerFn(captureCheckout);
  const submit = useServerFn(submitPrereservation);
  const stripePublic = useServerFn(getStripePublic);
  const flowFn = useServerFn(getCheckoutFlow);
  const startInstant = useServerFn(startInstantCheckout);
  const pay = useServerFn(payInstant);
  const startGp = useServerFn(startGpRequest);
  const gpOptFn = useServerFn(getGpOption);
  const [gpOpt, setGpOpt] = useState<{ available: boolean; mock: boolean; interestFree: number } | null>(null);
  const [clientType, setClientType] = useState<"brazilian" | "international" | null>(null);
  const [payMethod, setPayMethod] = useState<"card" | "gp">("card");
  const quoteFn = useServerFn(getGpQuote);
  const [gpQuote, setGpQuote] = useState<{ amount: number; q: Awaited<ReturnType<typeof getGpQuote>> | "loading" } | null>(null);
  useEffect(() => { gpOptFn().then(setGpOpt).catch(() => setGpOpt(null)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [flow, setFlow] = useState<"instant" | "request" | null>(null);
  const [inst, setInst] = useState<{ token: string; total: number; holdUntil: string } | null>(null);
  const [stripeCfg, setStripeCfg] = useState<{ connected: boolean; adminTest: boolean } | null>(null);
  const confirm = useServerFn(confirmHold);
  const metaSent = useRef("");
  useEffect(() => { if (metaSent.current === slug) return; metaSent.current = slug; metaTrack("InitiateCheckout", { content_type: "product", content_ids: [slug], currency: "USD" }); }, [slug]);

  const funnelKey = slug; // each funnel step counts once per checkout visit, even if dates are edited
  const funnelParams = { car: slug, city: vehicle.city, pickup: dates.pickup.slice(0, 10), return: dates.ret.slice(0, 10), total: quote?.total ?? null, currency: "USD" };
  useEffect(() => { if (quote && !dqBusy) trackFunnel("checkout_started", funnelParams, funnelKey); }, [funnelKey, !!quote, dqBusy]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (step === 1) trackFunnel("documents_step_viewed", funnelParams, funnelKey); if (step === 3) trackFunnel("payment_step_viewed", funnelParams, funnelKey); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { flowFn({ data: { vehicleId: vehicle.id } }).then(setFlow).catch(() => setFlow("request")); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!idv || idv.status === "verified" || idv.status === "canceled") return;
    let live = true;
    const tick = () => { checkIdv({ data: { sessionId: idv.sessionId, ref: idv.ref } }).then((r) => { if (live) setIdv((p) => p && p.sessionId === idv.sessionId ? { ...p, status: r.status, url: r.url ?? p.url } : p); }).catch(() => {}); };
    const id = window.setInterval(tick, 4000);
    // Mobile browsers pause timers in background tabs and often skip "focus" on tab return: re-check on visibility too.
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", tick);
    return () => { live = false; window.clearInterval(id); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pageshow", tick); };
  }, [idv?.sessionId, idv?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { stripePublic().then(setStripeCfg).catch(() => setStripeCfg({ connected: false, adminTest: false })); }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // An instant car whose delivery has no automatic price goes through the normal request flow.
  const instantCar = flow === "instant" && dOk?.status !== "quote_pending";
  // Every category uses full payment; Brazilian payment routing remains available.
  // Global Pays and Stripe both charge the entire rental total on the Payment step.
  const gpAllowed = !instantCar && !!gpOpt?.available;
  const askClient = false;
  const gpPath = false;
  const instant = instantCar || gpPath;
  const ti = c.instant;
  const offline = !instant && !stripeCfg?.connected && !stripeCfg?.adminTest;
  const gpAmount = due?.amount ?? null;
  useEffect(() => {
    if (step !== 3 || payMethod !== "gp" || gpAmount == null || gpQuote?.amount === gpAmount) return;
    setGpQuote({ amount: gpAmount, q: "loading" });
    quoteFn({ data: { amount: gpAmount } }).then((q) => setGpQuote({ amount: gpAmount, q })).catch(() => setGpQuote({ amount: gpAmount, q: null }));
  }, [step, payMethod, gpAmount]); // eslint-disable-line react-hooks/exhaustive-deps

  const validationInput = { driver, pickup: pickupLeg, ret: returnLeg, same: sameReturn, pickupAt: pickup ?? new Date(), minAge: vehicle.min_age, askClient, clientType, babySeat: !!addons.babySeat, childSeats, hotelCheckin: addons.hotelCheckin, hotel: hotelLogistics, luggageCar: addons.luggageCar, luggage: luggageLogistics, paymentReady: instant || (!offline && (!res?.stripeConnected || authorized)), uploaded, docBusy, accepted, licenseCountry, identityStatus: idvGate };
  const invalidFields = checkoutInvalidFields(step, validationInput);
  const invalidKey = JSON.stringify(invalidFields);
  useEffect(() => {
    setFieldErrors(previous => previous.filter(key => invalidFields.includes(key) || (step === 1 && key === "additionalDriver" && addDriverOn && (addDriverName.trim().length < 2 || addDriverName.trim().length > 120 || ADD_KEYS.some(k => !uploaded[k]))) || (step === 1 && key === "documentUploads" && Object.values(docBusy).some(Boolean))));
  }, [invalidKey, step, addDriverOn, addDriverName, uploaded, docBusy]);
  const validateStep = () => {
    const errors = checkoutInvalidFields(step, validationInput);
    setFieldErrors(errors);
    if (!errors.length) return true;
    focusCheckoutError(errors); if (step > 1) toast.error(c.required); return false;
  };
  if (!stripeCfg || !flow) return <Container className="py-24 text-center text-muted-foreground">…</Container>;

  if (!pickup || !ret || !quote) {
    return (
      <Container className="py-24 text-center">
        <p className="mb-6 text-muted-foreground">{tooShort ? shortMsg() : tr.car.invalidDates}</p>
        <Button asChild><Link to="/$lang/cars/$city/$slug" params={{ lang, city, slug }}>{vehicle.name}</Link></Button>
      </Container>
    );
  }

  const errMsg = (e: unknown) => {
    const m = e instanceof Error ? e.message : "";
    if (m.includes("TOO_SOON")) return fmt(tr.car.tooSoon, { h: s.min_lead_time_hours });
    if (m.includes("ORLANDO_MIN_DAYS")) return tr.search.orlandoMin;
    if (m.includes("MIN_DAYS")) return shortMsg();
    if (m.includes("UNDER_AGE")) return fmt(c.underAge, { n: vehicle.min_age });
    if (m.includes("HOLD_EXPIRED")) return ti.holdExpired;
    if (m.includes("DELIVERY_CITY")) return tr.delivery.cityRequired;
    if (m.includes("DELIVERY_PRICE")) return tr.delivery.priceError;
    if (m.includes("DELIVERY_ADDRESS")) return tr.delivery.errAddress;
    if (m.includes("MODE_NOT_OFFERED") || m.includes("PICKUP_ONLY") || m.includes("NOT_SERVED") || m.includes("DELIVERY_REQUIRED")) return tr.delivery.errMode;
    if (m.includes("INSURANCE_NOT_OFFERED")) return tr.delivery.errInsurance;
    if (m.includes("DELIVERY_QUOTE")) return c.genericError;
    if (m.includes("PAYMENT_UNAVAILABLE") || m.includes("FLOW_UNAVAILABLE")) return ti.paymentUnavailable;
    if (m.includes("DOCS_REQUIRED")) return c.docsRequired;
    if (m.includes("UNAVAILABLE")) return tr.car.unavailable;
    return c.genericError;
  };

  // Flight is asked once, on the car page airport leg; it travels with the leg into the booking.
  const legFlight = (l: DeliveryLeg) => (l.type === "airport" ? l.flightNumber?.trim() || undefined : undefined);
  const flightNumber = legFlight(pickupLeg) ?? legFlight(sameReturn ? pickupLeg : returnLeg);
  type DocsOut = { folder: string; licenseFront?: string; licenseBack?: string; passport?: string; insurancePolicy?: string; additionalDriver?: { fullName: string; licenseFront: string; licenseBack: string; passport: string } };
  /** null = incomplete. `documents` is omitted only for a verified USA licence with no files at all. */
  const docsUpload = (): { documents?: DocsOut; identity?: { sessionId: string; ref: string } } | null => {
    if (!documentsComplete(mode, uploaded, idvGate)) return null;
    const add = addDriverOn ? (addDriverName.trim().length >= 2 && uploaded.addLicenseFront && uploaded.addLicenseBack && uploaded.addPassport ? { fullName: addDriverName.trim(), licenseFront: uploaded.addLicenseFront, licenseBack: uploaded.addLicenseBack, passport: uploaded.addPassport } : null) : undefined;
    if (add === null) return null;
    const files: Omit<DocsOut, "folder"> = { ...Object.fromEntries(requiredUploads(mode).map((k) => [k, uploaded[k]])), ...(add ? { additionalDriver: add } : {}), ...(insuranceChoice === "own" && uploaded.insurancePolicy ? { insurancePolicy: uploaded.insurancePolicy } : {}) };
    if (Object.keys(files).length && !uploadSession) return null;
    const identity = mode !== "brazil" && idv ? { sessionId: idv.sessionId, ref: idv.ref } : undefined;
    return { ...(Object.keys(files).length && uploadSession ? { documents: { folder: uploadSession.folder, ...files } } : {}), ...(identity ? { identity } : {}) };
  };

  // Order: 0 driver/logistics → 1 documents → 2 terms → 3 payment (last). All state lives here, so Back never loses data.
  const payloadFor = (captureToken?: string) => ({
    vehicleSlug: slug, city, serviceCity: svcCity, pickupAt: pickup.toISOString(), returnAt: ret.toISOString(),
    delivery: deliveryChoice, addons,
    driver: { ...driver, flightNumber } as Driver, whatsappOptIn: waOptIn, language: lang as Lang,
    ...(captureToken ? { captureToken } : {}),
  });
  const payloadKey = JSON.stringify(payloadFor());
  const next0 = async () => {
    if (!validateStep()) return;
    if (!dq || dqBusy) return;
    if (!dq.ok) return void toast.error(errMsg(new Error(dq.error)));
    setBusy(true);
    try {
      // Abandoned-checkout capture only (no payment, no stock hold).
      const captured = await capture({ data: { ...payloadFor(), attribution: storedAttribution() } as never });
      setCaptureToken(captured.token);
      trackFunnel("driver_info_completed", funnelParams, funnelKey);
      setEditLegs(false); setStep(1);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const next1 = () => {
    if (!validateStep()) return;
    if (!mode) return void setFieldErrors(["licenseCountry"]);
    if (mode !== "brazil" && !identitySubmitted(idvGate)) return void setFieldErrors(["identity"]);
    if (requiredUploads(mode).some((k) => !uploaded[k]) || Object.values(docBusy).some(Boolean)) return void setFieldErrors(["documentUploads"]);
    if (addDriverOn && (addDriverName.trim().length < 2 || addDriverName.trim().length > 120 || ADD_KEYS.some((k) => !uploaded[k]))) return void setFieldErrors(["additionalDriver"]);
    if (!docsUpload()) return void setFieldErrors(["documentUploads"]);
    setStep(2);
  };
  // Terms accepted → the payment is prepared (same server calls as before) and documents are attached to it.
  const next2 = async () => {
    if (!validateStep()) return;
    const out = docsUpload();
    if (!out) return void toast.error(c.docsRequired);
    if (offline) return void setStep(3); // payment step shows "being configured" and blocks submission
    if ((res || inst) && preparedKey === payloadKey) return void setStep(3);
    setBusy(true);
    try {
      const payload = { ...payloadFor(captureToken), attribution: storedAttribution() };
      let token: string;
      if (gpPath) { const r = await startGp({ data: payload as never }); setInst(r); setRes(null); token = r.token; }
      else if (instant) { const r = await startInstant({ data: payload as never }); setInst(r); setRes(null); token = r.token; }
      else { const r = await create({ data: payload as never }); setRes(r); setInst(null); setAuthorized(false); token = r.token; }
      await attach({ data: { token, ...(out.documents && uploadSession ? { capability: uploadSession.capability, documents: out.documents } : {}), ...(out.identity ? { identity: out.identity } : {}), ...(insuranceChoice ? { insuranceChoice } : {}), ...(mode === "stripe_us" ? { usInsurance: {} } : {}), driverDocs: { licenseNumber: driver.licenseNumber || undefined, licenseExpiry: driver.licenseExpiry || undefined, passportNumber: driver.passportNumber || undefined } } });
      setDocs(out.documents ?? { folder: "" }); setPreparedKey(payloadKey); setStep(3);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const locked = authorized; // after payment completes, earlier steps are read-only
  const goTo = (i: number) => { if (busy || locked || i >= step) return; setFieldErrors([]); setStep(i); };
  const backBtn = step > 0 && !locked ? <Button variant="outline" onClick={() => goTo(step - 1)} data-testid="checkout-back">{c.back}</Button> : <span />;
  const editDates = () => { if (locked) return; setDraftDates(dates); setEditLegs(true); setStep(0); };
  const draftP = draftDates.pickup ? new Date(draftDates.pickup) : null, draftR = draftDates.ret ? new Date(draftDates.ret) : null;
  const draftError = !draftP || !draftR || !(draftR > draftP) ? tr.car.invalidDates : rentalDays(draftP, draftR) < minN ? shortMsg() : null;
  const applyDraft = (d: { pickup: string; ret: string }) => {
    setDraftDates(d);
    const p = d.pickup ? new Date(d.pickup) : null, r = d.ret ? new Date(d.ret) : null;
    if (p && r && r > p && rentalDays(p, r) >= minN) setDates(d);
  };

  const goPay = async () => {
    if (!validateStep() || !inst) return;
    setBusy(true);
    trackFunnel("pre_reservation_submitted", { ...funnelParams, flow: gpPath ? "global_pays" : "instant" }, funnelKey);
    try { const { url } = await pay({ data: { token: inst.token, accepted: true } }); window.location.assign(url); }
    catch (e) { toast.error(errMsg(e)); setBusy(false); }
  };

  // Global Pays: a fresh gp_request booking (the unsubmitted card request simply expires), documents attached, then the hosted page.
  const goGp = async () => {
    const out = docsUpload();
    if (!out) return void toast.error(c.docsRequired);
    setBusy(true);
    try {
      const r = await startGp({ data: { ...payloadFor(captureToken), attribution: storedAttribution() } as never });
      await attach({ data: { token: r.token, ...(out.documents && uploadSession ? { capability: uploadSession.capability, documents: out.documents } : {}), ...(out.identity ? { identity: out.identity } : {}), ...(insuranceChoice ? { insuranceChoice } : {}), ...(mode === "stripe_us" ? { usInsurance: {} } : {}), driverDocs: { licenseNumber: driver.licenseNumber || undefined, licenseExpiry: driver.licenseExpiry || undefined, passportNumber: driver.passportNumber || undefined } } });
      trackFunnel("pre_reservation_submitted", { ...funnelParams, flow: "global_pays", due_today: r.amount }, funnelKey);
      const { url } = await pay({ data: { token: r.token, accepted: true } });
      window.location.assign(url);
    } catch (e) { toast.error(errMsg(e)); setBusy(false); }
  };

  // After a successful payment the booking submits itself (no manual click); the server finalize lock keeps it idempotent.
  const finish = async (auto = false) => {
    if (!res || (!auto && !validateStep())) return;
    setBusy(true);
    const eventId = crypto.randomUUID();
    const meta = metaAllowed() ? { eventId, contentId: slug, sourceUrl: window.location.href, ...metaCookies() } : undefined;
    try {
      const finalized = await submit({ data: { token: res.token, accepted: true, meta } });
      trackFunnel("pre_reservation_submitted", { ...funnelParams, flow: "request", due_today: res.amount }, funnelKey);
      setPurchase(finalized.purchase);
      setDone(true);
      await navigate({ to: "/$lang/thank-you/$token", params: { lang, token: res.token } });
    }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  if (done && res) {
    return (
      <Container className="max-w-xl py-24 text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-8" /></div>
        <h1 className="font-display mb-4 text-3xl md:text-5xl">{c.done}</h1>
        <BookingNextSteps lang={lang} />
        <DoneMeasureOne lang={lang} token={res.token} />
        <Button asChild size="lg" className="mt-6"><Link to="/$lang/booking/$token" params={{ lang, token: res.token }}>{c.viewBooking}</Link></Button>
      </Container>
    );
  }

  const openTab = (url: string | null) => { if (url) window.open(url, "_blank", "noopener"); };
  const startVerification = async () => {
    if (!licenseCountry) return void toast.error(idt.required);
    setIdvBusy(true);
    try {
      const r = await startIdv({ data: { licenseCountry, lang } });
      if ("error" in r) return void toast.error(idt.unavailable);
      setIdv({ sessionId: r.sessionId, ref: r.ref, status: r.status, url: r.url }); openTab(r.url);
    } catch { toast.error(idt.unavailable); } finally { setIdvBusy(false); }
  };
  const refreshVerification = async () => {
    if (!idv) return;
    try { const r = await checkIdv({ data: { sessionId: idv.sessionId, ref: idv.ref } }); setIdv((p) => p && p.sessionId === idv.sessionId ? { ...p, status: r.status, url: r.url ?? p.url } : p); } catch { /* keep current state; user can retry */ }
  };
  const retryVerification = () => { if (idv?.status === "needs_attention" || idv?.status === "pending") openTab(idv.url); };
  const selectDocument = async (kind: DocKey, file: File) => {
    const isAdd = (ADD_KEYS as readonly string[]).includes(kind);
    if (isAdd && !["image/jpeg", "image/png"].includes(file.type)) { toast.error(c.addDriverType); return; }
    const isIns = kind === "insurancePolicy";
    const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (isIns ? ((!pdf && !DOC_TYPES.includes(file.type) && !/\.(heic|heif)$/i.test(file.name)) || file.size > 10 * 1024 * 1024) : false) { toast.error(insuranceText[lang].fileType); return; }
    if (!isIns && ((!DOC_TYPES.includes(file.type) && !/\.(heic|heif)$/i.test(file.name)) || file.size > 10 * 1024 * 1024)) { toast.error(`${c.fileType} (10 MB)`); return; }
    setFiles((prev) => ({ ...prev, [kind]: file }));
    setUploaded((prev) => ({ ...prev, [kind]: undefined }));
    setDocBusy((prev) => ({ ...prev, [kind]: true }));
    setDocMessage((prev) => ({ ...prev, [kind]: tx.checking }));
    try {
      const fresh = await uploadUrls({ data: { exts: { [kind]: extOf(file) }, ...(uploadSession ?? {}) } });
      const session = { folder: fresh.folder, capability: fresh.capability };
      const u = fresh.urls[kind];
      if (!u) throw new Error(c.genericError);
      const { error } = await supabase.storage.from("customer-documents").uploadToSignedUrl(u.path, u.token, file, { contentType: file.type || (extOf(file) === "pdf" ? "application/pdf" : "image/jpeg"), upsert: true });
      if (error) throw new Error(c.genericError);
      const path = u.path;
      setUploadSession(session); setUploaded((prev) => ({ ...prev, [kind]: path }));
      if (isAdd || isIns) { setDocMessage((prev) => ({ ...prev, [kind]: isIns ? insuranceText[lang].uploaded : c.uploaded })); return; } // main-driver AI check only
      try {
        const results = await analyze({ data: { ...session, kind, path, name: `${driver.firstName} ${driver.lastName}`, returnAt: ret.toISOString() } });
        const merged = { ...docResults, ...results };
        setDocResults(merged);
        setDriver((prev) => ({ ...prev, ...driverFromDocuments(merged) }));
        setDocMessage((prev) => ({ ...prev, [kind]: tx.checked }));
      } catch (e) { setDocMessage((prev) => ({ ...prev, [kind]: e instanceof Error ? e.message : tx.failed })); }
    } catch (e) { setDocMessage((prev) => ({ ...prev, [kind]: c.genericError })); toast.error(c.genericError); }
    finally { setDocBusy((prev) => ({ ...prev, [kind]: false })); }
  };
  const primaryDisabled = busy || (step === 0 && dqBusy) || (step === 1 && Object.values(docBusy).some(Boolean)) || (step === 3 && offline);

  const primary = () => { if (step === 0) void next0(); else if (step === 1) next1(); else if (step === 2) void next2(); else if (step === 3 && !offline) void (instant ? goPay() : finish()); };
  const set = (k: keyof Driver) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDriver((d) => ({ ...d, [k]: e.target.value }));

  const validationLabels: Record<string, string> = {
    firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, country: c.country, dateOfBirth: c.dob, address: c.address,
    pickupLocation: deliveryRowText[lang].pickupCity, returnLocation: deliveryRowText[lang].returnCity,
    pickupAddress: `${deliveryLegText[lang].pickup} · ${deliveryLegText[lang].address}`, returnAddress: `${deliveryLegText[lang].return} · ${deliveryLegText[lang].address}`,
    clientType: c.route.q, payment: checkoutValidationText[lang].payment, terms: checkoutValidationText[lang].terms,
    documentUploads: c.docsRequired, additionalDriver: c.addDriverRequired, licenseFront: c.licenseFront, licenseBack: c.licenseBack, passport: c.passportAlt, licenseCountry: idt.country, identity: idt.title,
    seatQuantity: tx.seatQuantity, ...Object.fromEntries((childSeats?.ages ?? []).map((_, i) => [`childAge${i}`, fmt(tx.childAge, { n: i + 1 })])),
    "hotel.hotelName": tx.hotelName, "hotel.hotelAddress": tx.hotelAddress, "hotel.arrivalTime": tx.arrival,
    "luggage.pickupPoint": tx.pickupPoint, "luggage.pickupAddress": tx.pickupAddress, "luggage.deliveryAddress": tx.luggageAddress, "luggage.pickupTime": tx.pickupTime,
  };
  return (
    <Container className={cn("checkout-compact grid gap-6 pb-28 pt-6 lg:pt-10", step === 1 ? "max-w-3xl" : "lg:grid-cols-[1fr_380px]")}>
      <div className="checkout-content min-w-0">
        <h1 className="font-display mb-6 text-3xl md:text-5xl">{step === 1 ? documentCopy.title : c.title}</h1>
        {!instant && stripeCfg.adminTest && <p className="mb-6 rounded-2xl border border-primary p-4 text-sm text-primary">{due?.mode === "full" ? ti.paymentUnavailable : c.adminTest}</p>}
        <ol className="mb-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {(instant || due?.mode === "full" ? [cv.steps[0], cv.steps[1], cv.steps[2], tr.car.fullDue] : cv.steps).map((label, i) => (
            <li key={label} data-testid="checkout-step">
              <Button type="button" onClick={() => goTo(i)} disabled={i >= step || locked || busy} aria-current={i === step ? "step" : undefined} variant="ghost" className={cn("min-h-11 w-full shrink-0 justify-start gap-2 rounded-full border px-4 py-2 text-xs font-semibold disabled:cursor-default disabled:opacity-100", i === step ? "border-foreground bg-secondary text-foreground ring-1 ring-foreground" : i < step ? "border-foreground bg-foreground text-background hover:bg-foreground hover:text-background" : "border-border text-muted-foreground")}>
                <span className="flex items-center gap-1">{i + 1}{i < step && <Check className="size-3" />}</span><span className="sm:hidden">{c.steps[i]}</span><span className="hidden sm:inline">{label}</span>
              </Button>
            </li>
          ))}
        </ol>

        <CheckoutValidation compactErrors={step < 2} errors={fieldErrors} labels={validationLabels} lang={lang}>
        {step === 0 && !editLegs && <LegsConfirmed lang={lang} raw={rawCfg} pickup={pickupLeg} ret={sameReturn ? pickupLeg : returnLeg} legs={shownLegs ?? []} free={mcoFree} onEdit={editDates} />}
        {step === 0 && editLegs && <section className="mb-4 rounded-2xl border border-border bg-card p-4" data-testid="checkout-dates"><div className="grid gap-3 sm:grid-cols-2"><div className="flex flex-col gap-1 text-xs text-muted-foreground">{tr.car.pickup}<DateTimeField lang={lang} label={tr.car.pickup} value={draftDates.pickup} onChange={(v) => applyDraft({ ...draftDates, pickup: v })} className="mt-0" /></div><div className="flex flex-col gap-1 text-xs text-muted-foreground">{tr.car.ret}<DateTimeField lang={lang} label={tr.car.ret} value={draftDates.ret} onChange={(v) => applyDraft({ ...draftDates, ret: v })} className="mt-0" /></div></div>{draftError && <p className="mt-2 text-sm text-destructive" role="alert">{draftError}</p>}</section>}
        {step === 0 && editLegs && <DeliveryLegs hideFlight base={vehicle.city} exotic={sameCityDeliveryOnly(vehicle)} allowsOneWay={vehicle.allows_one_way} lang={lang} raw={rawCfg} pickup={pickupLeg} ret={returnLeg} same={sameReturn} onPickup={setPickupLeg} onReturn={setReturnLeg} onSame={setSameReturn} legs={shownLegs ?? []} optionPrices={optPrices} />}
        {step === 0 && (addons.babySeat || addons.luggageCar || addons.hotelCheckin) && <section className="mb-6 flex flex-col gap-4 border-y border-border py-5" data-testid="checkout-addon-details">
          {addons.babySeat && childSeats && <div className="grid grid-cols-2 gap-3" data-testid="child-seat-fields"><Field id="seatQuantity" label={tx.seatQuantity} wide><select className={cn(fieldCls, "min-h-11")} value={childSeats.quantity} onChange={(e) => setChildSeats((prev) => resizeChildSeats(prev, Number(e.target.value)))}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>{childSeats.ages.map((age, i) => <Field id={`childAge${i}`} key={i} label={fmt(tx.childAge, { n: i + 1 })}><input className={cn(fieldCls, "min-h-11 min-w-0")} maxLength={40} placeholder={tx.ageExample} value={age} onChange={(e) => setChildSeats((prev) => prev ? { ...prev, ages: prev.ages.map((a, index) => index === i ? e.target.value : a) } : prev)} /></Field>)}</div>}
          {addons.luggageCar && <div className="grid gap-3 sm:grid-cols-2" data-testid="luggage-logistics"><Field id="luggage.pickupPoint" label={tx.pickupPoint}><select className={fieldCls} value={luggageLogistics.pickupPoint} onChange={(e) => setLuggageLogistics((prev) => ({ ...prev, pickupPoint: e.target.value as LuggageLogistics["pickupPoint"] }))}><option value="MCO">Airport MCO</option><option value="MIA">Airport MIA</option><option value="base">{tx.base}</option><option value="other">{tx.other}</option></select></Field>{luggageLogistics.pickupPoint === "other" && <Field id="luggage.pickupAddress" label={tx.pickupAddress}><input className={fieldCls} value={luggageLogistics.pickupAddress} onChange={(e) => setLuggageLogistics((prev) => ({ ...prev, pickupAddress: e.target.value }))} /></Field>}<Field id="luggage.deliveryAddress" label={tx.luggageAddress}><input className={fieldCls} value={luggageLogistics.deliveryAddress} onChange={(e) => setLuggageLogistics((prev) => ({ ...prev, deliveryAddress: e.target.value }))} /></Field><ValidationField id="luggage.pickupTime"><div className="flex flex-col gap-1 text-xs text-muted-foreground">{tx.pickupTime}<DateTimeField lang={lang} label={tx.pickupTime} value={luggageLogistics.pickupTime} onChange={(v) => setLuggageLogistics((prev) => ({ ...prev, pickupTime: v }))} className="mt-0" /></div></ValidationField><p className="text-xs text-muted-foreground sm:col-span-2">{tx.luggageNote}</p></div>}
          {addons.hotelCheckin && <div className="grid gap-3 sm:grid-cols-2" data-testid="hotel-logistics"><p className="text-sm text-muted-foreground sm:col-span-2">{tx.hotelNote}</p>{(["hotelName", "hotelAddress"] as const).map((key) => <Field id={`hotel.${key}`} key={key} label={tx[key]}><input className={fieldCls} value={hotelLogistics[key]} onChange={(e) => setHotelLogistics((prev) => ({ ...prev, [key]: e.target.value }))} /></Field>)}<ValidationField id="hotel.arrivalTime"><div className="flex flex-col gap-1 text-xs text-muted-foreground">{tx.arrival}<DateTimeField lang={lang} label={tx.arrival} value={hotelLogistics.arrivalTime} onChange={(v) => setHotelLogistics((prev) => ({ ...prev, arrivalTime: v }))} className="mt-0" /></div></ValidationField><p className="text-xs text-muted-foreground sm:col-span-2">{tx.hotelScope}</p></div>}
        </section>}
        {step === 0 && (
          <div className="checkout-driver surface grid gap-4 p-6 sm:grid-cols-2" data-testid="driver-fields">
            <p className="text-sm text-muted-foreground sm:col-span-2" data-testid="approval-promise">{instant ? documentCopy.instantConfirmation : documentCopy.confirmation}</p>
            <p className="font-semibold sm:col-span-2" data-testid="driver-min-age">{fmt(ownerText[lang].age, { n: vehicle.min_age })}</p>
            <Field id="firstName" label={c.firstName}><input className={fieldCls} value={driver.firstName} onChange={set("firstName")} autoComplete="given-name" /></Field>
            <Field id="lastName" label={c.lastName}><input className={fieldCls} value={driver.lastName} onChange={set("lastName")} autoComplete="family-name" /></Field>
            <Field id="email" label={c.email}><input type="email" className={fieldCls} value={driver.email} onChange={set("email")} autoComplete="email" /></Field>
            <Field id="phone" label={c.phone}><input type="tel" className={fieldCls} value={driver.phone} onChange={set("phone")} placeholder={documentCopy.phoneExample} autoComplete="tel" /></Field>
            <Field id="country" label={c.country}><select className={cn(fieldCls, "cursor-pointer")} value={driver.country} onChange={set("country")} autoComplete="country-name" data-testid="country"><option value="">{cv.countryPick}</option>{countries.top.map((o) => <option key={`t-${o.value}`} value={o.value}>{o.label}</option>)}<option disabled>──────────</option>{countries.rest.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
            <ValidationField id="dateOfBirth"><div className="flex flex-col gap-1.5 text-[13px] font-medium leading-5 text-muted-foreground">{c.dob}<BirthDateField lang={lang} label={c.dob} value={driver.dateOfBirth} onChange={(v) => setDriver((d) => ({ ...d, dateOfBirth: v }))} /></div></ValidationField>
            <Field id="address" label={<span data-testid="address-label">{c.address}</span>} wide><input className={fieldCls} value={driver.address} onChange={set("address")} placeholder={c.addressHint} autoComplete="street-address" data-testid="address-input" /></Field>
            <p className="text-xs text-muted-foreground sm:col-span-2">{recoveryText[lang].privacy}</p>
            <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-2 text-sm sm:col-span-2" data-testid="wa-optin">
              <span className="min-w-0">{c.waOptIn}</span><Switch checked={waOptIn} onCheckedChange={(x) => setWaOptIn(!!x)} />
            </label>
          </div>
        )}

        {askClient && step === 0 && (
          <ValidationField id="clientType"><fieldset className="mb-4 rounded-2xl border border-primary/50 p-4 text-sm" data-testid="client-type">
            <legend className="px-1 font-semibold">{c.route.q}</legend>
            <div className="mt-2 flex flex-col gap-2">
              <label className="flex cursor-pointer items-center gap-2"><input type="radio" name="clientType" checked={clientType === "brazilian"} onChange={() => setClientType("brazilian")} data-testid="client-br" />{c.route.yes} — {globalPaysLabel(lang, gpOpt?.interestFree ?? 6)}</label>
              <label className="flex cursor-pointer items-center gap-2"><input type="radio" name="clientType" checked={clientType === "international"} onChange={() => setClientType("international")} data-testid="client-intl" />{c.route.no} — {c.route.intl}</label>
            </div>
          </fieldset></ValidationField>
        )}
        {step === 1 && (
          <section className="flex flex-col gap-4" data-testid="documents-step">
            <p className="text-sm text-muted-foreground">{mode === "stripe_us" ? documentCopy.usNote : mode === "stripe_foreign" ? documentCopy.foreignNote : mode === "brazil" ? documentCopy.brazilNote : documentCopy.choose}</p>
            <Field id="licenseCountry" label={`${idt.country} *`}><select className={cn(fieldCls, "cursor-pointer")} value={licenseCountry} onChange={(e) => { setLicenseCountry(e.target.value); setIdv(null); }} data-testid="license-country"><option value="">{idt.pick}</option>{countries.top.map((o) => <option key={`lt-${o.value}`} value={o.value}>{o.label}</option>)}<option disabled>──────────</option>{countries.rest.map((o) => <option key={`l-${o.value}`} value={o.value}>{o.label}</option>)}</select></Field>
            {mode && mode !== "brazil" && <ValidationField id="identity"><IdentityPanel requiredLabel={documentCopy.required} t={idt} idv={idv && idvGate ? { status: idvGate } : idv} busy={idvBusy} onStart={startVerification} onRetry={retryVerification} onRefresh={refreshVerification} /></ValidationField>}
            {mode === "stripe_foreign" && <ValidationField id="passport"><DocumentUploadCard label={idt.passportForeign} file={files.passport} lang={lang} onFile={(f) => { void selectDocument("passport", f); }} busy={!!docBusy.passport} disabled={Object.values(docBusy).some(Boolean)} status={docMessage.passport} /></ValidationField>}
            {mode === "brazil" && (["licenseFront", "licenseBack", "passport"] as const).map((k) => <ValidationField key={k} id={k}><DocumentUploadCard label={`${k === "passport" ? c.passportAlt : c[k]}${REQUIRED.includes(k) ? " *" : ""}`} file={files[k]} lang={lang} onFile={(f) => { void selectDocument(k, f); }} busy={!!docBusy[k]} disabled={Object.values(docBusy).some(Boolean)} status={docMessage[k]} /></ValidationField>)}
            <InsuranceUpload lang={lang} usLicense={mode === "stripe_us"} measureOneUrl={measureOneLink((settings as { measureone_static_link?: unknown }).measureone_static_link)} choice={insuranceChoice} onChoice={setInsuranceChoice} file={files.insurancePolicy} onFile={(f) => { void selectDocument("insurancePolicy", f); }} busy={!!docBusy.insurancePolicy} status={docMessage.insurancePolicy} disabled={Object.values(docBusy).some(Boolean)} />
            <ValidationField id="additionalDriver" className="mt-5 border-t border-border pt-5"><label className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-sm" data-testid="additional-driver-toggle">
              <Checkbox checked={addDriverOn} onCheckedChange={(x) => { const on = !!x; setAddDriverOn(on); if (!on) { setAddDriverName(""); setUploaded((p) => { const n = { ...p }; for (const k of ADD_KEYS) delete n[k]; return n; }); setFiles((p) => { const n = { ...p }; for (const k of ADD_KEYS) delete n[k]; return n; }); setDocMessage((p) => { const n = { ...p }; for (const k of ADD_KEYS) delete n[k]; return n; }); } }} />
              <span><span className="block font-medium">{c.addDriver}</span><span className="block text-xs text-muted-foreground">{c.addDriverNote}</span></span>
            </label>
            {addDriverOn && <div className="mt-3 flex flex-col gap-4" data-testid="additional-driver-fields">
              <Field id="additionalDriver.fullName" label={`${c.addDriverName} *`}><input className={fieldCls} value={addDriverName} maxLength={120} autoComplete="off" onChange={(e) => setAddDriverName(e.target.value)} /></Field>
              {ADD_KEYS.map((k) => <DocumentUploadCard key={k} label={`${k === "addLicenseFront" ? c.addDriverFront : k === "addLicenseBack" ? c.addDriverBack : c.addDriverPassport} *`} file={files[k]} lang={lang} onFile={(f) => { void selectDocument(k, f); }} busy={!!docBusy[k]} disabled={Object.values(docBusy).some(Boolean)} status={docMessage[k]} />)}
            </div>}</ValidationField>
            <div className="flex"><span>{backBtn}</span></div>
          </section>
        )}

        {step === 3 && instant && inst && (
          <div className="surface flex flex-col gap-5 p-6">
            <h2 className="font-display text-2xl">{gpPath ? c.route.gpTitle : ti.payTitle}</h2>
            <div className="border-y border-border py-4 text-sm" data-testid={gpPath ? "gp-pay" : undefined}>
              <p className="mt-2 font-semibold">{gpPath ? globalPaysLabel(lang, gpOpt?.interestFree ?? 6) : globalPaysLabel(lang, gpOpt?.interestFree ?? 6)}</p>
              {!gpPath && <p className="mt-1 flex gap-2 text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-primary" />{ti.payNote}</p>}
            </div>
            <PaymentBadges />
            <CancellationSummary />
            {gpPath && <p className="text-sm text-muted-foreground" data-testid="payment-explanation">{c.route.gpNote}</p>}
            <div className="flex"><span>{backBtn}</span></div>
          </div>
        )}

        {step === 3 && offline && (
          <div className="surface flex flex-col gap-5 p-6">
            <h2 className="font-display text-2xl">{due?.mode === "full" ? tr.car.fullDue : c.holdTitle}</h2>
            <div className="rounded-2xl border border-border bg-background p-4 text-sm text-muted-foreground">{due?.mode === "full" ? ti.paymentUnavailable : c.payConfiguring}</div>
            <div className="flex"><span>{backBtn}</span></div>
          </div>
        )}

        {step === 3 && res && (
          <div className="surface flex flex-col gap-5 p-6">
            <h2 className="font-display text-2xl">{due?.mode === "full" ? tr.car.fullDue : c.holdTitle}</h2>
            {gpAllowed && !authorized && (
              <PaymentMethodCards hideMarks lang={lang} value={payMethod} onChange={setPayMethod} legend={c.route.choose} />
            )}
            {gpAllowed && payMethod === "gp" && !authorized ? (
              <GpPayOption hideApproval hideAmount t={c.route} amount={gpAmount} mode={due?.mode === "full" ? "full" : "signal"} quote={gpQuote?.amount === gpAmount ? gpQuote.q : "loading"} />
            ) : <>
            {res.mode !== "full" && <p className="mt-2 flex gap-2"><ShieldCheck className="size-4 shrink-0 text-primary" />{c.holdNote1}</p>}
            {res.clientSecret ? (
              authorized ? (
                <p className="flex items-center gap-2 font-semibold text-success"><Check className="size-5" />{res.mode === "full" ? tr.car.paidInFull : c.authorized}</p>
              ) : (
                <ValidationField id="payment"><p className="mb-3 text-sm text-muted-foreground" data-testid="payment-explanation">{due?.mode === "full" ? tr.car.holdNoteFull : tr.car.holdNote}</p><PaymentTestModeBanner mode={res.stripeMode} /><CardForm mode={res.stripeMode} clientSecret={res.clientSecret} onComplete={async () => {
                  const r = await confirm({ data: { token: res.token } }).catch(() => ({ authorized: false }));
                  if (r.authorized) { setAuthorized(true); void finish(true); } else toast.error(c.genericError);
                }} /></ValidationField>
              )
            ) : (
              <div className="rounded-2xl border border-border bg-background p-4 text-sm text-muted-foreground">
                <span className="mr-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-foreground">Stripe not connected</span>{c.stripeOff}
              </div>
            )}
            </>}
            <PaymentBadges />
            <CancellationSummary />
            {!res.clientSecret && !(gpAllowed && payMethod === "gp" && !authorized) && <p className="text-sm text-muted-foreground" data-testid="payment-explanation">{due?.mode === "full" ? tr.car.holdNoteFull : tr.car.holdNote}</p>}
            {gpAllowed && payMethod === "gp" && !authorized && <p className="text-sm text-muted-foreground" data-testid="payment-explanation">{due?.mode === "full" ? c.route.gpApproval : tr.car.holdNote}</p>}
            <div className="flex"><span>{backBtn}</span></div>
          </div>
        )}

        {step === 2 && (
          <div className="surface flex flex-col gap-5 p-6" data-testid="terms-step">
            <h2 className="font-display text-2xl">{c.termsTitle}</h2>
            <div className="max-h-72 overflow-y-auto border-y border-border py-4 text-sm text-muted-foreground" tabIndex={0} role="region" aria-label={c.termsTitle}><RentalTerms lang={lang} /></div>
            <ValidationField id="terms"><label className="flex cursor-pointer items-start gap-3 text-sm">
              <Checkbox checked={accepted} onCheckedChange={(x) => setAccepted(!!x)} className="mt-0.5" />
              <span>{c.termsAccept} <Link to="/$lang/terms" params={{ lang }} className="text-primary" target="_blank">{tr.footer.terms}</Link> · <Link to="/$lang/privacy" params={{ lang }} className="text-primary" target="_blank">{tr.footer.privacy}</Link> · <Link to="/$lang/cancellation" params={{ lang }} className="text-primary" target="_blank">{tr.footer.cancellation}</Link></span>
            </label></ValidationField>
            <div className="flex"><span>{backBtn}</span></div>
          </div>
        )}
        {docs && null}
        </CheckoutValidation>
      </div>

      {step !== 1 && <aside className="checkout-aside min-w-0 lg:sticky lg:top-24 lg:self-start">
        <details className="checkout-summary surface overflow-hidden" open={summaryOpen} onToggle={(e) => setSummaryOpen(e.currentTarget.open)}>
          <summary className="grid min-h-11 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-xs lg:hidden"><span className="min-w-0"><span className="block truncate font-semibold">{vehicle.name}</span><span className="text-muted-foreground">{pickup.toLocaleDateString(lang)} → {ret.toLocaleDateString(lang)}</span></span><ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /></summary>
          <div className="checkout-summary-body">
          <img src={photoUrl(vehicle.photos[0])} alt={vehicle.name} className="hidden aspect-[3/2] w-full object-cover lg:block" />
          <div className="flex flex-col gap-2 p-5 text-sm">
            <div className="font-display text-xl">{vehicle.name}</div>
            <div className="flex items-start justify-between gap-2 text-muted-foreground"><span>{pickup.toLocaleString(lang, { dateStyle: "short", timeStyle: "short" })} → {ret.toLocaleString(lang, { dateStyle: "short", timeStyle: "short" })}</span></div>
            <div className="mt-2 flex justify-between gap-3 border-t border-border pt-3" data-testid="sum-rental">
              <span>{tr.delivery.rental} ({quote.days} {tr.car.days}: {rentalRateText(quote, tr.delivery.perDay, cv) ?? tr.fleet.priceOnRequest})</span>
              <span className="shrink-0">{quote.base != null ? usd2(quote.base) : tr.car.toBeConfirmed}</span>
            </div>
            {durationLabel(quote, cv) && <div className="flex justify-between gap-3 text-muted-foreground" data-testid="sum-duration"><span>{durationLabel(quote, cv)}</span><span className="shrink-0">−{usd2(quote.durationDiscount)}</span></div>}
              {promoLabels(quote, cv).map((p) => <div key={p.label} className="flex justify-between gap-3 text-muted-foreground" data-testid="sum-promo"><span>{p.label}</span><span className="shrink-0">−{usd2(p.amount)}</span></div>)}
            {quote.basicInsurance > 0 && <div className="flex justify-between gap-3" data-testid="sum-basic"><span>{tr.delivery.basicInsurance} ({quote.days} × {usd2(quote.basicInsurance / quote.days)})</span><span>{usd2(quote.basicInsurance)}</span></div>}
            {quote.tolls > 0 && <div className="flex justify-between gap-3" data-testid="sum-tolls"><span>{tr.delivery.tolls} ({quote.days} × {usd2(quote.tolls / quote.days)})</span><span>{usd2(quote.tolls)}</span></div>}
            {quote.solidWaste > 0 && <div className="flex justify-between gap-3" data-testid="sum-solid-waste"><span>Solid Waste ({Math.min(quote.days, 30)} × {usd2(quote.solidWaste / Math.min(quote.days, 30))})</span><span>{usd2(quote.solidWaste)}</span></div>}
            {exoticCar && <p className="text-xs text-muted-foreground" data-testid="exotic-note">{cv.exoticNote}</p>}
            {shownLegs && <DeliveryLegSummary base={vehicle.city} lang={lang} legs={shownLegs} free={mcoFree} />}
            {quote.insurance > 0 && <div className="flex justify-between"><span>{tr.car.insurance} ({usd(s.addon_insurance_per_day)} {tr.car.insurancePer})</span><span>{usd(quote.insurance)}</span></div>}
            {quote.hotelCheckin > 0 && <div className="flex justify-between"><span>{tr.car.hotel}</span><span>{usd(quote.hotelCheckin)}</span></div>}
            {quote.luggageCar > 0 && <div className="flex justify-between"><span>{tr.car.luggage}</span><span>{usd(quote.luggageCar)}</span></div>}
            {quote.prepaidFuel > 0 && <div className="flex justify-between gap-3" data-testid="sum-prepaid-fuel"><span>{tx.fuel}</span><span>{usd2(quote.prepaidFuel)}</span></div>}
            {quote.vipDelivery > 0 && <div className="flex justify-between gap-3" data-testid="sum-vip-delivery"><span>{tx.vip}</span><span>{usd2(quote.vipDelivery)}</span></div>}
            {addons.babySeat && <div data-testid="sum-child-seats"><div className="flex justify-between gap-3"><span>{tx.baby} × {childSeats?.quantity ?? 1}</span><span>{quote.babySeat > 0 ? usd2(quote.babySeat) : `${tx.confirmPrice} / $0`}</span></div>{childSeats?.ages.map((age, i) => <p className="text-xs text-muted-foreground" key={i}>{fmt(tx.childAge, { n: i + 1 })}: {age || "—"}</p>)}</div>}
            {quote.coverage > 0 && <div className="flex justify-between"><span>{upsells.coverageLabel[lang] || tx.coverage}</span><span>{usd2(quote.coverage)}</span></div>}
            {quote.customFees.filter((f) => f.taxable).map((f) => <div key={f.id} className="flex justify-between gap-3" data-testid="sum-fee"><span>{feeName(f, lang)}</span><span>{usd2(f.amount)}</span></div>)}
            <div className="flex justify-between border-t border-border pt-2" data-testid="sum-subtotal"><span>{tr.delivery.subtotal}</span><span>{quote.subtotal != null ? usd2(quote.subtotal) : tr.car.toBeConfirmed}</span></div>
            <div className="flex justify-between" data-testid="sum-tax"><span>{tr.delivery.tax} {quote.taxRate}%</span><span>{quote.tax != null ? usd2(quote.tax) : "—"}</span></div>
            {quote.customFees.filter((f) => !f.taxable).map((f) => <div key={f.id} className="flex justify-between gap-3" data-testid="sum-fee"><span>{feeName(f, lang)}</span><span>{usd2(f.amount)}</span></div>)}
            <NoHiddenFeesBadge className="mt-1" />

          </div>
          </div>
        </details>
      </aside>}
      <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-[minmax(0,1fr)_minmax(0,1.65fr)] items-center gap-3 border-t border-border bg-card px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:px-[max(24px,calc((100vw-720px)/2))]" data-testid="checkout-sticky"><div className="min-w-0 text-sm"><span className="text-xs text-muted-foreground">{tr.car.total}</span><div className="break-words font-semibold">{quote.total == null ? tr.car.toBeConfirmed : usd2(quote.total)}</div></div>{step === 3 && !instant && res?.clientSecret && payMethod === "card" && !authorized ? <Button className="checkout-primary" size="lg" onClick={() => document.querySelector('[data-validation-field="payment"]')?.scrollIntoView({ block: "center", behavior: "smooth" })}>{c.next}</Button> : <Button className="checkout-primary" size="lg" disabled={step === 3 && !instant && gpAllowed && payMethod === "gp" && !authorized ? busy || gpAmount == null : primaryDisabled} onClick={step === 3 && !instant && gpAllowed && payMethod === "gp" && !authorized ? () => void goGp() : primary}>{busy ? "…" : step === 3 ? instant ? ti.payBtn : gpAllowed && payMethod === "gp" && !authorized ? c.route.gpBtn : c.submit : c.next}</Button>}</div>
    </Container>
  );
}

function Field({ label, children, wide, id }: { label: React.ReactNode; children: React.ReactNode; wide?: boolean; id?: string }) {
  const content = <label className="flex flex-col gap-1.5 text-[13px] font-medium leading-5 text-muted-foreground">{label}{children}</label>;
  return id ? <ValidationField id={id} className={wide ? "sm:col-span-2" : undefined}>{content}</ValidationField> : <div className={wide ? "sm:col-span-2" : undefined}>{content}</div>;
}


type IdT = (typeof identityText)[keyof typeof identityText];
/** Stripe Identity status + actions. Every non-verified state keeps a retry or restart path. */
function IdentityPanel({ t, requiredLabel, idv, busy, onStart, onRetry, onRefresh }: { requiredLabel: string; t: IdT; idv: { status: string } | null; busy: boolean; onStart: () => void; onRetry: () => void; onRefresh: () => void }) {
  const st = idv?.status;
  const text = !st ? null : st === "verified" ? t.verified : st === "processing" ? t.submitted : st === "needs_attention" ? t.needs_attention : st === "canceled" ? t.canceled : t.pending;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-foreground/60 bg-card p-4 text-sm" data-testid="identity-panel" data-status={st ?? "none"}>
      <div className="flex flex-wrap items-center justify-between gap-2 font-semibold"><span className="flex items-center gap-2"><ShieldCheck className="size-4 shrink-0" />{t.title}</span><span className="rounded-full bg-foreground px-2 py-1 text-xs text-background">{requiredLabel}</span></div>
      {st !== "verified" && <p className="text-muted-foreground">{t.note}</p>}
      {text && <p role="status" className={st === "verified" ? "flex items-center gap-2 font-semibold text-success" : st === "needs_attention" || st === "canceled" ? "text-destructive" : "text-muted-foreground"} data-testid="identity-status">{st === "verified" && <Check className="size-4" />}{text}</p>}
      {st !== "verified" && <div className="flex flex-wrap gap-2">
        {!st && <Button className="checkout-primary" type="button" disabled={busy} onClick={onStart} data-testid="identity-start">{busy ? "…" : t.start}</Button>}
        {(st === "pending" || st === "needs_attention") && <Button className="checkout-primary" type="button" onClick={onRetry} data-testid="identity-retry">{t.retry}</Button>}
        {st && st !== "processing" && <Button type="button" variant="outline" disabled={busy} onClick={onStart} data-testid="identity-restart">{busy ? "…" : t.restart}</Button>}
        {st && st !== "processing" && <Button type="button" variant="ghost" onClick={onRefresh} data-testid="identity-refresh">{t.refresh}</Button>}
      </div>}
    </div>
  );
}

/** First confirmation screen: the same post-payment MeasureOne card as the booking page (renders only when eligible). */
function DoneMeasureOne({ lang, token }: { lang: Lang; token: string }) {
  const { data: b } = useQuery({ queryKey: ["booking", token], queryFn: () => getBooking({ data: { token } }), refetchInterval: (q) => (q.state.data && !measureOneReady(q.state.data) && q.state.dataUpdateCount < 10 ? 3000 : false) });
  if (!b) return null;
  return <div className="text-left"><MeasureOneCard lang={lang} link={b.measureone_static_link} booking={b as never} /></div>;
}
const measureOneReady = (b: { status?: string | null }) => b.status !== "draft" && b.status !== "checkout_hold";
