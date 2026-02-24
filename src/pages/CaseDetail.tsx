import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, FileText, MessageSquare, Sparkles, ClipboardList, Edit2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { getStatusInfo, type Case, type Document, type Conversation, type Message, type AiOutput } from "@/lib/types";
import { CaseSummaryTab } from "@/components/CaseSummaryTab";
import { DocumentsTab } from "@/components/DocumentsTab";
import { ConversationsTab } from "@/components/ConversationsTab";
import { CaseExportModal } from "@/components/CaseExportModal";
import { formatPhone, formatProcessNumber } from "@/lib/utils";

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [aiOutputs, setAiOutputs] = useState<AiOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProcessNumber, setEditingProcessNumber] = useState(false);
  const [tempProcessNumber, setTempProcessNumber] = useState("");
  const [savingProcessNumber, setSavingProcessNumber] = useState(false);

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
    setTempProcessNumber(cRes.data?.process_number || "");
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

  const handleUpdateProcessNumber = async () => {
    if (!id || !caseData) return;
    setSavingProcessNumber(true);
    const { error } = await supabase
      .from("cases")
      .update({ process_number: tempProcessNumber })
      .eq("id", id);

    if (error) {
      toast.error("Erro ao atualizar número do processo.");
    } else {
      setCaseData({ ...caseData, process_number: tempProcessNumber });
      setEditingProcessNumber(false);
      toast.success("Número do processo atualizado!");
    }
    setSavingProcessNumber(false);
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
              {client && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                  <p className="text-sm font-medium text-foreground">
                    Autor: <span className="font-bold">{client.full_name}</span>
                  </p>

                  {client.phone_contract && (
                    <div className="flex items-center gap-1.5 text-xs bg-primary/10 text-primary-foreground px-2 py-0.5 rounded-md border border-primary/20">
                      <span className="font-semibold uppercase text-[10px]">Contrato:</span>
                      <span>{formatPhone(client.phone_contract)}</span>
                    </div>
                  )}

                  {client.phone && (
                    <div className="flex items-center gap-1.5 text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded-md border border-border">
                      <span className="font-semibold uppercase text-[10px]">Consulta:</span>
                      <span>{formatPhone(client.phone)}</span>
                    </div>
                  )}

                  {!client.phone && !client.phone_contract && (
                    <div className="flex items-center gap-1.5 text-[10px] text-destructive font-medium bg-destructive/10 rounded-md px-2 py-0.5 border border-destructive/20">
                      Sem telefone registrado
                    </div>
                  )}
                </div>
              )}
              {isAdmin && editingProcessNumber ? (
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    value={tempProcessNumber}
                    onChange={(e) => setTempProcessNumber(formatProcessNumber(e.target.value))}
                    className="h-7 text-xs font-mono bg-secondary border-border max-w-[240px]"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={handleUpdateProcessNumber} disabled={savingProcessNumber}>
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => { setEditingProcessNumber(false); setTempProcessNumber(caseData.process_number || ""); }}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group/process mt-1">
                  <p className="text-xs text-muted-foreground font-mono">Processo: {formatProcessNumber(caseData.process_number) || "Não informado"}</p>
                  {isAdmin && (
                    <button onClick={() => setEditingProcessNumber(true)} className="p-1 opacity-0 group-hover/process:opacity-100 hover:text-primary transition-all">
                      <Edit2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
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
          </TabsList>

          <TabsContent value="summary">
            <CaseSummaryTab caseData={caseData} documents={documents} aiOutputs={aiOutputs} onRefresh={fetchAll} />
          </TabsContent>
          <TabsContent value="documents">
            <DocumentsTab caseId={caseData.id} caseData={caseData} documents={documents} onRefresh={fetchAll} />
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
        </Tabs>
      </div>
    </Layout>
  );
}
