const GATEWAY = "https://connector-gateway.lovable.dev/resend";
export const EMAIL_DOMAIN = "seudominio.com";
export const EMAIL_FROM = "Sua Locadora <reservas@seudominio.com>";
export const OWNER_EMAIL = "dono@seudominio.com";

export function emailConfigured() {
  return Boolean(process.env["RESEND_API_KEY"] && process.env["LOVABLE_API_KEY"]);
}

async function request(path: string, init?: RequestInit) {
  const key = process.env["RESEND_API_KEY"];
  const lovable = process.env["LOVABLE_API_KEY"];
  if (!key || !lovable) throw new Error("Resend connection is not configured");
  const response = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: { ...Object.fromEntries(new Headers(init?.headers)), Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": key, "Content-Type": "application/json" },
  });
  const body = await response.text();
  if (!response.ok) {
    console.error(`[Resend] ${response.status}: ${body}`);
    throw new Error(`Resend ${response.status}: ${body}`);
  }
  return JSON.parse(body);
}

export async function emailHealth() {
  if (!emailConfigured()) return { connected: false, status: "not_connected" };
  try {
    const result = await request("/domains");
    const domain = result.data?.find((d: { name: string }) => d.name === EMAIL_DOMAIN);
    return { connected: domain?.status === "verified", status: String(domain?.status ?? "domain_missing") };
  } catch {
    return { connected: false, status: "connection_error" };
  }
}

export async function sendResendEmail(input: { to: string; subject: string; html: string; text?: string | undefined; idempotencyKey?: string | undefined }) {
  const data = await request("/emails", {
    method: "POST",
    headers: input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {},
    body: JSON.stringify({ from: EMAIL_FROM, to: [input.to], reply_to: OWNER_EMAIL, subject: input.subject, html: input.html, ...(input.text ? { text: input.text } : {}) }),
  });
  if (typeof data.id !== "string" || !data.id) throw new Error("Resend did not return a send receipt");
  return { sent: true as const, id: data.id };
}