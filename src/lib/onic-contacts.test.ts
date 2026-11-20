import { describe, expect, it } from "vitest";
import { CALL_PHONE, CALL_PHONE_DISPLAY, waLink } from "./i18n";
import { BUSINESS } from "./seo";
import { emailHtml } from "./emailLayout";

describe("confirmed Onic contact destinations", () => {
  it("uses the confirmed main phone for calling and business listings", () => {
    expect(CALL_PHONE).toBe("+19542480903");
    expect(CALL_PHONE_DISPLAY).toBe("+1 (954) 248-0903");
    expect(BUSINESS.telephone).toBe("+19542480903");
    expect(BUSINESS.phoneDisplay).toBe("+1 (954) 248-0903");
  });
  it("keeps WhatsApp on its separate Brazilian number", () => {
    expect(new URL(waLink("Booking question")).pathname).toBe("/5565984046666");
  });
  it.each(["en", "pt", "es"] as const)("%s emails offer the confirmed call and WhatsApp destinations", (lang) => {
    const document = new DOMParser().parseFromString(emailHtml({ siteUrl: "https://oniccarrentals.com", lang, subject: "Booking", lines: [] }), "text/html");
    const destinations = Array.from(document.querySelectorAll("a")).map((a) => a.href);
    expect(destinations).toContain("tel:+19542480903");
    expect(destinations).toContain("https://wa.me/5565984046666");
  });
});