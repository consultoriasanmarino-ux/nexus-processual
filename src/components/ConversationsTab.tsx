import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, User, Bot, Sparkles, Copy, Check, Info, Users, Paperclip, Loader2, X, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import type { Case, Conversation, Message } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { aiMessage } from "@/lib/gemini";

interface Props {
  caseId: string;
  caseData: Case;
  conversations: Conversation[];
  messages: Message[];
  onRefresh: () => void;
}

function toTitleCase(str: string) {
  if (!str) return "";
  return str.toLowerCase().replace(/(?:^|\s|[-/])\S/g, (c) => c.toUpperCase());
}

export function ConversationsTab({ caseId, caseData, conversations, messages, onRefresh }: Props) {
  const { user } = useAuth();
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeConv = conversations[0];
  const conversationId = activeConv?.id;

  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  const clientName = (caseData as any).clients?.full_name || "Cliente";
  const firstName = toTitleCase(clientName.split(" ")[0]);

  const caseType = (caseData.case_type || "ação judicial").toUpperCase();
  const defendant = (caseData.defendant || "instituição").toUpperCase();
  const court = caseData.court ? ` (${caseData.court})` : "";

  const initialMessage = `Olá, ${firstName}! Tudo bem?\nTenho novidades sobre sua ação de ${caseType} contra o ${defendant}${court}. Poderia confirmar se recebeu esta mensagem?`;

  const addMessage = async (sender: string, text: string) => {
    if (!user || !conversationId) return;
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender: sender,
      message_text: text,
      user_id: user.id
    });
    if (error) toast.error("Erro ao enviar mensagem.");
    else onRefresh();
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMsg.trim() || sending) return;
    setSending(true);
    await addMessage("user", newMsg);
    setNewMsg("");
    setSending(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione apenas imagens.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAiHelp = async () => {
    if (analyzing || (!newMsg.trim() && !selectedImage)) {
      toast.error("Digite algo ou suba um print para a IA analisar.");
      return;
    }

    setAnalyzing(true);
    try {
      const recent = messages.slice(-5).map(m => ({
        sender: (m as any).sender,
        text: (m as any).message_text
      }));

      const res = await aiMessage({
        action: "chat_assistant",
        caseTitle: caseData.case_title,
        defendant: caseData.defendant,
        caseType: caseData.case_type,
        court: caseData.court,
        recentMessages: recent,
        caseValue: (caseData as any).case_value,
        image: selectedImage,
        userQuery: newMsg || "Analise o print e a situação atual."
      });

      if (res.error) {
        toast.error(res.error);
      } else {
        // 1. Process transcription (Auto-type the conversation from the print)
        if (res.transcription && Array.isArray(res.transcription)) {
          console.log("Transcrevendo diálogo do print...");
          for (const item of res.transcription) {
            // Only add if it's a valid sender
            if (item.sender === "client" || item.sender === "user") {
              await addMessage(item.sender, item.text);
            }
          }
        }

        // 2. Build the AI analysis text
        let aiText = `🤖 **Análise da Nexus IA:**\n\n${res.analysis}\n\n💡 **Sugestões:**\n`;
        res.suggestions.forEach((s: any) => {
          aiText += `- ${s.label}: "${s.text}"\n`;
        });
        aiText += `\n🎯 **Conselho:** ${res.advice}`;

        await addMessage("ai", aiText);
        setNewMsg("");
        setSelectedImage(null);
      }
    } catch (err: any) {
      toast.error("Falha ao consultar IA.");
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  const copyInitialMessage = () => {
    navigator.clipboard.writeText(initialMessage);
    setCopied(true);
    toast.success("Mensagem copiada!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (!conversationId) {
    return (
      <div className="bg-card border border-border rounded-xl p-10 text-center">
        <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Inicie uma conversa para manter o histórico...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[600px] bg-card border border-border rounded-xl overflow-hidden shadow-card">
      {/* Sugestão Inicial & WhatsApp Actions */}
      <div className="bg-secondary/40 border-b border-border p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
            <Info className="w-3 h-3" /> Sugestão Inicial
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-[10px] font-bold uppercase transition-all hover:bg-primary hover:text-primary-foreground" onClick={copyInitialMessage}>
              {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
              {copied ? "Copiado" : "Copiar Texto"}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground italic leading-relaxed bg-black/20 p-2.5 rounded border border-white/5 whitespace-pre-wrap mb-3">
          {initialMessage}
        </p>

        {/* WhatsApp Buttons for found phones */}
        <div className="flex flex-wrap gap-2">
          {(() => {
            const client = (caseData as any).clients;
            const allPhones = `${client?.phone_contract || ""} ${client?.phone || ""}`
              .split(/[\s,;|]+/)
              .filter(p => p.replace(/\D/g, "").length >= 10);

            // Deduplicate
            const uniquePhones = Array.from(new Set(allPhones.map(p => p.replace(/\D/g, ""))));

            // Heuristic para Brasil: 11 dígitos começando com 9 = Celular (WhatsApp)
            const isBlacklisted = (p: string) => client?.notes?.includes(`[NO-WA:${p}]`);
            const isWhatsApp = (p: string) => {
              if (isBlacklisted(p)) return false;
              return p.length === 11 && p[2] === "9";
            };
            const waNumbers = uniquePhones.filter(isWhatsApp);
            const fixedNumbers = uniquePhones.filter(p => !isWhatsApp(p));

            if (uniquePhones.length === 0) {
              return <span className="text-[10px] text-muted-foreground italic">Nenhum número encontrado para este cliente.</span>;
            }

            return (
              <>
                {waNumbers.map((p, idx) => (
                  <Button
                    key={`wa-${idx}`}
                    size="sm"
                    className="bg-[#25D366] hover:bg-[#128C7E] text-white text-[10px] font-bold h-8 transition-transform hover:scale-105 shadow-sm"
                    onClick={() => {
                      const encodedMsg = encodeURIComponent(initialMessage);
                      window.open(`https://wa.me/55${p}?text=${encodedMsg}`, "_blank");
                    }}
                  >
                    <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                    WhatsApp ({p.slice(-4)})
                  </Button>
                ))}

                {fixedNumbers.map((p, idx) => (
                  <Button
                    key={`fixed-${idx}`}
                    size="sm"
                    variant="outline"
                    className="border-muted-foreground/30 text-muted-foreground text-[10px] font-bold h-8 opacity-60 hover:opacity-100"
                    title="Telefone Fixo - Provavelmente sem WhatsApp"
                    onClick={() => {
                      const encodedMsg = encodeURIComponent(initialMessage);
                      window.open(`https://wa.me/55${p}?text=${encodedMsg}`, "_blank");
                    }}
                  >
                    Fixo ({p.slice(-4)})
                  </Button>
                ))}
              </>
            );
          })()}
        </div>
      </div>

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 opacity-40">
              <MessageSquare className="w-8 h-8 mb-2" />
              <p className="text-xs">Inicie a conversa para manter o histórico...</p>
            </div>
          )}
          {messages.map((m) => {
            const sender = (m as any).sender;
            const text = (m as any).message_text;
            return (
              <div key={m.id} className={`flex ${sender === "user" ? "justify-end" : "justify-start animate-fade-in"}`}>
                <div className={`max-w-[85%] rounded-2xl p-3 shadow-sm ${sender === "user"
                  ? "bg-primary text-primary-foreground rounded-tr-none"
                  : sender === "ai"
                    ? "bg-secondary border border-border rounded-tl-none"
                    : "bg-blue-600/20 border border-blue-500/20 text-blue-100 rounded-tl-none"
                  }`}>
                  <div className="flex items-center gap-1.5 mb-1.5 opacity-70">
                    {sender === "user" ? <User className="w-3 h-3" /> : sender === "ai" ? <Bot className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                    <span className="text-[10px] uppercase font-bold tracking-tighter">
                      {sender === "user" ? "Eu" : sender === "ai" ? "Nexus IA" : "Cliente (Voz)"}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="p-4 bg-secondary/20 border-t border-border">
        {selectedImage && (
          <div className="mb-3 relative inline-block group">
            <img src={selectedImage} alt="Preview" className="h-24 w-auto rounded-lg border border-primary/30 shadow-md animate-in zoom-in-50 duration-200" />
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 shadow-lg hover:scale-110 transition-transform"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*"
            className="hidden"
          />

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className={`h-11 w-11 rounded-xl bg-secondary border-border hover:bg-muted transition-all ${selectedImage ? "text-primary border-primary/30 bg-primary/5" : "text-muted-foreground"}`}
                >
                  <Paperclip className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-card border-border text-xs">Anexar print da conversa</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <form onSubmit={handleSend} className="flex-1 flex gap-2">
            <Input
              value={newMsg}
              onChange={(e) => setNewMsg(e.target.value)}
              placeholder={selectedImage ? "Descreva o que deseja da IA sobre este print..." : "Explique a situação ou descreva o print..."}
              className="flex-1 bg-secondary border-border h-11 text-sm rounded-xl focus-visible:ring-primary shadow-inner"
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    onClick={handleAiHelp}
                    disabled={analyzing || (!newMsg.trim() && !selectedImage)}
                    variant="outline"
                    className="h-11 w-11 rounded-xl bg-orange-500/10 border-orange-500/20 text-orange-400 hover:bg-orange-500/20 transition-all shadow-glow-amber disabled:opacity-50"
                  >
                    {analyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-card border-border text-xs">Analisar print/situação com IA</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button type="submit" disabled={!newMsg.trim() || sending} className="h-11 px-5 rounded-xl bg-gradient-gold shadow-glow">
              {sending ? <Send className="w-4 h-4 animate-pulse" /> : <Send className="w-4 h-4" />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
