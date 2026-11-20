import { describe, expect, it } from "vitest";
import { matchesCar, searchCars, suggestCategory } from "./carsearch";

const cars = [
  { name: "Ferrari Portofino", brand: "Ferrari", model: "Portofino" },
  { name: "Ferrari Purosangue", brand: "Ferrari", model: "Purosangue" },
  { name: "Ferrari 296 GTB", brand: "Ferrari", model: "296 GTB" },
  { name: "Lamborghini Urus", brand: "Lamborghini", model: "Urus" },
  { name: "Range Rover Sport", brand: "Land Rover", model: "Range Rover Sport" },
  { name: "Rolls-Royce Cullinan", brand: "Rolls-Royce", model: "Cullinan" },
];

describe("model search", () => {
  it("'Ferrari' returns the three Ferraris", () => {
    expect(searchCars(cars, "Ferrari").map((c) => c.name)).toEqual(["Ferrari Portofino", "Ferrari Purosangue", "Ferrari 296 GTB"]);
  });
  it("'lambo' returns Lamborghinis", () => expect(searchCars(cars, "lambo").map((c) => c.name)).toEqual(["Lamborghini Urus"]));
  it("'range' returns Range Rover", () => expect(searchCars(cars, "range").map((c) => c.name)).toEqual(["Range Rover Sport"]));
  it("is accent and case insensitive", () => {
    expect(matchesCar({ name: "Ferrari Portofino" }, "FÉRRARI")).toBe(true);
    expect(matchesCar({ name: "Rolls-Royce Cullinan" }, "rolls royce")).toBe(true);
  });
  it("no match suggests a category", () => {
    expect(searchCars(cars, "tesla")).toEqual([]);
    expect(suggestCategory("convertible")).toBe("convertible");
  });
});
