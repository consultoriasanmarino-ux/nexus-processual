import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Save, Loader2, Scale, UserCheck, Headphones, ShieldCheck, Phone, Check } from "lucide-react";
import { toast } from "sonner";
import type { Lawyer, Caller } from "@/lib/types";

type SettingsTab = "advogados" | "tecladores";

export default function Settings() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<SettingsTab>("advogados");

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

    useEffect(() => {
        if (user) {
            fetchLawyers();
            fetchCallers();
        }
    }, [user]);

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

    const handleDeleteLawyer = async (id: string) => {
        const { error } = await supabase.from("lawyers" as any).delete().eq("id", id);
        if (error) toast.error("Erro ao excluir advogado.");
        else { toast.success("Advogado removido."); setLawyers((prev) => prev.filter((l) => l.id !== id)); }
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

    const toggleCallerLawyer = (lawyerId: string) => {
        setCallerLawyerIds((prev) =>
            prev.includes(lawyerId)
                ? prev.filter((id) => id !== lawyerId)
                : [...prev, lawyerId]
        );
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
                    Gerencie advogados e tecladores do sistema.
                </p>

                {/* Tabs */}
                <div className="flex gap-2 mb-6">
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
                </div>

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
                                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all" onClick={() => handleDeleteLawyer(lawyer.id)}>
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
                                <Label className="text-xs text-muted-foreground">Advogados disponíveis para este teclador *</Label>
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
        </Layout>
    );
}
