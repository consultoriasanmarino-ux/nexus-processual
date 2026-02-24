import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, Copy, Check, FileDown, Stamp, FileText as FileTextIcon } from "lucide-react";
import { toast } from "sonner";
import type { Case } from "@/lib/types";
import { formatPhone, formatCPF } from "@/lib/utils";
import { exportAsPdf, exportAsOficio, exportPetition } from "./CaseCardExport";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  caseData: Case;
}

function toTitleCase(str: string) {
  if (!str) return "";
  return str.toLowerCase().replace(/(?:^|\s|[-/])\S/g, (c) => c.toUpperCase());
}

function buildExportText(caseData: Case): string {
  const client = (caseData as any).clients;
  const financialData = (caseData as any).documents?.[0]?.extracted_json || {};

  const caseValue = caseData.case_value ? Number(caseData.case_value) : null;
  const principalValue = financialData.principal_value ? Number(financialData.principal_value) : caseValue;
  const feeValue = financialData.lawyer_fee_value ? Number(financialData.lawyer_fee_value) : null;
  const netValue = financialData.client_net_value ? Number(financialData.client_net_value) : null;
  const feePercent = financialData.lawyer_fee_percent ? Number(financialData.lawyer_fee_percent) : null;

  const lines: string[] = [];

  // MENSAGEM INICIAL SYNC
  const clientName = client?.full_name || "Cliente";
  const firstName = toTitleCase(clientName.split(" ")[0]);
  const aiSummary = caseData.case_summary || "";
  const initialMessage = aiSummary
    ? `Olá, ${firstName}! Fizemos a análise do seu caso: ${aiSummary}`
    : `Olá, ${firstName}! Tenho novidades sobre sua ação...`;

  lines.push("💬 MENSAGEM PARA O CLIENTE");
  lines.push("───────────────────────────────────────");
  lines.push(initialMessage);
  lines.push("");

  if (caseData.case_summary) {
    lines.push("📋 RESUMO DO CASO");
    lines.push("───────────────────────────────────────");
    lines.push(caseData.case_summary);
    lines.push("");
  }

  lines.push("💰 VALORES DO PROCESSO");
  lines.push("───────────────────────────────────────");
  if (principalValue !== null) {
    lines.push(`Valor Principal: R$ ${principalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  }
  if (feeValue !== null) {
    lines.push(`Honorários (${feePercent || 0}%): R$ ${feeValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  }
  if (netValue !== null) {
    lines.push(`Valor Líquido Cliente: R$ ${netValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  } else if (caseValue !== null) {
    lines.push(`Valor do Caso: R$ ${caseValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  }
  lines.push("");

  if (client) {
    lines.push("👤 DADOS DO CLIENTE");
    lines.push("───────────────────────────────────────");
    lines.push(`Nome: ${toTitleCase(client.full_name)}`);
    if (client.phone_contract) lines.push(`Tel. Contrato: ${formatPhone(client.phone_contract)}`);
    if (client.phone) lines.push(`Tel. Consulta: ${formatPhone(client.phone)}`);
    if (client.cpf_or_identifier) lines.push(`CPF: ${formatCPF(client.cpf_or_identifier)}`);
  }

  return lines.join("\n");
}

export function CaseExportModal({ caseData }: Props) {
  const { isCaller } = useAuth();
  const [copied, setCopied] = useState(false);
  const exportText = buildExportText(caseData);

  const handleCopy = () => {
    navigator.clipboard.writeText(exportText);
    setCopied(true);
    toast.success("Conteúdo copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([exportText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `caso-${caseData.case_title.replace(/\s+/g, "-").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Arquivo .txt baixado!");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs">
          <Copy className="w-3.5 h-3.5 mr-1.5" /> Ver Texto de Exportação
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Exportar Conteúdo do Caso</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-2 mb-4">
          <Button size="sm" variant="default" onClick={handleCopy} className="text-xs bg-primary text-primary-foreground hover:bg-primary/90">
            {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
            {copied ? "Copiado!" : "Copiar Texto Completo"}
          </Button>

          {!isCaller && (
            <>
              <Button size="sm" variant="outline" onClick={handleDownload} className="text-xs">
                <FileTextIcon className="w-3.5 h-3.5 mr-1.5" /> Baixar .txt
              </Button>
              <Button size="sm" onClick={() => exportAsPdf(caseData)} className="bg-gradient-gold text-primary-foreground hover:opacity-90 text-xs shadow-glow">
                <FileDown className="w-3.5 h-3.5 mr-1.5" /> Baixar Ficha (PDF)
              </Button>
              <Button size="sm" onClick={() => exportAsOficio(caseData)} className="bg-gradient-gold text-primary-foreground hover:opacity-90 text-xs shadow-glow">
                <Stamp className="w-3.5 h-3.5 mr-1.5" /> Baixar Ofício
              </Button>
              <Button size="sm" onClick={() => exportPetition(caseData)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs shadow-lg">
                <Download className="w-3.5 h-3.5 mr-1.5" /> Baixar Petição
              </Button>
            </>
          )}
        </div>
        <pre className="flex-1 overflow-auto bg-secondary/50 rounded-lg p-4 text-xs whitespace-pre-wrap font-mono text-foreground border border-border">
          {exportText}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
