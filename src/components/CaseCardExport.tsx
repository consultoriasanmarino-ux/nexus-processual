import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileText, FileDown, Stamp } from "lucide-react";
import { toast } from "sonner";
import type { Case, Client } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import { formatPhone, formatCPF, formatProcessNumber } from "@/lib/utils";

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
  if (!court) return "";
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


interface ExportContent {
  title: string;
  author: string;
  cpf: string;
  phones: string;
  phoneContract: string;
  birthDate: string;
  income: string;
  profession: string;
  vehicles: string;
  banks: string;
  defendant: string;
  court: string;
  processNumber: string;
  caseType: string;
  summary: string;
  initialMessage: string;
}


function buildExportContent(caseData: Case): ExportContent {
  const client = (caseData as any).clients as Client | undefined;

  let profession = client?.profession || "";
  let vehicles = client?.vehicles || "";

  const placaRegex = /[A-Z]{3}\d{4}|[A-Z]{3}\d[A-Z]\d{2}/i;
  if (profession && placaRegex.test(profession)) {
    if (!vehicles || vehicles === "Nenhum") {
      vehicles = profession;
    }
    profession = "Não informado";
  }

  return {
    title: caseData.case_title,
    author: client ? toTitleCase(client.full_name) : "Não informado",
    cpf: client?.cpf_or_identifier ? formatCPF(client.cpf_or_identifier) : "Não informado",
    phones: client?.phone ? formatPhone(client.phone) : "Não informado",
    phoneContract: client?.phone_contract ? formatPhone(client.phone_contract) : "Não informado",
    birthDate: client?.birth_date || "Não informado",
    income: client?.income || "Não informado",
    profession: profession || "Não informado",
    vehicles: vehicles || "Nenhum",
    banks: client?.banks || "Não informado",
    defendant: caseData.defendant || "Não informado",
    court: caseData.court || "Não informado",
    processNumber: formatProcessNumber(caseData.process_number) || "Não informado",
    caseType: caseData.case_type || "Não informado",
    summary: caseData.case_summary || "Sem resumo disponível.",
    initialMessage: buildInitialMessage(caseData),
  };
}

