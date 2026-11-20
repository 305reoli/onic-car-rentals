import { describe, it, expect, vi } from "vitest";
import { sendMeasureOneEmail, type MeasureOneBookingRow, type MeasureOneDeps } from "./measureone-email.server";
import { measureOneCardUrl, usFlowLabelKey, MEASUREONE_PENDING } from "@/lib/insurance";
import { render, screen } from "@testing-library/react";
import { MeasureOneCard } from "@/components/site/MeasureOneCard";

const LINK = "https://link.measureone.com/abc?x=1";
function deps(row: Partial<MeasureOneBookingRow>, link = LINK) {
  const db: MeasureOneBookingRow = { id: "11111111-2222-3333-4444-555555555555", email: "c@x.com", first_name: "Ana", language: "pt", insurance_us_flow: MEASUREONE_PENDING, insurance_choice: "own", measureone_email_sent_at: null, ...row };
  const send = vi.fn(async () => ({ id: "re_1" }));
  const d: MeasureOneDeps = {
    load: async () => ({ ...db }), link: async () => link,
    claim: async (_id, at) => { if (db.measureone_email_sent_at) return false; db.measureone_email_sent_at = at; return true; },
    release: async () => { db.measureone_email_sent_at = null; }, send, log: vi.fn(async () => undefined),
  };
  return { d, send, db };
}

describe("MeasureOne post-payment email", () => {
  it("sends once in the booking language with the exact link; retries never resend", async () => {
    const { d, send } = deps({});
    expect((await sendMeasureOneEmail(d, "x")).sent).toBe(true);
    expect((await sendMeasureOneEmail(d, "x")).reason).toBe("already_sent");
    expect(send).toHaveBeenCalledTimes(1);
    const m = (send.mock.calls[0] as unknown as [{ subject: string; html: string; idempotencyKey: string }])[0];
    expect(m.subject).toBe("Verifique seu seguro de carro — Onic Car Rentals");
    expect(m.html).toContain('href="https://link.measureone.com/abc?x=1"');
    expect(m.idempotencyKey).toBe("measureone-x");
  });
  it("EN/ES subjects", async () => {
    for (const [lang, subj] of [["en", "Verify your auto insurance — Onic Car Rentals"], ["es", "Verifique su seguro de auto — Onic Car Rentals"]] as const) {
      const { d, send } = deps({ language: lang }); await sendMeasureOneEmail(d, "x");
      expect((send.mock.calls[0] as unknown as [{ subject: string }])[0].subject).toBe(subj);
    }
  });
  it.each([["Onic coverage", { insurance_choice: "ben" }], ["upload path", { insurance_us_flow: null }], ["fallback", { insurance_us_flow: "fallback_uploaded" }]])("%s → no email", async (_n, row) => {
    const { d, send } = deps(row as never); await sendMeasureOneEmail(d, "x"); expect(send).not.toHaveBeenCalled();
  });
  it("empty link → no email", async () => { const { d, send } = deps({}, " "); await sendMeasureOneEmail(d, "x"); expect(send).not.toHaveBeenCalled(); });
  it("failed send releases the claim so it is not marked sent", async () => {
    const { d, db } = deps({}); d.send = vi.fn(async () => { throw new Error("down"); });
    expect((await sendMeasureOneEmail(d, "x")).sent).toBe(false); expect(db.measureone_email_sent_at).toBeNull();
  });
});

describe("MeasureOne confirmation card eligibility", () => {
  const paid = { status: "confirmed", captured_at: "2026-11-01", paid_amount_usd: 230.04, prereservation_amount_usd: 230.04, price_breakdown: { total: 230.04 }, pickup_at: "2026-12-01", return_at: "2026-12-04" };
  it("paid US pending shows the exact link in a new tab", () => {
    render(<MeasureOneCard lang="es" link={LINK} booking={{ ...paid, insurance_us_flow: MEASUREONE_PENDING, insurance_choice: "own" }} />);
    const a = screen.getByRole("link"); expect(a).toHaveAttribute("href", LINK); expect(a).toHaveAttribute("target", "_blank");
    expect(screen.getByText("Verifique su seguro", { selector: "h2" })).toBeInTheDocument();
  });
  it.each([
    ["BR/foreign", { ...paid, insurance_us_flow: null, insurance_choice: "own" }, LINK],
    ["Onic coverage", { ...paid, insurance_us_flow: MEASUREONE_PENDING, insurance_choice: "ben" }, LINK],
    ["unpaid", { ...paid, captured_at: null, paid_amount_usd: 0, insurance_us_flow: MEASUREONE_PENDING }, LINK],
    ["empty link", { ...paid, insurance_us_flow: MEASUREONE_PENDING }, ""],
  ])("%s → renders nothing", (_n, booking, link) => {
    const { container } = render(<MeasureOneCard lang="en" link={link} booking={booking as never} />);
    expect(container.innerHTML).toBe("");
  });
  it("new enum value is its own pending state", () => {
    expect(usFlowLabelKey(MEASUREONE_PENDING)).toBe("flowPending");
    expect(measureOneCardUrl(LINK, { insurance_us_flow: "measureone_started" }, true)).toBeNull();
  });
});
