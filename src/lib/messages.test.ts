import { describe, expect, it } from "vitest";
import { renderMessage } from "./messages";

describe("customer messages", () => {
  it("fills every bracket placeholder", () => {
    expect(renderMessage("[code] [car] $[balance] [link]", { code: "AB12CD34", car: "Ferrari Portofino", balance: "1,425.00", link: "https://x" }))
      .toBe("AB12CD34 Ferrari Portofino $1,425.00 https://x");
  });
});
