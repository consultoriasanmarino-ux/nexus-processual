import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, User, Phone, Mail, Trash2, Trash, Download, Upload, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { Client } from "@/lib/types";
import { formatPhone, formatCPF } from "@/lib/utils";
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

  const handleExportAllCpfs = () => {
    // Export CPFs of all clients EXCEPT those who already have phone (telefone de consulta),
    // because those already had leads imported. Clients with only phone_contract are included.
    const eligibleClients = clients.filter((c) => {
      const consultaPhone = (c.phone || "").replace(/\D/g, "");
      return consultaPhone.length === 0;
    });

    if (eligibleClients.length === 0) {
      toast.info("Todos os clientes já possuem telefone de consulta (leads já importados).");
      return;
    }

    const withCpf = eligibleClients.filter(c => c.cpf_or_identifier && c.cpf_or_identifier.replace(/\D/g, "").length > 0);
    const missingCpf = eligibleClients.length - withCpf.length;

    if (withCpf.length === 0) {
      toast.error(`${eligibleClients.length} clientes elegíveis não possuem CPF cadastrado.`);
      return;
    }

    const cpfs = withCpf
      .map((c) => c.cpf_or_identifier!.replace(/\D/g, ""))
      .join("\n");

    const blob = new Blob([cpfs], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cpfs-para-consulta-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    if (missingCpf > 0) {
      toast.success(`${withCpf.length} CPF(s) exportado(s). ${missingCpf} cliente(s) ignorados por falta de CPF.`);
    } else {
      toast.success(`${withCpf.length} CPF(s) exportado(s) para consulta.`);
    }
  };

  const handleUploadPhones = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const blocks = text.split(/[-]{5,}/).filter((b) => b.trim());
    let updated = 0;
    for (const block of blocks) {
      const cpfMatch = block.match(/CPF:\s*([\d.\-]+)/);
      if (!cpfMatch) continue;
      const cpf = cpfMatch[1].replace(/\D/g, "");
      const phoneMatches = block.match(/(?:- |\n\s*)(\(?\d[\d\s()-]+\d)/g);
      if (!phoneMatches || phoneMatches.length === 0) continue;
      const phones = phoneMatches.map((p) => p.replace(/^[\s-]+/, "").trim()).filter(Boolean);
      const client = clients.find((c) => c.cpf_or_identifier?.replace(/\D/g, "") === cpf);
      if (!client) continue;
      const existingPhones = client.phone ? client.phone.split(/[,;]\s*/).filter(Boolean) : [];
      const allPhones = [...new Set([...existingPhones, ...phones])].slice(0, 5);
      const newPhone = allPhones.join(", ");
      if (newPhone !== client.phone) {
        await supabase.from("clients").update({ phone: newPhone }).eq("id", client.id);
        updated++;
      }
    }
    const { data } = await supabase.from("clients").select("*").order("full_name");
    setClients((data as Client[]) ?? []);
    toast.success(`${updated} cliente(s) atualizado(s) com novos telefones.`);
    e.target.value = "";
  };

  const handleImportLeads = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const blocks = text.split(/[-]{5,}/).filter((b) => b.trim());
    let updated = 0;
    let notFound = 0;

    for (const block of blocks) {
      const cpfMatch = block.match(/CPF:\s*([\d.\-]+)/);
      if (!cpfMatch) continue;
      const cpfRaw = cpfMatch[1].replace(/\D/g, "");
      if (!cpfRaw) continue;

      const client = clients.find((c) => c.cpf_or_identifier?.replace(/\D/g, "") === cpfRaw);
      if (!client) { notFound++; continue; }

      const getValue = (key: string) => {
        const match = block.match(new RegExp(`${key}:\\s*(.+?)(?=\\n[A-ZÀ-Ú]+:|$)`, "s"));
        const val = match?.[1]?.trim();
        return val && val !== "N/A" && val !== "Nenhum" ? val : null;
      };

      const nascMatch = block.match(/NASC:\s*([\d/]+)/);
      const rendaMatch = block.match(/RENDA:\s*(.+)/);
      const profMatch = block.match(/PROFISSÃO:\s*(.+)/);

      // Collect phones from CELULARES line
      const celMatch = block.match(/CELULARES:\s*(.+)/);
      const newPhones = celMatch?.[1]?.match(/\(?\d[\d\s()-]+\d/g)?.map((p) => p.trim()).filter(Boolean) ?? [];
      const existingPhones = client.phone ? client.phone.split(/[,;]\s*/).filter(Boolean) : [];
      const mergedPhones = [...new Set([...existingPhones, ...newPhones])].slice(0, 5).join(", ");

      // Collect vehicles
      const veicMatch = block.match(/VEÍCULOS:\s*(.+)/);
      const vehicles = veicMatch?.[1]?.trim();
      const vehiclesVal = vehicles && vehicles !== "Nenhum" && vehicles !== "N/A" ? vehicles : null;

      // Collect banks (may span multiple lines until CELULARES)
      const banksMatch = block.match(/BANCOS:\s*([\s\S]+?)(?=CELULARES:|$)/);
      let banksVal: string | null = null;
      if (banksMatch) {
        const raw = banksMatch[1]
          .split(/[,\n]/)
          .map((b) => b.trim())
          .filter((b) => b && b !== "N/A" && b !== "null" && !b.startsWith("Agência"));
        banksVal = [...new Set(raw)].join(", ") || null;
      }

      const nascVal = nascMatch?.[1]?.trim() || null;
      const rendaVal = rendaMatch?.[1]?.trim();
      const rendaFinal = rendaVal && rendaVal !== "N/A" ? rendaVal : null;
      const profVal = profMatch?.[1]?.trim();
      const profFinal = profVal && profVal !== "N/A" && profVal !== "" ? profVal : null;

      const updateData: Record<string, any> = {};
      if (nascVal && nascVal !== client.birth_date) updateData.birth_date = nascVal;
      if (rendaFinal && rendaFinal !== client.income) updateData.income = rendaFinal;
      if (profFinal && profFinal !== client.profession) updateData.profession = profFinal;
      if (vehiclesVal && vehiclesVal !== client.vehicles) updateData.vehicles = vehiclesVal;
      if (banksVal && banksVal !== client.banks) updateData.banks = banksVal;
      if (mergedPhones && mergedPhones !== client.phone) updateData.phone = mergedPhones;

      if (Object.keys(updateData).length > 0) {
        await supabase.from("clients").update(updateData).eq("id", client.id);
        updated++;
      }
    }

    const { data } = await supabase.from("clients").select("*").order("full_name");
    setClients((data as Client[]) ?? []);
    toast.success(`${updated} cliente(s) atualizado(s).`);
    if (notFound > 0) toast.info(`${notFound} CPF(s) não encontrados na base.`);
    e.target.value = "";
  };

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.full_name.toLowerCase().includes(q) ||
      c.cpf_or_identifier?.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.phone_contract && c.phone_contract.includes(q))
    );
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
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleExportAllCpfs} className="text-xs">
                <Download className="w-4 h-4 mr-1.5" /> Exportar CPFs p/ Consulta
              </Button>
              <label>
                <input type="file" accept=".txt" className="hidden" onChange={handleUploadPhones} />
                <Button variant="outline" size="sm" className="text-xs cursor-pointer" asChild>
                  <span><Upload className="w-4 h-4 mr-1.5" /> Importar telefones</span>
                </Button>
              </label>
              <label>
                <input type="file" accept=".txt" className="hidden" onChange={handleImportLeads} />
                <Button variant="outline" size="sm" className="text-xs cursor-pointer" asChild>
                  <span><Upload className="w-4 h-4 mr-1.5" /> Importar Leads</span>
                </Button>
              </label>
              <Button variant="outline" onClick={() => setShowDeleteAll(true)} className="text-destructive border-destructive/30 hover:bg-destructive/10">
                <Trash className="w-4 h-4 mr-2" /> Apagar Todos
              </Button>
            </div>
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
                <Link to={`/client/${c.id}`} className="flex-1 min-w-0 hover:opacity-80 transition-opacity cursor-pointer">
                  <p className="text-sm font-medium hover:text-primary transition-colors">{c.full_name}</p>
                  <div className="flex flex-wrap gap-3 mt-1">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="w-3 h-3" />
                      {formatPhone(c.phone_contract || c.phone) || "Sem telefone"}
                    </span>
                    {c.email && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{c.email}</span>}
                    {c.cpf_or_identifier && <span className="text-xs text-muted-foreground font-mono">CPF: {formatCPF(c.cpf_or_identifier)}</span>}
                  </div>
                </Link>
                <Link to={`/client/${c.id}`} className="text-muted-foreground hover:text-primary transition-colors flex-shrink-0">
                  <ChevronRight className="w-4 h-4" />
                </Link>
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
