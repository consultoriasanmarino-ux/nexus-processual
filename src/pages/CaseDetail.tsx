import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, FileText, MessageSquare, Sparkles, ClipboardList } from "lucide-react";
import { getStatusInfo, type Case, type Document, type Conversation, type Message, type AiOutput } from "@/lib/types";
import { CaseSummaryTab } from "@/components/CaseSummaryTab";
import { DocumentsTab } from "@/components/DocumentsTab";
import { ConversationsTab } from "@/components/ConversationsTab";
import { MessageGeneratorTab } from "@/components/MessageGeneratorTab";
import { CaseExportModal } from "@/components/CaseExportModal";

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [aiOutputs, setAiOutputs] = useState<AiOutput[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && id) fetchAll();
  }, [user, id]);

  const fetchAll = async () => {
    const [cRes, dRes, cvRes, aoRes] = await Promise.all([
      supabase.from("cases").select("*, clients(*)").eq("id", id!).single(),
      supabase.from("documents").select("*").eq("case_id", id!).order("created_at", { ascending: false }),
      supabase.from("conversations").select("*").eq("case_id", id!),
      supabase.from("ai_outputs").select("*").eq("case_id", id!).order("created_at", { ascending: false }),
    ]);

    setCaseData(cRes.data as any);
    setDocuments((dRes.data as any[]) ?? []);
    setConversations((cvRes.data as any[]) ?? []);
    setAiOutputs((aoRes.data as any[]) ?? []);

    // Fetch messages for all conversations
    if (cvRes.data && cvRes.data.length > 0) {
      const convIds = (cvRes.data as any[]).map((c: any) => c.id);
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: true });
      setMessages((msgs as any[]) ?? []);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-8 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!caseData) {
    return (
      <Layout>
        <div className="p-8 text-center">
          <p className="text-muted-foreground">Caso não encontrado.</p>
          <Button variant="outline" onClick={() => navigate("/")} className="mt-4">Voltar</Button>
        </div>
      </Layout>
    );
  }

  const status = getStatusInfo(caseData.status);
  const client = (caseData as any).clients;

  return (
    <Layout>
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        <button onClick={() => navigate("/")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        {/* Header */}
        <div className="bg-card border border-border rounded-xl p-5 mb-6 shadow-card">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold">{caseData.case_title}</h1>
              {client && <p className="text-sm text-muted-foreground mt-1">Cliente: {client.full_name} — {client.phone}</p>}
              {caseData.process_number && (
                <p className="text-xs text-muted-foreground font-mono mt-1">Processo: {caseData.process_number}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <CaseExportModal caseData={caseData} />
              <span className={`${status.color} text-xs font-semibold px-3 py-1 rounded-full text-foreground`}>
                {status.label}
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="summary">
          <TabsList className="bg-card border border-border mb-4 w-full justify-start">
            <TabsTrigger value="summary" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <ClipboardList className="w-4 h-4 mr-1.5" /> Resumo
            </TabsTrigger>
            <TabsTrigger value="documents" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <FileText className="w-4 h-4 mr-1.5" /> Documentos
            </TabsTrigger>
            <TabsTrigger value="conversations" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <MessageSquare className="w-4 h-4 mr-1.5" /> Conversas
            </TabsTrigger>
            <TabsTrigger value="generator" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Sparkles className="w-4 h-4 mr-1.5" /> Gerador IA
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary">
            <CaseSummaryTab caseData={caseData} documents={documents} aiOutputs={aiOutputs} onRefresh={fetchAll} />
          </TabsContent>
          <TabsContent value="documents">
            <DocumentsTab caseId={caseData.id} documents={documents} onRefresh={fetchAll} />
          </TabsContent>
          <TabsContent value="conversations">
            <ConversationsTab
              caseId={caseData.id}
              caseData={caseData}
              conversations={conversations}
              messages={messages}
              onRefresh={fetchAll}
            />
          </TabsContent>
          <TabsContent value="generator">
            <MessageGeneratorTab caseData={caseData} documents={documents} aiOutputs={aiOutputs} onRefresh={fetchAll} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
