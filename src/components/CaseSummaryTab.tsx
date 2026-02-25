import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { aiAnalyze } from "@/lib/gemini";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, AlertTriangle, Building2, User, Gavel, Save, BookOpen, DollarSign, CalendarIcon, ClipboardList, Phone, Pencil, Car, Banknote, BriefcaseIcon, Milestone, MessageSquare, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Case, Document, AiOutput } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import { format, differenceInYears } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { formatPhone, formatCPF } from "@/lib/utils";

import { DEFAULT_COMPANY_CONTEXT } from "@/lib/constants";


interface Props {
  caseData: Case;
  documents: Document[];
  aiOutputs: AiOutput[];
  onRefresh: () => void;
}
function formatCurrency(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const num = parseInt(digits, 10) / 100;
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function currencyToNumber(formatted: string): number | null {
  if (!formatted) return null;
  const clean = formatted.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

function ClientPhoneEditor({ client, onRefresh }: { client: any; onRefresh: () => void }) {
  const [editingField, setEditingField] = useState<"phone" | "phone_contract" | null>(null);
  const [phoneValue, setPhoneValue] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!editingField) return;
    setSaving(true);
    const { error } = await supabase.from("clients").update({ [editingField]: phoneValue }).eq("id", client.id);
    if (error) toast.error("Erro ao salvar telefone.");
    else { toast.success("Telefone atualizado!"); setEditingField(null); onRefresh(); }
    setSaving(false);
  };

  const startEditing = (field: "phone" | "phone_contract", val: string) => {
    setEditingField(field);
    setPhoneValue(val || "");
  };

  const phones = client.phone?.split(/[\s,;|]+/).filter(Boolean) || [];
  const contractPhones = client.phone_contract?.split(/[\s,;|]+/).filter(Boolean) || [];

  const isWA = (p: string) => {
    const clean = p.replace(/\D/g, "");
    return clean.length === 11 && clean[2] === "9";
  };

  const openWhatsApp = (p: string) => {
    const clean = p.replace(/\D/g, "");
    if (clean.length >= 10) {
      window.open(`https://wa.me/55${clean}`, "_blank");
    } else {
      toast.error("Número inválido para WhatsApp");
    }
  };

  return (
    <div className="space-y-4">
      {/* Telefone Consulta */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Telefone Principal</span>
        {editingField === "phone" ? (
          <div className="flex items-center gap-1.5 animate-in slide-in-from-left-2">
            <Input value={phoneValue} onChange={(e) => setPhoneValue(e.target.value)} placeholder="(11) 99999-9999" className="h-8 max-w-[200px] text-xs bg-secondary border-border" />
            <Button size="sm" variant="outline" onClick={handleSave} disabled={saving} className="h-8 text-xs px-2 bg-primary/10 hover:bg-primary/20 border-primary/20">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingField(null)} className="h-8 text-xs px-2">X</Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {phones.length > 0 ? phones.map((p, idx) => {
              const wa = isWA(p);
              return (
                <div key={idx} className={cn(
                  "flex items-center gap-2 border rounded-lg px-2.5 py-1.5 group transition-all",
                  wa ? "bg-secondary/30 border-border/50 hover:border-primary/30" : "bg-muted/10 border-dashed border-muted-foreground/20 opacity-70"
                )}>
                  {wa ? <MessageSquare className="w-3 h-3 text-[#25D366]" /> : <Phone className="w-3 h-3 text-muted-foreground" />}
                  <span className={cn("text-xs font-semibold", !wa && "text-muted-foreground")}>{formatPhone(p)}</span>
                  <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openWhatsApp(p)} title={wa ? "Abrir no WhatsApp" : "Tentar WhatsApp (Fixo)"} className={cn("hover:scale-110 transition-transform", wa ? "text-[#25D366]" : "text-muted-foreground")}>
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => startEditing("phone", client.phone)} className="text-muted-foreground hover:text-foreground">
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            }) : (
              <button
                onClick={() => startEditing("phone", "")}
                className="text-[10px] text-muted-foreground italic flex items-center gap-1 hover:text-primary transition-colors"
              >
                <Plus className="w-3 h-3" /> Adicionar telefone
              </button>
            )}
          </div>
        )}
      </div>

      {/* Telefone Contrato / Múltiplos */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Telefones Localizados (Contrato)</span>
        {editingField === "phone_contract" ? (
          <div className="flex items-center gap-1.5 animate-in slide-in-from-left-2">
            <Input value={phoneValue} onChange={(e) => setPhoneValue(e.target.value)} placeholder="Números separados por vírgula" className="h-8 flex-1 text-xs bg-secondary border-border" />
            <Button size="sm" variant="outline" onClick={handleSave} disabled={saving} className="h-8 text-xs px-2 bg-primary/10 hover:bg-primary/20 border-primary/20">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingField(null)} className="h-8 text-xs px-2">X</Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {contractPhones.length > 0 ? contractPhones.map((p, idx) => {
              const wa = isWA(p);
              return (
                <div key={idx} className={cn(
                  "flex items-center gap-2 border rounded-lg px-2.5 py-1.5 group transition-all",
                  wa ? "bg-primary/5 border-primary/20 hover:bg-primary/10" : "bg-muted/5 border-dashed border-muted-foreground/10 opacity-60"
                )}>
                  {wa ? <MessageSquare className="w-3 h-3 text-[#25D366]" /> : <Phone className="w-3 h-3 text-muted-foreground" />}
                  <span className={cn("text-xs font-bold", !wa ? "text-muted-foreground" : "text-foreground")}>{formatPhone(p)}</span>
                  <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openWhatsApp(p)} title={wa ? "Abrir no WhatsApp" : "Tentar WhatsApp (Fixo)"} className={cn("hover:scale-110 transition-transform", wa ? "text-[#25D366]" : "text-muted-foreground")}>
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => startEditing("phone_contract", client.phone_contract)} className="text-muted-foreground hover:text-foreground">
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            }) : (
              <div
                className="bg-destructive/5 border border-destructive/20 rounded-lg px-2.5 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-destructive/10 transition-colors"
                onClick={() => startEditing("phone_contract", "")}
              >
                <AlertTriangle className="w-3 h-3 text-destructive" />
                <span className="text-[10px] text-destructive-foreground font-medium uppercase">Nenhum no contrato</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CaseSummaryTab({ caseData, documents, aiOutputs, onRefresh }: Props) {
  const { isCaller } = useAuth();
  const [analyzing, setAnalyzing] = useState(false);
  const [context, setContext] = useState(caseData.company_context || DEFAULT_COMPANY_CONTEXT);
  const [savingCtx, setSavingCtx] = useState(false);
  const [caseValueInput, setCaseValueInput] = useState(
    caseData.case_value
      ? Number(caseData.case_value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : ""
  );
  const [savingValue, setSavingValue] = useState(false);
  const [caseSummary, setCaseSummary] = useState(caseData.case_summary || "");
  const [savingSummary, setSavingSummary] = useState(false);

  const summaryOutput = aiOutputs.find((o) => o.output_type === "case_summary");
  const docWithJson = documents.find((d) => d.extracted_json);

  const handleSaveContext = async () => {
    setSavingCtx(true);
    const { error } = await supabase.from("cases").update({ company_context: context } as any).eq("id", caseData.id);
    if (error) toast.error("Erro ao salvar contexto.");
    else {
      toast.success("Contexto salvo!");
      onRefresh();
    }
    setSavingCtx(false);
  };

  const handleSaveCaseValue = async () => {
    setSavingValue(true);
    const parsed = currencyToNumber(caseValueInput);
    const { error } = await supabase.from("cases").update({ case_value: parsed }).eq("id", caseData.id);
    if (error) toast.error("Erro ao salvar valor.");
    else {
      toast.success("Valor da causa salvo!");
      onRefresh();
    }
    setSavingValue(false);
  };

  const handleAnalyze = async () => {
    const docWithText = documents.find((d) => d.extracted_text);
    if (!docWithText?.extracted_text) {
      toast.error("Nenhum documento com texto extraído encontrado. Faça upload e processe um PDF primeiro.");
      return;
    }

    setAnalyzing(true);
    try {
      const result = await aiAnalyze({
        petitionText: docWithText.extracted_text,
        contractText: "",
        contractType: "outros",
      });
      if (!result.success) throw new Error(result.error || "Erro na análise.");
      toast.success("Análise concluída!");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Erro na análise.");
    }
    setAnalyzing(false);
  };

  const client = (caseData as any).clients;
  const extracted = docWithJson?.extracted_json as any;

  const age = client?.birth_date ? differenceInYears(new Date(), new Date(client.birth_date)) : null;

  return (
    <div className="space-y-4 animate-fade-in">
      {!isCaller && (
        <>
          {/* Case Summary */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-primary" /> Resumo do Caso
              </h3>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  setSavingSummary(true);
                  const { error } = await supabase.from("cases").update({ case_summary: caseSummary } as any).eq("id", caseData.id);
                  if (error) toast.error("Erro ao salvar resumo.");
                  else { toast.success("Resumo salvo!"); onRefresh(); }
                  setSavingSummary(false);
                }}
                disabled={savingSummary || caseSummary === (caseData.case_summary || "")}
                className="text-xs"
              >
                {savingSummary ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                Salvar
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mb-2">
              Descreva o caso de forma resumida. Este texto será incluído na exportação.
            </p>
            <Textarea
              value={caseSummary}
              onChange={(e) => setCaseSummary(e.target.value)}
              placeholder="Ex: A autora busca a revisão judicial de seu contrato de financiamento..."
              className="bg-secondary border-border min-h-[100px] resize-y text-sm"
            />
          </div>

          {/* Company Context */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" /> Contexto da Empresa
              </h3>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveContext}
                disabled={savingCtx || context === (caseData.company_context || DEFAULT_COMPANY_CONTEXT)}
                className="text-xs"
              >
                {savingCtx ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                Salvar
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mb-2">
              Este contexto é usado pela IA para responder mensagens e gerar abordagens. Edite conforme necessário.
            </p>
            <Textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              className="bg-secondary border-border min-h-[120px] resize-y text-sm"
            />
          </div>
        </>
      )}

      {/* Case info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <User className="w-3.5 h-3.5" /> Cliente
          </div>
          {client && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-bold text-foreground mb-1">{client.full_name}</p>
                {client.cpf_or_identifier && <p className="text-[11px] text-muted-foreground">CPF: {formatCPF(client.cpf_or_identifier)}</p>}
                {age !== null && <p className="text-[11px] text-muted-foreground">Idade: {age} anos</p>}
              </div>

              <ClientPhoneEditor client={client} onRefresh={onRefresh} />

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
                <div className="space-y-1">
                  <p className="text-[9px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                    <BriefcaseIcon className="w-2.5 h-2.5" /> Profissão
                  </p>
                  <p className="text-[11px] font-medium truncate">{client.profession || "Não inf."}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                    <DollarSign className="w-2.5 h-2.5" /> Renda
                  </p>
                  <p className="text-[11px] font-medium truncate">{client.income || "Não inf."}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <Gavel className="w-3.5 h-3.5" /> Processo
          </div>
          <div className="space-y-1">
            {caseData.defendant && <p className="text-sm"><span className="text-muted-foreground">Réu:</span> {caseData.defendant}</p>}
            {caseData.case_type && <p className="text-sm"><span className="text-muted-foreground">Tipo:</span> {caseData.case_type}</p>}
            {caseData.court && <p className="text-sm"><span className="text-muted-foreground">Tribunal:</span> {caseData.court}</p>}
            <div className="flex items-center gap-2 mt-2">
              <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Valor da causa: R$</span>
              <Input
                value={caseValueInput}
                onChange={(e) => setCaseValueInput(formatCurrency(e.target.value))}
                placeholder="0,00"
                className="bg-secondary border-border h-7 w-36 text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveCaseValue}
                disabled={savingValue}
                className="h-7 text-xs px-2"
              >
                {savingValue ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              </Button>
            </div>
          </div>

          {(caseData.partner_law_firm_name || caseData.partner_lawyer_name) && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1 font-bold uppercase">
                <Building2 className="w-3 h-3" /> Escritório Parceiro
              </div>
              <p className="text-sm">{caseData.partner_law_firm_name || caseData.partner_lawyer_name}</p>
            </div>
          )}
        </div>
      </div>

      {/* Dados Complementares (Veículos e Bancos) */}
      {client && (client.vehicles || client.banks) && (
        <div className="bg-card border border-primary/20 rounded-xl p-4 shadow-sm border-l-4 border-l-primary">
          <div className="flex items-center gap-2 text-xs font-bold text-primary mb-3 uppercase tracking-wider">
            <Milestone className="w-4 h-4" /> Dados Complementares (Lead)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {client.vehicles && (
              <div className="space-y-1.5 bg-black/10 p-2.5 rounded-lg border border-white/5">
                <p className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1.5">
                  <Car className="w-3 h-3" /> Veículos Localizados
                </p>
                <p className="text-xs font-medium text-foreground">{client.vehicles}</p>
              </div>
            )}
            {client.banks && (
              <div className="space-y-1.5 bg-black/10 p-2.5 rounded-lg border border-white/5">
                <p className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1.5">
                  <Banknote className="w-3 h-3" /> Bancos Relacionados
                </p>
                <p className="text-xs font-medium text-foreground">{client.banks}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Summary */}
      {!isCaller && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> Resumo da IA
            </h3>
            <Button size="sm" onClick={handleAnalyze} disabled={analyzing} className="bg-gradient-gold text-primary-foreground hover:opacity-90 text-xs">
              {analyzing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
              {summaryOutput ? "Reanalisar" : "Analisar com IA"}
            </Button>
          </div>

          {summaryOutput ? (
            <div className="prose prose-sm prose-invert max-w-none text-sm">
              <ReactMarkdown>{summaryOutput.content}</ReactMarkdown>
            </div>
          ) : extracted ? (
            <div className="space-y-3 text-sm">
              {extracted.resumo && <p>{extracted.resumo}</p>}
              {extracted.alertas_golpe && (
                <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                  <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-medium text-destructive">Alertas de risco</p>
                    <ul className="list-disc pl-4 mt-1 text-muted-foreground">
                      {(extracted.alertas_golpe as string[]).map((a: string, i: number) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Faça upload de um PDF e clique em "Analisar com IA" para gerar o resumo.</p>
          )}
        </div>
      )}
    </div>
  );
}
