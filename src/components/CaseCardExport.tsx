import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileText, FileDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Case } from "@/lib/types";
import jsPDF from "jspdf";

interface Props {
  caseData: Case;
}

function toTitleCase(str: string) {
  return str.toLowerCase().replace(/(?:^|\s|[-/])\S/g, (c) => c.toUpperCase());
}

function simplifyDefendant(name: string) {
  let simplified = name.replace(/[,\s]+(financiamento|crédito|credito|investimento|seguros|previdência|previdencia|participações|participacoes|administradora|corretora|distribuidora)\b.*/i, "");
  simplified = simplified.replace(/\s*(s\.?\/?a\.?|ltda\.?|me|epp|eireli)\.?\s*$/i, "").trim();
  return simplified || name;
}

function simplifyCourtToComarca(court: string) {
  const comarcaMatch = court.match(/comarca\s+de\s+(.+)/i);
  if (comarcaMatch) return comarcaMatch[1].trim();
  const foroMatch = court.match(/foro\s+(?:de\s+|central\s+)?(.+)/i);
  if (foroMatch) return foroMatch[1].trim();
  return court;
}

function buildInitialMessage(caseData: Case): string {
  const client = (caseData as any).clients;
  const clientName = client?.full_name || "Cliente";
  const firstName = toTitleCase(clientName.split(" ")[0]);
  const defendantName = caseData.defendant ? toTitleCase(simplifyDefendant(caseData.defendant)) : "a parte ré";
  const courtDisplay = caseData.court
    ? toTitleCase(simplifyCourtToComarca(caseData.court)).replace(/\b(rs|sp|rj|mg|pr|sc|ba|go|df|es|pe|ce|ma|pa|mt|ms|am|pi|rn|pb|se|al|to|ro|ac|ap|rr)\b/gi, (s) => s.toUpperCase())
    : "comarca não informada";
  return `Olá, ${firstName}! Tenho novidades sobre sua ação de revisão contra o ${defendantName} (Comarca de ${courtDisplay}). Poderia confirmar se recebeu esta mensagem?`;
}

function buildExportContent(caseData: Case): { title: string; author: string; cpf: string; phones: string; summary: string; initialMessage: string } {
  const client = (caseData as any).clients;
  return {
    title: caseData.case_title,
    author: client ? toTitleCase(client.full_name) : "Não informado",
    cpf: client?.cpf_or_identifier || "Não informado",
    phones: client?.phone || "Não informado",
    summary: caseData.case_summary || "Sem resumo disponível.",
    initialMessage: buildInitialMessage(caseData),
  };
}

function exportAsTxt(caseData: Case) {
  const c = buildExportContent(caseData);
  const lines = [
    `FICHA DO CASO`,
    `${"═".repeat(50)}`,
    ``,
    `📋 TÍTULO: ${c.title}`,
    ``,
    `👤 AUTOR: ${c.author}`,
    `📄 CPF: ${c.cpf}`,
    `📞 TELEFONES: ${c.phones}`,
    ``,
    `${"─".repeat(50)}`,
    `📝 RESUMO DO CASO`,
    `${"─".repeat(50)}`,
    c.summary,
    ``,
    `${"─".repeat(50)}`,
    `💬 MENSAGEM INICIAL`,
    `${"─".repeat(50)}`,
    c.initialMessage,
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ficha-${caseData.case_title.replace(/\s+/g, "-").toLowerCase()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("Ficha exportada em .txt!");
}

function exportAsPdf(caseData: Case) {
  const c = buildExportContent(caseData);
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  let y = 20;

  const addText = (text: string, size: number, bold = false, color: [number, number, number] = [30, 30, 30]) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, maxWidth);
    for (const line of lines) {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, margin, y);
      y += size * 0.5;
    }
    y += 2;
  };

  const addSeparator = () => {
    if (y > 275) { doc.addPage(); y = 20; }
    doc.setDrawColor(180, 160, 120);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  };

  // Title
  addText("FICHA DO CASO", 16, true, [120, 90, 40]);
  y += 4;
  addSeparator();

  // Case title
  addText(c.title, 13, true);
  y += 4;

  // Client info
  addText(`Autor: ${c.author}`, 10, false);
  addText(`CPF: ${c.cpf}`, 10, false);
  addText(`Telefones: ${c.phones}`, 10, false);
  y += 4;
  addSeparator();

  // Summary
  addText("RESUMO DO CASO", 11, true, [120, 90, 40]);
  y += 2;
  addText(c.summary, 10, false);
  y += 4;
  addSeparator();

  // Initial message
  addText("MENSAGEM INICIAL", 11, true, [120, 90, 40]);
  y += 2;
  addText(c.initialMessage, 10, false);

  doc.save(`ficha-${caseData.case_title.replace(/\s+/g, "-").toLowerCase()}.pdf`);
  toast.success("Ficha exportada em PDF!");
}

export function CaseCardExport({ caseData }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="absolute bottom-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="w-3.5 h-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => exportAsPdf(caseData)}>
          <FileDown className="w-3.5 h-3.5 mr-2" /> Exportar PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportAsTxt(caseData)}>
          <FileText className="w-3.5 h-3.5 mr-2" /> Exportar .txt
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
