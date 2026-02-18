import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Sparkles, Loader2, MessageSquare, User, Bot, Image as ImageIcon, X, Trash2, Info } from "lucide-react";
import { toast } from "sonner";
import type { Case, Conversation, Message } from "@/lib/types";
import { formatPhone } from "@/lib/utils";

interface Props {
  caseId: string;
  caseData: Case;
  conversations: Conversation[];
  messages: Message[];
  onRefresh: () => void;
}

export function ConversationsTab({ caseId, caseData, conversations, messages, onRefresh }: Props) {
  const { user } = useAuth();
  const [userInput, setUserInput] = useState("");
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isAskingAI, setIsAskingAI] = useState(false);
  const [aiResponse, setAiResponse] = useState<{
    analysis: string;
    suggestions: { label: string; text: string }[];
    advice: string;
  } | null>(null);
  const [senderTab, setSenderTab] = useState<"assistant" | "client" | "operator">("assistant");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const conversationId = conversations[0]?.id;

  const toTitleCase = (str: string) =>
    str.toLowerCase().replace(/(?:^|\s|[-/])\S/g, (c) => c.toUpperCase());

  const clientName = (caseData as any).clients?.full_name || "Cliente";
  const firstName = toTitleCase(clientName.split(" ")[0]);
  const initialMessage = `Olá, ${firstName}! Tenho novidades sobre sua ação de revisão...`; // Simplified for the component, actual from props/state if needed

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

  const handleImagePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.indexOf("image") !== -1) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            setAttachedImage(event.target?.result as string);
            toast.success("Imagem colada!");
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setAttachedImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAskAI = async () => {
    if (!userInput.trim() && !attachedImage) {
      toast.error("Digite algo ou anexe uma imagem para o assistente.");
      return;
    }

    setIsAskingAI(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-message", {
        body: {
          action: "chat_assistant",
          caseId,
          caseTitle: caseData.case_title,
          distributionDate: caseData.distribution_date,
          defendant: caseData.defendant,
          court: caseData.court,
          caseValue: (caseData as any).case_value,
          recentMessages: messages.map((m) => ({ sender: m.sender, text: m.message_text })),
          userQuery: userInput,
          image: attachedImage,
        },
      });

      if (error) throw error;
      setAiResponse(data);
      // If user typed something personal to the AI, we don't necessarily register it in the "client conversation"
      // unless they use one of the suggestions.
      toast.success("Nexus analisou a situação!");
    } catch (err: any) {
      toast.error(err.message || "Erro na análise da IA.");
    }
    setIsAskingAI(false);
  };

  const handleUseSuggestion = async (text: string) => {
    await addMessage("operator", text);
    setAiResponse(null);
    setUserInput("");
    setAttachedImage(null);
    toast.success("Resposta registrada no histórico.");
  };

  const handleRegisterRaw = async () => {
    const sender = senderTab === "client" ? "client" : "operator";
    await addMessage(sender, userInput);
    setUserInput("");
    toast.success("Mensagem registrada.");
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Initial message helper */}
      <div className="bg-card border border-primary/20 rounded-xl p-3 flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-primary font-bold uppercase tracking-wider mb-1">Sugestão Inicial</p>
          <p className="text-sm truncate opacity-60 italic">{initialMessage}</p>
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs font-semibold" onClick={() => { navigator.clipboard.writeText(initialMessage); toast.success("Copiada!"); }}>
          Copiar
        </Button>
      </div>

      {/* Chat History Area */}
      <div className="bg-card border border-border rounded-xl p-4 h-80 overflow-y-auto space-y-3 custom-scrollbar">
        {messages.length === 0 ? (
          <div className="text-center py-10 opacity-40">
            <MessageSquare className="w-8 h-8 mx-auto mb-2" />
            <p className="text-xs">Inicie a conversa para manter o histórico...</p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex gap-2 ${m.sender === "operator" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.sender === "operator"
                  ? "bg-primary/20 border border-primary/30 text-foreground ml-auto"
                  : "bg-secondary border border-border text-foreground"
                }`}>
                <div className="flex items-center gap-1.5 mb-1 opacity-60">
                  {m.sender === "client" ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3 text-primary" />}
                  <span className="text-[10px] font-bold uppercase">{m.sender === "client" ? "Cliente" : "Operador"}</span>
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{m.message_text}</p>
                <p className="text-[9px] opacity-40 mt-1">{new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input / Assistant Area */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4 shadow-sm">
        <div className="flex gap-1 bg-secondary rounded-lg p-1">
          {[
            { id: "assistant", label: "Perguntar à IA", icon: Sparkles },
            { id: "client", label: "Voz do Cliente", icon: User },
            { id: "operator", label: "Minha Voz", icon: Send },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSenderTab(tab.id as any)}
              className={`flex-1 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase py-2 px-2 rounded-md transition-all ${senderTab === tab.id ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <tab.icon className="w-3 h-3" /> {tab.label}
            </button>
          ))}
        </div>

        <div className="relative group">
          <Textarea
            placeholder={
              senderTab === "assistant"
                ? "Explique a situação ou cole um print da conversa aqui..."
                : "Digite a mensagem para registrar no histórico..."
            }
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onPaste={senderTab === "assistant" ? handleImagePaste : undefined}
            className="bg-secondary border-border min-h-[100px] max-h-[200px] resize-y pr-10 focus:ring-primary/20"
          />
          {senderTab === "assistant" && (
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-2 bottom-2 h-8 w-8 text-muted-foreground hover:text-primary"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageIcon className="w-4 h-4" />
            </Button>
          )}
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
        </div>

        {attachedImage && (
          <div className="relative w-24 h-24 rounded-lg overflow-hidden border-2 border-primary/40 animate-in zoom-in-95">
            <img src={attachedImage} className="w-full h-full object-cover" alt="Anexo" />
            <button
              onClick={() => setAttachedImage(null)}
              className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5 hover:bg-destructive hover:text-white transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          {senderTab === "assistant" ? (
            <Button
              onClick={handleAskAI}
              disabled={isAskingAI || (!userInput.trim() && !attachedImage)}
              className="flex-1 bg-gradient-gold text-primary-foreground font-bold"
            >
              {isAskingAI ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Analisar com Nexus
            </Button>
          ) : (
            <Button
              onClick={handleRegisterRaw}
              disabled={!userInput.trim()}
              variant="outline"
              className="flex-1 font-semibold border-primary/20 hover:bg-primary/5"
            >
              Registrar no Histórico
            </Button>
          )}

          {(userInput || attachedImage) && (
            <Button variant="ghost" size="icon" onClick={() => { setUserInput(""); setAttachedImage(null); }} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* AI Intelligence Display */}
      {aiResponse && (
        <div className="bg-card border-2 border-primary/30 rounded-xl p-5 space-y-4 shadow-glow animate-slide-up">
          <div className="flex items-center justify-between border-b border-border pb-3 mb-1">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-primary/10 rounded-lg">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">Nexus Assistente</h4>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Inteligência Estratégica</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAiResponse(null)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="space-y-4">
            <div className="bg-primary/5 rounded-lg p-3 border border-primary/10">
              <div className="flex items-center gap-1.5 text-xs font-bold text-primary mb-1.5 uppercase tracking-wide">
                <Info className="w-3.5 h-3.5" /> Análise da Conversa
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">{aiResponse.analysis}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {aiResponse.suggestions.map((s, i) => (
                <div key={i} className="group relative bg-secondary hover:bg-secondary/80 border border-border rounded-xl p-3 transition-all cursor-pointer" onClick={() => handleUseSuggestion(s.text)}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase text-secondary-foreground/60">{s.label}</span>
                    <Sparkles className="w-3 h-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-xs line-clamp-3 italic text-foreground mb-3">"{s.text}"</p>
                  <Button size="sm" variant="outline" className="w-full text-[10px] h-7 font-bold uppercase tracking-wider group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                    Usar Resposta
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
              <div className="p-1 bg-amber-500/10 rounded-md text-amber-500 mt-0.5">
                <Sparkles className="w-3 h-3" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-amber-500/80 uppercase mb-1">Dica Estratégica</p>
                <p className="text-xs font-medium text-foreground/80">{aiResponse.advice}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
