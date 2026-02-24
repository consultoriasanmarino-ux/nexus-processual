import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Briefcase, User, Calendar, Hash, Trash2, AlertTriangle, Trash, Eye, EyeOff } from "lucide-react";
import { getStatusInfo, type Case, type Lawyer } from "@/lib/types";
import { CaseCardExport } from "@/components/CaseCardExport";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PinConfirmDialog } from "@/components/PinConfirmDialog";
import { formatProcessNumber } from "@/lib/utils";

// Color palette for lawyer tabs
const LAWYER_COLORS = [
  { bg: "from-violet-500/20 to-violet-600/5", border: "border-violet-500/40", accent: "text-violet-400", dot: "bg-violet-400", tab: "bg-violet-500/15 text-violet-300 border-violet-500/30", tabActive: "bg-violet-500/30 text-violet-200 border-violet-400 shadow-[0_0_12px_rgba(139,92,246,0.3)]" },
  { bg: "from-cyan-500/20 to-cyan-600/5", border: "border-cyan-500/40", accent: "text-cyan-400", dot: "bg-cyan-400", tab: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30", tabActive: "bg-cyan-500/30 text-cyan-200 border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.3)]" },
  { bg: "from-amber-500/20 to-amber-600/5", border: "border-amber-500/40", accent: "text-amber-400", dot: "bg-amber-400", tab: "bg-amber-500/15 text-amber-300 border-amber-500/30", tabActive: "bg-amber-500/30 text-amber-200 border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.3)]" },
  { bg: "from-rose-500/20 to-rose-600/5", border: "border-rose-500/40", accent: "text-rose-400", dot: "bg-rose-400", tab: "bg-rose-500/15 text-rose-300 border-rose-500/30", tabActive: "bg-rose-500/30 text-rose-200 border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.3)]" },
  { bg: "from-emerald-500/20 to-emerald-600/5", border: "border-emerald-500/40", accent: "text-emerald-400", dot: "bg-emerald-400", tab: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", tabActive: "bg-emerald-500/30 text-emerald-200 border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]" },
  { bg: "from-sky-500/20 to-sky-600/5", border: "border-sky-500/40", accent: "text-sky-400", dot: "bg-sky-400", tab: "bg-sky-500/15 text-sky-300 border-sky-500/30", tabActive: "bg-sky-500/30 text-sky-200 border-sky-400 shadow-[0_0_12px_rgba(14,165,233,0.3)]" },
];

const GERAL_COLOR = {
  bg: "from-primary/20 to-primary/5", border: "border-primary/40", accent: "text-primary", dot: "bg-primary",
  tab: "bg-primary/15 text-primary/80 border-primary/30",
  tabActive: "bg-primary/30 text-primary border-primary shadow-[0_0_12px_rgba(234,179,8,0.3)]",
};

