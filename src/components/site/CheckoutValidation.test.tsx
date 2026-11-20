import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CheckoutValidation, ValidationField, focusCheckoutError } from "./CheckoutValidation";

describe("shared checkout validation controls", () => {
  it.each(["pt", "en", "es"] as const)("marks and clears inputs, birth selects, terms and upload actions in %s", lang => {
    const fields = ["email", "dateOfBirth", "terms", "passport", "payment"];
    const ui = (errors: string[]) => <CheckoutValidation lang={lang} labels={{}} errors={errors}>
      <ValidationField id="email"><input aria-label="email" /></ValidationField>
      <ValidationField id="dateOfBirth"><select aria-label="day"><option /></select><select aria-label="month"><option /></select><select aria-label="year"><option /></select></ValidationField>
      <ValidationField id="terms"><input type="checkbox" aria-label="terms" /></ValidationField>
      <ValidationField id="passport"><button aria-label="upload" /></ValidationField>
      <ValidationField id="payment"><iframe title="payment" /></ValidationField>
      <input aria-label="optional flight" />
    </CheckoutValidation>;
    const { rerender } = render(ui(fields));
    for (const name of ["email", "day", "month", "year", "terms", "upload"]) expect(screen.getByLabelText(name)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTitle("payment")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("optional flight")).not.toHaveAttribute("aria-invalid");
    rerender(ui([]));
    expect(screen.getByLabelText("email")).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByLabelText("email")).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByTestId("checkout-validation-alert")).not.toBeInTheDocument();
  });
  it("centers and focuses the first visible invalid control", async () => {
    render(<CheckoutValidation lang="en" labels={{}} errors={["email"]}><ValidationField id="email"><input aria-label="focus email" /></ValidationField></CheckoutValidation>);
    const input = screen.getByLabelText("focus email");
    const wrapper = input.parentElement;
    if (!wrapper) throw new Error("Missing field wrapper");
    vi.spyOn(wrapper, "getClientRects").mockReturnValue({ length: 1 } as DOMRectList);
    const scroll = vi.fn(); wrapper.scrollIntoView = scroll;
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    fireEvent.blur(input);
    focusCheckoutError(["email"]);
    await waitFor(() => expect(input).toHaveFocus());
    expect(scroll).toHaveBeenCalledWith({ block: "center", behavior: "instant" });
    vi.unstubAllGlobals();
  });
});