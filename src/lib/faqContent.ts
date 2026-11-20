// GEO FAQ content (main FAQ, per-car mini-FAQ, positioning). One source feeds the visible accordion,
// the FAQPage JSON-LD and /llms*.txt, so the three are always word-for-word identical. Facts come from
// settings (bases, airports, payment modes, signal minimum) and car data (seats, bags, deposit, min days).
import { cancellationPolicy, ownerText, fmt, minimumFaqText, t, type Lang } from "./i18n";
import { addressLine, businessAddresses } from "./seo";
import { crossCell, crossConfig, deliveryConfig, effectiveMinDays, minDaysMap, paymentMode, payModes, usd, type CrossCell } from "./pricing";
import { carDeliveryNote, deliveryFaq, faqItems } from "./deliveryText";
import { carMileageLine } from "./vehicles";
import { publicPath } from "./publicRoutes";

export type FaqItem = { q: string; a: string; href?: string };
type CityLite = { slug: string; name: string; fleet_from_city?: string | null };
type CarLite = { body_category: string; is_convertible: boolean; seats: number | null; bags: number | null; city?: string; name?: string; model?: string; min_days?: number | null; min_age?: number; mileage_limit?: string };
type Settings = { delivery_config?: unknown; payment_modes?: unknown; min_days_by_category?: unknown; prereservation_min_usd?: number | string | null } | null | undefined;

const CATS = ["suv", "sedan", "luxury", "convertible", "sports", "exotics"] as const;
const PHONE = "+1 (555) 123-4567";

