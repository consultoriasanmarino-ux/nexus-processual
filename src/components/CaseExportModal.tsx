import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, Copy, Check, FileDown } from "lucide-react";
import { toast } from "sonner";
import type { Case } from "@/lib/types";
import { formatPhone, formatCPF } from "@/lib/utils";

interface Props {
  caseData: Case;
}

function toTitleCase(str: string) {
  return str.toLowerCase().replace(/(?:^|\s|[-/])\S/g, (c) => c.toUpperCase());
}

function buildExportText(caseData: Case): string {
  const client = (caseData as any).clients;
  const caseValue = caseData.case_value ? Number(caseData.case_value) : null;
  const paymentValue = caseValue ? caseValue / 2 : null;
  const lines: string[] = [];

  if (caseData.case_summary) {
    lines.push("📋 RESUMO DO CASO");
    lines.push("───────────────────────────────────────");
    lines.push(caseData.case_summary);
    lines.push("");
  }

  if (caseData.distribution_date) {
    lines.push(`Data de Autuação: ${new Date(caseData.distribution_date + "T12:00:00").toLocaleDateString("pt-BR")}`);
  }
  lines.push("");

  if (caseValue !== null) {
    lines.push(`Valor da Causa: R$ ${caseValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  }
  if (paymentValue !== null) {
    lines.push(`Valor de pagamento: R$ ${paymentValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
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
          <FileDown className="w-3.5 h-3.5 mr-1.5" /> Exportar Conteúdo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Exportar Conteúdo do Caso</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 mb-3">
          <Button size="sm" variant="outline" onClick={handleCopy} className="text-xs">
            {copied ? <Check className="w-3.5 h-3.5 mr-1.5 text-primary" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
            {copied ? "Copiado!" : "Copiar tudo"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleDownload} className="text-xs">
            <Download className="w-3.5 h-3.5 mr-1.5" /> Baixar .txt
          </Button>
        </div>
        <pre className="flex-1 overflow-auto bg-secondary rounded-lg p-4 text-xs whitespace-pre-wrap font-mono text-foreground border border-border">
          {exportText}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
