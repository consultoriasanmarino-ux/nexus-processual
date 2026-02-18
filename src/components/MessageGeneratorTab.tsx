import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2, AlertTriangle, Copy, Check, Shield, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import type { Case, Document, AiOutput } from "@/lib/types";

interface Props {
  caseData: Case;
  documents: Document[];
  aiOutputs: AiOutput[];
  onRefresh: () => void;
}

const DEFAULT_CONTEXT = "Somos uma empresa parceira do escritório responsável, notificamos o cliente sobre valores integrais liberados e auxiliamos no recebimento seguro junto ao Dr. Bruno.";
const DEFAULT_OBJECTIVE = "Gerar resposta e continuar a conversa com confiança.";

type GeneratedMessage = {
  message: string;
  short_variant: string;
  confidence: number;
  scam_risk: string;
  scam_reasons: string[];
};

export function MessageGeneratorTab({ caseData, documents, aiOutputs, onRefresh }: Props) {
  const { user } = useAuth();
  const [context, setContext] = useState(DEFAULT_CONTEXT);
  const [objective, setObjective] = useState(DEFAULT_OBJECTIVE);
  const [tone, setTone] = useState("profissional");
  const [formality, setFormality] = useState("média");
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<GeneratedMessage[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const generate = async (action: string) => {
    setGenerating(true);
    setResults([]);
    try {
      const { data, error } = await supabase.functions.invoke("ai-message", {
        body: {
          action,
          caseId: caseData.id,
          caseTitle: caseData.case_title,
          distributionDate: caseData.distribution_date,
          defendant: caseData.defendant,
          caseType: caseData.case_type,
          court: caseData.court,
          partnerFirm: caseData.partner_law_firm_name,
          partnerLawyer: caseData.partner_lawyer_name,
          caseValue: (caseData as any).case_value,
          context,
          objective,
          tone,
          formality,
          existingOutputs: aiOutputs.slice(0, 3).map((o) => o.content),
        },
      });
      if (error) throw error;

      if (data?.error) {
        toast.error(`Erro na Geração: ${data.error}`);
        setGenerating(false);
        return;
      }

      const msgs = Array.isArray(data?.messages) ? data.messages : [data];
      setResults(msgs);

      // Save to ai_outputs
      for (const msg of msgs) {
        await supabase.from("ai_outputs").insert({
          case_id: caseData.id,
          user_id: user!.id,
          output_type: action,
          content: msg.message,
          confidence_score: msg.confidence,
          scam_risk: msg.scam_risk,
          rationale: msg.scam_reasons?.join("; ") ?? null,
        });
      }
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar mensagem.");
    }
    setGenerating(false);
  };

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
    toast.success("Copiado!");
  };

  const riskColor = (risk: string) => {
    if (risk === "baixo") return "text-success";
    if (risk === "médio") return "text-warning";
    return "text-destructive";
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Config panel */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" /> Configuração do Gerador
        </h3>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Contexto da empresa</Label>
          <Textarea value={context} onChange={(e) => setContext(e.target.value)} className="bg-secondary border-border min-h-[60px] resize-none text-xs" />
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Objetivo</Label>
          <Textarea value={objective} onChange={(e) => setObjective(e.target.value)} className="bg-secondary border-border min-h-[40px] resize-none text-xs" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Tom</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger className="bg-secondary border-border text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="profissional">Profissional</SelectItem>
                <SelectItem value="acolhedor">Acolhedor</SelectItem>
                <SelectItem value="técnico">Técnico</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Formalidade</Label>
            <Select value={formality} onValueChange={setFormality}>
              <SelectTrigger className="bg-secondary border-border text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="média">Média</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {[
          { action: "approach_v1", label: "Gerar abordagem inicial", icon: MessageSquare },
          { action: "variations_v1", label: "Gerar 3 variações", icon: Sparkles },
          { action: "make_trustworthy", label: "Tornar mais confiável", icon: Shield },
          { action: "reduce_scam", label: "Reduzir cara de golpe", icon: AlertTriangle },
          { action: "simplify", label: "Simplificar linguagem", icon: MessageSquare },
        ].map((btn) => (
          <Button
            key={btn.action}
            onClick={() => generate(btn.action)}
            disabled={generating}
            size="sm"
            variant="outline"
            className="text-xs"
          >
            {generating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <btn.icon className="w-3 h-3 mr-1" />}
            {btn.label}
          </Button>
        ))}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((r, i) => (
            <div key={i} className="bg-card border border-primary/20 rounded-xl p-4 shadow-glow animate-slide-up space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">Confiança: <span className="text-foreground font-bold">{r.confidence}/10</span></span>
                  <span className="text-muted-foreground">Risco: <span className={`font-bold ${riskColor(r.scam_risk)}`}>{r.scam_risk}</span></span>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(r.message, i)}>
                  {copiedIdx === i ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>

              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Mensagem sugerida</p>
                <p className="text-sm whitespace-pre-wrap bg-secondary rounded-lg p-3">{r.message}</p>
              </div>

              {r.short_variant && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Variante curta</p>
                  <p className="text-sm whitespace-pre-wrap bg-secondary rounded-lg p-3">{r.short_variant}</p>
                </div>
              )}

              {r.scam_reasons?.length > 0 && (
                <div className="text-xs">
                  <p className="text-muted-foreground mb-1">Motivos do risco:</p>
                  <ul className="list-disc pl-4 text-muted-foreground space-y-0.5">
                    {r.scam_reasons.map((reason, j) => <li key={j}>{reason}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Past outputs */}
      {aiOutputs.length > 0 && (
        <div className="mt-6">
          <h4 className="text-xs text-muted-foreground font-medium mb-3 uppercase tracking-wider">Histórico de saídas</h4>
          <div className="space-y-2">
            {aiOutputs.slice(0, 5).map((o) => (
              <div key={o.id} className="bg-card border border-border rounded-lg p-3 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-muted-foreground font-mono">{o.output_type}</span>
                  <span className="text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</span>
                </div>
                <p className="text-foreground line-clamp-2">{o.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
