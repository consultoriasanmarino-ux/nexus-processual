import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, User, Phone, Mail, Trash2, Trash, Download, Upload, AlertTriangle, Ticket } from "lucide-react";
import { toast } from "sonner";
import type { RifaFicha } from "@/lib/types";
import { formatPhone, formatCPF } from "@/lib/utils";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PinConfirmDialog } from "@/components/PinConfirmDialog";

export default function RifaClients() {
    const { user } = useAuth();
    const [fichas, setFichas] = useState<RifaFicha[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [showDeleteAll, setShowDeleteAll] = useState(false);

    useEffect(() => {
        if (!user) return;
        supabase.from("rifa_fichas" as any).select("*").order("nome").then(({ data }) => {
            setFichas((data as any as RifaFicha[]) ?? []);
            setLoading(false);
        });
    }, [user]);

    const handleDeleteFicha = async (fichaId: string) => {
        setDeleting(fichaId);
        const { error } = await supabase.from("rifa_fichas" as any).delete().eq("id", fichaId);
        if (error) toast.error("Erro ao excluir ficha.");
        else {
            toast.success("Ficha excluída.");
            setFichas(prev => prev.filter(f => f.id !== fichaId));
        }
        setDeleting(null);
    };

    const handleDeleteAll = async () => {
        for (const f of fichas) {
            await supabase.from("rifa_fichas" as any).delete().eq("id", f.id);
        }
        setFichas([]);
        toast.success("Todas as fichas foram excluídas.");
    };

    const exportToFile = (content: string, filename: string) => {
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleExportPhones = () => {
        const withPhone = fichas.filter(f => f.celular && f.celular.trim().length > 0);
        if (withPhone.length === 0) {
            toast.error("Nenhuma ficha possui celular.");
            return;
        }
        const phones = withPhone.map(f => f.celular!.replace(/\D/g, "")).join("\n");
        exportToFile(phones, `celulares-rifas-${new Date().toISOString().split('T')[0]}.txt`);
        toast.success(`${withPhone.length} celular(es) exportado(s)!`);
    };

    const handleExportEmails = () => {
        const withEmail = fichas.filter(f => f.email && f.email.trim().length > 0);
        if (withEmail.length === 0) {
            toast.error("Nenhuma ficha possui email.");
            return;
        }
        const emails = withEmail.map(f => f.email!.trim()).join("\n");
        exportToFile(emails, `emails-rifas-${new Date().toISOString().split('T')[0]}.txt`);
        toast.success(`${withEmail.length} email(s) exportado(s)!`);
    };

    const handleExportNames = () => {
        if (fichas.length === 0) {
            toast.error("Nenhuma ficha cadastrada.");
            return;
        }
        const names = fichas.map(f => f.nome.trim()).join("\n");
        exportToFile(names, `nomes-rifas-${new Date().toISOString().split('T')[0]}.txt`);
        toast.success(`${fichas.length} nome(s) exportado(s)!`);
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

            // Find ficha by CPF
            const ficha = fichas.find(f => f.cpf?.replace(/\D/g, "") === cpfRaw);
            if (!ficha) {
                // Try matching by name
                const nameMatch = block.match(/NOME:\s*(.+)/i);
                const matchedName = nameMatch?.[1]?.trim();
                const fichaByName = matchedName ? fichas.find(f => f.nome.toLowerCase() === matchedName.toLowerCase()) : null;
                if (!fichaByName) { notFound++; continue; }
                // Update by name match
                const updateData = buildUpdateData(block, fichaByName);
                if (Object.keys(updateData).length > 0) {
                    await supabase.from("rifa_fichas" as any).update(updateData as any).eq("id", fichaByName.id);
                    updated++;
                }
                continue;
            }

            const updateData = buildUpdateData(block, ficha);
            if (Object.keys(updateData).length > 0) {
                await supabase.from("rifa_fichas" as any).update(updateData as any).eq("id", ficha.id);
                updated++;
            }
        }

        const { data } = await supabase.from("rifa_fichas" as any).select("*").order("nome");
        setFichas((data as any as RifaFicha[]) ?? []);
        toast.success(`${updated} ficha(s) atualizada(s).`);
        if (notFound > 0) toast.info(`${notFound} CPF(s) não encontrados na base.`);
        e.target.value = "";
    };

    const buildUpdateData = (block: string, ficha: RifaFicha) => {
        const nascMatch = block.match(/NASC:\s*([\d/]+)/);
        const rendaMatch = block.match(/RENDA:\s*(.+)/);
        const profMatch = block.match(/PROFISSÃO:\s*(.+)/);
        const veicMatch = block.match(/VEÍCULOS:\s*(.+)/);
        const banksMatch = block.match(/BANCOS:\s*([\s\S]+?)(?=CELULARES:|$)/);
        const celMatch = block.match(/CELULARES:\s*(.+)/);
        const cpfMatch = block.match(/CPF:\s*([\d.\-]+)/);

        const updateData: Record<string, any> = {};

        const nascVal = nascMatch?.[1]?.trim();
        if (nascVal && nascVal !== ficha.birth_date) updateData.birth_date = nascVal;

        const rendaVal = rendaMatch?.[1]?.trim();
        if (rendaVal && rendaVal !== "N/A" && rendaVal !== ficha.income) updateData.income = rendaVal;

        const profVal = profMatch?.[1]?.trim();
        if (profVal && profVal !== "N/A" && profVal !== ficha.profession) updateData.profession = profVal;

        const veicVal = veicMatch?.[1]?.trim();
        if (veicVal && veicVal !== "Nenhum" && veicVal !== "N/A" && veicVal !== ficha.vehicles) updateData.vehicles = veicVal;

        if (banksMatch) {
            const raw = banksMatch[1].split(/[,\n]/).map(b => b.trim()).filter(b => b && b !== "N/A" && b !== "null");
            const banksVal = [...new Set(raw)].join(", ") || null;
            if (banksVal && banksVal !== ficha.banks) updateData.banks = banksVal;
        }

        const newPhones = celMatch?.[1]?.match(/\(?\d[\d\s()-]+\d/g)?.map(p => p.trim()).filter(Boolean) ?? [];
        if (newPhones.length > 0) {
            const existingPhones = ficha.celular || "";
            const merged = [...new Set([existingPhones, ...newPhones].filter(Boolean))].join(", ");
            if (merged !== ficha.celular) updateData.celular = merged;
        }

        const cpfVal = cpfMatch?.[1]?.replace(/\D/g, "");
        if (cpfVal && !ficha.cpf) updateData.cpf = cpfVal;

        return updateData;
    };

    const filtered = fichas.filter(f => {
        const q = search.toLowerCase();
        return (
            f.nome.toLowerCase().includes(q) ||
            f.celular?.includes(q) ||
            f.email?.toLowerCase().includes(q) ||
            f.cpf?.includes(q)
        );
    });

    return (
        <Layout>
            <div className="p-4 md:p-8 max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
                            <Ticket className="w-6 h-6 text-emerald-400" />
                            Clientes Rifas
                        </h1>
                        <p className="text-sm text-muted-foreground">{fichas.length} ficha(s)</p>
                    </div>
                    {fichas.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                            <Button variant="outline" size="sm" onClick={handleExportPhones} className="text-xs">
                                <Download className="w-4 h-4 mr-1.5" /> Exportar Celulares
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleExportEmails} className="text-xs">
                                <Download className="w-4 h-4 mr-1.5" /> Exportar Emails
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleExportNames} className="text-xs">
                                <Download className="w-4 h-4 mr-1.5" /> Exportar Nomes
                            </Button>
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
                    <Input placeholder="Buscar ficha..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-card border-border" />
                </div>

                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-card border border-border animate-pulse" />)}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16">
                        <User className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">Nenhuma ficha encontrada.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map(f => (
                            <div key={f.id} className="group bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-sm font-bold text-emerald-400 flex-shrink-0">
                                    {f.nome[0]?.toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium">{f.nome}</p>
                                    <div className="flex flex-wrap gap-3 mt-1">
                                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                            <Phone className="w-3 h-3" />
                                            {formatPhone(f.celular || "") || "Sem celular"}
                                        </span>
                                        {f.email && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{f.email}</span>}
                                        {f.cpf ? (
                                            <span className="text-xs text-muted-foreground font-mono">CPF: {formatCPF(f.cpf)}</span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-[10px] text-amber-400">
                                                <AlertTriangle className="w-3 h-3" /> Sem CPF
                                            </span>
                                        )}
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
                                            <AlertDialogTitle>Excluir ficha?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                A ficha de <strong>{f.nome}</strong> será excluída permanentemente.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={() => handleDeleteFicha(f.id)}
                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                disabled={deleting === f.id}
                                            >
                                                {deleting === f.id ? "Excluindo..." : "Excluir"}
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
                    title="Apagar todas as fichas?"
                    description="Todas as fichas serão excluídas permanentemente."
                    onConfirm={handleDeleteAll}
                />
            </div>
        </Layout>
    );
}
