import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function formatPhone(value: string | null | undefined): string {
  if (!value) return "";

  // Se houver vírgulas, trata como uma lista de telefones
  if (value.includes(",")) {
    return value.split(",")
      .map(p => formatPhone(p.trim()))
      .filter(Boolean)
      .join(", ");
  }

  const digits = value.replace(/\D/g, "");
  if (!digits) return "";

  // Format based on length (standard Brazilian formats)
  if (digits.length <= 10) {
    // (99) 9999-9999
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  } else {
    // (99) 99999-9999
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }
}

export function formatCPF(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) {
    // 999.999.999-99
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    // 99.999.999/9999-99
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return value; // Return as is if format not recognized
}

export function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const num = typeof value === "string" ? parseFloat(value.replace(/[^\d.-]/g, "")) : value;
  if (isNaN(num)) return "";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatProcessNumber(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 20) {
    // NNNNNNN-DD.YYYY.J.TR.OOOO
    return digits.replace(/(\d{7})(\d{2})(\d{4})(\d{1})(\d{2})(\d{4})/, "$1-$2.$3.$4.$5.$6");
  }
  return value;
}

export function extractProcessNumberFromFilename(filename: string): string | null {
  // Look for 20 consecutive digits in the filename
  const match = filename.match(/\d{20}/);
  if (match) {
    return formatProcessNumber(match[0]);
  }
  return null;
}
