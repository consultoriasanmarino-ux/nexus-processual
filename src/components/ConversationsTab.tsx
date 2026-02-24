import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, User, Bot, Sparkles, Copy, Check, Info, Users } from "lucide-react";
import { toast } from "sonner";
import type { Case, Conversation, Message } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  const scrollRef = useRef<HTMLDivElement>(null);

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
      {/* Sugestão Inicial */}
      <div className="bg-secondary/40 border-b border-border p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
            <Info className="w-3 h-3" /> Sugestão Inicial
          </span>
          <Button size="sm" variant="outline" className="h-7 text-[10px] font-bold uppercase transition-all hover:bg-primary hover:text-primary-foreground" onClick={copyInitialMessage}>
            {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground italic leading-relaxed bg-black/20 p-2.5 rounded border border-white/5 whitespace-pre-wrap">
          {initialMessage}
        </p>
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
        <form onSubmit={handleSend} className="flex gap-2">
          <Input
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            placeholder="Explique a situação ou cole um print da conversa aqui..."
            className="flex-1 bg-secondary border-border h-11 text-sm rounded-xl focus-visible:ring-primary shadow-inner"
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="outline" className="h-11 w-11 rounded-xl bg-orange-500/10 border-orange-500/20 text-orange-400 hover:bg-orange-500/20 transition-all">
                  <Sparkles className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-card border-border text-xs">Pedir ajuda para a IA</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button type="submit" disabled={!newMsg.trim() || sending} className="h-11 px-5 rounded-xl bg-gradient-gold shadow-glow">
            {sending ? <Send className="w-4 h-4 animate-pulse" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
