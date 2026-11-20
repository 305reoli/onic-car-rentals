// Provider-agnostic WhatsApp sender. DISABLED until Settings → WhatsApp provider is set AND that
// provider's credentials exist. Business-initiated messages use the pre-approved template per language
// (Settings → Messages); the rendered text is passed as the template's single body variable {{1}}.
// Every attempt (sent, skipped, failed) is written to notification_log.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;
export type WaProvider = "meta" | "twilio";
type SendInput = { to: string; template: string; language: string; text: string };
type SendResult = { ok: true; id: string } | { ok: false; reason: string };

const GATEWAY = "https://connector-gateway.lovable.dev";
const LANG_CODE: Record<string, string> = { en: "en_US", pt: "pt_BR", es: "es" };

interface Provider { configured(): string | null; send(i: SendInput): Promise<SendResult> }

const meta: Provider = {
  configured: () => (!process.env["LOVABLE_API_KEY"] ? "LOVABLE_API_KEY missing" : !process.env["WHATSAPP_API_KEY"] ? "WhatsApp connector not linked" : null),
  async send(i) {
    const res = await fetch(`${GATEWAY}/whatsapp/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`, "X-Connection-Api-Key": process.env["WHATSAPP_API_KEY"]!, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: i.to, type: "template",
        template: { name: i.template, language: { code: LANG_CODE[i.language] ?? "en_US" }, components: [{ type: "body", parameters: [{ type: "text", text: i.text }] }] } }),
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, reason: `Meta ${res.status}: ${body.slice(0, 500)}` };
    try { return { ok: true, id: JSON.parse(body).messages?.[0]?.id ?? "" }; } catch { return { ok: true, id: "" }; }
  },
};

/** Twilio: template = Content SID (HX…) of an approved WhatsApp template; From = TWILIO_WHATSAPP_FROM (+1…). */
const twilio: Provider = {
  configured: () => (!process.env["LOVABLE_API_KEY"] ? "LOVABLE_API_KEY missing" : !process.env["TWILIO_API_KEY"] ? "Twilio connector not linked" : !process.env["TWILIO_WHATSAPP_FROM"] ? "TWILIO_WHATSAPP_FROM missing" : null),
  async send(i) {
    const res = await fetch(`${GATEWAY}/twilio/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`, "X-Connection-Api-Key": process.env["TWILIO_API_KEY"]!, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: `whatsapp:+${i.to}`, From: `whatsapp:${process.env["TWILIO_WHATSAPP_FROM"]}`, ContentSid: i.template, ContentVariables: JSON.stringify({ 1: i.text }) }),
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, reason: `Twilio ${res.status}: ${body.slice(0, 500)}` };
    try { return { ok: true, id: JSON.parse(body).sid ?? "" }; } catch { return { ok: true, id: "" }; }
  },
};

const PROVIDERS: Record<WaProvider, Provider> = { meta, twilio };

export async function logNotification(db: Admin, row: { prereservation_id?: string | null; channel: string; kind: string; recipient: string; status: string; detail?: string }) {
  const { error } = await db.from("notification_log").insert({ ...row, detail: (row.detail ?? "").slice(0, 2000) });
  if (error) console.error("[notification_log] insert failed", error.message);
}

export async function sendWhatsApp(db: Admin, opts: { provider: string; prereservationId: string; kind: string; phone: string; template: string; language: string; text: string }) {
  const to = opts.phone.replace(/\D/g, "");
  const base = { prereservation_id: opts.prereservationId, channel: "whatsapp", kind: opts.kind, recipient: to };
  const p = PROVIDERS[opts.provider as WaProvider];
  const why = !p ? "disabled: no WhatsApp provider selected" : p.configured() ?? (!opts.template ? `disabled: no approved template set for ${opts.kind}/${opts.language}` : null);
  if (why || !p) { await logNotification(db, { ...base, status: "skipped", detail: `${why} — ${opts.text}` }); return { sent: false as const, reason: why }; }
  try {
    const r = await p.send({ to, template: opts.template, language: opts.language, text: opts.text });
    await logNotification(db, { ...base, status: r.ok ? "sent" : "failed", detail: r.ok ? `id=${r.id}` : r.reason });
    return r.ok ? { sent: true as const } : { sent: false as const, reason: r.reason };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await logNotification(db, { ...base, status: "failed", detail: reason });
    return { sent: false as const, reason };
  }
}
