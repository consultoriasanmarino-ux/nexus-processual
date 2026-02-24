import { useState, useCallback, useEffect } from "react";
import { aiAnalyze } from "@/lib/gemini";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Upload, Loader2, Sparkles, FileText, CheckCircle2, AlertTriangle, Phone, Building2, Scale } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker - use dynamic version to prevent mismatches
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

function formatCurrency(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const num = parseInt(digits, 10) / 100;
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

import { formatPhone, formatCPF, formatProcessNumber, extractProcessNumberFromFilename } from "@/lib/utils";
import { getCompanyContext } from "@/lib/constants";
import type { Lawyer } from "@/lib/types";

interface ExtractedData {
  client_name: string;
  client_cpf: string;
  defendant: string;
  case_type: string;
  court: string;
  process_number: string;
  case_value: number;
  principal_value?: number;
  lawyer_fee_percent?: number;
  lawyer_fee_value?: number;
  client_net_value?: number;
  lawyers: { name: string; oab: string; role: string }[];
  partner_law_firm: string;
  summary: string;
  phone_found: string;
  phone_contract: string;
}

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function NewCase() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [phone, setPhone] = useState("");
  const [phoneContract, setPhoneContract] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [saving, setSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Editable fields after extraction
  const [clientName, setClientName] = useState("");
  const [clientCpf, setClientCpf] = useState("");
  const [defendant, setDefendant] = useState("");
  const [caseType, setCaseType] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [court, setCourt] = useState("");
  const [processNumber, setProcessNumber] = useState("");
  const [partnerFirm, setPartnerFirm] = useState("");
  const [partnerLawyer, setPartnerLawyer] = useState("");
  const [caseValue, setCaseValue] = useState("");
  const [principalValue, setPrincipalValue] = useState("");
  const [lawyerFeePercent, setLawyerFeePercent] = useState("");
  const [lawyerFeeValue, setLawyerFeeValue] = useState("");
  const [clientNetValue, setClientNetValue] = useState("");
  const [isDanosMorais, setIsDanosMorais] = useState(false);

  const updateFinancials = (p?: string, pct?: string, f?: string) => {
    const pVal = p !== undefined ? parseFloat(p.replace(/\./g, "").replace(",", ".")) : parseFloat(principalValue.replace(/\./g, "").replace(",", "."));
    const pctVal = pct !== undefined ? parseFloat(pct) : parseFloat(lawyerFeePercent);

    if (!isNaN(pVal)) {
      if (!isNaN(pctVal)) {
        const fee = pVal * (pctVal / 100);
        const net = pVal - fee;
        setLawyerFeeValue(fee.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        setClientNetValue(net.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      } else if (f !== undefined) {
        const fVal = parseFloat(f.replace(/\./g, "").replace(",", "."));
        if (!isNaN(fVal)) {
          setClientNetValue((pVal - fVal).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        }
      }
    }
  };

  // Lawyer selection
  const [lawyerType, setLawyerType] = useState<"geral" | "especifico">("geral");
  const [selectedLawyerId, setSelectedLawyerId] = useState("");
  const [availableLawyers, setAvailableLawyers] = useState<Lawyer[]>([]);

  useEffect(() => {
    supabase
      .from("lawyers" as any)
      .select("*")
      .order("name")
      .then(({ data }) => setAvailableLawyers((data as any as Lawyer[]) ?? []));
  }, []);

  const extractTextFromPdf = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    for (let i = 1; i <= Math.min(pdf.numPages, 40); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      // Sort items by vertical position then horizontal
      const items = content.items as any[];
      items.sort((a, b) => {
        // Reduced tolerance to 3 for better line detection
        if (Math.abs(a.transform[5] - b.transform[5]) > 3) {
          return b.transform[5] - a.transform[5]; // Top to bottom
        }
        return a.transform[4] - b.transform[4]; // Left to right
      });

      const pageText = items.map((item: any) => item.str).join(" ");
      fullText += pageText + "\n\n";
    }

    console.log(`Texto extraído de ${file.name}:`, fullText.substring(0, 500) + "...");
    return fullText;
  };

  const renderPdfPagesToImages = async (file: File, maxPages = 3): Promise<string[]> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const images: string[] = [];

    for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      images.push(canvas.toDataURL("image/jpeg", 0.8));
    }

    return images;
  };

  const handleProcessPdf = async () => {
    if (!pdfFile) {
      toast.error("Selecione a petição inicial.");
      return;
    }

    setExtracting(true);
    try {
      const pdfText = await extractTextFromPdf(pdfFile);

      const result = await aiAnalyze({
        petitionText: pdfText,
        contractText: "",
        contractType: "outros",
        phoneProvided: phone,
      });

      if (!result.success || result.error) throw new Error(result.error || "Resposta inesperada da IA.");

      const ext = result.extracted as any;
      if (!ext) throw new Error("Resposta inesperada da IA.");

      setExtracted(ext as ExtractedData);
      console.log("Extracted result:", ext);

      // Pre-fill fields
      setClientName(ext.client_name || "");
      setClientCpf(ext.client_cpf || "");
      setDefendant(ext.defendant || "");
      setCaseType(ext.case_type || "");
      setCaseTitle(ext.case_type ? `${ext.case_type} — ${ext.client_name || ""}` : "");
      setCourt(ext.court || "");
      // Only overwrite if AI found a process number; keep filename-extracted value otherwise
      if (ext.process_number) {
        setProcessNumber(formatProcessNumber(ext.process_number));
      }
      setPartnerFirm(ext.partner_law_firm || "");

      if (ext.case_value && ext.case_value > 0) {
        setCaseValue(ext.case_value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      }
      if (ext.principal_value && ext.principal_value > 0) {
        setPrincipalValue(ext.principal_value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      }
      if (ext.lawyer_fee_percent && ext.lawyer_fee_percent > 0) {
        setLawyerFeePercent(ext.lawyer_fee_percent.toString());
      }
      if (ext.lawyer_fee_value && ext.lawyer_fee_value > 0) {
        setLawyerFeeValue(ext.lawyer_fee_value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      }
      if (ext.client_net_value && ext.client_net_value > 0) {
        setClientNetValue(ext.client_net_value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      }

      if (ext.lawyers?.length > 0) {
        setPartnerLawyer(ext.lawyers.map((l: any) => `${l.name} (${l.oab})`).join(", "));
      }

      // Robust phone mapping: catch any field the AI might use
      const extractedPhone = ext.phone_contract || ext.phone_petition || ext.phone_found || ext.phone;
      if (extractedPhone) {
        setPhoneContract(formatPhone(extractedPhone));
      }

      toast.success("Documentos processados! Confira os dados extraídos.");
    } catch (err: any) {
      console.error("Erro no processamento:", err);
      // Try to extract more detail from Supabase function error
      let errorMessage = "Erro ao processar documentos.";

      if (err.message) errorMessage = err.message;

      // Handle the case where err is the response or has context
      if (err.context?.json?.error) {
        errorMessage = err.context.json.error;
      } else if (typeof err === 'object' && err !== null) {
        try {
          // Some versions of the client return the error in a different format
          const errorStr = JSON.stringify(err);
          if (errorStr.includes("non-2xx")) {
            errorMessage = "A IA demorou muito ou falhou. Tente novamente em instantes ou verifique os arquivos.";
          }
        } catch (e) { }
      }

      toast.error(errorMessage);
    }
    setExtracting(false);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!clientName.trim()) {
      toast.error("Nome do cliente é obrigatório.");
      return;
    }

    const phoneDigits = phone.replace(/\D/g, "");

    setSaving(true);
    try {
      // 1. Create client
      const { data: clientData, error: clientErr } = await supabase
        .from("clients")
        .insert({
          full_name: clientName,
          cpf_or_identifier: clientCpf || null,
          phone: phoneDigits,
          phone_contract: phoneContract.replace(/\D/g, "") || null,
          user_id: user.id,
        } as any)
        .select()
        .single();
      if (clientErr) throw clientErr;

      // 2. Create case
      const parsedValue = caseValue ? parseFloat(caseValue.replace(/\./g, "").replace(",", ".")) : null;
      const { data: caseResult, error: caseErr } = await supabase
        .from("cases")
        .insert({
          client_id: clientData.id,
          user_id: user.id,
          case_title: caseTitle || `Caso — ${clientName}`,
          defendant: defendant || null,
          case_type: caseType || null,
          court: court || null,
          process_number: processNumber || null,
          partner_law_firm_name: partnerFirm || null,
          partner_lawyer_name: partnerLawyer || null,
          case_value: parsedValue,
          case_summary: extracted?.summary || null,
          lawyer_type: lawyerType,
          lawyer_id: lawyerType === "especifico" && selectedLawyerId ? selectedLawyerId : null,
          company_context: getCompanyContext(
            lawyerType,
            lawyerType === "especifico"
              ? availableLawyers.find((l) => l.id === selectedLawyerId)?.name
              : undefined
          ),
        } as any)
        .select()
        .single();
      if (caseErr) throw caseErr;

      // 3. Upload files and save documents
      if (pdfFile) {
        const filePath = `${user.id}/${caseResult.id}/${pdfFile.name}`;
        await supabase.storage.from("documents").upload(filePath, pdfFile);
        const pdfText = await extractTextFromPdf(pdfFile).catch(() => "");

        // Update extracted JSON with user-confirmed values
        const finalJson = {
          ...extracted,
          client_name: clientName,
          client_cpf: clientCpf,
          defendant,
          case_type: caseType,
          court,
          process_number: processNumber,
          case_value: caseValue ? parseFloat(caseValue.replace(/\./g, "").replace(",", ".")) : 0,
          principal_value: principalValue ? parseFloat(principalValue.replace(/\./g, "").replace(",", ".")) : 0,
          lawyer_fee_percent: lawyerFeePercent ? parseFloat(lawyerFeePercent) : 0,
          lawyer_fee_value: lawyerFeeValue ? parseFloat(lawyerFeeValue.replace(/\./g, "").replace(",", ".")) : 0,
          client_net_value: clientNetValue ? parseFloat(clientNetValue.replace(/\./g, "").replace(",", ".")) : 0,
        };

        await supabase.from("documents").insert({
          case_id: caseResult.id,
          user_id: user.id,
          doc_type: "petição inicial",
          file_url: filePath,
          extracted_text: pdfText || null,
          extracted_json: finalJson as any,
        });
      }



      // 4. Create conversation
      await supabase.from("conversations").insert({
        case_id: caseResult.id,
        user_id: user.id,
        channel: "WhatsApp",
      });

      toast.success("Caso criado com sucesso!");
      navigate(`/case/${caseResult.id}`);
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error(err.message || "Erro ao salvar. Tente novamente.");
    }
    setSaving(false);
  };

  return (
    <Layout>
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <button onClick={() => navigate("/")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        <h1 className="text-2xl font-bold mb-1">Novo Caso</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Envie a petição inicial para extração automática dos dados.
        </p>

        {/* Step 1: Phone + PDF */}
        {!extracted && (
          <div className="bg-card border border-border rounded-xl p-6 shadow-card animate-fade-in space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Petition Upload */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <FileText className="w-3 h-3" /> Petição Inicial (PDF) *
                </Label>
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file && file.type === "application/pdf") {
                      setPdfFile(file);
                      const extractedNumber = extractProcessNumberFromFilename(file.name);
                      if (extractedNumber) setProcessNumber(extractedNumber);
                    } else if (file) {
                      toast.error("Por favor, envie apenas arquivos PDF.");
                    }
                  }}
                  className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 bg-secondary/50 ${isDragging ? "border-primary bg-primary/5 shadow-glow" : "border-border hover:border-primary/50"
                    }`}
                >
                  {pdfFile ? (
                    <div className="flex flex-col items-center gap-1 p-2 text-center animate-fade-in">
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                      <span className="text-[11px] text-foreground font-medium truncate max-w-full">{pdfFile.name}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 animate-fade-in">
                      <Upload className={`w-5 h-5 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="text-[10px] text-muted-foreground">Arraste aqui ou clique para buscar</span>
                    </div>
                  )}
                  <input type="file" accept=".pdf" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setPdfFile(file);
                    if (file) {
                      const extractedNumber = extractProcessNumberFromFilename(file.name);
                      if (extractedNumber) {
                        setProcessNumber(extractedNumber);
                      }
                    }
                  }} />
                </label>
              </div>

              {/* Lawyer Selector */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Scale className="w-3 h-3" /> Advogado do Caso
                </Label>
                <Select value={lawyerType} onValueChange={(v) => { setLawyerType(v as any); setSelectedLawyerId(""); }}>
                  <SelectTrigger className="bg-secondary border-border text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geral">Geral — Paulo Tanaka (Parceiro)</SelectItem>
                    <SelectItem value="especifico">Específico — Advogado do Caso</SelectItem>
                  </SelectContent>
                </Select>
                {lawyerType === "especifico" && (
                  <div className="pt-1">
                    {availableLawyers.length === 0 ? (
                      <p className="text-xs text-destructive">Nenhum advogado cadastrado. Vá em Configurações para cadastrar.</p>
                    ) : (
                      <Select value={selectedLawyerId} onValueChange={setSelectedLawyerId}>
                        <SelectTrigger className="bg-secondary border-border text-xs">
                          <SelectValue placeholder="Escolha o advogado" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableLawyers.map((l) => (
                            <SelectItem key={l.id} value={l.id}>
                              {l.name}{l.oab ? ` (OAB: ${l.oab})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </div>
            </div>

            <Button
              onClick={handleProcessPdf}
              disabled={!pdfFile || extracting}
              className="w-full bg-gradient-gold text-primary-foreground hover:opacity-90 font-semibold"
            >
              {extracting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Analisando petição...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Processar com IA
                </>
              )}
            </Button>
          </div>
        )}

        {/* Step 2: Review extracted data */}
        {extracted && (
          <div className="space-y-4 animate-slide-up">
            {/* Summary card */}
            {extracted.summary && (
              <div className="bg-card border border-primary/30 rounded-xl p-4 shadow-glow">
                <div className="flex items-center gap-2 text-xs text-primary font-medium mb-2">
                  <Sparkles className="w-3.5 h-3.5" /> Resumo da IA
                </div>
                <p className="text-sm text-muted-foreground">{extracted.summary}</p>
              </div>
            )}

            {/* Lawyers found info */}
            {extracted.lawyers && extracted.lawyers.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-2 font-medium">Advogados identificados na petição:</p>
                <div className="space-y-1">
                  {extracted.lawyers.map((l, i) => (
                    <p key={i} className="text-xs">
                      <span className="text-foreground font-medium">{l.name}</span>
                      <span className="text-muted-foreground"> — OAB: {l.oab} — {l.role}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Editable fields */}
            <div className="bg-card border border-border rounded-xl p-6 shadow-card space-y-5">
              <h3 className="text-sm font-semibold">Dados do Cliente</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Nome do cliente *</Label>
                  <Input value={clientName} onChange={(e) => setClientName(e.target.value)} className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">CPF</Label>
                  <Input value={formatCPF(clientCpf)} onChange={(e) => setClientCpf(e.target.value)} className="bg-secondary border-border" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className={`rounded-lg p-3 space-y-1 border border-border bg-secondary/30`}>
                  <Label className={`text-[10px] flex items-center gap-1.5 font-semibold text-muted-foreground uppercase`}>
                    <Phone className="w-3 h-3" /> Telefone do Contrato
                  </Label>
                  <p className="text-sm font-medium px-1">
                    {formatPhone(phoneContract) || <span className="text-muted-foreground italic font-normal">Não encontrado</span>}
                  </p>
                </div>

                <div className={`rounded-lg p-3 space-y-1 ${!phone.trim() && !phoneContract.trim() ? 'border-2 border-destructive/60 bg-destructive/5' : 'border border-border bg-secondary/30'}`}>
                  <Label className={`text-[10px] flex items-center gap-1.5 font-semibold ${!phone.trim() ? 'text-destructive' : 'text-muted-foreground'} uppercase`}>
                    <Phone className="w-3 h-3" /> Telefone Consulta
                  </Label>
                  <p className="text-sm font-medium px-1">
                    {formatPhone(phone) || <span className="text-muted-foreground italic font-normal">Não encontrado</span>}
                  </p>
                </div>
              </div>
            </div>
            {!phone.trim() && !phoneContract.trim() && (
              <p className="text-[10px] text-destructive font-medium flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Nenhum telefone registrado — não será possível iniciar conversa.
              </p>
            )}

            <hr className="border-border" />

            <h3 className="text-sm font-semibold">Dados do Processo</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Título do caso</Label>
                <Input value={caseTitle} onChange={(e) => setCaseTitle(e.target.value)} className="bg-secondary border-border" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Réu</Label>
                <Input value={defendant} onChange={(e) => setDefendant(e.target.value)} className="bg-secondary border-border" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Tipo de ação</Label>
                <Input value={caseType} onChange={(e) => setCaseType(e.target.value)} className="bg-secondary border-border" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Tribunal / Vara</Label>
                <Input value={court} onChange={(e) => setCourt(e.target.value)} className="bg-secondary border-border" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Nº do processo</Label>
                <Input value={processNumber} onChange={(e) => setProcessNumber(e.target.value)} className="bg-secondary border-border" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Valor Reclamado / Ofício (R$)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    value={caseValue}
                    onChange={(e) => setCaseValue(formatCurrency(e.target.value))}
                    placeholder="0,00"
                    className="bg-secondary border-border flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Principal (R$)</Label>
                <Input
                  value={principalValue}
                  onChange={(e) => {
                    const val = formatCurrency(e.target.value);
                    setPrincipalValue(val);
                    updateFinancials(val);
                  }}
                  placeholder="0,00"
                  className="bg-secondary border-border"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Honorários (%)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={lawyerFeePercent}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^\d]/g, "");
                      setLawyerFeePercent(val);
                      updateFinancials(undefined, val);
                    }}
                    placeholder="0"
                    className="bg-secondary border-border"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Honorários Valor (R$)</Label>
                <Input
                  value={lawyerFeeValue}
                  onChange={(e) => {
                    const val = formatCurrency(e.target.value);
                    setLawyerFeeValue(val);
                    updateFinancials(undefined, undefined, val);
                  }}
                  placeholder="0,00"
                  className="bg-secondary border-border"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Líquido Cliente (R$)</Label>
                <Input
                  value={clientNetValue}
                  onChange={(e) => setClientNetValue(formatCurrency(e.target.value))}
                  placeholder="0,00"
                  className="bg-secondary border-border font-bold text-primary"
                />
              </div>

              <div className="space-y-2 flex items-end">
                <label className="flex items-center gap-1.5 cursor-pointer whitespace-nowrap mb-3">
                  <Checkbox checked={isDanosMorais} onCheckedChange={(checked) => {
                    setIsDanosMorais(!!checked);
                    if (checked) {
                      setCaseValue("10.000,00");
                      setPrincipalValue("10.000,00");
                    }
                  }} />
                  <span className="text-xs text-muted-foreground">Danos Morais Padrão</span>
                </label>
              </div>

              {/* Lawyer info (selected in Step 1) */}
              <div className="sm:col-span-2 rounded-lg p-3 bg-secondary/30 border border-border">
                <Label className="text-[10px] flex items-center gap-1.5 font-semibold text-muted-foreground uppercase mb-1">
                  <Scale className="w-3 h-3" /> Advogado Selecionado
                </Label>
                <p className="text-sm font-medium">
                  {lawyerType === "especifico" && selectedLawyerId
                    ? (() => {
                      const l = availableLawyers.find((l) => l.id === selectedLawyerId);
                      return l ? `${l.name}${l.oab ? ` (OAB: ${l.oab})` : ""}` : "Específico";
                    })()
                    : "Geral — Paulo Tanaka (Parceiro)"
                  }
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 gap-4">
              <Button variant="outline" onClick={() => { setExtracted(null); setPdfFile(null); }}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-gradient-gold text-primary-foreground hover:opacity-90 font-semibold"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Criar Caso
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout >
  );
}