const L = {
  en: {
    position: "Sua Locadora is a specialist sports & exotic car rental service for Brazilians in the USA",
    whatQ: "What is Sua Locadora?",
    whatA: "{pos}, operating since 2022 and run by Sua Empresa LLC. We compete on service, not price: support in Portuguese, minimal bureaucracy, and your car guaranteed and delivered where you are.",
    citiesQ: "Which cities and airports do you serve?",
    citiesA: "{own}. {served} Airport delivery at {airports}. Our bases: {bases}.",
    own: "Orlando and Miami", servedBy: "{city} is served by the {fleet} fleet.", and: "and", near: "near",
    carsQ: "What kinds of cars do you have?",
    carsA: "Six categories — SUV, Sedan, Luxury, Convertible, Sports and Exotics: from family minivans (Pacifica, Carnival) and large SUVs (Suburban, Escalade, Expedition) to sports cars (Mustang convertible, Charger), exotics (Ferrari Portofino, Lamborghini Huracán, Porsche 911, Corvette C8) and luxury cars (Mercedes, BMW, Range Rover, Porsche Macan).",
    capQ: "How many people and suitcases fit?",
    capA: "With all seats in use: {list}. Each car's page shows its exact seats and large suitcases.",
    capItem: "{cat} {p} people, {b} large suitcases",
    bookQ: "How does booking work?",
    bookA: "Choose the car, dates and pickup/return locations online, add any extras, then enter the driver details, upload your documents (driver's license and passport), accept the terms and finish by paying 100% of the rental total through Stripe or Global Pays. You'll receive your booking confirmation within minutes or up to 2 hours during business hours. Once approved, you sign the digital contract.",
    payQ: "How much do I pay when I book?",
    payA: "For every car, pay 100% of the rental total at booking, through Stripe or Global Pays. There is no rental balance to pay later.",
    payFull: " For {cats}, full payment is due today: the complete booking total.",
    approveQ: "What if my request is declined?",
    approveA: "You'll receive your booking confirmation within minutes or up to 2 hours during business hours. If it is declined, the payment is refunded in full.",
    depositQ: "Is there a security deposit?",
    depositA: "Yes — it is a card hold at pickup, not a charge. The amount is shown on each car's page.",
    minDaysQ: "What is the minimum rental?",
    minDaysA: "The minimum rental is shown on each car's page.",
    ageQ: "What is the minimum age?",
    ageA: ownerText.en.agePolicy,
    docsQ: "What documents do I need?",
    docsA: "Your driver's license and passport, uploaded with the booking.",
    pixQ: "Can I pay with Pix or in installments?",
    pixA: "Payment is by card. Brazilians can pay with Pix or card in up to 12 installments when that option appears at checkout.",
    solidWasteQ: "What is the Solid Waste fee?",
    solidWasteA: "It is a mandatory Florida state surcharge on vehicle rentals: US$ 2 per day, charged only for the first 30 days of a rental. Sua Locadora simply collects this amount and remits it in full to the state — it is not part of the rental price. The fee appears as a separate line in your booking summary and is included in the tax calculation base.",
    langQ: "Do you speak Portuguese?",
    langA: "Yes. We serve you in Portuguese, English and Spanish — on the site, on WhatsApp at {phone} and on Instagram @sualocadora.",
    cancelQ: "What is the cancellation policy?",
    cancelA: "The rules are on our Cancellation & refunds page.",
    jetQ: "Do you deliver to customers arriving by private jet (FBO)?", jetA: "Yes. In the Orlando and Miami areas we can deliver the car at the aircraft or FBO. It is arranged in advance, case by case, via WhatsApp.",
    transferQ: "Do you offer airport transfers?",
    transferA: "Private transfers are handled by Sua Transfer, a separate sister service. Sua Locadora handles car rental only.",
    // car mini-FAQ
    fitQ: "Who is the {car} a good fit for?",
    fitA: "The {car} ({cat}) seats {seats} — a good fit for {fit}.",
    fit: { suv: "families and groups who need space", sedan: "couples and small groups who want an easy everyday drive", luxury: "travellers who want comfort and presence", convertible: "open-air drives along the Florida coast", sports: "drivers who want performance", exotics: "special occasions and unforgettable drives" },
    bagsQ: "How much luggage fits in the {car}?",
    bagsA: "About {n} large checked suitcases with all seats in use.", bags1: "About 1 large checked suitcase with all seats in use.", bags0: "No large checked suitcases — carry-on bags only.",
    dlvQ: "Can the {car} be delivered in {city}?",
    termsQ: "What are the deposit and minimum days for the {car}?",
    termsDep: "Security deposit: {d}, a card hold at pickup (not a charge).", termsMin: "Minimum rental: {n} days.", termsMin1: "Minimum rental: 1 day.",
    howQ: "How do I book the {car}?",
    howA: "Book online in 4 steps: 1) driver details, dates, pickup/return locations and add-ons; 2) documents and identity verification according to your license country; 3) accept the terms; 4) payment to secure the car ({due}).",
    dueFull: "full payment due today: the complete booking total",
    ptQ: "Is there support in Portuguese?",
    ptA: "Yes — in Portuguese, English and Spanish, including on WhatsApp at {phone}.",
    cityLine: "In {city}, Sua Locadora is a specialist sports & exotic car rental service for Brazilians in the USA — service in Portuguese and the car delivered where you are.",
    whoTitle: "Who we serve",
    who: ["Main audience: Brazilian travellers in Florida. Service in Portuguese, English and Spanish.", "Specialist sports & exotic car rental service for Brazilians in the USA — minimal bureaucracy, the car guaranteed and delivered where the client is. We compete on service, not price.", "Sister service: Sua Transfer (private transfers), operated separately."],
  },
  pt: {
    position: "A Sua Locadora é um serviço especializado em aluguel de carros esportivos e exóticos para brasileiros nos EUA",
    whatQ: "O que é a Sua Locadora?",
    whatA: "{pos}, desde 2022, operado pela Sua Empresa LLC. Competimos no atendimento, não no preço: atendimento em português, burocracia mínima e o carro garantido e entregue onde você estiver.",
    citiesQ: "Quais cidades e aeroportos vocês atendem?",
    citiesA: "{own}. {served} Entrega nos aeroportos {airports}. Nossas bases: {bases}.",
    own: "Orlando e Miami", servedBy: "{city} é atendida pela frota de {fleet}.", and: "e", near: "perto do",
    carsQ: "Que tipos de carro vocês têm?",
    carsA: "Seis categorias — SUV, Sedã, Luxo, Conversível, Esportivo e Exótico: de minivans para a família (Pacifica, Carnival) e SUVs grandes (Suburban, Escalade, Expedition) a esportivos (Mustang conversível, Charger), exóticos (Ferrari Portofino, Lamborghini Huracán, Porsche 911, Corvette C8) e carros de luxo (Mercedes, BMW, Range Rover, Porsche Macan).",
    capQ: "Quantas pessoas e malas cabem?",
    capA: "Com todos os lugares ocupados: {list}. A página de cada carro mostra os lugares e as malas grandes exatos.",
    capItem: "{cat} {p} pessoas, {b} malas grandes",
    bookQ: "Como funciona a reserva?",
    bookA: "Escolha no site o carro, as datas e os locais de retirada e devolução, adicione os extras que quiser, preencha os dados do motorista, envie seus documentos (CNH e passaporte), aceite os termos e conclua pagando 100% do total da locação pelo Stripe ou pela Global Pays. Você receberá a confirmação da sua reserva em minutos ou em até 2 horas em horário comercial. Depois da aprovação, você assina o contrato digital.",
    payQ: "Quanto pago ao reservar?",
    payA: "Para todos os carros, pague 100% do total da locação ao reservar, pelo Stripe ou pela Global Pays. Não há saldo da locação para pagar depois.",
    payFull: " Para {cats}, o pagamento integral é devido hoje: o valor total da reserva.",
    approveQ: "E se meu pedido for recusado?",
    approveA: "Você receberá a confirmação da sua reserva em minutos ou em até 2 horas em horário comercial. Se for recusado, o pagamento é reembolsado integralmente.",
    depositQ: "Existe caução?",
    depositA: "Sim — é um bloqueio no cartão na retirada, não uma cobrança. O valor aparece na página de cada carro.",
    minDaysQ: "Qual é o mínimo de diárias?",
    minDaysA: "O mínimo de diárias aparece na página de cada carro.",
    ageQ: "Qual é a idade mínima?",
    ageA: ownerText.pt.agePolicy,
    docsQ: "Quais documentos preciso?",
    docsA: "Sua CNH e seu passaporte, enviados junto com a reserva.",
    pixQ: "Posso pagar com Pix ou parcelado?",
    pixA: "O pagamento é por cartão. Brasileiros podem pagar com Pix ou cartão em até 12x quando essa opção aparecer no checkout.",
    solidWasteQ: "O que é a taxa Solid Waste?",
    solidWasteA: "É uma taxa estadual obrigatória da Flórida cobrada em locações de veículos: US$ 2 por dia, aplicada somente nos primeiros 30 dias da locação. A Sua Locadora apenas arrecada esse valor e o repassa integralmente ao estado — ele não faz parte do preço da locação. A taxa aparece como uma linha separada no resumo da reserva e entra na base de cálculo do imposto.",
    langQ: "Vocês falam português?",
    langA: "Sim. Atendemos em português, inglês e espanhol — no site, no WhatsApp {phone} e no Instagram @sualocadora.",
    cancelQ: "Qual é a política de cancelamento?",
    cancelA: "As regras estão na nossa página de Cancelamento e reembolsos.",
    jetQ: "Vocês entregam o carro para quem chega de jato particular?", jetA: "Sim. Nas regiões de Orlando e Miami podemos entregar o carro na aeronave ou no FBO. A entrega é combinada com antecedência, caso a caso, pelo WhatsApp.",
    transferQ: "Vocês fazem transfer do aeroporto?",
    transferA: "Os transfers privativos são feitos pela Sua Transfer, um serviço irmão separado. A Sua Locadora cuida apenas do aluguel de carros.",
    fitQ: "Para quem o {car} é indicado?",
    fitA: "O {car} ({cat}) leva {seats} pessoas — indicado para {fit}.",
    fit: { suv: "famílias e grupos que precisam de espaço", sedan: "casais e grupos pequenos que querem praticidade no dia a dia", luxury: "quem quer conforto e presença", convertible: "passeios ao ar livre pela costa da Flórida", sports: "quem quer desempenho", exotics: "ocasiões especiais e passeios inesquecíveis" },
    bagsQ: "Quantas malas cabem no {car}?",
    bagsA: "Cerca de {n} malas grandes despachadas com todos os lugares ocupados.", bags1: "Cerca de 1 mala grande despachada com todos os lugares ocupados.", bags0: "Nenhuma mala grande despachada — apenas malas de mão.",
    dlvQ: "O {car} pode ser entregue em {city}?",
    termsQ: "Qual é a caução e o mínimo de diárias do {car}?",
    termsDep: "Caução: {d}, bloqueio no cartão na retirada (não é cobrança).", termsMin: "Mínimo de {n} diárias.", termsMin1: "Mínimo de 1 diária.",
    howQ: "Como reservo o {car}?",
    howA: "Reserve no site em 4 etapas: 1) dados do motorista, datas, locais de retirada e devolução e extras; 2) documentos e verificação de identidade conforme o país da habilitação; 3) aceite dos termos; 4) pagamento para garantir o carro ({due}).",
    dueFull: "pagamento integral hoje: o valor total da reserva",
    ptQ: "Tem atendimento em português?",
    ptA: "Sim — em português, inglês e espanhol, inclusive no WhatsApp {phone}.",
    cityLine: "Em {city}, a Sua Locadora é um serviço especializado em aluguel de carros esportivos e exóticos para brasileiros nos EUA — atendimento em português e o carro entregue onde você estiver.",
    whoTitle: "Quem atendemos",
    who: ["Público principal: viajantes brasileiros na Flórida. Atendimento em português, inglês e espanhol.", "Serviço especializado em aluguel de carros esportivos e exóticos para brasileiros nos EUA — burocracia mínima, o carro garantido e entregue onde o cliente estiver. Competimos no atendimento, não no preço.", "Serviço irmão: Sua Transfer (transfers privativos), operado separadamente."],
  },
  es: {
    position: "Sua Locadora es un servicio especializado en alquiler de autos deportivos y exóticos para brasileños en EE. UU.",
    whatQ: "¿Qué es Sua Locadora?",
    whatA: "{pos}, desde 2022, operado por Sua Empresa LLC. Competimos en servicio, no en precio: atención en portugués, mínima burocracia y el auto garantizado y entregado donde usted esté.",
    citiesQ: "¿Qué ciudades y aeropuertos atienden?",
    citiesA: "{own}. {served} Entrega en los aeropuertos {airports}. Nuestras bases: {bases}.",
    own: "Orlando y Miami", servedBy: "{city} se atiende con la flota de {fleet}.", and: "y", near: "cerca de",
    carsQ: "¿Qué tipos de autos tienen?",
    carsA: "Seis categorías — SUV, Sedán, Lujo, Convertible, Deportivo y Exótico: desde minivans familiares (Pacifica, Carnival) y SUV grandes (Suburban, Escalade, Expedition) hasta deportivos (Mustang convertible, Charger), exóticos (Ferrari Portofino, Lamborghini Huracán, Porsche 911, Corvette C8) y autos de lujo (Mercedes, BMW, Range Rover, Porsche Macan).",
    capQ: "¿Cuántas personas y maletas caben?",
    capA: "Con todos los asientos ocupados: {list}. La página de cada auto muestra sus asientos y maletas grandes exactos.",
    capItem: "{cat} {p} personas, {b} maletas grandes",
    bookQ: "¿Cómo funciona la reserva?",
    bookA: "Elija en el sitio el auto, las fechas y los lugares de recogida y devolución, agregue los extras que quiera, complete los datos del conductor, suba sus documentos (licencia de conducir y pasaporte), acepte los términos y finalice con el pago del 100% del total del alquiler mediante Stripe o Global Pays. Recibirás la confirmación de tu reserva en minutos o en hasta 2 horas en horario comercial. Una vez aprobada, firma el contrato digital.",
    payQ: "¿Cuánto pago al reservar?",
    payA: "Para todos los autos, paga el 100% del total del alquiler al reservar, mediante Stripe o Global Pays. No hay saldo del alquiler para pagar después.",
    payFull: " Para {cats}, el pago completo es debido hoy: el total de la reserva.",
    approveQ: "¿Y si mi solicitud es rechazada?",
    approveA: "Recibirás la confirmación de tu reserva en minutos o en hasta 2 horas en horario comercial. Si se rechaza, el pago se reembolsa por completo.",
    depositQ: "¿Hay depósito de garantía?",
    depositA: "Sí — es una retención en la tarjeta al recoger el auto, no un cargo. El monto aparece en la página de cada auto.",
    minDaysQ: "¿Cuál es el alquiler mínimo?",
    minDaysA: "El mínimo de días aparece en la página de cada auto.",
    ageQ: "¿Cuál es la edad mínima?",
    ageA: ownerText.es.agePolicy,
    docsQ: "¿Qué documentos necesito?",
    docsA: "Su licencia de conducir y su pasaporte, subidos con la reserva.",
    pixQ: "¿Puedo pagar con Pix o en cuotas?",
    pixA: "El pago es con tarjeta. Los brasileños pueden pagar con Pix o tarjeta en hasta 12 cuotas cuando esa opción aparece al pagar.",
    solidWasteQ: "¿Qué es la tarifa Solid Waste?",
    solidWasteA: "Es un cargo estatal obligatorio de Florida sobre el alquiler de vehículos: US$ 2 por día, aplicado solo durante los primeros 30 días del alquiler. Sua Locadora solo recauda este monto y lo remite íntegramente al estado; no forma parte del precio del alquiler. El cargo aparece como una línea separada en el resumen de tu reserva y forma parte de la base de cálculo del impuesto.",
    langQ: "¿Hablan portugués y español?",
    langA: "Sí. Atendemos en portugués, inglés y español — en el sitio, por WhatsApp al {phone} y en Instagram @sualocadora.",
    cancelQ: "¿Cuál es la política de cancelación?",
    cancelA: "Las reglas están en nuestra página de Cancelación y reembolsos.",
    jetQ: "¿Entregan el auto a quien llega en jet privado (FBO)?", jetA: "Sí. En las zonas de Orlando y Miami podemos entregar el auto en la aeronave o en el FBO. Se coordina con antelación, caso por caso, por WhatsApp.",
    transferQ: "¿Ofrecen traslados desde el aeropuerto?",
    transferA: "Los traslados privados los realiza Sua Transfer, un servicio hermano independiente. Sua Locadora se ocupa solo del alquiler de autos.",
    fitQ: "¿Para quién es ideal el {car}?",
    fitA: "El {car} ({cat}) lleva {seats} personas — ideal para {fit}.",
    fit: { suv: "familias y grupos que necesitan espacio", sedan: "parejas y grupos pequeños que buscan comodidad diaria", luxury: "quienes buscan confort y presencia", convertible: "paseos al aire libre por la costa de Florida", sports: "quienes buscan desempeño", exotics: "ocasiones especiales y paseos inolvidables" },
    bagsQ: "¿Cuántas maletas caben en el {car}?",
    bagsA: "Unas {n} maletas grandes documentadas con todos los asientos ocupados.", bags1: "Una maleta grande documentada con todos los asientos ocupados.", bags0: "Ninguna maleta grande documentada — solo equipaje de mano.",
    dlvQ: "¿Pueden entregar el {car} en {city}?",
    termsQ: "¿Cuál es el depósito y el mínimo de días del {car}?",
    termsDep: "Depósito de garantía: {d}, retención en la tarjeta al recoger (no es un cargo).", termsMin: "Alquiler mínimo: {n} días.", termsMin1: "Alquiler mínimo: 1 día.",
    howQ: "¿Cómo reservo el {car}?",
    howA: "Reserve en el sitio en 4 pasos: 1) datos del conductor, fechas, lugares de recogida y devolución y extras; 2) documentos y verificación de identidad según el país de la licencia; 3) aceptar los términos; 4) pago para asegurar el auto ({due}).",
    dueFull: "pago completo hoy: el total de la reserva",
    ptQ: "¿Hay atención en portugués?",
    ptA: "Sí — en portugués, inglés y español, también por WhatsApp al {phone}.",
    cityLine: "En {city}, Sua Locadora es un servicio especializado en alquiler de autos deportivos y exóticos para brasileños en EE. UU. — atención en portugués y el auto entregado donde usted esté.",
    whoTitle: "A quién atendemos",
    who: ["Público principal: viajeros brasileños en Florida. Atención en portugués, inglés y español.", "Servicio especializado en alquiler de autos deportivos y exóticos para brasileños en EE. UU. — mínima burocracia, el auto garantizado y entregado donde esté el cliente. Competimos en servicio, no en precio.", "Servicio hermano: Sua Transfer (traslados privados), operado por separado."],
  },
} as const;

