import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Upload, Loader2, Sparkles, FileText, CheckCircle2, AlertTriangle, Phone, Building2 } from "lucide-react";
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

import { formatPhone, formatCPF } from "@/lib/utils";

interface ExtractedData {
  client_name: string;
  client_cpf: string;
  defendant: string;
  case_type: string;
  court: string;
  process_number: string;
  distribution_date: string;
  case_value: string;
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
  const [contractType, setContractType] = useState("omni");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [saving, setSaving] = useState(false);

  // Editable fields after extraction
  const [clientName, setClientName] = useState("");
  const [clientCpf, setClientCpf] = useState("");
  const [defendant, setDefendant] = useState("");
  const [caseType, setCaseType] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [court, setCourt] = useState("");
  const [processNumber, setProcessNumber] = useState("");
  const [distributionDate, setDistributionDate] = useState("");
  const [partnerFirm, setPartnerFirm] = useState("");
  const [partnerLawyer, setPartnerLawyer] = useState("");
  const [caseValue, setCaseValue] = useState("");
  const [isDanosMorais, setIsDanosMorais] = useState(false);

  const extractTextFromPdf = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];

    for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item: any) => item.str).join(" ");
      pages.push(text);
    }

    return pages.join("\n\n");
  };

  const handleProcessPdf = async () => {
    if (!pdfFile) {
      toast.error("Selecione um PDF primeiro.");
      return;
    }

    setExtracting(true);
    try {
      // 1. Extract text client-side
      const pdfText = await extractTextFromPdf(pdfFile);

      if (!pdfText.trim()) {
        toast.error("Não foi possível extrair texto do PDF. O arquivo pode ser uma imagem escaneada.");
        setExtracting(false);
        return;
      }

      // 2. Send to AI for structured extraction
      const contractText = contractFile ? await extractTextFromPdf(contractFile) : "";

      const { data, error } = await supabase.functions.invoke("ai-analyze", {
        body: {
          petitionText: pdfText,
          contractText: contractText,
          contractType: contractType,
          phoneProvided: phone,
        },
      });

      if (error) throw error;

      const ext = data?.extracted as ExtractedData;
      if (!ext) throw new Error("Resposta inesperada da IA.");

      setExtracted(ext);

      // Pre-fill fields
      setClientName(ext.client_name || "");
      setClientCpf(ext.client_cpf || "");
      setDefendant(ext.defendant || "");
      setCaseType(ext.case_type || "");
      setCaseTitle(ext.case_type ? `${ext.case_type} — ${ext.client_name || ""}` : "");
      setCourt(ext.court || "");
      setProcessNumber(ext.process_number || "");
      setDistributionDate(ext.distribution_date || "");
      setPartnerFirm(ext.partner_law_firm || "");
      // Format case_value from AI (comes as "50000.00" string)
      if (ext.case_value) {
        const numVal = parseFloat(String(ext.case_value).replace(/[^\d.]/g, ""));
        if (!isNaN(numVal)) {
          setCaseValue(numVal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        } else {
          setCaseValue("");
        }
      } else {
        setCaseValue("");
      }
      // Pick the first lawyer as partner
      if (ext.lawyers?.length > 0) {
        setPartnerLawyer(ext.lawyers.map((l) => `${l.name} (${l.oab})`).join(", "));
      }
      // Map any found phone to phoneContract (never to consulta/phone)
      const extractedPhone = ext.phone_contract || ext.phone_found;
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
          distribution_date: distributionDate || null,
          partner_law_firm_name: partnerFirm || null,
          partner_lawyer_name: partnerLawyer || null,
          case_value: parsedValue,
          case_summary: extracted?.summary || null,
        } as any)
        .select()
        .single();
      if (caseErr) throw caseErr;

      // 3. Upload files and save documents
      if (pdfFile) {
        const filePath = `${user.id}/${caseResult.id}/${pdfFile.name}`;
        await supabase.storage.from("documents").upload(filePath, pdfFile);
        const pdfText = await extractTextFromPdf(pdfFile).catch(() => "");
        await supabase.from("documents").insert({
          case_id: caseResult.id,
          user_id: user.id,
          doc_type: "petição inicial",
          file_url: filePath,
          extracted_text: pdfText || null,
          extracted_json: extracted ? (extracted as any) : null,
        });
      }

      if (contractFile) {
        const filePath = `${user.id}/${caseResult.id}/${contractFile.name}`;
        await supabase.storage.from("documents").upload(filePath, contractFile);
        const contractText = await extractTextFromPdf(contractFile).catch(() => "");
        await supabase.from("documents").insert({
          case_id: caseResult.id,
          user_id: user.id,
          doc_type: "contrato",
          file_url: filePath,
          extracted_text: contractText || null,
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
          Envie a petição e o contrato para extração automática dos dados.
        </p>

        {/* Step 1: Phone + PDF */}
        {!extracted && (
          <div className="bg-card border border-border rounded-xl p-6 shadow-card animate-fade-in space-y-5">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Building2 className="w-3 h-3" /> Tipo de Contrato
                </Label>
                <Select value={contractType} onValueChange={setContractType}>
                  <SelectTrigger className="bg-secondary border-border text-xs">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="omni">Omni Financiamentos</SelectItem>
                    <SelectItem value="outros">Outros / Desconhecido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <FileText className="w-3 h-3" /> Petição Inicial (PDF) *
                </Label>
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 transition-colors bg-secondary/50">
                  {pdfFile ? (
                    <div className="flex flex-col items-center gap-1 p-2 text-center">
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                      <span className="text-[11px] text-foreground font-medium truncate max-w-full">{pdfFile.name}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Upload className="w-5 h-5 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">Petição Judicial</span>
                    </div>
                  )}
                  <input type="file" accept=".pdf" className="hidden" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
                </label>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <FileText className="w-3 h-3" /> Contrato/CCB (PDF)
                </Label>
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 transition-colors bg-secondary/50">
                  {contractFile ? (
                    <div className="flex flex-col items-center gap-1 p-2 text-center">
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                      <span className="text-[11px] text-foreground font-medium truncate max-w-full">{contractFile.name}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Upload className="w-5 h-5 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">Contrato de Financiamento</span>
                    </div>
                  )}
                  <input type="file" accept=".pdf" className="hidden" onChange={(e) => setContractFile(e.target.files?.[0] ?? null)} />
                </label>
              </div>
            </div>

            <Button
              onClick={handleProcessPdf}
              disabled={(!pdfFile && !contractFile) || extracting}
              className="w-full bg-gradient-gold text-primary-foreground hover:opacity-90 font-semibold"
            >
              {extracting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Analisando documentos...
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
                <Label className="text-xs text-muted-foreground">Data de distribuição</Label>
                <Input type="date" value={distributionDate} onChange={(e) => setDistributionDate(e.target.value)} className="bg-secondary border-border" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Valor da causa (R$)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    value={isDanosMorais ? "10.000,00" : caseValue}
                    onChange={(e) => setCaseValue(formatCurrency(e.target.value))}
                    placeholder="0,00"
                    disabled={isDanosMorais}
                    className="bg-secondary border-border flex-1"
                  />
                  <label className="flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                    <Checkbox checked={isDanosMorais} onCheckedChange={(checked) => {
                      setIsDanosMorais(!!checked);
                      if (checked) setCaseValue("10.000,00");
                    }} />
                    <span className="text-xs text-muted-foreground">Danos Morais</span>
                  </label>
                </div>
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
    </Layout>
  );
}
