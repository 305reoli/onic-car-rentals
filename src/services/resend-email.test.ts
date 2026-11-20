import { afterEach, describe, expect, it, vi } from "vitest";
import { emailHealth, sendResendEmail } from "./resend-email.server";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function configured() { vi.stubEnv("RESEND_API_KEY", "test-connection"); vi.stubEnv("LOVABLE_API_KEY", "test-project"); }
describe("Resend delivery", () => {
  it("sends through the connected service with Sua Locadora sender and owner reply address", async () => {
    configured(); const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "test-receipt" })));
    vi.stubGlobal("fetch", fetcher);
    expect(await sendResendEmail({ to: "dono@seudominio.com", subject: "Test", html: "<p>Test</p>", idempotencyKey: "one-test" })).toEqual({ sent: true, id: "test-receipt" });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("https://connector-gateway.lovable.dev/resend/emails");
    expect(JSON.parse(init.body)).toMatchObject({ from: "Sua Locadora <reservas@seudominio.com>", to: ["dono@seudominio.com"], reply_to: "dono@seudominio.com" });
  });
  it("does not report pending DNS as connected", async () => {
    configured(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ name: "seudominio.com", status: "pending" }] }))));
    expect(await emailHealth()).toEqual({ connected: false, status: "pending" });
  });
  it("rejects a response without a send receipt", async () => {
    configured(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    await expect(sendResendEmail({ to: "dono@seudominio.com", subject: "Test", html: "test" })).rejects.toThrow("send receipt");
  });
});