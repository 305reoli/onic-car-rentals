import { createFileRoute } from "@tanstack/react-router";
import { BookingNextSteps } from "@/components/site/BookingNextSteps";
import { bookingNextStepsText, type Lang } from "@/lib/i18n";
import { emailHtml } from "@/lib/emailLayout";

export const Route = createFileRoute("/_authenticated/admin/review")({
 validateSearch: (s: Record<string, unknown>) => ({ lang: (s["lang"] === "es" || s["lang"] === "pt" ? s["lang"] : "en") as Lang, view: s["view"] === "email" ? "email" : "confirmation" }),
 head: () => ({ meta: [{ title: "Booking copy review — Onic Car Rentals" }, { name: "description", content: "Private review of Onic Car Rentals request confirmation and received-email wording." }, { property: "og:title", content: "Booking copy review — Onic Car Rentals" }, { property: "og:description", content: "Private review of request next steps." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex, nofollow" }] }),
 component: Review,
});

function Review() {
 const { lang, view } = Route.useSearch();
 const copy = bookingNextStepsText[lang];
 const subject = lang === "es" ? "Recibimos tu solicitud" : lang === "pt" ? "Recebemos seu pedido" : "We received your request";
 if (view === "confirmation") return <div className="mx-auto max-w-2xl"><h1 className="font-display text-3xl">{subject}</h1><BookingNextSteps lang={lang} /></div>;
 const html = emailHtml({ siteUrl: "https://oniccarrentals.com", lang, subject, lines: [copy.title, ...copy.lines] });
 return <div className="mx-auto max-w-3xl"><h1 className="font-display mb-4 text-2xl">{subject}</h1><iframe title={subject} srcDoc={html} sandbox="" className="h-[800px] w-full border border-border" /></div>;
}