import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { aiMessage } from "@/lib/gemini";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Sparkles, Loader2, MessageSquare, User, Bot, Image as ImageIcon, X, Trash2, Info, CheckCircle2, Pencil, Check } from "lucide-react";
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

  // State para edição de sugestão antes de enviar
  const [pendingSuggestion, setPendingSuggestion] = useState<string | null>(null);

  // State para edição de mensagens existentes
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const conversationId = conversations[0]?.id;

  const toTitleCase = (str: string) =>
    str.toLowerCase().replace(/(?:^|\s|[-/])\S/g, (c) => c.toUpperCase());

  const clientName = (caseData as any).clients?.full_name || "Cliente";
  const firstName = toTitleCase(clientName.split(" ")[0]);
  const initialMessage = `Olá, ${firstName}! Tenho novidades sobre sua ação de revisão...`;

  const addMessage = async (sender: string, text: string) => {
    if (!user || !conversationId) return;

    await supabase
      .from("cases")
      .update({ is_chat_active: true } as any)
      .eq("id", caseId);

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      user_id: user.id,
      sender,
      message_text: text,
    });
    onRefresh();
  };

  const handleFinishConversation = async () => {
    try {
      await supabase
        .from("cases")
        .update({ is_chat_active: false } as any)
        .eq("id", caseId);

      toast.success("Atendimento finalizado com sucesso!");
      onRefresh();
    } catch (err) {
      toast.error("Erro ao finalizar atendimento.");
    }
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
      const recentMessages = messages.slice(-10).map((m) => ({ sender: m.sender, text: m.message_text }));
      const caseValueNum = typeof (caseData as any).case_value === "string"
        ? parseFloat((caseData as any).case_value.replace(/\D/g, ""))
        : Number((caseData as any).case_value || 0);

      const data = await aiMessage({
        action: "chat_assistant",
        caseId,
        caseTitle: caseData.case_title,
        defendant: caseData.defendant,
        court: caseData.court,
        caseValue: caseValueNum,
        companyContext: caseData.company_context || undefined,
        recentMessages: recentMessages,
        userQuery: userInput,
        image: attachedImage,
      });

      if (data?.error) {
        toast.error(`Sugestão Indisponível: ${data.error}`);
        setIsAskingAI(false);
        return;
      }

      setAiResponse(data);
      toast.success("Nexus analisou a situação!");
    } catch (err: any) {
      toast.error(err.message || "Erro na análise da IA.");
    }
    setIsAskingAI(false);
  };

  // Ao clicar na sugestão, abre o editor de confirmação em vez de enviar direto
  const handleSelectSuggestion = (text: string) => {
    setPendingSuggestion(text);
  };

  // Confirma e envia a sugestão (possivelmente editada)
  const handleConfirmSuggestion = async () => {
    if (!pendingSuggestion?.trim()) return;
    await addMessage("operator", pendingSuggestion);
    setPendingSuggestion(null);
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

  // Editar mensagem existente no banco
  const handleStartEdit = (msg: Message) => {
    setEditingMessageId(msg.id);
    setEditingMessageText(msg.message_text);
  };

  const handleSaveEdit = async () => {
    if (!editingMessageId || !editingMessageText.trim()) return;

    const { error } = await supabase
      .from("messages")
      .update({ message_text: editingMessageText })
      .eq("id", editingMessageId);

    if (error) {
      toast.error("Erro ao editar mensagem.");
    } else {
      toast.success("Mensagem editada!");
      onRefresh();
    }
    setEditingMessageId(null);
    setEditingMessageText("");
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingMessageText("");
  };

  // Deletar mensagem
  const handleDeleteMessage = async (msgId: string) => {
    const { error } = await supabase
      .from("messages")
      .delete()
      .eq("id", msgId);

    if (error) {
      toast.error("Erro ao excluir mensagem.");
    } else {
      toast.success("Mensagem excluída.");
      onRefresh();
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Initial message helper */}
      <div className="bg-card border border-primary/20 rounded-xl p-3 flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[10px] text-primary font-bold uppercase tracking-wider">Sugestão Inicial</p>
            {caseData.is_chat_active && (
              <span className="flex items-center gap-1 text-[9px] bg-success/10 text-success px-1.5 py-0.5 rounded-full border border-success/20 animate-pulse">
                <div className="w-1 h-1 rounded-full bg-success" /> Em Atendimento
              </span>
            )}
          </div>
          <p className="text-sm truncate opacity-60 italic">{initialMessage}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 text-[10px] font-bold uppercase tracking-wider" onClick={() => { navigator.clipboard.writeText(initialMessage); toast.success("Copiada!"); }}>
            Copiar
          </Button>
          {caseData.is_chat_active && (
            <Button size="sm" onClick={handleFinishConversation} className="h-8 bg-success hover:bg-success/90 text-white text-[10px] font-bold uppercase tracking-wider">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Finalizar
            </Button>
          )}
        </div>
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
              <div className={`group max-w-[85%] rounded-xl px-3 py-2 text-sm relative ${m.sender === "operator"
                ? "bg-primary/20 border border-primary/30 text-foreground ml-auto"
                : "bg-secondary border border-border text-foreground"
                }`}>
                <div className="flex items-center gap-1.5 mb-1 opacity-60">
                  {m.sender === "client" ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3 text-primary" />}
                  <span className="text-[10px] font-bold uppercase">{m.sender === "client" ? "Cliente" : "Operador"}</span>
                  {/* Botões Editar / Excluir */}
                  <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleStartEdit(m)}
                      className="p-0.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteMessage(m.id)}
                      className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>

                {editingMessageId === m.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editingMessageText}
                      onChange={(e) => setEditingMessageText(e.target.value)}
                      className="bg-background border-primary/30 min-h-[60px] resize-y text-sm"
                      autoFocus
                    />
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" onClick={handleSaveEdit} className="h-6 text-[10px] px-2 bg-primary text-primary-foreground">
                        <Check className="w-3 h-3 mr-1" /> Salvar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="h-6 text-[10px] px-2">
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap leading-relaxed">{m.message_text}</p>
                )}

                <p className="text-[9px] opacity-40 mt-1">{new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pending Suggestion Confirmation */}
      {pendingSuggestion !== null && (
        <div className="bg-card border-2 border-primary/40 rounded-xl p-4 space-y-3 shadow-glow animate-slide-up">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1 bg-primary/10 rounded-lg">
              <Pencil className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground">Revisar antes de enviar</h4>
              <p className="text-[10px] text-muted-foreground">Edite se necessário e confirme para registrar no histórico.</p>
            </div>
          </div>
          <Textarea
            value={pendingSuggestion}
            onChange={(e) => setPendingSuggestion(e.target.value)}
            className="bg-secondary border-primary/20 min-h-[80px] resize-y text-sm focus:ring-primary/30"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <Button
              onClick={handleConfirmSuggestion}
              disabled={!pendingSuggestion?.trim()}
              className="flex-1 bg-gradient-gold text-primary-foreground font-bold"
            >
              <Check className="w-4 h-4 mr-2" /> Confirmar e Enviar
            </Button>
            <Button
              variant="ghost"
              onClick={() => setPendingSuggestion(null)}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

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
                <div key={i} className="group relative bg-secondary hover:bg-secondary/80 border border-border rounded-xl p-3 transition-all cursor-pointer" onClick={() => handleSelectSuggestion(s.text)}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase text-secondary-foreground/60">{s.label}</span>
                    <Pencil className="w-3 h-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-xs line-clamp-3 italic text-foreground mb-3">"{s.text}"</p>
                  <Button size="sm" variant="outline" className="w-full text-[10px] h-7 font-bold uppercase tracking-wider group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                    Revisar e Enviar
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