export const faqText = (lang: Lang) => L[lang];

const range = (xs: number[]) => { const a = Math.min(...xs), b = Math.max(...xs); return a === b ? String(a) : `${a}–${b}`; };
const listJoin = (xs: string[], and: string) => xs.length > 1 ? `${xs.slice(0, -1).join(", ")} ${and} ${xs[xs.length - 1]}` : xs.join("");

const minimumValues = (lang: Lang, v: CarLite, st: Settings) => {
  const n = effectiveMinDays(v, st?.min_days_by_category).n;
  const tx = minimumFaqText[lang];
  return { n, days: n === 1 ? tx.one : tx.many, model: /cybertruck/i.test(v.model ?? v.name ?? "") ? "Cybertruck" : v.name ?? v.model ?? "", city: v.city ? v.city.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ") : "" };
};
const hasMinimumException = (v: CarLite, st: Settings) => effectiveMinDays(v, st?.min_days_by_category).n !== effectiveMinDays({ body_category: v.body_category }, st?.min_days_by_category).n;

/** Individual units use their own minimum; only an actual override names the model and base city. */
export function carMinimumSentence(lang: Lang, v: CarLite, st: Settings): string {
  return fmt(hasMinimumException(v, st) ? minimumFaqText[lang].singleException : minimumFaqText[lang].single, minimumValues(lang, v, st));
}

/** Category defaults occur once; scoped unit exceptions never redefine the category. */
export function minimumDaysSentence(lang: Lang, cars: CarLite[], st: Settings, main = false): string {
  const tx = minimumFaqText[lang], defaults = minDaysMap(st?.min_days_by_category);
  const present = new Set(cars.map((v) => v.body_category));
  const sentences: string[] = [];
  const add = (category: string, n: number) => sentences.push(fmt(tx.category, { category, n, days: n === 1 ? tx.one : tx.many }));
  if (main) {
    const regular = CATS.filter((c) => c !== "sports" && c !== "exotics" && present.has(c));
    const values = new Set(regular.map((c) => defaults[c] ?? 3));
    if (values.size === 1) add(tx.regular, defaults[regular[0] ?? "suv"] ?? 3);
    else regular.forEach((c) => add(t(lang).categories[c], defaults[c] ?? 3));
    if (present.has("sports")) add(tx.sports, defaults["sports"] ?? 3);
    if (present.has("exotics")) add(t(lang).categories.exotics, defaults["exotics"] ?? 1);
  } else CATS.filter((c) => present.has(c)).forEach((c) => add(t(lang).categories[c], defaults[c] ?? 3));
  const exceptions = cars.filter((v) => hasMinimumException(v, st) && v.city && (v.name || v.model));
  sentences.push(...new Set(exceptions.map((v) => fmt(tx.exception, minimumValues(lang, v, st)))));
  return sentences.join(" ");
}

/** Seats / large-suitcase ranges per public category, from live car data. */
export function capacityList(lang: Lang, cars: CarLite[]) {
  const tx = L[lang], cat = t(lang).categories;
  return CATS.flatMap((c) => {
    const xs = cars.filter((v) => (c === "convertible" ? v.is_convertible || v.body_category === c : v.body_category === c) && v.seats != null && v.bags != null);
    return xs.length ? [fmt(tx.capItem, { cat: `${cat[c]}:`, p: range(xs.map((v) => v.seats!)), b: range(xs.map((v) => v.bags!)) })] : [];
  }).join("; ");
}

/** Main FAQ (home + /faq): general items, then the delivery group (anchor #delivery). */
export function mainFaq(lang: Lang, st: Settings, cities: CityLite[], cars: CarLite[]): { general: FaqItem[]; delivery: FaqItem[] } {
  const tx = L[lang], cfg = st?.delivery_config, dc = deliveryConfig(cfg), cat = t(lang).categories;
  const name = (s: string) => cities.find((c) => c.slug === s)?.name ?? s;
  const served = cities.filter((c) => c.fleet_from_city && c.fleet_from_city !== c.slug).map((c) => fmt(tx.servedBy, { city: c.name, fleet: name(c.fleet_from_city!) })).join(" ");
  const codes = cities.map((c) => dc.airports[c.slug]?.code).filter(Boolean) as string[];
  const bases = (["orlando", "miami"] as const).map((k, i) => {
    const a = businessAddresses((cfg as { bases?: Record<string, { address: string }> } | null)?.bases)[i];
    return a ? `${name(k)} — ${addressLine(a)}${k === "orlando" && dc.airports["orlando"] ? ` (${tx.near} ${dc.airports["orlando"].code})` : ""}` : null;
  }).filter(Boolean).join("; ");
  const fullCats = CATS.filter((c) => payModes(st?.payment_modes)[c] === "full").map((c) => cat[c]);
  const tollPair = faqItems(lang, cfg)[1];
  const general: FaqItem[] = [
    { q: tx.whatQ, a: fmt(tx.whatA, { pos: tx.position }) },
    { q: tx.citiesQ, a: fmt(tx.citiesA, { own: tx.own, served, airports: listJoin(codes, tx.and), bases }) },
    { q: tx.carsQ, a: tx.carsA },
    { q: tx.capQ, a: fmt(tx.capA, { list: capacityList(lang, cars) }) },
    { q: tx.bookQ, a: `${tx.bookA} ${ownerText[lang].hours}` },
    { q: tx.payQ, a: tx.payA },
    { q: tx.approveQ, a: `${tx.approveA} ${ownerText[lang].hours}` },
    { q: t(lang).subst.faqQ, a: t(lang).subst.faqA },
    { q: tx.depositQ, a: tx.depositA },
    { q: tx.minDaysQ, a: minimumDaysSentence(lang, cars, st, true) || tx.minDaysA },
    { q: tx.ageQ, a: tx.ageA },
    { q: tx.docsQ, a: tx.docsA },
    ...(tollPair ? [{ q: tollPair[0], a: tollPair[1] }] : []),
    { q: tx.solidWasteQ, a: tx.solidWasteA },
    { q: tx.pixQ, a: tx.pixA },
    { q: tx.langQ, a: fmt(tx.langA, { phone: PHONE }) },
    { q: tx.cancelQ, a: cancellationPolicy(lang), href: publicPath(lang, "cancellation") },
    { q: ownerText[lang].prereserveTitle, a: ownerText[lang].prereserve },
    { q: tx.transferQ, a: tx.transferA },
    { q: tx.jetQ, a: tx.jetA },
  ];
  return { general, delivery: deliveryFaq(lang, cfg).map(([q, a]) => ({ q, a })) };
}

export const allMain = (f: { general: FaqItem[]; delivery: FaqItem[] }) => [...f.general, ...f.delivery];

type CarFull = CarLite & { body_category: string; name: string; city: string; payment_mode?: string | null; security_deposit_usd?: number | null; min_days?: number | null; delivery_tier_override?: string | null };

/** 4–6 car-specific questions for every car page (also its FAQPage JSON-LD). */
export function carFaq(lang: Lang, v: CarFull, st: Settings, cross: CrossCell | null, serviceCity: string, cityName: string): FaqItem[] {
  const tx = L[lang], cat = t(lang).categories[v.body_category as "suv"] ?? v.body_category;
  const out: FaqItem[] = [];
  if (v.seats != null) out.push({ q: fmt(tx.fitQ, { car: v.name }), a: fmt(tx.fitA, { car: v.name, cat, seats: v.seats, fit: tx.fit[v.body_category as "suv"] ?? tx.fit.luxury }) });
  if (v.bags != null) out.push({ q: fmt(tx.bagsQ, { car: v.name }), a: v.bags === 0 ? tx.bags0 : v.bags === 1 ? tx.bags1 : fmt(tx.bagsA, { n: v.bags }) });
  out.push({ q: fmt(tx.dlvQ, { car: v.name, city: cityName }), a: carDeliveryNote(lang, st?.delivery_config, v, cross, serviceCity) });
  const terms = [v.security_deposit_usd ? fmt(tx.termsDep, { d: usd(Number(v.security_deposit_usd)) ?? "" }) : "", carMinimumSentence(lang, v, st)].filter(Boolean).join(" ");
  if (terms) out.push({ q: fmt(tx.termsQ, { car: v.name }), a: terms });
  const due = tx.dueFull;
  out.push({ q: fmt(tx.howQ, { car: v.name }), a: fmt(tx.howA, { due }) });
  out.push({ q: tx.ptQ, a: fmt(tx.ptA, { phone: PHONE }) });
  if (v.min_age != null) out.push({ q: fmt(ownerText[lang].ageQ, { car: v.name }), a: fmt(ownerText[lang].age, { n: v.min_age }) });
  const mileage = carMileageLine(v, lang);
  if (mileage) out.push({ q: fmt(ownerText[lang].mileageQ, { car: v.name }), a: mileage });
  return out;
}

export const toPairs = (xs: FaqItem[]) => xs.map((x) => [x.q, x.a] as [string, string]);

/** Landing FAQs share the same factual settings helpers as each bookable car. */
export function landingFaq(label: string, cars: (CarFull & { brand: string; model: string })[], st: Settings, serviceCity: string, cityName: string, singleModel = false): FaqItem[] {
  const tx = L.pt;
  const cfg = crossConfig((st?.delivery_config as { cross?: unknown } | null)?.cross);
  const notes = [...new Set(cars.map((v) => carDeliveryNote("pt", st?.delivery_config, v, crossCell(v.city, serviceCity, v, cfg), serviceCity)))];
  const terms = singleModel ? [...new Set(cars.map((v) => carMinimumSentence("pt", v, st)))].join(" ") : minimumDaysSentence("pt", cars, st);
  const full = cars.filter((v) => paymentMode(v, st?.payment_modes) === "full");
  const regular = cars.filter((v) => paymentMode(v, st?.payment_modes) === "signal");
  return [
    { q: `Quais carros posso reservar em ${label}?`, a: `Em ${cityName}: ${[...new Set(cars.map((v) => v.name))].slice(0, 3).join(", ")}. Veja todas as unidades nesta página; cada carro tem sua própria página com fotos, lugares, malas e diária.` },
    { q: `Como funciona a entrega em ${cityName}?`, a: notes.join(" ") },
    { q: "Qual é o mínimo de diárias e quanto pago ao reservar?", a: `${terms} ${tx.payA}`.trim() },
    { q: tx.docsQ, a: tx.docsA },
    { q: tx.ptQ, a: fmt(tx.ptA, { phone: PHONE }) },
    { q: t("pt").subst.faqQ, a: t("pt").subst.faqA },
  ];
}