export function exportAsPdf(caseData: Case) {
  const c = buildExportContent(caseData);
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  const primaryDark: [number, number, number] = [30, 41, 59];
  const primaryAccent: [number, number, number] = [59, 130, 246];
  const goldAccent: [number, number, number] = [180, 140, 60];
  const textDark: [number, number, number] = [30, 30, 30];
  const textMuted: [number, number, number] = [100, 116, 139];
  const bgLight: [number, number, number] = [248, 250, 252];
  const whiteBase: [number, number, number] = [255, 255, 255];
  const borderColor: [number, number, number] = [226, 232, 240];

  const checkNewPage = (needed: number) => {
    if (y + needed > pageHeight - 20) {
      doc.addPage();
      y = 20;
    }
  };

  doc.setFillColor(...primaryDark);
  doc.rect(0, 0, pageWidth, 44, "F");
  doc.setFillColor(...goldAccent);
  doc.rect(0, 44, pageWidth, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...whiteBase);
  doc.text("FICHA DO CASO", margin, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(180, 200, 230);
  doc.text("Nexus Processual", margin, 26);
  doc.setFontSize(8);
  doc.setTextColor(150, 170, 200);
  doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}`, margin, 34);

  y = 55;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);

  const titleLines = doc.splitTextToSize(c.title, contentWidth - 25);
  const lineHeight = 6.5;
  const totalTitleHeight = titleLines.length * lineHeight;
  const headerBoxHeight = Math.max(25, totalTitleHeight + 18);

  doc.setFillColor(...bgLight);
  doc.roundedRect(margin, y, contentWidth, headerBoxHeight, 3, 3, "F");
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, headerBoxHeight, 3, 3, "S");
  doc.setFillColor(...primaryAccent);
  doc.rect(margin, y, 3, headerBoxHeight, "F");

  doc.setTextColor(...primaryDark);
  titleLines.forEach((line: string, index: number) => {
    doc.text(line, margin + 10, y + 10 + (index * lineHeight));
  });

  if (c.processNumber !== "Não informado") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...primaryAccent);
    const processY = y + totalTitleHeight + 12;
    doc.text(`PROCESSO Nº: ${c.processNumber}`, margin + 10, processY);
  }
  y += headerBoxHeight + 8;

  const addSectionTitle = (title: string) => {
    checkNewPage(16);
    doc.setDrawColor(...borderColor);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
    doc.setFillColor(...primaryAccent);
    doc.roundedRect(margin, y - 1, 2, 8, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...primaryAccent);
    doc.text(title.toUpperCase(), margin + 6, y + 5);
    y += 14;
  };

  const addField = (label: string, value: string, labelWidth = 32) => {
    checkNewPage(8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...textMuted);
    doc.text(label, margin + 4, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...textDark);
    const valueLines = doc.splitTextToSize(value, contentWidth - labelWidth - 8);
    doc.text(valueLines, margin + labelWidth, y);
    y += valueLines.length * 5 + 3;
  };

  const addTextBlock = (text: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...textDark);
    const blockLines = doc.splitTextToSize(text, contentWidth - 8);
    for (const line of blockLines) {
      checkNewPage(6);
      doc.text(line, margin + 4, y);
      y += 4.5;
    }
    y += 4;
  };

  addSectionTitle("Informações do Processo");
  addField("Tipo:", c.caseType);
  addField("Vara/Comarca:", c.court);
  addField("Réu:", c.defendant);
  addSectionTitle("Dados do Autor");
  checkNewPage(14);
  doc.setFillColor(...bgLight);
  doc.roundedRect(margin + 2, y - 4, contentWidth - 4, 12, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...primaryDark);
  doc.text(c.author, margin + 6, y + 3);
  y += 16;
  addField("CPF:", c.cpf);
  if (c.phoneContract !== "Não informado") addField("Tel. Contrato:", c.phoneContract);
  if (c.phones !== "Não informado") addField("Tel. Consulta:", c.phones);
  addField("Nascimento:", c.birthDate);
  addField("Renda:", c.income);
  addField("Profissão:", c.profession);
  addSectionTitle("Veículos");
  if (c.vehicles && c.vehicles !== "Nenhum") {
    const vehicleList = c.vehicles.split("|").map(v => v.trim()).filter(Boolean);
    for (const vehicle of vehicleList) {
      checkNewPage(8);
      doc.setFillColor(...bgLight);
      doc.roundedRect(margin + 2, y - 3.5, contentWidth - 4, 8, 1.5, 1.5, "F");
      doc.setFillColor(...primaryAccent);
      doc.circle(margin + 6, y, 1.2, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...textDark);
      doc.text(vehicle, margin + 10, y + 1);
      y += 10;
    }
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...textMuted);
    doc.text("Nenhum veículo registrado.", margin + 4, y);
    y += 8;
  }
  addSectionTitle("Bancos / Instituições Financeiras");
  if (c.banks && c.banks !== "Não informado") {
    const bankList = c.banks.split(",").map(b => b.trim()).filter(Boolean);
    const colWidth = (contentWidth - 8) / 2;
    for (let i = 0; i < bankList.length; i += 2) {
      checkNewPage(8);
      doc.setFillColor(...bgLight);
      doc.roundedRect(margin + 2, y - 3.5, colWidth - 2, 8, 1.5, 1.5, "F");
      doc.setFillColor(...goldAccent);
      doc.circle(margin + 6, y, 1.2, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...textDark);
      doc.text(bankList[i], margin + 10, y + 1);
      if (bankList[i + 1]) {
        const col2X = margin + colWidth + 4;
        doc.setFillColor(...bgLight);
        doc.roundedRect(col2X, y - 3.5, colWidth - 2, 8, 1.5, 1.5, "F");
        doc.setFillColor(...goldAccent);
        doc.circle(col2X + 4, y, 1.2, "F");
        doc.text(bankList[i + 1], col2X + 8, y + 1);
      }
      y += 10;
    }
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...textMuted);
    doc.text("Nenhum banco registrado.", margin + 4, y);
    y += 8;
  }
  addSectionTitle("Resumo do Caso");
  addTextBlock(c.summary);
  addSectionTitle("Mensagem Inicial Sugerida");
  checkNewPage(20);
  const msgLines = doc.splitTextToSize(c.initialMessage, contentWidth - 16);
  const msgHeight = msgLines.length * 4.5 + 10;
  checkNewPage(msgHeight);
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(191, 219, 254);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin + 2, y - 4, contentWidth - 4, msgHeight, 3, 3, "FD");
  doc.setFillColor(...primaryAccent);
  doc.rect(margin + 2, y - 4, 3, msgHeight, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(30, 64, 175);
  let msgY = y + 2;
  for (const line of msgLines) {
    doc.text(line, margin + 10, msgY);
    msgY += 4.5;
  }
  y += msgHeight + 6;

  const footerY = pageHeight - 12;
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...textMuted);
  doc.text("Nexus Processual", margin, footerY);
  doc.text(new Date().toLocaleDateString("pt-BR"), pageWidth - margin, footerY, { align: "right" });

  doc.save(`ficha-${caseData.case_title.replace(/\s+/g, "-").toLowerCase()}.pdf`);
  toast.success("Ficha exportada em PDF!");
}

export async function exportAsOficio(caseData: Case) {
  const client = (caseData as any).clients as Client | undefined;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const centerX = pageWidth / 2;
  const margin = 20;

  // Fetch detailed data and CHECK for existing original ofício
  let financialData: any = null;
  try {
    const { data: docData } = await supabase
      .from("documents")
      .select("file_url, extracted_json, doc_type")
      .eq("case_id", caseData.id)
      .in("doc_type", ["ofício", "petição inicial"])
      .order("created_at", { ascending: false });

    // 1. Prioritize official ofício download if exists
    const officialOficio = docData?.find(d => d.doc_type === "ofício");
    if (officialOficio?.file_url) {
      console.log("Found official ofício, downloading original file...");
      const { data: signedData } = await supabase.storage
        .from("documents")
        .createSignedUrl(officialOficio.file_url, 60);

      if (signedData?.signedUrl) {
        const response = await fetch(signedData.signedUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const fileName = (caseData as any).clients?.full_name
          ? `OFICIO-${(caseData as any).clients.full_name.toUpperCase()}.pdf`
          : "oficio-oficial.pdf";
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success("Ofício oficial baixado com sucesso!");
        return; // Stop here, don't generate the PDF
      }
    }

    // Fallback for financial data if just generating the PDF
    financialData = docData?.find(d => d.doc_type === "petição inicial")?.extracted_json;
  } catch (e) {
    console.warn("Could not fetch details for ofício download/generation", e);
  }

  // Dados dinâmicos
  const clientName = client?.full_name ? client.full_name.toUpperCase() : "NÃO INFORMADO";
  const clientCpf = client?.cpf_or_identifier ? formatCPF(client.cpf_or_identifier) : "NÃO INFORMADO";
  const processNumber = formatProcessNumber(caseData.process_number) || "NÃO INFORMADO";
  const defendant = caseData.defendant ? caseData.defendant.toUpperCase() : "NÃO INFORMADO";

  // Use detailed values and fallback to case_value
  const totalValue = financialData?.case_value || Number(caseData.case_value) || 0;
  const principalValue = financialData?.principal_value || totalValue;
  const feePercent = financialData?.lawyer_fee_percent || 0;
  const feeValue = financialData?.lawyer_fee_value || 0;
  const netValue = financialData?.client_net_value || principalValue;

  const formattedTotal = totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formattedPrincipal = principalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formattedFee = feeValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formattedNet = netValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const today = new Date();

  try {
    // --- 1. HEADER (LOGOS E TEXTO DO TRIBUNAL) ---
    try {
      let oabLogo: HTMLImageElement;
      try {
        oabLogo = await loadImage("/oab.png");
      } catch (e) {
        try {
          oabLogo = await loadImage("/oab.jpg");
        } catch (e2) {
          oabLogo = await loadImage("/oab.jpeg");
        }
      }

      // Calcula a proporção real da imagem para não esticar
      const imgWidth = 35;
      const imgRatio = oabLogo.naturalWidth / oabLogo.naturalHeight;
      const imgHeight = imgWidth / imgRatio;

      doc.addImage(oabLogo, "JPEG", 12, 8, imgWidth, imgHeight, undefined, 'FAST');
    } catch (e) { }

    try {
      const brasaoLogo = await loadImage("/brasao.png");
      const bRatio = brasaoLogo.naturalWidth / brasaoLogo.naturalHeight;
      const bW = 32;
      const bH = bW / bRatio;
      doc.addImage(brasaoLogo, "PNG", centerX - (bW / 2), 8, bW, bH, undefined, 'FAST');
    } catch (e) { }

    let y = 44;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text("TRIBUNAL DE JUSTIÇA", centerX, y, { align: "center" });

    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("ALVARÁ DE LIBERAÇÃO DE VALORES Nº: " + (Math.floor(Math.random() * 900000) + 100000) + "/2026", centerX, y, { align: "center" });

    y += 4;
    doc.text("AÇÃO: EXECUÇÃO DE SENTENÇA - CUMPRIMENTO DE TÍTULO JUDICIAL", centerX, y, { align: "center" });

    // --- 2. TÍTULOS PRINCIPAIS ---
    y += 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("DEMONSTRATIVO DE LIQUIDAÇÃO", centerX, y, { align: "center" });

    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Guia de Levantamento Judicial", centerX, y, { align: "center" });

    // --- 3. DADOS DO PROCESSO ---
    y += 18;
    doc.setFontSize(10);
    doc.text(`Beneficiário: ${clientName}`, margin, y);
    y += 6;
    doc.text(`CPF/CNPJ: ${clientCpf}`, margin, y);

    y += 12;
    doc.text(`Processo N°: ${processNumber}`, margin, y);

    // --- 4. CUMPRIMENTO DE SENTENÇA (CAIXA) ---
    y += 12;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageWidth - margin, y);

    y += 7;
    doc.setFont("helvetica", "bold");
    doc.text(`EXECUTADO: ${defendant}`, margin, y);

    y += 2;
    doc.line(margin, y, pageWidth - margin, y);

    // --- 5. ASSUNTO E SITUAÇÃO ---
    y += 11;
    doc.setFont("helvetica", "normal");
    doc.text("Assunto: Expedição de Alvará / Ofício de Pagamento", margin, y);
    y += 6;
    doc.text("Situação: ", margin, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 128, 0);
    doc.text("AUTORIZADO PARA PAGAMENTO", margin + doc.getTextWidth("Situação: "), y);
    doc.setTextColor(30, 30, 30);

    // --- 6. CÓDIGO DE BARRAS CENTRAL ---
    y += 13;
    const centralBarX = margin;
    const centralBarH = 15;
    const centralBarW = 100;
    for (let i = 0; i < centralBarW; i += 1.2) {
      const wWidth = Math.random() > 0.4 ? 0.8 : 0.4;
      doc.setFillColor(0, 0, 0);
      doc.rect(centralBarX + i, y, wWidth, centralBarH, "F");
    }

    // --- 7. VALORES DETALHADOS ---
    y += centralBarH + 15;
    doc.setFont("helvetica", "bold");
    doc.text("DISCRIMINAÇÃO DOS VALORES:", margin, y);

    y += 8;
    doc.setFont("helvetica", "normal");
    doc.text(`VALOR PRINCIPAL BRUTO:`, margin, y);
    doc.text(`R$ ${formattedPrincipal}`, pageWidth - margin, y, { align: "right" });

    if (feeValue > 0) {
      y += 6;
      doc.text(`HONORÁRIOS ADVOCATÍCIOS (${feePercent}%):`, margin, y);
      doc.text(`- R$ ${formattedFee}`, pageWidth - margin, y, { align: "right" });
    }

    y += 2;
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.text(`VALOR LÍQUIDO DISPONÍVEL (CLIENTE):`, margin, y);
    doc.setFontSize(11);
    doc.text(`R$ ${formattedNet}`, pageWidth - margin, y, { align: "right" });
    doc.setFontSize(10);

    y += 12;
    const legalTextFinal = `O referido valor de R$ ${formattedNet} encontra-se disponível para levantamento, devendo ser transferido integralmente para conta de titularidade do beneficiário acima qualificado.`;
    const linesFinal = doc.splitTextToSize(legalTextFinal, pageWidth - margin * 2);
    doc.setFont("helvetica", "normal");
    doc.text(linesFinal, margin, y);

    // --- 8. DATA ---
    y += (linesFinal.length * 6) + 14;
    doc.text(`${today.getDate()} de ${today.toLocaleString('pt-BR', { month: 'long' })} de ${today.getFullYear()}.`, margin, y);

    // --- 9. BARRA VERTICAL NO LADO DIREITO ---
    const verticalBarX = pageWidth - 12;
    const verticalBarH = 25;
    const verticalBarY = pageHeight - 50 - verticalBarH;
    const verticalBarW = 5;

    for (let i = 0; i < verticalBarH; i += 1.2) {
      const barThick = Math.random() > 0.4 ? 0.8 : 0.4;
      doc.setFillColor(0, 0, 0);
      doc.rect(verticalBarX, verticalBarY + i, verticalBarW, barThick, "F");
    }

    doc.setFontSize(6.5);
    doc.text("3 1117 01320 6375", verticalBarX + 8, verticalBarY + verticalBarH, { angle: 90 });

    // --- 11. FOOTER ---
    let footerY = pageHeight - 40; // Volta para a posição original
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("PODER JUDICIÁRIO", centerX, footerY, { align: "center" });
    footerY += 4.5;
    doc.setFont("helvetica", "italic");
    doc.text("TJ– Tribunal de Justiça.", centerX, footerY, { align: "center" });

    // --- 12. ASSINATURA ---
    const lineY = pageHeight - 25;
    try {
      let signatureImg: HTMLImageElement;
      try {
        signatureImg = await loadImage("/assinatura.png");
      } catch (e) {
        try {
          signatureImg = await loadImage("/assinatura.jpg");
        } catch (e2) {
          signatureImg = await loadImage("/assinatura.jpeg");
        }
      }

      const sigWidth = 80;
      const sigRatio = signatureImg.naturalWidth / signatureImg.naturalHeight;
      const sigHeight = sigWidth / sigRatio;

      doc.addImage(signatureImg, "JPEG", centerX - (sigWidth / 2), lineY - sigHeight + 18, sigWidth, sigHeight, undefined, 'FAST');
    } catch (e) { }

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(centerX - 45, lineY, centerX + 45, lineY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("GERALDO FRANCISCO PINHEIRO FRANCO", centerX, lineY + 5, { align: "center" });

    // --- 13. MARCA D'ÁGUA ---
    try {
      const watermarkFinal = await loadImage("/brasao.png");
      doc.setGState(new (doc as any).GState({ opacity: 0.08 }));
      doc.addImage(watermarkFinal, "PNG", centerX - 70, pageHeight / 2 - 70, 140, 140, undefined, 'FAST');
    } catch (e) { }

    doc.save(`oficio-${caseData.process_number?.replace(/\D/g, "") || "documento"}.pdf`);
    toast.success("Ofício oficial gerado com sucesso!");
  } catch (err) {
    console.error("Erro ao gerar ofício:", err);
    toast.error("Erro ao gerar o ofício em PDF.");
  }
}

export function exportAsTxt(caseData: Case) {
  const c = buildExportContent(caseData);
  const sep = "═".repeat(55);
  const line = "─".repeat(55);
  const lines = [
    sep,
    `  FICHA DO CASO`,
    sep,
    ``,
    `  TÍTULO: ${c.title}`,
    `  Nº PROCESSO: ${c.processNumber}`,
    `  TIPO: ${c.caseType}`,
    `  VARA/COMARCA: ${c.court}`,
    `  RÉU: ${c.defendant}`,
    ``,
    line,
    `  DADOS DO AUTOR`,
    line,
    `  Nome:        ${c.author}`,
    `  CPF:         ${c.cpf}`,
    `  Tel. Contrato: ${c.phoneContract}`,
    `  Tel. Consulta: ${c.phones}`,
    `  Nascimento:  ${c.birthDate}`,
    `  Renda:       ${c.income}`,
    `  Profissão:   ${c.profession}`,
    ``,
    line,
    `  VEÍCULOS`,
    line,
    `  ${c.vehicles}`,
    ``,
    line,
    `  BANCOS / INSTITUIÇÕES FINANCEIRAS`,
    line,
    `  ${c.banks}`,
    ``,
    line,
    `  RESUMO DO CASO`,
    line,
    `  ${c.summary}`,
    ``,
    line,
    `  MENSAGEM INICIAL SUGERIDA`,
    line,
    `  ${c.initialMessage}`,
    ``,

    sep,
    `  Gerado por Nexus Processual em ${new Date().toLocaleDateString("pt-BR")}`,
    sep,
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

export async function exportPetition(caseData: Case) {
  const client = (caseData as any).clients;
  const clientName = client?.full_name || "peticao";

  try {
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("file_url")
      .eq("case_id", caseData.id)
      .eq("doc_type", "petição inicial")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (docErr || !doc?.file_url) {
      toast.error("Petição não encontrada para este caso.");
      return;
    }

    const { data: signedData, error: urlErr } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.file_url, 60);

    if (urlErr || !signedData?.signedUrl) {
      toast.error("Erro ao gerar link de download.");
      return;
    }

    const response = await fetch(signedData.signedUrl);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${clientName.toUpperCase()}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    toast.success("Petição baixada com sucesso!");
  } catch (err) {
    console.error("Error downloading petition:", err);
    toast.error("Erro ao baixar petição.");
  }
}

export function CaseCardExport({ caseData }: Props) {
  return (
    <>
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
            <FileDown className="w-3.5 h-3.5 mr-2" /> Exportar Ficha PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportAsOficio(caseData)}>
            <Stamp className="w-3.5 h-3.5 mr-2" /> Exportar Ofício
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportPetition(caseData)}>
            <Download className="w-3.5 h-3.5 mr-2" /> Baixar Petição PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportAsTxt(caseData)}>
            <FileText className="w-3.5 h-3.5 mr-2" /> Exportar .txt
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
