import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Upload, Loader2, Sparkles, FileText, CheckCircle2, AlertTriangle, Phone } from "lucide-react";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs`;

function formatCurrency(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const num = parseInt(digits, 10) / 100;
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

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
}

export default function NewCase() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [phone, setPhone] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
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
      const { data, error } = await supabase.functions.invoke("ai-analyze", {
        body: {
          extractedText: pdfText,
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
      // If phone was found in PDF and none was provided
      if (ext.phone_found && !phone) {
        setPhone(formatPhone(ext.phone_found));
      }

      toast.success("PDF processado! Confira os dados extraídos.");
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar PDF.");
    }
    setExtracting(false);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!clientName.trim()) {
      toast.error("Nome do cliente é obrigatório.");
      return;
    }
    if (!phone.trim()) {
      toast.error("Telefone é obrigatório.");
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
          user_id: user.id,
        })
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

      // 3. Upload PDF and save document
      if (pdfFile) {
        const filePath = `${user.id}/${caseResult.id}/${pdfFile.name}`;
        const { error: uploadErr } = await supabase.storage.from("documents").upload(filePath, pdfFile);
        if (uploadErr) console.warn("Upload warning:", uploadErr.message);

        const pdfText = extracted ? await extractTextFromPdf(pdfFile).catch(() => "") : "";

        await supabase.from("documents").insert({
          case_id: caseResult.id,
          user_id: user.id,
          doc_type: "petição inicial",
          file_url: filePath,
          extracted_text: pdfText || null,
          extracted_json: extracted ? (extracted as any) : null,
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
          Envie a petição e a IA extrairá os dados automaticamente.
        </p>

        {/* Step 1: Phone + PDF */}
        {!extracted && (
          <div className="bg-card border border-border rounded-xl p-6 shadow-card animate-fade-in space-y-5">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Phone className="w-3 h-3" /> Telefone do cliente (se tiver)
              </Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="(55) 99999-9999"
                maxLength={15}
                className="bg-secondary border-border"
              />
              <p className="text-[10px] text-muted-foreground">Se o telefone estiver na petição, será extraído automaticamente.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <FileText className="w-3 h-3" /> Petição Inicial (PDF) *
              </Label>
              <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 transition-colors bg-secondary/50">
                {pdfFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <CheckCircle2 className="w-6 h-6 text-primary" />
                    <span className="text-sm text-foreground font-medium">{pdfFile.name}</span>
                    <span className="text-[10px] text-muted-foreground">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-6 h-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Clique para selecionar o PDF da petição</span>
                  </div>
                )}
                <input type="file" accept=".pdf" className="hidden" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>

            <Button
              onClick={handleProcessPdf}
              disabled={!pdfFile || extracting}
              className="w-full bg-gradient-gold text-primary-foreground hover:opacity-90 font-semibold"
            >
              {extracting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Processando com IA...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Processar PDF com IA
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
                  <Label className="text-xs text-muted-foreground">Telefone *</Label>
                  <Input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} maxLength={15} className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">CPF</Label>
                  <Input value={clientCpf} onChange={(e) => setClientCpf(e.target.value)} className="bg-secondary border-border" />
                </div>
              </div>

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
                  <Input value={caseValue} onChange={(e) => setCaseValue(formatCurrency(e.target.value))} placeholder="0,00" className="bg-secondary border-border" />
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
          </div>
        )}
      </div>
    </Layout>
  );
}
