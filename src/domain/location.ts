import type { Region } from "./options";

const countryAliases: Record<string, string> = {
  US: "United States",
  USA: "United States",
  "UNITED STATES OF AMERICA": "United States",
  "UNITED STATES": "United States",
  CA: "Canada",
  CAN: "Canada",
  MX: "Mexico",
  MEX: "Mexico",
  UK: "United Kingdom",
  GB: "United Kingdom",
  GBR: "United Kingdom",
  FR: "France",
  FRA: "France",
  BR: "Brazil",
  BRA: "Brazil"
};

export interface InferredLocation {
  region?: Region;
  country?: string;
  city?: string;
}

export function normalizeCountry(value?: string) {
  const normalized = value?.trim();
  if (!normalized) return undefined;

  return countryAliases[normalized.toUpperCase()] ?? normalized;
}

export function regionForCountry(country?: string): Region | undefined {
  const normalized = normalizeCountry(country);
  if (!normalized) return undefined;

  if (["United States", "Canada", "Mexico"].includes(normalized)) return "NAFTA";
  if (["Brazil"].includes(normalized)) return "Latam";
  if (["France", "United Kingdom"].includes(normalized)) return "Europe";

  return undefined;
}

export function inferLocationFromAddress(address?: string): InferredLocation {
  const parts = address?.split(",").map((part) => part.trim()).filter(Boolean) ?? [];
  if (parts.length === 0) return {};

  const country = normalizeCountry(parts.at(-1));
  const city = country && parts.length >= 3 ? parts.at(-3) : parts.length >= 2 ? parts.at(-2) : undefined;

  return {
    city,
    country,
    region: regionForCountry(country)
  };
}

export function inferLocationFromStatementFields(input: {
  city?: string;
  country?: string;
  stateOrProvince?: string;
  currency?: string;
}): InferredLocation {
  const rawCity = input.city?.trim();
  const city = rawCity && /[a-z]/i.test(rawCity) && !/^\+?\d[\d\s().-]{6,}$/.test(rawCity) ? rawCity : undefined;
  const country = normalizeCountry(input.country) ??
    (input.stateOrProvince || input.currency === "USD" ? "United States" : undefined);

  return {
    city,
    country,
    region: regionForCountry(country)
  };
}
