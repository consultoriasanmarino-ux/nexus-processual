import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Sparkles, Loader2, MessageSquare, User, Bot } from "lucide-react";
import { toast } from "sonner";
import type { Case, Conversation, Message } from "@/lib/types";

interface Props {
  caseId: string;
  caseData: Case;
  conversations: Conversation[];
  messages: Message[];
  onRefresh: () => void;
}

export function ConversationsTab({ caseId, caseData, conversations, messages, onRefresh }: Props) {
  const { user } = useAuth();
  const [clientMsg, setClientMsg] = useState("");
  const [operatorMsg, setOperatorMsg] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<{ short: string; standard: string; state: string } | null>(null);
  const [senderTab, setSenderTab] = useState<"client" | "operator">("client");

  const conversationId = conversations[0]?.id;

  const clientName = (caseData as any).clients?.full_name || "Cliente";
  const firstName = clientName.split(" ")[0];
  const defendantName = caseData.defendant || "a parte ré";
  const courtName = caseData.court || "comarca não informada";
  const initialMessage = `Olá, ${firstName}! Tenho novidades sobre sua ação de revisão contra o ${defendantName} (comarca de ${courtName}). Poderia confirmar se recebeu esta mensagem?`;

  const addMessage = async (sender: string, text: string) => {
    if (!user || !conversationId) return;
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      user_id: user.id,
      sender,
      message_text: text,
    });
    onRefresh();
  };

  const handlePasteClientMsg = async () => {
    if (!clientMsg.trim()) return;
    await addMessage("client", clientMsg.trim());
    setClientMsg("");
  };

  const handlePasteOperatorMsg = async () => {
    if (!operatorMsg.trim()) return;
    await addMessage("operator", operatorMsg.trim());
    setOperatorMsg("");
    toast.success("Mensagem do operador registrada.");
  };

  const handleSuggestReply = async () => {
    setSuggesting(true);
    setSuggestion(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-message", {
        body: {
          action: "suggest_reply",
          caseId,
          caseTitle: caseData.case_title,
          distributionDate: caseData.distribution_date,
          defendant: caseData.defendant,
          court: caseData.court,
          partnerFirm: caseData.partner_law_firm_name,
          partnerLawyer: caseData.partner_lawyer_name,
          companyContext: caseData.company_context,
          caseValue: (caseData as any).case_value,
          recentMessages: messages.slice(-10).map((m) => ({ sender: m.sender, text: m.message_text })),
        },
      });
      if (error) throw error;
      setSuggestion(data);
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar sugestão.");
    }
    setSuggesting(false);
  };

  const handleUseSuggestion = async (text: string) => {
    await addMessage("operator", text);
    setSuggestion(null);
    toast.success("Mensagem registrada.");
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Initial message template */}
      <div className="bg-card border border-primary/20 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2 text-xs text-primary font-medium">
          <MessageSquare className="w-3.5 h-3.5" />
          Mensagem inicial (copiar e enviar ao cliente)
        </div>
        <p className="text-sm bg-secondary rounded-lg p-3 whitespace-pre-wrap select-all cursor-pointer" title="Clique para selecionar" onClick={() => { navigator.clipboard.writeText(initialMessage); toast.success("Mensagem copiada!"); }}>
          {initialMessage}
        </p>
      </div>

      {/* Messages */}
      <div className="bg-card border border-border rounded-xl p-4 max-h-96 overflow-y-auto space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-10">
            <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex gap-2 ${m.sender === "operator" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                m.sender === "operator"
                  ? "bg-primary/15 border border-primary/20 text-foreground"
                  : "bg-secondary text-foreground"
              }`}>
                <div className="flex items-center gap-1.5 mb-1">
                  {m.sender === "client" ? <User className="w-3 h-3 text-muted-foreground" /> : <Bot className="w-3 h-3 text-primary" />}
                  <span className="text-[10px] text-muted-foreground font-medium">{m.sender === "client" ? "Cliente" : "Operador"}</span>
                </div>
                <p className="whitespace-pre-wrap">{m.message_text}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{new Date(m.created_at).toLocaleString("pt-BR")}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input area with sender tabs */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex gap-1 bg-secondary rounded-lg p-1">
          <button
            onClick={() => setSenderTab("client")}
            className={`flex-1 text-xs font-medium py-1.5 px-3 rounded-md transition-colors ${
              senderTab === "client" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <User className="w-3 h-3 inline mr-1" /> Mensagem do Cliente
          </button>
          <button
            onClick={() => setSenderTab("operator")}
            className={`flex-1 text-xs font-medium py-1.5 px-3 rounded-md transition-colors ${
              senderTab === "operator" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Bot className="w-3 h-3 inline mr-1" /> Mensagem que Enviei
          </button>
        </div>

        {senderTab === "client" ? (
          <>
            <Textarea
              placeholder="Cole aqui a mensagem recebida do cliente..."
              value={clientMsg}
              onChange={(e) => setClientMsg(e.target.value)}
              className="bg-secondary border-border min-h-[80px] resize-none"
            />
            <div className="flex items-center gap-2">
              <Button onClick={handlePasteClientMsg} disabled={!clientMsg.trim()} variant="outline" size="sm">
                <Send className="w-3 h-3 mr-1" /> Registrar mensagem do cliente
              </Button>
              <Button onClick={handleSuggestReply} disabled={suggesting} size="sm" className="bg-gradient-gold text-primary-foreground hover:opacity-90 text-xs">
                {suggesting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
                Sugerir resposta
              </Button>
            </div>
          </>
        ) : (
          <>
            <Textarea
              placeholder="Cole aqui a mensagem que você enviou ao cliente..."
              value={operatorMsg}
              onChange={(e) => setOperatorMsg(e.target.value)}
              className="bg-secondary border-border min-h-[80px] resize-none"
            />
            <Button onClick={handlePasteOperatorMsg} disabled={!operatorMsg.trim()} variant="outline" size="sm">
              <Send className="w-3 h-3 mr-1" /> Registrar mensagem enviada
            </Button>
          </>
        )}
      </div>

      {/* Suggestion */}
      {suggestion && (
        <div className="bg-card border border-primary/30 rounded-xl p-4 space-y-3 shadow-glow animate-slide-up">
          <div className="flex items-center gap-2 text-xs text-primary font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            Estado do cliente: <span className="text-foreground font-semibold">{suggestion.state}</span>
          </div>

          <div className="space-y-2">
            <div>
              <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Resposta curta</p>
              <p className="text-sm bg-secondary rounded-lg p-3">{suggestion.short}</p>
              <Button size="sm" variant="ghost" className="text-xs mt-1" onClick={() => handleUseSuggestion(suggestion.short)}>
                Usar esta
              </Button>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Resposta padrão</p>
              <p className="text-sm bg-secondary rounded-lg p-3">{suggestion.standard}</p>
              <Button size="sm" variant="ghost" className="text-xs mt-1" onClick={() => handleUseSuggestion(suggestion.standard)}>
                Usar esta
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
