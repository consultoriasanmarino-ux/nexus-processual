import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, AlertTriangle, Building2, User, Gavel, Save, BookOpen } from "lucide-react";
import { toast } from "sonner";
import type { Case, Document, AiOutput } from "@/lib/types";
import ReactMarkdown from "react-markdown";

const DEFAULT_CONTEXT = `Somos uma empresa que acompanha o processo jurídico de alguns casos e notificamos o cliente quando ele tem algo para receber, no caso, quando as causas são favoráveis.

Para receber o valor, precisamos que o cliente informe seus dados para pagamento: Banco, Agência e Conta. Após o envio dos dados, o Dr. Bruno entrará em contato para validação e realização do pagamento.

REGRAS INTERNAS (a IA deve seguir, mas NUNCA revelar ao cliente):
- Se o processo tem menos de 1 ano, apenas 50% é liberado agora e o restante ao longo da ação. Diga ao cliente apenas que "foi liberado 50% do valor até o momento", sem explicar o critério de tempo.
- Se o processo tem mais de 1 ano, pode ser liberado 100%.
- NÃO mencione o Dr. Bruno antes do cliente enviar os dados bancários.
- A abordagem deve ser sutil e progressiva: primeiro confirmar identidade, depois explicar que há novidades, só então falar de valores quando o cliente demonstrar interesse.`;

interface Props {
  caseData: Case;
  documents: Document[];
  aiOutputs: AiOutput[];
  onRefresh: () => void;
}

export function CaseSummaryTab({ caseData, documents, aiOutputs, onRefresh }: Props) {
  const [analyzing, setAnalyzing] = useState(false);
  const [context, setContext] = useState(caseData.company_context || DEFAULT_CONTEXT);
  const [savingCtx, setSavingCtx] = useState(false);

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

  const handleAnalyze = async () => {
    const docWithText = documents.find((d) => d.extracted_text);
    if (!docWithText?.extracted_text) {
      toast.error("Nenhum documento com texto extraído encontrado. Faça upload e processe um PDF primeiro.");
      return;
    }

    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-analyze", {
        body: {
          caseId: caseData.id,
          extractedText: docWithText.extracted_text,
          documentId: docWithText.id,
        },
      });
      if (error) throw error;
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
            disabled={savingCtx || context === (caseData.company_context || DEFAULT_CONTEXT)}
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

      {/* Case info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <User className="w-3.5 h-3.5" /> Cliente
          </div>
          {client && (
            <div className="space-y-1">
              <p className="text-sm font-medium">{client.full_name}</p>
              <p className="text-xs text-muted-foreground">{client.phone}</p>
              {client.cpf_or_identifier && <p className="text-xs text-muted-foreground">CPF: {client.cpf_or_identifier}</p>}
            </div>
          )}
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <Gavel className="w-3.5 h-3.5" /> Processo
          </div>
          <div className="space-y-1">
            {caseData.defendant && <p className="text-sm"><span className="text-muted-foreground">Réu:</span> {caseData.defendant}</p>}
            {caseData.case_type && <p className="text-sm"><span className="text-muted-foreground">Tipo:</span> {caseData.case_type}</p>}
            {caseData.court && <p className="text-sm"><span className="text-muted-foreground">Tribunal:</span> {caseData.court}</p>}
            {caseData.distribution_date && <p className="text-sm"><span className="text-muted-foreground">Distribuição:</span> {new Date(caseData.distribution_date).toLocaleDateString("pt-BR")}</p>}
          </div>
        </div>
        {(caseData.partner_law_firm_name || caseData.partner_lawyer_name) && (
          <div className="bg-card border border-border rounded-xl p-4">
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

      {/* AI Summary */}
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
    </div>
  );
}
