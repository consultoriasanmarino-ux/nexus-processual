import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, User, Phone, Mail, Trash2, Trash } from "lucide-react";
import { toast } from "sonner";
import type { Client } from "@/lib/types";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PinConfirmDialog } from "@/components/PinConfirmDialog";

export default function Clients() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("clients").select("*").order("full_name").then(({ data }) => {
      setClients((data as Client[]) ?? []);
      setLoading(false);
    });
  }, [user]);

  const handleDeleteClient = async (clientId: string) => {
    setDeleting(clientId);
    // Check if client has cases
    const { data: clientCases } = await supabase.from("cases").select("id").eq("client_id", clientId);
    if (clientCases && clientCases.length > 0) {
      toast.error(`Este cliente possui ${clientCases.length} caso(s). Exclua os casos primeiro.`);
      setDeleting(null);
      return;
    }
    const { error } = await supabase.from("clients").delete().eq("id", clientId);
    if (error) toast.error("Erro ao excluir cliente.");
    else {
      toast.success("Cliente excluído.");
      setClients((prev) => prev.filter((c) => c.id !== clientId));
    }
    setDeleting(null);
  };

  const handleDeleteAll = async () => {
    // Check if any client has cases
    const { data: allCases } = await supabase.from("cases").select("client_id");
    const clientsWithCases = new Set((allCases ?? []).map((c) => c.client_id));
    const deletable = clients.filter((c) => !clientsWithCases.has(c.id));
    const blocked = clients.length - deletable.length;

    for (const c of deletable) {
      await supabase.from("clients").delete().eq("id", c.id);
    }
    setClients((prev) => prev.filter((c) => clientsWithCases.has(c.id)));
    if (blocked > 0) toast.info(`${blocked} cliente(s) com casos vinculados não foram excluídos.`);
    toast.success(`${deletable.length} cliente(s) excluído(s).`);
  };

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return c.full_name.toLowerCase().includes(q) || c.cpf_or_identifier?.toLowerCase().includes(q) || c.phone.includes(q);
  });

  return (
    <Layout>
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-1">Clientes</h1>
            <p className="text-sm text-muted-foreground">{clients.length} cliente(s)</p>
          </div>
          {clients.length > 0 && (
            <Button variant="outline" onClick={() => setShowDeleteAll(true)} className="text-destructive border-destructive/30 hover:bg-destructive/10">
              <Trash className="w-4 h-4 mr-2" /> Apagar Todos
            </Button>
          )}
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-card border-border" />
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-card border border-border animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <User className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((c) => (
              <div key={c.id} className="group bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gradient-gold flex items-center justify-center text-sm font-bold text-primary-foreground flex-shrink-0">
                  {c.full_name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{c.full_name}</p>
                  <div className="flex flex-wrap gap-3 mt-1">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{c.phone}</span>
                    {c.email && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{c.email}</span>}
                    {c.cpf_or_identifier && <span className="text-xs text-muted-foreground font-mono">CPF: {c.cpf_or_identifier}</span>}
                  </div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
                      <AlertDialogDescription>
                        O cliente <strong>{c.full_name}</strong> será excluído permanentemente. Clientes com casos vinculados não podem ser excluídos.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDeleteClient(c.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={deleting === c.id}
                      >
                        {deleting === c.id ? "Excluindo..." : "Excluir"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
        <PinConfirmDialog
          open={showDeleteAll}
          onOpenChange={setShowDeleteAll}
          title="Apagar todos os clientes?"
          description="Clientes sem casos vinculados serão excluídos permanentemente. Clientes com casos serão mantidos."
          onConfirm={handleDeleteAll}
        />
      </div>
    </Layout>
  );
}
