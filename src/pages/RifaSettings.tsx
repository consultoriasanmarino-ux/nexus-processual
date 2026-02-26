import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Save, Loader2, Ticket, Pencil, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { Rifeiro } from "@/lib/types";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

export default function RifaSettings() {
    const { user } = useAuth();

    // Rifeiros state
    const [rifeiros, setRifeiros] = useState<Rifeiro[]>([]);
    const [loadingRifeiros, setLoadingRifeiros] = useState(true);
    const [rifeiroName, setRifeiroName] = useState("");
    const [rifeiroUsername, setRifeiroUsername] = useState("");
    const [rifeiroPassword, setRifeiroPassword] = useState("");
    const [savingRifeiro, setSavingRifeiro] = useState(false);
    const [editingRifeiro, setEditingRifeiro] = useState<Rifeiro | null>(null);
    const [editName, setEditName] = useState("");
    const [editUsername, setEditUsername] = useState("");
    const [editPassword, setEditPassword] = useState("");
    const [updatingRifeiro, setUpdatingRifeiro] = useState(false);

    useEffect(() => {
        if (user) fetchRifeiros();
    }, [user]);

    const fetchRifeiros = async () => {
        const { data } = await supabase
            .from("rifeiros" as any)
            .select("*")
            .order("created_at", { ascending: true });
        setRifeiros((data as any as Rifeiro[]) ?? []);
        setLoadingRifeiros(false);
    };

    const handleAddRifeiro = async () => {
        if (!rifeiroName.trim()) { toast.error("Nome do rifeiro é obrigatório."); return; }
        if (!rifeiroUsername.trim()) { toast.error("Usuário é obrigatório."); return; }
        if (!rifeiroPassword.trim()) { toast.error("Senha é obrigatória."); return; }

        const existing = rifeiros.find(r => r.username === rifeiroUsername.trim());
        if (existing) { toast.error(`Usuário já em uso por: ${existing.name}`); return; }
        if (!user) return;

        setSavingRifeiro(true);
        const { error } = await supabase.from("rifeiros" as any).insert({
            user_id: user.id,
            name: rifeiroName.trim(),
            username: rifeiroUsername.trim(),
            password: rifeiroPassword,
            active: true,
        });
        if (error) { toast.error("Erro ao cadastrar rifeiro."); console.error(error); }
        else {
            toast.success("Rifeiro cadastrado!");
            setRifeiroName(""); setRifeiroUsername(""); setRifeiroPassword("");
            fetchRifeiros();
        }
        setSavingRifeiro(false);
    };

    const handleDeleteRifeiro = async (id: string) => {
        const { error } = await supabase.from("rifeiros" as any).delete().eq("id", id);
        if (error) toast.error("Erro ao excluir rifeiro.");
        else { toast.success("Rifeiro removido."); setRifeiros(prev => prev.filter(r => r.id !== id)); }
    };

    const handleToggleActive = async (rifeiro: Rifeiro) => {
        const { error } = await supabase
            .from("rifeiros" as any)
            .update({ active: !rifeiro.active } as any)
            .eq("id", rifeiro.id);
        if (error) toast.error("Erro ao atualizar status.");
        else {
            setRifeiros(prev => prev.map(r => r.id === rifeiro.id ? { ...r, active: !r.active } : r));
            toast.success(rifeiro.active ? "Rifeiro desativado." : "Rifeiro reativado.");
        }
    };

    const handleOpenEdit = (rifeiro: Rifeiro) => {
        setEditingRifeiro(rifeiro);
        setEditName(rifeiro.name);
        setEditUsername(rifeiro.username);
        setEditPassword(rifeiro.password);
    };

    const handleUpdateRifeiro = async () => {
        if (!editingRifeiro) return;
        if (!editName.trim()) { toast.error("Nome é obrigatório."); return; }
        if (!editUsername.trim()) { toast.error("Usuário é obrigatório."); return; }
        if (!editPassword.trim()) { toast.error("Senha é obrigatória."); return; }

        setUpdatingRifeiro(true);
        const { error } = await supabase
            .from("rifeiros" as any)
            .update({
                name: editName.trim(),
                username: editUsername.trim(),
                password: editPassword,
            } as any)
            .eq("id", editingRifeiro.id);

        if (error) { toast.error("Erro ao atualizar rifeiro."); console.error(error); }
        else {
            toast.success("Rifeiro atualizado!");
            setEditingRifeiro(null);
            fetchRifeiros();
        }
        setUpdatingRifeiro(false);
    };

    return (
        <Layout>
            <div className="p-4 md:p-8 max-w-3xl mx-auto">
                <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
                    <Ticket className="w-6 h-6 text-emerald-400" />
                    Configurações de Rifas
                </h1>
                <p className="text-sm text-muted-foreground mb-6">
                    Gerencie rifeiros (operadores que terão acesso às fichas de rifas).
                </p>

                {/* Add Rifeiro Form */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-card space-y-4 mb-6">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Plus className="w-4 h-4 text-emerald-400" /> Cadastrar Rifeiro
                    </h3>
                    <p className="text-xs text-muted-foreground -mt-2">
                        O rifeiro terá acesso somente às fichas de rifas.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Nome *</Label>
                            <Input value={rifeiroName} onChange={(e) => setRifeiroName(e.target.value)} placeholder="João da Silva" className="bg-secondary border-border" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground font-bold">Usuário *</Label>
                            <Input value={rifeiroUsername} onChange={(e) => setRifeiroUsername(e.target.value)} placeholder="usuario.login" className="bg-secondary border-border" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground font-bold">Senha *</Label>
                            <Input
                                type="password"
                                value={rifeiroPassword}
                                onChange={(e) => setRifeiroPassword(e.target.value)}
                                placeholder="••••••••"
                                className="bg-secondary border-border"
                            />
                        </div>
                    </div>

                    <Button
                        onClick={handleAddRifeiro}
                        disabled={savingRifeiro || !rifeiroName.trim() || !rifeiroUsername.trim() || !rifeiroPassword.trim()}
                        className="bg-emerald-600 text-white hover:bg-emerald-700 font-semibold w-full sm:w-auto"
                    >
                        {savingRifeiro ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                        Cadastrar Rifeiro
                    </Button>
                </div>

                {/* Rifeiros List */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-card">
                    <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
                        <Ticket className="w-4 h-4 text-emerald-400" /> Rifeiros Cadastrados
                    </h3>

                    {loadingRifeiros ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : rifeiros.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">Nenhum rifeiro cadastrado.</p>
                    ) : (
                        <div className="space-y-3">
                            {rifeiros.map((rifeiro) => (
                                <div key={rifeiro.id} className={`border rounded-xl px-4 py-3 group transition-all ${rifeiro.active ? "bg-emerald-500/5 border-emerald-500/20" : "bg-muted/20 border-border opacity-70"}`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${rifeiro.active ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}>
                                                {rifeiro.name[0]?.toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">{rifeiro.name}</p>
                                                <p className="text-[10px] text-muted-foreground">Usuário: <span className="font-bold text-emerald-300">{rifeiro.username}</span></p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => handleToggleActive(rifeiro)} className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${rifeiro.active ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-muted/30 text-muted-foreground border-border"}`}>
                                                {rifeiro.active ? "Ativo" : "Inativo"}
                                            </button>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => handleOpenEdit(rifeiro)}><Pencil className="w-3 h-3" /></Button>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 hover:text-destructive" onClick={() => handleDeleteRifeiro(rifeiro.id)}><Trash2 className="w-3 h-3" /></Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Edit Rifeiro Dialog */}
                <Dialog open={!!editingRifeiro} onOpenChange={(open) => !open && setEditingRifeiro(null)}>
                    <DialogContent className="max-w-md bg-card border-border shadow-2xl">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Pencil className="w-5 h-5 text-emerald-400" /> Editar Rifeiro
                            </DialogTitle>
                            <DialogDescription>
                                Atualize os dados de acesso deste rifeiro.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Nome completo</Label>
                                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="bg-secondary border-border" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Usuário</Label>
                                <Input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} className="bg-secondary border-border" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Senha</Label>
                                <Input
                                    type="text"
                                    value={editPassword}
                                    onChange={(e) => setEditPassword(e.target.value)}
                                    className="bg-secondary border-border"
                                />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setEditingRifeiro(null)} className="border-border">Cancelar</Button>
                            <Button onClick={handleUpdateRifeiro} disabled={updatingRifeiro} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                {updatingRifeiro ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                Salvar Alterações
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </Layout>
    );
}
