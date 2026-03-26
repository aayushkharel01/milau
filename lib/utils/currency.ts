import { CurrencyCode } from "@/types";

export const currencyOptions: CurrencyCode[] = ["USD", "EUR", "GBP", "INR", "NPR"];

export const currencyLabels: Record<CurrencyCode, string> = {
  USD: "USD ($)",
  EUR: "EUR (€)",
  GBP: "GBP (£)",
  INR: "INR (Rs)",
  NPR: "NPR (Rs)"
};

export function formatCurrency(value: number, currency: CurrencyCode) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value);
}
