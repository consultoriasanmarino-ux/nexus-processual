import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function formatPhone(value: string | null | undefined): string {
  if (!value) return "";

  // Se houver vírgulas ou múltiplos espaços, trata como lista
  if (value.includes(",") || value.includes("  ")) {
    return value.split(/,|\s{2,}/)
      .map(p => formatPhone(p.trim()))
      .filter(Boolean)
      .join(", ");
  }

  const digits = value.replace(/\D/g, "");
  if (!digits) return "";

  // Se a string for muito longa (mais que 11 dígitos), pode ser vários números grudados
  if (digits.length > 11) {
    const results: string[] = [];
    let current = digits;

    while (current.length >= 10) {
      // Tenta pegar 11 dígitos (celular) ou 10 (fixo)
      // Se começar com o dígito 9 na posição 3 (ex: 119...), provavelmente tem 11
      const isMobile = current.length >= 11 && current[2] === "9";
      const size = isMobile ? 11 : 10;

      const part = current.substring(0, size);
      results.push(formatPhone(part));
      current = current.substring(size);
    }

    // Se sobrar algo pequeno, anexa ao último ou ignora? 
    // Melhor retornar o que conseguimos organizar.
    return results.join(", ");
  }

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
