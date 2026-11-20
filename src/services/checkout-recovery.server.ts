import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { fmt, recoveryText, type Lang } from "@/lib/i18n";
import { resumeLink } from "@/lib/checkoutRecovery";
import { emailConfigured, sendResendEmail } from "./resend-email.server";

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
export async function processCheckoutRecovery(db: SupabaseClient<Database>, now = new Date()) {
  const { error: expiryError } = await db.from("checkout_captures").update({ status: "expired" }).eq("status", "pending_payment").lte("expires_at", now.toISOString());
  if (expiryError) throw new Error(expiryError.message);
  if (!emailConfigured()) return { sent: 0, failed: 0 };
  const { data: rows, error } = await db.from("checkout_captures").select("*").eq("status", "pending_payment").is("recovery_attempted_at", null).lte("created_at", new Date(now.getTime() - 2 * 3600000).toISOString()).gt("expires_at", now.toISOString()).order("created_at").limit(50);
  if (error) throw new Error(error.message);
  let sent = 0, failed = 0;
  for (const row of rows ?? []) {
    const { data: claim, error: claimError } = await db.from("checkout_captures").update({ recovery_attempted_at: now.toISOString() }).eq("id", row.id).eq("status", "pending_payment").is("recovery_attempted_at", null).select("id").maybeSingle();
    if (claimError) throw new Error(claimError.message);
    if (!claim) continue;
    const { data: current } = await db.from("checkout_captures").select("status").eq("id", row.id).maybeSingle();
    if (current?.status !== "pending_payment") continue;
    const lang: Lang = row.language === "en" || row.language === "es" ? row.language : "pt";
    const tx = recoveryText[lang], link = resumeLink(row);
    let receipt = "", detail = "", status = "failed";
    try {
      const result = await sendResendEmail({ to: row.email, subject: tx.subject, idempotencyKey: `checkout-recovery-${row.id}`, html: `<h1>Onic Car Rentals</h1><p>${escape(tx.email)}</p><p>${escape(fmt(tx.message, { name: row.first_name, car: row.vehicle_name, link: "" }))}</p><p><a href="${escape(link)}">${escape(tx.resume)}</a></p>` });
      receipt = result.id; status = "sent"; sent++;
    } catch (e) { detail = e instanceof Error ? e.message : "Email unavailable"; failed++; }
    await db.from("checkout_captures").update({ recovery_sent_at: status === "sent" ? now.toISOString() : null, recovery_receipt: receipt || null, recovery_error: detail || null }).eq("id", row.id);
    await db.from("notification_log").insert({ channel: "email", kind: "checkout_recovery", recipient: row.email, status, detail: receipt || detail });
  }
  return { sent, failed };
}