import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { aiAnalyze } from "@/lib/gemini";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, AlertTriangle, Building2, User, Gavel, Save, BookOpen, DollarSign, CalendarIcon, ClipboardList, Phone, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { Case, Document, AiOutput } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import { format } from "date-fns";
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

  return (
    <div className="space-y-2">
      {/* Telefone Consulta */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-muted-foreground uppercase font-semibold">Telefone Consulta</span>
        {editingField === "phone" ? (
          <div className="flex items-center gap-1.5">
            <Input value={phoneValue} onChange={(e) => setPhoneValue(formatPhone(e.target.value))} placeholder="(11) 99999-9999" className="h-7 w-40 text-xs bg-secondary border-border" />
            <Button size="sm" variant="outline" onClick={handleSave} disabled={saving} className="h-7 text-xs px-2">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingField(null)} className="h-7 text-xs px-2">Cancelar</Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2 py-1">
            <Phone className="w-3 h-3 text-muted-foreground" />
            <span className={`text-xs ${!client.phone?.trim() ? 'text-muted-foreground/60 italic' : 'text-muted-foreground'}`}>
              {formatPhone(client.phone) || "Não informado"}
            </span>
            <button onClick={() => startEditing("phone", client.phone)} className="text-muted-foreground hover:text-foreground transition-colors">
              <Pencil className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Telefone Contrato */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-muted-foreground uppercase font-semibold">Telefone do Contrato</span>
        {editingField === "phone_contract" ? (
          <div className="flex items-center gap-1.5">
            <Input value={phoneValue} onChange={(e) => setPhoneValue(formatPhone(e.target.value))} placeholder="(11) 99999-9999" className="h-7 w-40 text-xs bg-secondary border-border" />
            <Button size="sm" variant="outline" onClick={handleSave} disabled={saving} className="h-7 text-xs px-2">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingField(null)} className="h-7 text-xs px-2">Cancelar</Button>
          </div>
        ) : (
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md",
            !client.phone_contract?.trim() && !client.phone?.trim() ? "bg-destructive/10 border border-destructive/20" : "bg-secondary/50"
          )}>
            {!client.phone_contract?.trim() && !client.phone?.trim() && <AlertTriangle className="w-3 h-3 text-destructive" />}
            <Phone className={cn("w-3 h-3", client.phone_contract?.trim() ? "text-primary" : "text-muted-foreground")} />
            <span className={cn(
              "text-xs",
              !client.phone_contract?.trim() && !client.phone?.trim() ? "text-destructive font-medium" :
                !client.phone_contract?.trim() ? "text-muted-foreground italic" : "text-foreground font-semibold"
            )}>
              {formatPhone(client.phone_contract) || "Não extraído"}
            </span>
            <button onClick={() => startEditing("phone_contract", client.phone_contract)} className="text-muted-foreground hover:text-foreground transition-colors">
              <Pencil className="w-3 h-3" />
            </button>
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
            <div className="space-y-2">
              <p className="text-sm font-medium">{client.full_name}</p>
              <ClientPhoneEditor client={client} onRefresh={onRefresh} />
              {client.cpf_or_identifier && <p className="text-xs text-muted-foreground">CPF: {formatCPF(client.cpf_or_identifier)}</p>}
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
        </div>
        {(caseData.partner_law_firm_name || caseData.partner_lawyer_name) && (
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
              <Building2 className="w-3.5 h-3.5" /> Escritório Parceiro
            </div>
            <div className="space-y-1">
              {caseData.partner_law_firm_name && <p className="text-sm">{caseData.partner_law_firm_name}</p>}
              {caseData.partner_lawyer_name && <p className="text-xs text-muted-foreground">Adv: {caseData.partner_lawyer_name}</p>}
            </div>
          </div>
        )}
      </div>

      {/* Dados Extras (Informações Complementares) */}
      {extracted?.client_details && (
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm border-l-4 border-l-primary/30">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <ClipboardList className="w-3.5 h-3.5" /> Informações Complementares (Extraído da IA)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-4 gap-x-6">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Profissão / Renda</p>
              <p className="text-sm font-medium">
                {extracted.client_details.profession || "N/A"}
                {extracted.client_details.income && ` - R$ ${extracted.client_details.income}`}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Idade</p>
              <p className="text-sm font-medium">{extracted.client_details.age || "N/A"}</p>
            </div>
            {extracted.client_details.vehicles?.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Veículos</p>
                <p className="text-sm font-medium">{extracted.client_details.vehicles.join(", ")}</p>
              </div>
            )}
            {extracted.client_details.banks?.length > 0 && (
              <div className="sm:col-span-2">
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Bancos Relacionados</p>
                <p className="text-sm font-medium">{extracted.client_details.banks.join(", ")}</p>
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
