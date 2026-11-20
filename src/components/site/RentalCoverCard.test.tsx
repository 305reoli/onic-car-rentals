import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RentalCoverCard } from "./RentalCoverCard";
import { LANGS } from "@/lib/i18n";

afterEach(cleanup);
const booking = { status: "pending_approval", captured_at: "2026-11-17T03:00:00Z", paid_amount_usd: 230.04, price_breakdown: { total: 230.04 }, pickup_at: "2026-11-24T15:00:00Z", return_at: "2026-11-27T15:00:00Z", base_city: "orlando" };
const car = { name: "Toyota Corolla", category: "economy", body_category: "sedan" };
describe("RentalCover confirmation visibility", () => {
  it.each(["", "  \n\t"])("renders nothing for empty link %s", (link) => {
    const { container } = render(<RentalCoverCard lang="en" link={link} car={car} booking={booking} />);
    expect(container.childElementCount).toBe(0);
  });
  it("has no offer for a premium vehicle even with a link", () => {
    const { container } = render(<RentalCoverCard lang="en" link="https://affiliate.example/protect" car={{ ...car, name: "Escalade" }} booking={booking} />);
    expect(container.childElementCount).toBe(0);
  });
  it("has no offer before payment", () => {
    const { container } = render(<RentalCoverCard lang="en" link="https://affiliate.example/protect" car={car} booking={{ ...booking, status: "checkout_hold" }} />);
    expect(container.childElementCount).toBe(0);
  });
  it.each(LANGS)("paid regular booking uses stored affiliate URL exactly in %s", (lang) => {
    render(<RentalCoverCard lang={lang} link="https://affiliate.example/protect?affiliate=123" car={car} booking={booking} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("https://affiliate.example/protect?affiliate=123");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});