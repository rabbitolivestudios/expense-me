import type { Expense } from "../../domain/types";

export type ExpenseClassification = Pick<Expense, "expenseType" | "subExpenseType">;

export function classifyExpenseText(text: string): ExpenseClassification {
  const normalized = text.toLowerCase();

  if (/taxi|uber|lyft|cab/.test(normalized)) {
    return { expenseType: "Transport", subExpenseType: "Taxi" };
  }

  if (/\btips?\b|gratuity/.test(normalized)) {
    return { expenseType: "Other Expenses", subExpenseType: "Tips" };
  }

  if (/registration|conference fee|event fee/.test(normalized)) {
    return { expenseType: "Other Expenses", subExpenseType: "Registration Fees" };
  }

  if (/training fee|training fees|course fee|seminar fee/.test(normalized)) {
    return { expenseType: "Other Expenses", subExpenseType: "Training Fees" };
  }

  if (/room service/.test(normalized)) {
    return { expenseType: "Stay", subExpenseType: "Room Service" };
  }

  if (/laundry|dry cleaning/.test(normalized)) {
    return { expenseType: "Stay", subExpenseType: "Laundry" };
  }

  if (/mini bar|minibar|hotel bar/.test(normalized)) {
    return { expenseType: "Stay", subExpenseType: "Bar/Mini Bar" };
  }

  if (/hotel|lodging|inn|suite|resort/.test(normalized)) {
    return { expenseType: "Stay", subExpenseType: "Hotel" };
  }

  if (/\btoll\b|toll road|turnpike/.test(normalized)) {
    return { expenseType: "Transport", subExpenseType: "Toll" };
  }

  if (/\brail\b|\btrain\b|amtrak|metro rail/.test(normalized)) {
    return { expenseType: "Transport", subExpenseType: "Rail" };
  }

  if (/fuel|shell|gas|gasoline/.test(normalized)) {
    return { expenseType: "Transport", subExpenseType: "Fuel" };
  }

  if (/\bair\b|airline|flight|airport/.test(normalized)) {
    return { expenseType: "Transport", subExpenseType: "Air" };
  }

  if (/parking/.test(normalized)) {
    return { expenseType: "Transport", subExpenseType: "Parking" };
  }

  if (/breakfast/.test(normalized)) {
    return { expenseType: "Meals", subExpenseType: "Breakfast" };
  }

  if (/brunch/.test(normalized)) {
    return { expenseType: "Meals", subExpenseType: "Brunch" };
  }

  if (/dinner/.test(normalized)) {
    return { expenseType: "Meals", subExpenseType: "Dinner" };
  }

  if (/drinks?|cocktail|beverage/.test(normalized)) {
    return { expenseType: "Meals", subExpenseType: "Drinks" };
  }

  if (/snacks?/.test(normalized)) {
    return { expenseType: "Meals", subExpenseType: "Snacks" };
  }

  if (/restaurant|cafe|coffee|lunch|meal/.test(normalized)) {
    return { expenseType: "Meals", subExpenseType: "Lunch" };
  }

  return { expenseType: "Other Expenses", subExpenseType: "Any other expenses" };
}