export default function Index() {
  const { user, isAdmin, isCaller, callerInfo } = useAuth();
  const navigate = useNavigate();
  const [cases, setCases] = useState<Case[]>([]);
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [activeTab, setActiveTab] = useState("todos");
  const [markedCases, setMarkedCases] = useState<Set<string>>(new Set());
  const [showMarked, setShowMarked] = useState(true);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, isCaller, callerInfo?.id]);

  const fetchData = async () => {
    setLoading(true);
    const [casesRes, lawyersRes] = await Promise.all([
      supabase.from("cases").select("*, clients(*)").order("created_at", { ascending: false }),
      supabase.from("lawyers" as any).select("*").order("name"),
    ]);

    let allCases = (casesRes.data as any[]) ?? [];
    const lawyersData = (lawyersRes.data as any as Lawyer[]) ?? [];
    setLawyers(lawyersData);

    // For callers, filter to only show assigned lawyers' cases
    if (isCaller && callerInfo) {
      allCases = allCases.filter((c) => {
        // If assigned to "geral", show cases without a specific lawyer
        if (callerInfo.lawyer_ids.includes("geral") && (!c.lawyer_id || c.lawyer_type !== "especifico")) {
          return true;
        }

        // Show cases for specific lawyers chosen in settings
        if (c.lawyer_id && callerInfo.lawyer_ids.includes(c.lawyer_id)) {
          return true;
        }

        return false;
      });

      // Fetch caller's case marks
      const { data: marks } = await supabase
        .from("caller_case_marks" as any)
        .select("case_id")
        .eq("caller_id", callerInfo.id);
      if (marks) {
        setMarkedCases(new Set((marks as any[]).map((m) => m.case_id)));
      }
    }

    setCases(allCases);
    setLoading(false);
  };

  // Build lawyer color map
  const lawyerColorMap = useMemo(() => {
    const map: Record<string, typeof LAWYER_COLORS[0]> = {};
    lawyers.forEach((l, i) => {
      map[l.id] = LAWYER_COLORS[i % LAWYER_COLORS.length];
    });
    return map;
  }, [lawyers]);

  const getCaseColor = (c: Case) => {
    if (c.lawyer_type === "especifico" && c.lawyer_id && lawyerColorMap[c.lawyer_id]) {
      return lawyerColorMap[c.lawyer_id];
    }
    return GERAL_COLOR;
  };

  // Build tabs — for callers, only show tabs for their assigned lawyers
  const tabs = useMemo(() => {
    const relevantLawyers = isCaller && callerInfo
      ? lawyers.filter((l) => callerInfo.lawyer_ids.includes(l.id))
      : lawyers;
    const showGeral = !isCaller || (callerInfo?.lawyer_ids.includes("geral") ?? false);

    const geralCount = cases.filter((c) => c.lawyer_type !== "especifico" || !c.lawyer_id).length;

    const result: { id: string; label: string; count: number; color: typeof GERAL_COLOR | null }[] = [
      { id: "todos", label: "Todos", count: cases.length, color: null },
    ];

    if (showGeral) {
      result.push({ id: "geral", label: "Paulo Tanaka", count: geralCount, color: GERAL_COLOR });
    }

    relevantLawyers.forEach((l) => {
      const count = cases.filter((c) => c.lawyer_id === l.id).length;
      result.push({ id: l.id, label: l.name, count, color: lawyerColorMap[l.id] || LAWYER_COLORS[0] });
    });

    return result;
  }, [cases, lawyers, lawyerColorMap, isCaller, callerInfo]);

  // Filter cases by active tab + search + mark filter
  const filtered = useMemo(() => {
    let list = cases;

    if (activeTab === "geral") {
      list = list.filter((c) => c.lawyer_type !== "especifico" || !c.lawyer_id);
    } else if (activeTab !== "todos") {
      list = list.filter((c) => c.lawyer_id === activeTab);
    }

    // For callers: hide marked cases if showMarked is false
    if (isCaller && !showMarked) {
      list = list.filter((c) => !markedCases.has(c.id));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.case_title?.toLowerCase().includes(q) ||
        c.process_number?.toLowerCase().includes(q) ||
        (c as any).clients?.full_name?.toLowerCase().includes(q) ||
        (c as any).clients?.cpf_or_identifier?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [cases, activeTab, search, isCaller, showMarked, markedCases]);

  // Calculate case counts per client to show "Multiple Cases" badge
  const clientCaseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    cases.forEach((c) => {
      if (c.client_id) {
        counts[c.client_id] = (counts[c.client_id] || 0) + 1;
      }
    });
    return counts;
  }, [cases]);

  // Toggle mark for a case (caller only)
  const toggleCaseMark = async (caseId: string) => {
    if (!callerInfo) return;
    const isMarked = markedCases.has(caseId);

    if (isMarked) {
      await supabase.from("caller_case_marks" as any).delete().eq("caller_id", callerInfo.id).eq("case_id", caseId);
      setMarkedCases((prev) => { const next = new Set(prev); next.delete(caseId); return next; });
      toast.success("Caso reativado.");
    } else {
      await supabase.from("caller_case_marks" as any).insert({ caller_id: callerInfo.id, case_id: caseId } as any);
      setMarkedCases((prev) => new Set(prev).add(caseId));
      toast.success("Caso marcado como concluído.");
    }
  };

  // Admin functions
  const handleDeleteCase = async (caseId: string) => {
    setDeleting(caseId);
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

  const markedCount = markedCases.size;
  const pendingCount = cases.length - markedCount;

  return (
    <Layout>
      <div className="p-4 md:p-8 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Casos</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {cases.length} caso(s) registrados
              {isCaller && markedCount > 0 && (
                <span className="ml-2 text-[10px] bg-muted/50 px-2 py-0.5 rounded-full">
                  {pendingCount} pendente(s) · {markedCount} concluído(s)
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {/* Caller: toggle to show/hide marked */}
            {isCaller && markedCount > 0 && (
              <Button
                variant="outline"
                onClick={() => setShowMarked(!showMarked)}
                className={`text-xs ${!showMarked ? "border-violet-500/40 text-violet-300" : "border-border text-muted-foreground"}`}
              >
                {showMarked ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                {showMarked ? "Ocultar Concluídos" : "Mostrar Todos"}
              </Button>
            )}

            {/* Admin only buttons */}
            {isAdmin && (
              <>
                {cases.length > 0 && (
                  <Button variant="outline" onClick={() => setShowDeleteAll(true)} className="text-destructive border-destructive/30 hover:bg-destructive/10">
                    <Trash className="w-4 h-4 mr-2" /> Apagar Todos
                  </Button>
                )}
                <Button onClick={() => navigate("/new-case")} className="bg-gradient-gold hover:opacity-90 text-primary-foreground font-semibold">
                  <Plus className="w-4 h-4 mr-2" /> Novo Caso
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Lawyer Tabs */}
        <div className="flex flex-wrap gap-2 mb-5">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const colorStyle = tab.color;

            if (tab.id === "todos") {
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all duration-200 ${isActive
                    ? "bg-foreground/10 text-foreground border-foreground/30 shadow-md"
                    : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50 hover:text-foreground"
                    }`}
                >
                  Todos
                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? "bg-foreground/15" : "bg-muted/50"}`}>
                    {tab.count}
                  </span>
                </button>
              );
            }

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all duration-200 flex items-center gap-2 ${isActive ? colorStyle!.tabActive : colorStyle!.tab
                  } ${!isActive ? "hover:opacity-80" : ""}`}
              >
                <div className={`w-2 h-2 rounded-full ${colorStyle!.dot} ${isActive ? "shadow-[0_0_6px_currentColor]" : "opacity-60"}`} />
                {tab.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? "bg-white/10" : "bg-white/5"}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
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
            <p className="text-muted-foreground">{search ? "Nenhum caso encontrado." : "Nenhum caso nesta aba."}</p>
            {!search && activeTab === "todos" && isAdmin && (
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
              const caseColor = getCaseColor(c);
              const lawyerName = c.lawyer_type === "especifico" && c.lawyer_id
                ? lawyers.find((l) => l.id === c.lawyer_id)?.name
                : "Paulo Tanaka";
              const isMarked = markedCases.has(c.id);

              return (
                <div
                  key={c.id}
                  className={`relative group bg-gradient-to-br ${caseColor.bg} border ${caseColor.border} rounded-xl hover:shadow-lg transition-all animate-fade-in ${isMarked ? "opacity-50" : ""
                    }`}
                >
                  <Link to={`/case/${c.id}`} className="block p-5">
                    {/* Lawyer indicator */}
                    <div className="flex items-center gap-1.5 mb-3">
                      <div className={`w-1.5 h-1.5 rounded-full ${caseColor.dot}`} />
                      <span className={`text-[10px] font-semibold uppercase tracking-wider ${caseColor.accent}`}>
                        {lawyerName}
                      </span>
                      {isMarked && (
                        <span className="ml-auto text-[9px] bg-muted/40 text-muted-foreground px-1.5 py-0.5 rounded-full font-bold uppercase">
                          Concluído
                        </span>
                      )}
                    </div>

                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 pr-6">
                        {c.case_title}
                      </h3>
                      <span className={`${status.color} text-[10px] font-semibold px-2 py-0.5 rounded-full text-foreground flex-shrink-0`}>
                        {status.label}
                      </span>
                    </div>

                    {c.is_chat_active && (
                      <div className="absolute top-14 right-4 flex items-center gap-1.5 px-2 py-1 bg-success/10 rounded-lg animate-pulse border border-success/20 shadow-glow-success">
                        <div className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                        <span className="text-[10px] font-bold text-success uppercase tracking-wider">Atendendo</span>
                      </div>
                    )}

                    {client && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                        <User className="w-3 h-3" />
                        <span className="truncate">{client.full_name}</span>
                        {clientCaseCounts[c.client_id] > 1 && (
                          <span className="flex-shrink-0 bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[9px] font-bold border border-primary/20 uppercase animate-pulse">
                            +{clientCaseCounts[c.client_id] - 1} Outros
                          </span>
                        )}
                      </div>
                    )}

                    {c.process_number && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                        <Hash className="w-3 h-3" />
                        <span className="font-mono">{formatProcessNumber(c.process_number)}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      <span>{new Date(c.created_at).toLocaleDateString("pt-BR")}</span>
                    </div>

                    {client && !client.phone && !client.phone_contract && (
                      <div className="flex items-center gap-1.5 text-[10px] text-destructive font-medium mt-2 bg-destructive/10 rounded-md px-2 py-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Sem telefone registrado</span>
                      </div>
                    )}
                  </Link>

                  {/* Caller: Mark as done button */}
                  {isCaller && (
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleCaseMark(c.id); }}
                      className={`absolute bottom-3 right-3 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border transition-all ${isMarked
                        ? "bg-muted/30 text-muted-foreground border-border hover:bg-warning/10 hover:text-warning hover:border-warning/30"
                        : "bg-success/10 text-success border-success/20 hover:bg-success/20"
                        }`}
                      title={isMarked ? "Reativar caso" : "Marcar como concluído"}
                    >
                      {isMarked ? "Reativar" : "✓ Concluído"}
                    </button>
                  )}

                  {/* Admin: Delete & Export */}
                  {isAdmin && (
                    <>
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
                      <CaseCardExport caseData={c} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isAdmin && (
          <PinConfirmDialog
            open={showDeleteAll}
            onOpenChange={setShowDeleteAll}
            title="Apagar todos os casos?"
            description="Todos os casos, documentos, conversas e análises serão excluídos permanentemente."
            onConfirm={handleDeleteAll}
          />
        )}
      </div>
    </Layout>
  );
}
