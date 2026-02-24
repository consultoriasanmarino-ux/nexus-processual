import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, User, Phone, Mail, Calendar, DollarSign, Briefcase, Car, Building2, FileText, Hash,
} from "lucide-react";
import { getStatusInfo } from "@/lib/types";
import type { Client, Case } from "@/lib/types";
import { formatPhone, formatCPF, formatCurrency, formatProcessNumber } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Edit2, Check, X } from "lucide-react";

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [client, setClient] = useState<Client | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCpf, setEditingCpf] = useState(false);
  const [tempCpf, setTempCpf] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    Promise.all([
      supabase.from("clients").select("*").eq("id", id).single(),
      supabase.from("cases").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    ]).then(([clientRes, casesRes]) => {
      const clientData = clientRes.data as Client | null;
      setClient(clientData);
      setTempCpf(clientData?.cpf_or_identifier || "");
      setCases((casesRes.data as Case[]) ?? []);
      setLoading(false);
    });
  }, [user, id]);

  const handleUpdateCpf = async () => {
    if (!id || !client) return;
    setSaving(true);
    const cleanCpf = tempCpf.replace(/\D/g, "");
    const { error } = await supabase.from("clients").update({ cpf_or_identifier: cleanCpf }).eq("id", id);
    if (error) {
      toast.error("Erro ao atualizar CPF.");
    } else {
      setClient({ ...client, cpf_or_identifier: cleanCpf });
      setEditingCpf(false);
      toast.success("CPF atualizado com sucesso!");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-8 max-w-4xl mx-auto">
          <div className="h-40 rounded-xl bg-card border border-border animate-pulse" />
        </div>
      </Layout>
    );
  }

  if (!client) {
    return (
      <Layout>
        <div className="p-8 max-w-4xl mx-auto text-center py-20">
          <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Cliente não encontrado.</p>
          <Link to="/clients"><Button variant="outline" className="mt-4"><ArrowLeft className="w-4 h-4 mr-2" /> Voltar</Button></Link>
        </div>
      </Layout>
    );
  }

  const infoItems = [
    { icon: FileText, label: "CPF", value: formatCPF(client.cpf_or_identifier) },
    { icon: Phone, label: "Telefone Consulta", value: formatPhone(client.phone) },
    { icon: Phone, label: "Telefone do Contrato", value: formatPhone(client.phone_contract) },
    { icon: Mail, label: "E-mail", value: client.email },
    { icon: Calendar, label: "Nascimento", value: client.birth_date },
    { icon: DollarSign, label: "Renda", value: client.income },
    { icon: Briefcase, label: "Profissão", value: client.profession },
    { icon: Car, label: "Veículos", value: client.vehicles },
    { icon: Building2, label: "Bancos", value: client.banks },
  ];

  return (
    <Layout>
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <Link to="/clients" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" /> Voltar para Clientes
        </Link>

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-full bg-gradient-gold flex items-center justify-center text-lg font-bold text-primary-foreground flex-shrink-0">
            {client.full_name[0]?.toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{client.full_name}</h1>
            <p className="text-sm text-muted-foreground">Cadastrado em {new Date(client.created_at).toLocaleDateString("pt-BR")}</p>
          </div>
        </div>

        {/* Client Info */}
        <div className="bg-card border border-border rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Dados do Cliente</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <FileText className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">CPF</p>
                {editingCpf ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      value={tempCpf}
                      onChange={(e) => setTempCpf(e.target.value)}
                      className="h-8 text-sm bg-secondary border-border"
                      autoFocus
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={handleUpdateCpf} disabled={saving}>
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => { setEditingCpf(false); setTempCpf(client.cpf_or_identifier || ""); }}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group/cpf">
                    <p className="text-sm font-medium break-words">{formatCPF(client.cpf_or_identifier) || "Sem CPF"}</p>
                    <button onClick={() => setEditingCpf(true)} className="p-1 opacity-0 group-hover/cpf:opacity-100 hover:text-primary transition-all">
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            {infoItems.slice(1).map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3">
                <Icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm font-medium break-words">{value || "Não informado"}</p>
                </div>
              </div>
            ))}
          </div>
          {client.notes && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground mb-1">Observações</p>
              <p className="text-sm">{client.notes}</p>
            </div>
          )}
        </div>

        {/* Linked Cases */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Casos Vinculados ({cases.length})
          </h2>
          {cases.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum caso vinculado.</p>
          ) : (
            <div className="space-y-3">
              {cases.map((c) => {
                const status = getStatusInfo(c.status);
                return (
                  <Link key={c.id} to={`/case/${c.id}`} className="block group">
                    <div className="border border-border rounded-lg p-4 hover:border-primary/40 hover:shadow-glow transition-all">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-sm font-semibold group-hover:text-primary transition-colors">{c.case_title}</h3>
                        <span className={`${status.color} text-[10px] font-semibold px-2 py-0.5 rounded-full text-foreground flex-shrink-0`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        {c.process_number && (
                          <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{formatProcessNumber(c.process_number)}</span>
                        )}
                        {c.defendant && (
                          <span>Réu: {c.defendant}</span>
                        )}
                        {c.case_value && (
                          <span>Valor: R$ {Number(c.case_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                        )}
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(c.created_at).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
