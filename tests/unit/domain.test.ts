import { describe, expect, it } from "vitest";
import { seedExpenses } from "../fixtures";
import {
  businessMealsSubExpenseOptions,
  countryOptionsByRegion,
  expenseTypeOptions,
  getCountryOptions,
  getSubExpenseTypeOptions,
  mealsSubExpenseOptions,
  otherExpensesSubExpenseOptions,
  regionOptions,
  staySubExpenseOptions,
  transportSubExpenseOptions
} from "../../src/domain/options";
import { inferLocationFromStatementFields } from "../../src/domain/location";
import { expenseSchema } from "../../src/domain/validators";

describe("Expense domain", () => {
  it("requires meal people count for meal expenses", () => {
    const meal = seedExpenses.find((expense) => expense.expenseType === "Business Meals")!;

    expect(expenseSchema.parse(meal).mealPeopleCount).toBeGreaterThan(0);
  });

  it("rejects meals without people count", () => {
    const meal = seedExpenses.find((expense) => expense.expenseType === "Business Meals")!;

    expect(() => expenseSchema.parse({ ...meal, mealPeopleCount: undefined })).toThrow(
      "Meal expenses require number of people."
    );
  });

  it("keeps Export Package terminology in seed data", () => {
    expect(seedExpenses.map((expense) => expense.status)).toContain("Declare");
  });

  it("mirrors the company Region and Expense type dropdowns", () => {
    expect(regionOptions).toEqual([
      "Africa",
      "America",
      "Asia",
      "Central America",
      "Europe",
      "Latam",
      "Middle East",
      "NAFTA",
      "Other",
      "Southwest Pacific"
    ]);
    expect(expenseTypeOptions).toEqual([
      "Business Meals",
      "Entertainment and Gifts",
      "Flight Travel Approval",
      "Meals",
      "Other Expenses",
      "Stay",
      "Transport",
      "Travel Approval"
    ]);
    expect(businessMealsSubExpenseOptions).toEqual(["Business Meals", "Dinner", "Lunch"]);
    expect(mealsSubExpenseOptions).toEqual(["Breakfast", "Brunch", "Dinner", "Drinks", "Lunch", "Snacks"]);
    expect(otherExpensesSubExpenseOptions).toEqual([
      "Any other expenses",
      "Bank Charges",
      "Donation/Gift",
      "Fitness/Gym fees",
      "Health Insurance",
      "Medical Fees",
      "Meeting Room",
      "Membership",
      "Office",
      "Office Rent",
      "Office Supplies",
      "Outing/Sports Ticket",
      "Passports & Visa",
      "Promotional Items",
      "Registration Fees",
      "Tips",
      "Training Fees"
    ]);
    expect(staySubExpenseOptions).toEqual([
      "Bar/Mini Bar",
      "Hotel",
      "Laundry",
      "Other Lodging Expenses",
      "Rent Housing",
      "Room Service",
      "Telephone Bill"
    ]);
    expect(transportSubExpenseOptions).toEqual([
      "Air",
      "Auto/Bus/Metro",
      "Car Rental",
      "Fuel",
      "Mileage (Personal Car)",
      "Other Transportation",
      "Parking",
      "Rail",
      "Taxi",
      "Toll"
    ]);
    expect(getSubExpenseTypeOptions("Entertainment and Gifts")).toEqual(["Entertainment and Gifts"]);
    expect(getSubExpenseTypeOptions("Flight Travel Approval")).toEqual(["Flight Travel Approval"]);
    expect(getSubExpenseTypeOptions("Travel Approval")).toEqual(["Travel Approval"]);
  });

  it("filters Country options by parent Region", () => {
    expect(getCountryOptions("NAFTA")).toEqual(["Canada", "Mexico", "United States"]);
    expect(getCountryOptions("Europe")).toContain("France");
    expect(getCountryOptions("Central America")).toEqual([
      "Belize",
      "Costa Rica",
      "El Salvador",
      "Guatemala",
      "Honduras",
      "Nicaragua",
      "Panama"
    ]);
    expect(getCountryOptions("Southwest Pacific")).toEqual(
      expect.arrayContaining(["Australia", "New Zealand", "Papua New Guinea"])
    );
    expect(getCountryOptions("Other")).toEqual(["Other"]);
    expect(regionOptions.every((region) => countryOptionsByRegion[region].length > 0)).toBe(true);
  });

  it("does not treat merchant phone numbers as statement cities", () => {
    expect(inferLocationFromStatementFields({ city: "8005928996", stateOrProvince: "CA", currency: "USD" })).toEqual({
      city: undefined,
      country: "United States",
      region: "NAFTA"
    });
  });
});
