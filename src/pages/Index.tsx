import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Briefcase, User, Calendar, Hash, Trash2, AlertTriangle, Trash } from "lucide-react";
import { getStatusInfo, type Case } from "@/lib/types";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PinConfirmDialog } from "@/components/PinConfirmDialog";

export default function Index() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cases, setCases] = useState<Case[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchCases();
  }, [user]);

  const fetchCases = async () => {
    const { data } = await supabase
      .from("cases")
      .select("*, clients(full_name, cpf_or_identifier, phone)")
      .order("created_at", { ascending: false });
    setCases((data as any[]) ?? []);
    setLoading(false);
  };

  const handleDeleteCase = async (caseId: string) => {
    setDeleting(caseId);
    // Delete related data first (messages via conversations)
    const { data: convs } = await supabase.from("conversations").select("id").eq("case_id", caseId);
    if (convs && convs.length > 0) {
      const convIds = convs.map((c) => c.id);
      await supabase.from("messages").delete().in("conversation_id", convIds);
    }
    await supabase.from("conversations").delete().eq("case_id", caseId);
    await supabase.from("ai_outputs").delete().eq("case_id", caseId);
    await supabase.from("documents").delete().eq("case_id", caseId);
    const { error } = await supabase.from("cases").delete().eq("id", caseId);
    if (error) toast.error("Erro ao excluir caso.");
    else {
      toast.success("Caso excluído.");
      setCases((prev) => prev.filter((c) => c.id !== caseId));
    }
    setDeleting(null);
  };

  const handleDeleteAll = async () => {
    for (const c of cases) {
      await handleDeleteCase(c.id);
    }
    toast.success("Todos os casos foram excluídos.");
  };

  const filtered = cases.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.case_title?.toLowerCase().includes(q) ||
      c.process_number?.toLowerCase().includes(q) ||
      (c as any).clients?.full_name?.toLowerCase().includes(q) ||
      (c as any).clients?.cpf_or_identifier?.toLowerCase().includes(q)
    );
  });

  return (
    <Layout>
      <div className="p-4 md:p-8 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Casos</h1>
            <p className="text-sm text-muted-foreground mt-1">{cases.length} caso(s) registrados</p>
          </div>
          <div className="flex gap-2">
            {cases.length > 0 && (
              <Button variant="outline" onClick={() => setShowDeleteAll(true)} className="text-destructive border-destructive/30 hover:bg-destructive/10">
                <Trash className="w-4 h-4 mr-2" /> Apagar Todos
              </Button>
            )}
            <Button onClick={() => navigate("/new-case")} className="bg-gradient-gold hover:opacity-90 text-primary-foreground font-semibold">
              <Plus className="w-4 h-4 mr-2" /> Novo Caso
            </Button>
          </div>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CPF ou nº do processo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-card border-border"
          />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-44 rounded-xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Briefcase className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{search ? "Nenhum caso encontrado." : "Nenhum caso cadastrado ainda."}</p>
            {!search && (
              <Button onClick={() => navigate("/new-case")} variant="outline" className="mt-4">
                <Plus className="w-4 h-4 mr-2" /> Criar primeiro caso
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((c) => {
              const status = getStatusInfo(c.status);
              const client = (c as any).clients;
              return (
                <div key={c.id} className="relative group bg-card border border-border rounded-xl hover:border-primary/40 hover:shadow-glow transition-all animate-fade-in">
                  <Link to={`/case/${c.id}`} className="block p-5">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 pr-6">
                        {c.case_title}
                      </h3>
                      <span className={`${status.color} text-[10px] font-semibold px-2 py-0.5 rounded-full text-foreground`}>
                        {status.label}
                      </span>
                    </div>

                    {client && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                        <User className="w-3 h-3" />
                        <span>{client.full_name}</span>
                      </div>
                    )}

                    {c.process_number && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                        <Hash className="w-3 h-3" />
                        <span className="font-mono">{c.process_number}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      <span>{new Date(c.created_at).toLocaleDateString("pt-BR")}</span>
                    </div>

                    {client && !client.phone && (
                      <div className="flex items-center gap-1.5 text-[10px] text-destructive font-medium mt-2 bg-destructive/10 rounded-md px-2 py-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Sem telefone registrado</span>
                      </div>
                    )}
                  </Link>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir caso?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Todos os documentos, conversas e análises deste caso serão excluídos permanentemente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDeleteCase(c.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          disabled={deleting === c.id}
                        >
                          {deleting === c.id ? "Excluindo..." : "Excluir"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              );
            })}
          </div>
        )}
        <PinConfirmDialog
          open={showDeleteAll}
          onOpenChange={setShowDeleteAll}
          title="Apagar todos os casos?"
          description="Todos os casos, documentos, conversas e análises serão excluídos permanentemente."
          onConfirm={handleDeleteAll}
        />
      </div>
    </Layout>
  );
}
