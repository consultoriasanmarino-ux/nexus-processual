import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Save, Loader2, Scale, UserCheck, Headphones, ShieldCheck, Phone, Check, Key, Sparkles, Pencil, CheckSquare, Square, AlertTriangle, Settings as SettingsIcon, Database } from "lucide-react";
import { toast } from "sonner";
import type { Lawyer, Caller } from "@/lib/types";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

type SettingsTab = "advogados" | "tecladores" | "api_keys" | "sistema";

export default function Settings() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<SettingsTab>("advogados");

    // Database Cleaning state
    const [cleaning, setCleaning] = useState(false);
    const [cleanStats, setCleanStats] = useState({ total: 0, updated: 0 });

    const handleDatabaseCleanup = async () => {
        if (!confirm("Isso irá formatar e limpar os números de telefone de TODOS os clientes para o formato WhatsApp. Continuar?")) return;
        setCleaning(true);
        try {
            const { data: clients } = await supabase.from("clients").select("id, phone, phone_contract");
            if (!clients) return;

            setCleanStats({ total: clients.length, updated: 0 });
            let updatedCount = 0;

            for (const client of clients) {
                const smartClean = (val: string) => {
                    if (!val) return "";
                    // Pega apenas dígitos e organiza em blocos de 10 ou 11
                    const digits = val.replace(/\D/g, "");
                    if (digits.length <= 11) return digits;

                    const normalized: string[] = [];
                    let remaining = digits;
                    while (remaining.length >= 10) {
                        const isMobile = remaining.length >= 11 && remaining[2] === "9";
                        const size = isMobile ? 11 : 10;
                        normalized.push(remaining.substring(0, size));
                        remaining = remaining.substring(size);
                    }
                    return normalized.join(" "); // Separa por espaço para não virar um blocão
                };

                const p1 = smartClean(client.phone || "");
                const p2 = smartClean(client.phone_contract || "");

                if (p1 !== client.phone || p2 !== client.phone_contract) {
                    await supabase.from("clients").update({
                        phone: p1,
                        phone_contract: p2
                    }).eq("id", client.id);
                    updatedCount++;
                    setCleanStats(prev => ({ ...prev, updated: updatedCount }));
                }
            }
            toast.success(`Limpeza concluída! ${updatedCount} clientes atualizados.`);
        } catch (err) {
            console.error(err);
            toast.error("Erro na limpeza.");
        } finally {
            setCleaning(false);
        }
    };

    // Lawyers state
    const [lawyers, setLawyers] = useState<Lawyer[]>([]);
    const [loadingLawyers, setLoadingLawyers] = useState(true);
    const [name, setName] = useState("");
    const [oab, setOab] = useState("");
    const [specialty, setSpecialty] = useState("");
    const [savingLawyer, setSavingLawyer] = useState(false);

    // Callers state
    const [callers, setCallers] = useState<Caller[]>([]);
    const [loadingCallers, setLoadingCallers] = useState(true);
    const [callerName, setCallerName] = useState("");
    const [callerPin, setCallerPin] = useState("");
    const [callerLawyerIds, setCallerLawyerIds] = useState<string[]>([]);
    const [savingCaller, setSavingCaller] = useState(false);
    const [editingCaller, setEditingCaller] = useState<Caller | null>(null);
    const [editName, setEditName] = useState("");
    const [editPin, setEditPin] = useState("");
    const [editLawyerIds, setEditLawyerIds] = useState<string[]>([]);
    const [updatingCaller, setUpdatingCaller] = useState(false);

    // API Keys state
    const [apiKeys, setApiKeys] = useState<{ id: string; key_value: string; created_at: string }[]>([]);
    const [newKey, setNewKey] = useState("");
    const [loadingKeys, setLoadingKeys] = useState(true);
    const [savingKey, setSavingKey] = useState(false);

    useEffect(() => {
        if (user) {
            fetchLawyers();
            fetchCallers();
            fetchApiKeys();
        }
    }, [user]);

    // ========== API KEYS ==========
    const fetchApiKeys = async () => {
        const { data } = await supabase
            .from("gemini_api_keys" as any)
            .select("*")
            .order("created_at", { ascending: true });
        setApiKeys((data as any[]) ?? []);
        setLoadingKeys(false);
    };

    const handleAddKey = async () => {
        if (!newKey.trim()) { toast.error("A chave não pode estar vazia."); return; }
        if (!user) return;
        setSavingKey(true);
        const { error } = await supabase.from("gemini_api_keys" as any).insert({
            key_value: newKey.trim(),
            user_id: user.id
        });
        if (error) toast.error("Erro ao salvar chave de API.");
        else { toast.success("Chave de API salva!"); setNewKey(""); fetchApiKeys(); }
        setSavingKey(false);
    };

    const handleDeleteKey = async (id: string) => {
        const { error } = await supabase.from("gemini_api_keys" as any).delete().eq("id", id);
        if (error) toast.error("Erro ao excluir chave.");
        else { toast.success("Chave removida."); setApiKeys((prev) => prev.filter((k) => k.id !== id)); }
    };

    // ========== LAWYERS ==========
    const fetchLawyers = async () => {
        const { data } = await supabase
            .from("lawyers" as any)
            .select("*")
            .order("created_at", { ascending: true });
        setLawyers((data as any as Lawyer[]) ?? []);
        setLoadingLawyers(false);
    };

    const handleAddLawyer = async () => {
        if (!name.trim()) { toast.error("Nome do advogado é obrigatório."); return; }
        if (!user) return;
        setSavingLawyer(true);
        const { error } = await supabase.from("lawyers" as any).insert({
            user_id: user.id, name: name.trim(), oab: oab.trim() || null, specialty: specialty.trim() || null,
        });
        if (error) toast.error("Erro ao cadastrar advogado.");
        else { toast.success("Advogado cadastrado!"); setName(""); setOab(""); setSpecialty(""); fetchLawyers(); }
        setSavingLawyer(false);
    };

    // Nuclear Delete state
    const [deletingLawyerId, setDeletingLawyerId] = useState<string | null>(null);
    const [isDeletingNuclear, setIsDeletingNuclear] = useState(false);

    const handleDeleteLawyer = async () => {
        if (!deletingLawyerId || !user) return;

        setIsDeletingNuclear(true);
        try {
            // 1. Get all cases for this lawyer
            const { data: lawyerCases } = await supabase
                .from("cases")
                .select("id, client_id")
                .eq("lawyer_id", deletingLawyerId);

            const caseIds = lawyerCases?.map(c => c.id) || [];
            const clientIds = Array.from(new Set(lawyerCases?.map(c => c.client_id).filter(Boolean) || []));

            if (caseIds.length > 0) {
                // 2. Delete documents (and try to delete from storage if possible, though bulk storage delete is harder)
                // For now, delete from DB
                await supabase.from("documents").delete().in("case_id", caseIds);

                // 3. Delete messages and conversations
                const { data: convs } = await supabase.from("conversations").select("id").in("case_id", caseIds);
                const convIds = convs?.map(c => c.id) || [];
                if (convIds.length > 0) {
                    await supabase.from("messages").delete().in("conversation_id", convIds);
                }
                await supabase.from("conversations").delete().in("case_id", caseIds);

                // 4. Delete cases
                await supabase.from("cases").delete().in("id", caseIds);

                // 5. Delete clients only if they have no other cases? 
                // The user was emphatic: "apaga todos os casos e clientes também! Tudo!"
                // To be safe and follow instructions: delete these clients.
                if (clientIds.length > 0) {
                    await supabase.from("clients").delete().in("id", clientIds);
                }
            }

            // 6. Update callers to remove this lawyer ID from their array
            const { data: allCallers } = await supabase.from("callers" as any).select("*");
            if (allCallers) {
                for (const caller of allCallers) {
                    if (caller.lawyer_ids?.includes(deletingLawyerId)) {
                        const newIds = caller.lawyer_ids.filter((id: string) => id !== deletingLawyerId);
                        await supabase
                            .from("callers" as any)
                            .update({ lawyer_ids: newIds } as any)
                            .eq("id", caller.id);
                    }
                }
            }

            // 7. Finally, delete the lawyer
            const { error } = await supabase.from("lawyers" as any).delete().eq("id", deletingLawyerId);

            if (error) throw error;

            toast.success("Advogado e todos os dados vinculados foram apagados!");
            setLawyers((prev) => prev.filter((l) => l.id !== deletingLawyerId));
            setDeletingLawyerId(null);
            fetchCallers(); // Refresh callers list too
        } catch (err: any) {
            console.error(err);
            toast.error("Erro ao realizar limpeza completa.");
        } finally {
            setIsDeletingNuclear(false);
        }
    };

    // ========== CALLERS ==========
    const fetchCallers = async () => {
        const { data } = await supabase
            .from("callers" as any)
            .select("*")
            .order("created_at", { ascending: true });
        setCallers((data as any as Caller[]) ?? []);
        setLoadingCallers(false);
    };

    const handleAddCaller = async () => {
        if (!callerName.trim()) { toast.error("Nome do teclador é obrigatório."); return; }
        if (!callerPin || callerPin.length !== 6 || !/^\d{6}$/.test(callerPin)) {
            toast.error("O PIN deve ter exatamente 6 dígitos numéricos."); return;
        }
        if (callerPin === "171033") {
            toast.error("Este PIN é reservado para o admin."); return;
        }
        // Check for duplicate PINs
        const existing = callers.find((c) => c.pin === callerPin);
        if (existing) { toast.error(`PIN já em uso por: ${existing.name}`); return; }
        if (callerLawyerIds.length === 0) { toast.error("Selecione ao menos um advogado para o teclador."); return; }
        if (!user) return;

        setSavingCaller(true);
        const { error } = await supabase.from("callers" as any).insert({
            user_id: user.id,
            name: callerName.trim(),
            pin: callerPin,
            lawyer_ids: callerLawyerIds,
            active: true,
        });
        if (error) { toast.error("Erro ao cadastrar teclador."); console.error(error); }
        else {
            toast.success("Teclador cadastrado!");
            setCallerName(""); setCallerPin(""); setCallerLawyerIds([]);
            fetchCallers();
        }
        setSavingCaller(false);
    };

    const handleDeleteCaller = async (id: string) => {
        const { error } = await supabase.from("callers" as any).delete().eq("id", id);
        if (error) toast.error("Erro ao excluir teclador.");
        else { toast.success("Teclador removido."); setCallers((prev) => prev.filter((c) => c.id !== id)); }
    };

    const handleToggleCallerActive = async (caller: Caller) => {
        const { error } = await supabase
            .from("callers" as any)
            .update({ active: !caller.active } as any)
            .eq("id", caller.id);
        if (error) toast.error("Erro ao atualizar status.");
        else {
            setCallers((prev) => prev.map((c) => c.id === caller.id ? { ...c, active: !c.active } : c));
            toast.success(caller.active ? "Teclador desativado." : "Teclador reativado.");
        }
    };

    const handleOpenEditCaller = (caller: Caller) => {
        setEditingCaller(caller);
        setEditName(caller.name);
        setEditPin(caller.pin);
        setEditLawyerIds(caller.lawyer_ids || []);
    };

    const handleUpdateCaller = async () => {
        if (!editingCaller) return;
        if (!editName.trim()) { toast.error("Nome é obrigatório."); return; }
        if (editPin.length !== 6) { toast.error("PIN deve ter 6 dígitos."); return; }
        if (editLawyerIds.length === 0) { toast.error("Selecione ao menos um advogado."); return; }

        setUpdatingCaller(true);
        const { error } = await supabase
            .from("callers" as any)
            .update({
                name: editName.trim(),
                pin: editPin,
                lawyer_ids: editLawyerIds,
            } as any)
            .eq("id", editingCaller.id);

        if (error) { toast.error("Erro ao atualizar teclador."); console.error(error); }
        else {
            toast.success("Teclador atualizado!");
            setEditingCaller(null);
            fetchCallers();
        }
        setUpdatingCaller(false);
    };

    const toggleCallerLawyer = (lawyerId: string, isEdit: boolean = false) => {
        if (isEdit) {
            setEditLawyerIds((prev) =>
                prev.includes(lawyerId)
                    ? prev.filter((id) => id !== lawyerId)
                    : [...prev, lawyerId]
            );
        } else {
            setCallerLawyerIds((prev) =>
                prev.includes(lawyerId)
                    ? prev.filter((id) => id !== lawyerId)
                    : [...prev, lawyerId]
            );
        }
    };

    const selectAllLawyers = (isEdit: boolean = false) => {
        const allIds = ["geral", ...lawyers.map(l => l.id)];
        if (isEdit) setEditLawyerIds(allIds);
        else setCallerLawyerIds(allIds);
        toast.info("Todos selecionados.");
    };

    const deselectAllLawyers = (isEdit: boolean = false) => {
        if (isEdit) setEditLawyerIds([]);
        else setCallerLawyerIds([]);
        toast.info("Todos desmarcados.");
    };

    const getLawyerName = (id: string) => {
        if (id === "geral") return "Paulo Tanaka (Geral)";
        return lawyers.find((l) => l.id === id)?.name ?? "Desconhecido";
    };

    return (
        <Layout>
            <div className="p-4 md:p-8 max-w-3xl mx-auto">
                <h1 className="text-2xl font-bold mb-1">Configurações</h1>
                <p className="text-sm text-muted-foreground mb-6">
                    Gerencie advogados, tecladores e chaves de API do sistema.
                </p>

                {/* Tabs */}
                <div className="flex flex-wrap gap-2 mb-6">
                    <button
                        onClick={() => setActiveTab("advogados")}
                        className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all duration-200 flex items-center gap-2 ${activeTab === "advogados"
                            ? "bg-primary/20 text-primary border-primary/40 shadow-md"
                            : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
                            }`}
                    >
                        <Scale className="w-3.5 h-3.5" />
                        Advogados
                        <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full">{lawyers.length + 1}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab("tecladores")}
                        className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all duration-200 flex items-center gap-2 ${activeTab === "tecladores"
                            ? "bg-violet-500/20 text-violet-300 border-violet-500/40 shadow-md"
                            : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
                            }`}
                    >
                        <Headphones className="w-3.5 h-3.5" />
                        Tecladores
                        <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full">{callers.length}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab("api_keys")}
                        className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all duration-200 flex items-center gap-2 ${activeTab === "api_keys"
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-md"
                            : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
                            }`}
                    >
                        <Key className="w-3.5 h-3.5" />
                        Chaves Gemini 2.5
                        <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full">{apiKeys.length}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab("sistema")}
                        className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all duration-200 flex items-center gap-2 ${activeTab === "sistema"
                            ? "bg-blue-500/20 text-blue-300 border-blue-500/40 shadow-md"
                            : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
                            }`}
                    >
                        <SettingsIcon className="w-3.5 h-3.5" />
                        Sistema
                    </button>
                </div>

                {/* ===== TAB: API KEYS ===== */}
                {activeTab === "api_keys" && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="bg-card border border-border rounded-xl p-6 shadow-card space-y-4">
                            <h3 className="text-sm font-semibold flex items-center gap-2">
                                <Plus className="w-4 h-4 text-amber-400" /> Adicionar Chave de API
                            </h3>
                            <p className="text-xs text-muted-foreground -mt-2">
                                Adicione chaves das suas contas do Google Cloud Console para que o sistema rotacione entre elas.
                            </p>
                            <div className="flex gap-2">
                                <Input
                                    value={newKey}
                                    onChange={(e) => setNewKey(e.target.value)}
                                    placeholder="Cole aqui sua API Key (AIza...)"
                                    className="bg-secondary border-border font-mono text-xs"
                                />
                                <Button onClick={handleAddKey} disabled={savingKey || !newKey.trim()} className="bg-amber-600 hover:bg-amber-700 text-white">
                                    {savingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                </Button>
                            </div>
                            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                                <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                                <p className="text-[11px] text-amber-200/80 leading-relaxed">
                                    O sistema usará apenas o modelo **Gemini 2.5 Flash** (via API). Se uma chave falhar ou atingir o limite, ele trocará automaticamente para a próxima chave da lista abaixo.
                                </p>
                            </div>
                        </div>

                        <div className="bg-card border border-border rounded-xl p-6 shadow-card">
                            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
                                <Key className="w-4 h-4 text-amber-400" /> Chaves Ativas
                            </h3>

                            {loadingKeys ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                                </div>
                            ) : apiKeys.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-6">
                                    Nenhuma chave cadastrada. Adicione chaves para evitar interrupções.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {apiKeys.map((k) => (
                                        <div key={k.id} className="flex items-center justify-between bg-secondary/30 border border-border rounded-lg px-4 py-3 group">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                                                    <Key className="w-4 h-4 text-amber-400" />
                                                </div>
                                                <div className="overflow-hidden">
                                                    <p className="text-xs font-mono text-muted-foreground truncate max-w-[200px] sm:max-w-md">
                                                        {k.key_value.substring(0, 10)}*******************{k.key_value.slice(-4)}
                                                    </p>
                                                    <p className="text-[10px] text-muted-foreground/60">Adicionada em {new Date(k.created_at).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteKey(k.id)}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ===== TAB: ADVOGADOS ===== */}
                {activeTab === "advogados" && (
                    <div className="space-y-6 animate-fade-in">
                        {/* Add Lawyer Form */}
                        <div className="bg-card border border-border rounded-xl p-6 shadow-card space-y-4">
                            <h3 className="text-sm font-semibold flex items-center gap-2">
                                <Plus className="w-4 h-4 text-primary" /> Cadastrar Advogado Específico
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">Nome *</Label>
                                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. João Silva" className="bg-secondary border-border" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">OAB</Label>
                                    <Input value={oab} onChange={(e) => setOab(e.target.value)} placeholder="SP 123.456" className="bg-secondary border-border" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">Especialidade</Label>
                                    <Input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Direito do Consumidor" className="bg-secondary border-border" />
                                </div>
                            </div>
                            <Button onClick={handleAddLawyer} disabled={savingLawyer || !name.trim()} className="bg-gradient-gold text-primary-foreground hover:opacity-90 font-semibold">
                                {savingLawyer ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                Cadastrar
                            </Button>
                        </div>

                        {/* Lawyer List */}
                        <div className="bg-card border border-border rounded-xl p-6 shadow-card">
                            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
                                <Scale className="w-4 h-4 text-primary" /> Advogados Cadastrados
                            </h3>

                            {/* Paulo Tanaka — always present */}
                            <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 mb-3">
                                <div className="flex items-center gap-3">
                                    <UserCheck className="w-4 h-4 text-primary" />
                                    <div>
                                        <p className="text-sm font-medium">Paulo Tanaka</p>
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Advogado Geral — Padrão</p>
                                    </div>
                                </div>
                                <span className="text-[10px] bg-primary/10 text-primary px-2 py-1 rounded-full font-bold uppercase">Fixo</span>
                            </div>

                            {loadingLawyers ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                                </div>
                            ) : lawyers.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-6">
                                    Nenhum advogado específico cadastrado.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {lawyers.map((lawyer) => (
                                        <div key={lawyer.id} className="flex items-center justify-between bg-secondary/50 border border-border rounded-lg px-4 py-3 group hover:border-primary/30 transition-colors">
                                            <div>
                                                <p className="text-sm font-medium">{lawyer.name}</p>
                                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                    {lawyer.oab && <span>OAB: {lawyer.oab}</span>}
                                                    {lawyer.specialty && <span>• {lawyer.specialty}</span>}
                                                </div>
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all" onClick={() => setDeletingLawyerId(lawyer.id)}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ===== TAB: TECLADORES ===== */}
                {activeTab === "tecladores" && (
                    <div className="space-y-6 animate-fade-in">
                        {/* Add Caller Form */}
                        <div className="bg-card border border-border rounded-xl p-6 shadow-card space-y-4">
                            <h3 className="text-sm font-semibold flex items-center gap-2">
                                <Plus className="w-4 h-4 text-violet-400" /> Cadastrar Teclador
                            </h3>
                            <p className="text-xs text-muted-foreground -mt-2">
                                O teclador terá acesso somente de leitura aos casos dos advogados selecionados.
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">Nome *</Label>
                                    <Input value={callerName} onChange={(e) => setCallerName(e.target.value)} placeholder="João da Silva" className="bg-secondary border-border" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                        <ShieldCheck className="w-3 h-3" /> PIN de Acesso (6 dígitos) *
                                    </Label>
                                    <Input
                                        value={callerPin}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                                            setCallerPin(val);
                                        }}
                                        placeholder="000000"
                                        className="bg-secondary border-border font-mono tracking-[0.3em] text-center"
                                        maxLength={6}
                                    />
                                </div>
                            </div>

                            {/* Lawyer selection */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs text-muted-foreground">Advogados disponíveis para este teclador *</Label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => selectAllLawyers()}
                                            className="text-[10px] flex items-center gap-1 text-primary hover:underline font-medium"
                                        >
                                            <CheckSquare className="w-3 h-3" /> Selecionar Todos
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deselectAllLawyers()}
                                            className="text-[10px] flex items-center gap-1 text-muted-foreground hover:underline font-medium"
                                        >
                                            <Square className="w-3 h-3" /> Limpar
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {/* Paulo Tanaka (geral) */}
                                    <button
                                        type="button"
                                        onClick={() => toggleCallerLawyer("geral")}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left text-sm transition-all ${callerLawyerIds.includes("geral")
                                            ? "bg-primary/10 border-primary/40 text-foreground"
                                            : "bg-secondary/50 border-border text-muted-foreground hover:border-primary/30"
                                            }`}
                                    >
                                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${callerLawyerIds.includes("geral") ? "bg-primary border-primary" : "border-muted-foreground/30"
                                            }`}>
                                            {callerLawyerIds.includes("geral") && <Check className="w-3 h-3 text-primary-foreground" />}
                                        </div>
                                        <div>
                                            <p className="font-medium text-xs">Paulo Tanaka</p>
                                            <p className="text-[10px] text-muted-foreground">Advogado Geral</p>
                                        </div>
                                    </button>

                                    {lawyers.map((l) => (
                                        <button
                                            key={l.id}
                                            type="button"
                                            onClick={() => toggleCallerLawyer(l.id)}
                                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left text-sm transition-all ${callerLawyerIds.includes(l.id)
                                                ? "bg-violet-500/10 border-violet-500/40 text-foreground"
                                                : "bg-secondary/50 border-border text-muted-foreground hover:border-violet-500/30"
                                                }`}
                                        >
                                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${callerLawyerIds.includes(l.id) ? "bg-violet-500 border-violet-500" : "border-muted-foreground/30"
                                                }`}>
                                                {callerLawyerIds.includes(l.id) && <Check className="w-3 h-3 text-white" />}
                                            </div>
                                            <div>
                                                <p className="font-medium text-xs">{l.name}</p>
                                                {l.oab && <p className="text-[10px] text-muted-foreground">OAB: {l.oab}</p>}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <Button
                                onClick={handleAddCaller}
                                disabled={savingCaller || !callerName.trim() || callerPin.length !== 6 || callerLawyerIds.length === 0}
                                className="bg-violet-600 text-white hover:bg-violet-700 font-semibold"
                            >
                                {savingCaller ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                Cadastrar Teclador
                            </Button>
                        </div>

                        {/* Callers List */}
                        <div className="bg-card border border-border rounded-xl p-6 shadow-card">
                            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
                                <Headphones className="w-4 h-4 text-violet-400" /> Tecladores Cadastrados
                            </h3>

                            {loadingCallers ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                                </div>
                            ) : callers.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-6">
                                    Nenhum teclador cadastrado. Crie um acima para dar acesso de leitura.
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {callers.map((caller) => (
                                        <div
                                            key={caller.id}
                                            className={`border rounded-lg px-4 py-3 group transition-all ${caller.active
                                                ? "bg-violet-500/5 border-violet-500/20 hover:border-violet-500/40"
                                                : "bg-muted/20 border-border opacity-60"
                                                }`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${caller.active ? "bg-violet-500 text-white" : "bg-muted text-muted-foreground"
                                                        }`}>
                                                        {caller.name[0]?.toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium">{caller.name}</p>
                                                        <p className="text-[10px] text-muted-foreground font-mono tracking-wider">
                                                            PIN: {caller.pin}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleToggleCallerActive(caller)}
                                                        className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border transition-colors ${caller.active
                                                            ? "bg-success/10 text-success border-success/20 hover:bg-success/20"
                                                            : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
                                                            }`}
                                                    >
                                                        {caller.active ? "Ativo" : "Inativo"}
                                                    </button>
                                                    <Button
                                                        variant="ghost" size="icon"
                                                        className="h-8 w-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all"
                                                        onClick={() => handleOpenEditCaller(caller)}
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost" size="icon"
                                                        className="h-8 w-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                                                        onClick={() => handleDeleteCaller(caller.id)}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Assigned lawyers */}
                                            <div className="flex flex-wrap gap-1.5 ml-11">
                                                {caller.lawyer_ids.map((lid) => (
                                                    <span key={lid} className="text-[10px] bg-violet-500/10 text-violet-300 px-2 py-0.5 rounded-full border border-violet-500/20">
                                                        {getLawyerName(lid)}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Edit Caller Dialog */}
            <Dialog open={!!editingCaller} onOpenChange={(open) => !open && setEditingCaller(null)}>
                <DialogContent className="max-w-md bg-card border-border shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Pencil className="w-5 h-5 text-violet-400" /> Editar Teclador
                        </DialogTitle>
                        <DialogDescription>
                            Atualize os dados e as permissões de acesso deste teclador.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                        <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Nome completo</Label>
                                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="bg-secondary border-border" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">PIN de Acesso (6 dígitos)</Label>
                                <Input
                                    value={editPin}
                                    onChange={(e) => setEditPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                    className="bg-secondary border-border font-mono tracking-[0.3em] text-center"
                                    maxLength={6}
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs text-muted-foreground">Advogados permitidos</Label>
                                <div className="flex gap-2 text-[10px] font-medium">
                                    <button onClick={() => selectAllLawyers(true)} className="text-primary hover:underline">Selecionar Todos</button>
                                    <button onClick={() => deselectAllLawyers(true)} className="text-muted-foreground hover:underline">Limpar</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-2 max-h-[30vh] overflow-y-auto pr-2 custom-scrollbar">
                                <button
                                    onClick={() => toggleCallerLawyer("geral", true)}
                                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-left text-sm transition-all ${editLawyerIds.includes("geral") ? "bg-primary/10 border-primary/40" : "bg-secondary/30 border-border"}`}
                                >
                                    <div className={`w-4 h-4 rounded flex items-center justify-center ${editLawyerIds.includes("geral") ? "bg-primary" : "border border-muted-foreground/30"}`}>
                                        {editLawyerIds.includes("geral") && <Check className="w-3 h-3 text-primary-foreground" />}
                                    </div>
                                    <span className="text-xs">Paulo Tanaka (Geral)</span>
                                </button>
                                {lawyers.map((l) => (
                                    <button
                                        key={l.id}
                                        onClick={() => toggleCallerLawyer(l.id, true)}
                                        className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-left text-sm transition-all ${editLawyerIds.includes(l.id) ? "bg-violet-500/10 border-violet-500/40" : "bg-secondary/30 border-border"}`}
                                    >
                                        <div className={`w-4 h-4 rounded flex items-center justify-center ${editLawyerIds.includes(l.id) ? "bg-violet-500" : "border border-muted-foreground/30"}`}>
                                            {editLawyerIds.includes(l.id) && <Check className="w-3 h-3 text-white" />}
                                        </div>
                                        <span className="text-xs">{l.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingCaller(null)} className="border-border">Cancelar</Button>
                        <Button onClick={handleUpdateCaller} disabled={updatingCaller} className="bg-violet-600 hover:bg-violet-700 text-white">
                            {updatingCaller ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                            Salvar Alterações
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Nuclear Delete Confirmation Dialog */}
            <Dialog open={!!deletingLawyerId} onOpenChange={(open) => !open && !isDeletingNuclear && setDeletingLawyerId(null)}>
                <DialogContent className="max-w-md bg-card border-destructive/20 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="w-5 h-5" /> EXCLUSÃO TOTAL (NUCLEAR)
                        </DialogTitle>
                        <DialogDescription className="text-foreground font-medium pt-2">
                            Você está prestes a apagar o advogado "{lawyers.find(l => l.id === deletingLawyerId)?.name}".
                        </DialogDescription>
                    </DialogHeader>

                    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 space-y-3">
                        <p className="text-xs text-destructive-foreground font-bold uppercase tracking-wider">Atenção! Esta ação apagará:</p>
                        <ul className="text-[11px] space-y-1 text-destructive-foreground/80 list-disc pl-4">
                            <li>O cadastro do advogado permanentemente.</li>
                            <li>**TODOS** os casos vinculados a este advogado.</li>
                            <li>**TODOS** os clientes vinculados a esses casos.</li>
                            <li>**TODOS** os documentos e conversas desses casos.</li>
                            <li>Removerá o acesso de todos os tecladores a este advogado.</li>
                        </ul>
                    </div>

                    <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={() => setDeletingLawyerId(null)} disabled={isDeletingNuclear}>
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteLawyer}
                            disabled={isDeletingNuclear}
                            className="bg-destructive hover:bg-destructive/90 text-white font-bold"
                        >
                            {isDeletingNuclear ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                            APAGAR TUDO (NUCLEAR)
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* ===== TAB: SISTEMA ===== */}
            {activeTab === "sistema" && (
                <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
                    <div className="bg-card border border-border rounded-xl p-8 shadow-card space-y-6">
                        <div className="flex items-center gap-3 border-b border-border pb-4">
                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                <Database className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold">Manutenção do Sistema</h3>
                                <p className="text-xs text-muted-foreground">Ferramentas de integridade e limpeza de dados.</p>
                            </div>
                        </div>

                        <div className="bg-secondary/20 border border-border/50 rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6 hover:bg-secondary/30 transition-colors">
                            <div className="space-y-2 flex-1">
                                <h4 className="text-sm font-bold flex items-center gap-2">
                                    <Phone className="w-4 h-4 text-[#25D366]" /> Limpeza de Telefones (WhatsApp)
                                </h4>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    Processa todos os clientes para manter apenas dígitos nos telefones.
                                    Isso corrige botões de WhatsApp que não abrem e remove caracteres como `()`, `-` e espaços.
                                </p>
                            </div>
                            <Button
                                onClick={handleDatabaseCleanup}
                                disabled={cleaning}
                                className="bg-blue-600 hover:bg-blue-700 text-white min-w-[180px] h-11 font-bold shadow-lg shadow-blue-900/20"
                            >
                                {cleaning ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                        Processando...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-4 h-4 mr-2" />
                                        Limpar Banco
                                    </>
                                )}
                            </Button>
                        </div>

                        {cleaning && (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                    <span>Progresso da Limpeza</span>
                                    <span>{Math.round((cleanStats.updated / (cleanStats.total || 1)) * 100)}%</span>
                                </div>
                                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden border border-border">
                                    <div
                                        className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                        style={{ width: `${(cleanStats.updated / (cleanStats.total || 1)) * 100}%` }}
                                    />
                                </div>
                                <p className="text-[10px] text-center text-muted-foreground font-medium">
                                    {cleanStats.updated} clientes atualizados de {cleanStats.total} totalizados no sistema.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Layout>
    );
}
