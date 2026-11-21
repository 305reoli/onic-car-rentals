import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fieldCls } from "@/components/site/SearchBox";
import { useServerFn } from "@tanstack/react-start";
import { globalPaysStatus, globalPaysTest } from "@/services/admin.functions";
import { DeliverySettings } from "@/components/admin/DeliverySettings";
import { minDaysMap, payModes, type PayMode } from "@/lib/pricing";
import { PUBLIC_CATEGORIES } from "@/lib/vehicles";
import { bookingNotificationEmail } from "@/lib/bookingEmail";
import { z } from "zod";
import { currentPaymentMessage, insuranceText, type Lang } from "@/lib/i18n";

const CAT_LABEL: Record<string, string> = { suv: "SUV", sedan: "Sedan", luxury: "Luxury", convertible: "Convertible", sports: "Sports", exotics: "Exotics" };

export const Route = createFileRoute("/_authenticated/admin/settings")({ head: () => ({ meta: [{ title: "Settings — Onic Car Rentals admin" }, { name: "description", content: "Owner booking and delivery settings." }, { property: "og:title", content: "Settings — Onic Car Rentals admin" }, { property: "og:description", content: "Owner booking and delivery settings." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: SettingsPage });

const FIELDS = [
  ["addon_hotel_checkin", "Hotel check-in assistance (USD)", "number"],
  ["addon_luggage_car", "Extra luggage car (USD)", "number"],
  ["approval_window_hours", "Approval window (hours)", "number"],
  ["cutoff_hours_before_pickup", "Request expires this many hours before pick-up", "number"],
  ["min_lead_time_hours", "Minimum online lead time (hours)", "number"],
  
  ["substitute_reminder_hours", "Substitute offer: send reminder this many hours before the deadline", "number"],
  ["gp_interest_free_installments", "Global Pays: interest-free installments shown to Brazilian clients (must match the Global Pays merchant setup)", "number"],
  ["whatsapp_number", "WhatsApp number (digits only, with country code)", "text"],
  ["contact_email", "Contact email", "email"],
  ["owner_notification_email", "Booking notification email", "email"],
  ["terms_version", "Terms version label", "text"],
] as const;
const COMPANY = [
  ["company_zip", "Company ZIP code (Orlando address)", "text"],
  ["support_email", "Support email (public)", "email"],
  ["google_business_url", "Google Business Profile URL (added to search-engine data when filled)", "url"],
  ["measureone_static_link", `${insuranceText.en.settingLabel} — ${insuranceText.en.settingHelp}`, "url"],
  ["rentalcover_affiliate_link", "RentalCover affiliate link", "url"],
] as const;
const LEGAL = [
  ["legal_operator_en", "Brand & operator — EN"], ["legal_operator_pt", "Brand & operator — PT"], ["legal_operator_es", "Brand & operator — ES"],
  ["legal_payments_en", "Payments — EN"], ["legal_payments_pt", "Payments — PT"], ["legal_payments_es", "Payments — ES"],
  ["payment_company_address", "Payment company address (optional — shown under the payments text)"],
] as const;
const KINDS = ["approved", "declined", "expired", "confirmed"] as const;
const LG = ["en", "pt", "es"] as const;
const MESSAGES = KINDS.flatMap((k) => LG.map((l) => [`msg_${k}_${l}`, `${k[0]!.toUpperCase()}${k.slice(1)} message — ${l.toUpperCase()}`] as const));
const WA_TPL = KINDS.flatMap((k) => LG.map((l) => [`wa_tpl_${k}_${l}`, `WhatsApp template — ${k} — ${l.toUpperCase()}`] as const));
const MSG_KEYS = ["whatsapp_provider", ...MESSAGES.map((m) => m[0]), ...WA_TPL.map((m) => m[0])];
const ALL_KEYS = [...FIELDS.map((f) => f[0]), ...COMPANY.map((f) => f[0]), ...LEGAL.map((f) => f[0]), ...MSG_KEYS];

function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-settings"], queryFn: async () => (await supabase.from("settings").select("*").eq("id", 1).single()).data });
  const [form, setForm] = useState<Record<string, string>>({});
  const [modes, setModes] = useState<Record<string, PayMode>>(payModes(null));
  const [mins, setMins] = useState<Record<string, number>>(minDaysMap(null));
  useEffect(() => { if (data) setMins(minDaysMap((data as { min_days_by_category?: unknown }).min_days_by_category)); }, [data]);
  useEffect(() => { if (data) setModes(payModes((data as { payment_modes?: unknown }).payment_modes)); }, [data]);
  useEffect(() => { if (data) setForm(Object.fromEntries(ALL_KEYS.map((k) => [k, k === "owner_notification_email" ? bookingNotificationEmail(data.owner_notification_email) : k.startsWith("msg_") ? currentPaymentMessage(k.slice(-2) as Lang, k.split("_")[1] as typeof KINDS[number], String((data as Record<string, unknown>)[k] ?? "")) : String((data as Record<string, unknown>)[k] ?? "")]))); }, [data]);

  const save = async () => {
    const notificationEmail = z.string().trim().email().safeParse(form["owner_notification_email"]);
    if (!notificationEmail.success) return void toast.error("Enter a valid booking notification email");
    const patch: Record<string, unknown> = {};
    for (const [k, , type] of FIELDS) patch[k] = type === "number" ? Number(form[k]) : form[k];
    patch["owner_notification_email"] = notificationEmail.data;
    for (const [k] of [...COMPANY, ...LEGAL]) patch[k] = (form[k] ?? "").trim();
    for (const k of MSG_KEYS) patch[k] = (form[k] ?? "").trim();
    const { error } = await supabase.from("settings").update({ ...patch, payment_modes: modes, min_days_by_category: mins, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) return void toast.error(error.message);
    toast.success("Saved — applies to new requests");
    qc.invalidateQueries({ queryKey: ["settings"] });
  };

  return (
    <div className="max-w-2xl">
      <h1 className="font-display mb-6 text-3xl">Settings</h1>
      <DeliverySettings />
      <GlobalPaysCard />
      <div className="surface mb-6 flex flex-col gap-3 p-6 text-sm">
        <h2 className="font-semibold text-foreground">Minimum rental days (per category)</h2>
        <p className="text-xs text-muted-foreground">Default for every car in the category. A car's own “Minimum days” field overrides it. Applies to new searches and bookings. Save with “Save settings” below.</p>
        {PUBLIC_CATEGORIES.filter((c) => c !== "convertible").map((c) => (
          <label key={c} className="flex items-center justify-between gap-3">{CAT_LABEL[c]}
            <input data-testid={`mindays-${c}`} type="number" min={1} inputMode="numeric" className={`${fieldCls} max-w-[8rem]`} value={mins[c] ?? 3} onChange={(e) => setMins((m) => ({ ...m, [c]: Math.max(1, Math.floor(Number(e.target.value) || 1)) }))} />
          </label>
        ))}
      </div>
      <div className="surface flex flex-col gap-4 p-6">
        {FIELDS.map(([k, label, type]) => (
          <label key={k} className="flex flex-col gap-1 text-sm text-muted-foreground">{label}
            <input type={type} className={fieldCls} value={form[k] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
          </label>
        ))}
        <h2 className="mt-4 font-semibold text-foreground">Company info</h2>
        {COMPANY.map(([k, label, type]) => (
          <label key={k} className="flex flex-col gap-1 text-sm text-muted-foreground">{label}
            <input type={type} className={fieldCls} value={form[k] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
          </label>
        ))}
        <h2 className="mt-4 font-semibold text-foreground">Legal page</h2>
        {LEGAL.map(([k, label]) => (
          <label key={k} className="flex flex-col gap-1 text-sm text-muted-foreground">{label}
            <textarea rows={2} className={`${fieldCls} h-auto py-2`} value={form[k] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
          </label>
        ))}
        <h2 className="mt-4 font-semibold text-foreground">Messages</h2>
        <p className="text-xs text-muted-foreground">Sent to the customer by email, and by WhatsApp if they opted in. Placeholders: [code] [car] [pickup] [return] [city] [link].</p>
        {MESSAGES.map(([k, label]) => (
          <label key={k} className="flex flex-col gap-1 text-sm text-muted-foreground">{label}
            <textarea rows={3} className={`${fieldCls} h-auto py-2`} value={form[k] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
          </label>
        ))}
        <h2 className="mt-4 font-semibold text-foreground">WhatsApp sending</h2>
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">Provider (off until credentials are connected)
          <select className={fieldCls} value={form["whatsapp_provider"] ?? ""} onChange={(e) => setForm((f) => ({ ...f, whatsapp_provider: e.target.value }))}>
            <option value="">Off</option><option value="meta">Meta WhatsApp Cloud API</option><option value="twilio">Twilio</option>
          </select>
        </label>
        <p className="text-xs text-muted-foreground">Pre-approved template per language (Meta: template name; Twilio: Content SID). The message text above fills the template's single variable {"{{1}}"}.</p>
        {WA_TPL.map(([k, label]) => (
          <label key={k} className="flex flex-col gap-1 text-sm text-muted-foreground">{label}
            <input className={fieldCls} value={form[k] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
          </label>
        ))}
        <Button size="lg" onClick={save}>Save settings</Button>
      </div>
    </div>
  );
}

function GlobalPaysCard() {
  const status = useServerFn(globalPaysStatus);
  const test = useServerFn(globalPaysTest);
  const { data } = useQuery({ queryKey: ["gp-status"], queryFn: () => status() });
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  return (
    <div className="surface mb-6 flex flex-col gap-3 p-6 text-sm">
      <div className="flex items-center justify-between"><h2 className="font-semibold text-foreground">Global Pays (instant full payment)</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${data.mode === "production" ? "bg-destructive text-primary-foreground" : "bg-secondary"}`}>{data.mode.toUpperCase()}</span></div>
      {data.mode === "mock" && <p className="text-xs text-muted-foreground">Built-in simulator: only you (signed in) can use the instant checkout; customers get the request flow until sandbox/production credentials are set.</p>}
      <ul className="grid gap-1">{Object.entries(data.secrets).map(([k, ok]) => <li key={k} className="flex justify-between"><span className="font-mono text-xs">{k}</span><span className={ok ? "text-success" : "text-muted-foreground"}>{ok ? "set" : "not set"}</span></li>)}</ul>
      <div>Webhook: <b>{data.webhookEnabled ? "enabled" : "disabled (needs WEBHOOK_SECRET + CUTOFF)"}</b>{data.cutoff && <> · cutoff {new Date(data.cutoff).toLocaleString()}</>}</div>
      <Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { const r = await test(); r.ok ? toast.success(r.message) : toast.error(r.message); } finally { setBusy(false); } }}>Test connection (sandbox auth)</Button>
    </div>
  );
}
