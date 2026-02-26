import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Ticket, User, Phone, Mail, AlertTriangle, Trash2, Trash, Eye, EyeOff, Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { getRifaStatusInfo, type RifaFicha } from "@/lib/types";
import { toast } from "sonner";
import { formatPhone, formatCPF } from "@/lib/utils";
import { PinConfirmDialog } from "@/components/PinConfirmDialog";
import * as XLSX from "xlsx";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

export default function RifaFichas() {
    const { user, isAdmin, isRifeiro, rifeiroInfo } = useAuth();
    const [fichas, setFichas] = useState<RifaFicha[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [showDeleteAll, setShowDeleteAll] = useState(false);
    const [markedFichas, setMarkedFichas] = useState<Set<string>>(new Set());
    const [showMarked, setShowMarked] = useState(true);
    const [importing, setImporting] = useState(false);
    const [selectedFicha, setSelectedFicha] = useState<RifaFicha | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);

    useEffect(() => {
        if (user) fetchFichas();
    }, [user, isRifeiro, rifeiroInfo?.id]);

    const fetchFichas = async () => {
        setLoading(true);
        const { data } = await supabase
            .from("rifa_fichas" as any)
            .select("*")
            .order("created_at", { ascending: false });
        setFichas((data as any as RifaFicha[]) ?? []);

        // Fetch marks if rifeiro
        if (isRifeiro && rifeiroInfo) {
            const { data: marks } = await supabase
                .from("rifeiro_ficha_marks" as any)
                .select("ficha_id")
                .eq("rifeiro_id", rifeiroInfo.id);
            if (marks) {
                setMarkedFichas(new Set((marks as any[]).map((m) => m.ficha_id)));
            }
        }
        setLoading(false);
    };

    // Toggle ficha mark (rifeiro only)
    const toggleMark = async (fichaId: string) => {
        if (!rifeiroInfo) return;
        const isMarked = markedFichas.has(fichaId);
        if (isMarked) {
            await supabase.from("rifeiro_ficha_marks" as any).delete().eq("rifeiro_id", rifeiroInfo.id).eq("ficha_id", fichaId);
            setMarkedFichas(prev => { const next = new Set(prev); next.delete(fichaId); return next; });
            toast.success("Ficha reativada.");
        } else {
            await supabase.from("rifeiro_ficha_marks" as any).insert({ rifeiro_id: rifeiroInfo.id, ficha_id: fichaId } as any);
            setMarkedFichas(prev => new Set(prev).add(fichaId));
            toast.success("Ficha marcada como concluída.");
        }
    };

    // Import XLSX
    const handleImportXlsx = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        setImporting(true);
        try {
            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(buffer, { type: "array" });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });

            if (rows.length === 0) {
                toast.error("Planilha vazia.");
                setImporting(false);
                return;
            }

            let imported = 0;
            let skipped = 0;

            for (const row of rows) {
                // Map columns from the spreadsheet
                const nome = (row.nome || row.Nome || row.name || row.Name || "").toString().trim();
                if (!nome) { skipped++; continue; }

                const source = (row.source || row.Source || row.fonte || "").toString().trim();
                const username = (row.username || row.Username || row.usuario || "").toString().trim();
                const celular = (row.celular || row.Celular || row.telefone || row.Telefone || row.phone || "").toString().trim();
                const email = (row.email || row.Email || row["e-mail"] || "").toString().trim();

                // Check if already exists by name + celular
                const { data: existing } = await supabase
                    .from("rifa_fichas" as any)
                    .select("id")
                    .eq("nome", nome)
                    .eq("celular", celular)
                    .limit(1);

                if (existing && existing.length > 0) {
                    skipped++;
                    continue;
                }

                await supabase.from("rifa_fichas" as any).insert({
                    user_id: user.id,
                    source: source || null,
                    username: username || null,
                    nome,
                    celular: celular || null,
                    email: email || null,
                    cpf: null,
                    status: "nova",
                });
                imported++;
            }

            toast.success(`Importação concluída! ${imported} fichas importadas. ${skipped > 0 ? `${skipped} ignoradas (vazias ou duplicadas).` : ""}`);
            fetchFichas();
        } catch (err: any) {
            console.error("Import error:", err);
            toast.error("Erro ao importar planilha: " + err.message);
        }
        setImporting(false);
        e.target.value = "";
    };

    // Delete ficha
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

    // Delete all
    const handleDeleteAll = async () => {
        for (const f of fichas) {
            await supabase.from("rifa_fichas" as any).delete().eq("id", f.id);
        }
        setFichas([]);
        toast.success("Todas as fichas foram excluídas.");
    };

    // Filter
    const filtered = useMemo(() => {
        let list = fichas;

        if (isRifeiro && !showMarked) {
            list = list.filter(f => !markedFichas.has(f.id));
        }

        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(f =>
                f.nome.toLowerCase().includes(q) ||
                f.celular?.includes(q) ||
                f.email?.toLowerCase().includes(q) ||
                f.username?.toLowerCase().includes(q) ||
                f.cpf?.includes(q)
            );
        }
        return list;
    }, [fichas, search, isRifeiro, showMarked, markedFichas]);

    const markedCount = markedFichas.size;
    const pendingCount = fichas.length - markedCount;

    return (
        <Layout>
            <div className="p-4 md:p-8 max-w-6xl mx-auto">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Ticket className="w-6 h-6 text-emerald-400" />
                            Fichas de Rifas
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {fichas.length} ficha(s) registrada(s)
                            {isRifeiro && markedCount > 0 && (
                                <span className="ml-2 text-[10px] bg-muted/50 px-2 py-0.5 rounded-full">
                                    {pendingCount} pendente(s) · {markedCount} concluída(s)
                                </span>
                            )}
                        </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {isRifeiro && markedCount > 0 && (
                            <Button
                                variant="outline"
                                onClick={() => setShowMarked(!showMarked)}
                                className={`text-xs ${!showMarked ? "border-emerald-500/40 text-emerald-300" : "border-border text-muted-foreground"}`}
                            >
                                {showMarked ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                                {showMarked ? "Ocultar Concluídas" : "Mostrar Todas"}
                            </Button>
                        )}
                        {isAdmin && (
                            <>
                                {fichas.length > 0 && (
                                    <Button variant="outline" onClick={() => setShowDeleteAll(true)} className="text-destructive border-destructive/30 hover:bg-destructive/10">
                                        <Trash className="w-4 h-4 mr-2" /> Apagar Todas
                                    </Button>
                                )}
                                <label>
                                    <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportXlsx} />
                                    <Button variant="outline" className="text-xs cursor-pointer border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" asChild disabled={importing}>
                                        <span>
                                            {importing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-1.5" />}
                                            Importar .xlsx
                                        </span>
                                    </Button>
                                </label>
                            </>
                        )}
                    </div>
                </div>

                {/* Search */}
                <div className="relative mb-6">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por nome, celular, email, username..."
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
                        <Ticket className="w-12 h-12 text-muted-foreground mb-4" />
                        <p className="text-muted-foreground">{search ? "Nenhuma ficha encontrada." : "Nenhuma ficha cadastrada."}</p>
                        {!search && isAdmin && (
                            <label className="mt-4">
                                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportXlsx} />
                                <Button variant="outline" className="cursor-pointer" asChild>
                                    <span><Upload className="w-4 h-4 mr-2" /> Importar primeira planilha</span>
                                </Button>
                            </label>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filtered.map((ficha) => {
                            const status = getRifaStatusInfo(ficha.status);
                            const isMarked = isRifeiro && markedFichas.has(ficha.id);
                            const hasCpf = ficha.cpf && ficha.cpf.trim().length > 0;
                            const hasPhone = ficha.celular && ficha.celular.trim().length > 0;

                            return (
                                <div
                                    key={ficha.id}
                                    className={`relative group bg-gradient-to-br from-emerald-500/15 to-emerald-600/5 border border-emerald-500/30 rounded-xl hover:shadow-lg transition-all animate-fade-in ${isMarked ? "opacity-50" : ""}`}
                                >
                                    <div
                                        onClick={() => setSelectedFicha(ficha)}
                                        className="block p-5 cursor-pointer"
                                    >
                                        {/* Status */}
                                        <div className="flex items-center gap-1.5 mb-3">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                                                {ficha.source || "Ficha"}
                                            </span>
                                            <span className={`ml-auto ${status.color} text-[10px] font-semibold px-2 py-0.5 rounded-full text-foreground`}>
                                                {status.label}
                                            </span>
                                        </div>

                                        {/* Name */}
                                        <div className="flex items-center gap-2 text-xs mb-2">
                                            <User className="w-4 h-4 text-emerald-400/60" />
                                            <span className="font-bold text-foreground truncate">{ficha.nome}</span>
                                        </div>

                                        {/* Username */}
                                        {ficha.username && (
                                            <p className="text-[10px] text-muted-foreground ml-6 -mt-1 mb-1.5">@{ficha.username}</p>
                                        )}

                                        {/* Phone */}
                                        {hasPhone && (
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                                                <Phone className="w-3 h-3" />
                                                <span>{formatPhone(ficha.celular!)}</span>
                                            </div>
                                        )}

                                        {/* Email */}
                                        {ficha.email && (
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                                                <Mail className="w-3 h-3" />
                                                <span className="truncate">{ficha.email}</span>
                                            </div>
                                        )}

                                        {/* Warnings */}
                                        {!hasCpf && (
                                            <div className="flex items-center gap-1.5 text-[10px] text-amber-400 font-medium mt-2 bg-amber-500/10 rounded-md px-2 py-1">
                                                <AlertTriangle className="w-3 h-3" />
                                                <span>CPF não informado</span>
                                            </div>
                                        )}

                                        {!hasPhone && (
                                            <div className="flex items-center gap-1.5 text-[10px] text-destructive font-medium mt-1.5 bg-destructive/10 rounded-md px-2 py-1">
                                                <AlertTriangle className="w-3 h-3" />
                                                <span>Sem celular registrado</span>
                                            </div>
                                        )}

                                        {isMarked && (
                                            <span className="text-[9px] bg-muted/40 text-muted-foreground px-1.5 py-0.5 rounded-full font-bold uppercase mt-2 inline-block">
                                                Concluída
                                            </span>
                                        )}
                                    </div>

                                    {/* Mark button for rifeiro */}
                                    {isRifeiro && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); toggleMark(ficha.id); }}
                                            className={`absolute top-2 right-2 text-[8px] font-bold uppercase px-2 py-1 rounded-lg border transition-all ${isMarked
                                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                                : "bg-muted/30 text-muted-foreground border-border hover:bg-emerald-500/10 hover:text-emerald-400"
                                                }`}
                                        >
                                            {isMarked ? "✓ Feita" : "Marcar"}
                                        </button>
                                    )}

                                    {/* Admin delete */}
                                    {isAdmin && (
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
                                                    <AlertDialogTitle>Excluir ficha?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        A ficha de <strong>{ficha.nome}</strong> será excluída permanentemente.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => handleDeleteFicha(ficha.id)}
                                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                        disabled={deleting === ficha.id}
                                                    >
                                                        {deleting === ficha.id ? "Excluindo..." : "Excluir"}
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Ficha Detail Dialog */}
                <Dialog open={!!selectedFicha} onOpenChange={(open) => !open && setSelectedFicha(null)}>
                    <DialogContent className="max-w-lg bg-[#0a0a0c] border-emerald-500/20 shadow-2xl">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold flex items-center gap-2">
                                <Ticket className="w-5 h-5 text-emerald-400" />
                                Detalhes da Ficha
                            </DialogTitle>
                            <DialogDescription>Dados importados da planilha.</DialogDescription>
                        </DialogHeader>

                        {selectedFicha && (
                            <div className="space-y-4 mt-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <DetailItem label="Nome" value={selectedFicha.nome} />
                                    <DetailItem label="Username" value={selectedFicha.username ? `@${selectedFicha.username}` : null} />
                                    <DetailItem label="Celular" value={selectedFicha.celular ? formatPhone(selectedFicha.celular) : null} />
                                    <DetailItem label="Email" value={selectedFicha.email} />
                                    <DetailItem label="CPF" value={selectedFicha.cpf ? formatCPF(selectedFicha.cpf) : null} warn={!selectedFicha.cpf} warnText="CPF ausente" />
                                    <DetailItem label="Fonte" value={selectedFicha.source} />
                                    <DetailItem label="Data Nascimento" value={selectedFicha.birth_date} warn={!selectedFicha.birth_date} warnText="Não informada" />
                                    <DetailItem label="Renda" value={selectedFicha.income} warn={!selectedFicha.income} warnText="Não informada" />
                                    <DetailItem label="Profissão" value={selectedFicha.profession} warn={!selectedFicha.profession} warnText="Não informada" />
                                    <DetailItem label="Veículos" value={selectedFicha.vehicles} warn={!selectedFicha.vehicles} warnText="Não informado" />
                                    <DetailItem label="Bancos" value={selectedFicha.banks} warn={!selectedFicha.banks} warnText="Não informado" />
                                    <DetailItem label="Outros Telefones" value={selectedFicha.phones_extra} />
                                </div>

                                {selectedFicha.notes && (
                                    <div className="bg-secondary/30 border border-border rounded-lg p-3">
                                        <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Observações</p>
                                        <p className="text-xs text-foreground">{selectedFicha.notes}</p>
                                    </div>
                                )}

                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                    <span>Criada em {new Date(selectedFicha.created_at).toLocaleString("pt-BR")}</span>
                                    <span className={`ml-auto ${getRifaStatusInfo(selectedFicha.status).color} text-foreground px-2 py-0.5 rounded-full font-bold`}>
                                        {getRifaStatusInfo(selectedFicha.status).label}
                                    </span>
                                </div>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>

                {isAdmin && (
                    <PinConfirmDialog
                        open={showDeleteAll}
                        onOpenChange={setShowDeleteAll}
                        title="Apagar todas as fichas?"
                        description="Todas as fichas serão excluídas permanentemente."
                        onConfirm={handleDeleteAll}
                    />
                )}
            </div>
        </Layout>
    );
}

function DetailItem({ label, value, warn, warnText }: { label: string; value: string | null | undefined; warn?: boolean; warnText?: string }) {
    return (
        <div className="bg-secondary/20 border border-border/50 rounded-lg px-3 py-2">
            <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">{label}</p>
            {value ? (
                <p className="text-xs font-medium text-foreground mt-0.5 truncate">{value}</p>
            ) : warn ? (
                <p className="text-[10px] text-amber-400 flex items-center gap-1 mt-0.5">
                    <AlertTriangle className="w-3 h-3" />
                    {warnText || "Não informado"}
                </p>
            ) : (
                <p className="text-[10px] text-muted-foreground mt-0.5">—</p>
            )}
        </div>
    );
}
