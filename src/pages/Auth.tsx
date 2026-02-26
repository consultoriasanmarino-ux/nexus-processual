import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Scale, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const DEFAULT_EMAIL = "operador@nexusprocessual.com";
const DEFAULT_PASS = "Nexus#2026!SecureAccess";

export default function Auth() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { setRole, setCallerInfo, setRifeiroInfo } = useAuth();

  const doLogin = async () => {
    // Hidden gateway login to Supabase
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: DEFAULT_EMAIL,
      password: DEFAULT_PASS,
    });
    return !signInErr;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error("Preencha usuário e senha.");
      return;
    }

    setLoading(true);

    // 1. Check if it's the admin
    if (username === "osevenboy" && password === "Neneco24!") {
      const ok = await doLogin();
      if (ok) {
        setRole("admin");
        setCallerInfo(null);
        setRifeiroInfo(null);
        toast.success("Acesso Admin autorizado!");
      } else {
        toast.error("Erro na conexão com o banco.");
      }
      setLoading(false);
      return;
    }

    // 2. Check if it's a caller
    const ok = await doLogin();
    if (!ok) {
      toast.error("Erro na conexão com o servidor.");
      setLoading(false);
      return;
    }

    try {
      // Query callers table for matching credentials
      const { data: callers, error } = await supabase
        .from("callers" as any)
        .select("*")
        .eq("username", username)
        .eq("password", password)
        .eq("active", true);

      const matchedCaller = (callers as any[])?.[0];

      if (matchedCaller) {
        setRole("caller");
        setCallerInfo({
          id: matchedCaller.id,
          name: matchedCaller.name,
          lawyer_ids: matchedCaller.lawyer_ids || [],
        });
        setRifeiroInfo(null);
        toast.success(`Bem-vindo, ${matchedCaller.name}!`);
        setLoading(false);
        return;
      }

      // 3. Check if it's a rifeiro
      const { data: rifeiros } = await supabase
        .from("rifeiros" as any)
        .select("*")
        .eq("username", username)
        .eq("password", password)
        .eq("active", true);

      const matchedRifeiro = (rifeiros as any[])?.[0];

      if (matchedRifeiro) {
        setRole("rifeiro");
        setRifeiroInfo({
          id: matchedRifeiro.id,
          name: matchedRifeiro.name,
        });
        setCallerInfo(null);
        toast.success(`Bem-vindo, ${matchedRifeiro.name}!`);
        setLoading(false);
        return;
      }

      // No match found
      await supabase.auth.signOut();
      toast.error("Usuário ou senha incorretos.");
    } catch (err) {
      console.error("Auth error:", err);
      toast.error("Erro ao validar acesso.");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 font-sans">
      <div className="w-full max-w-sm animate-fade-in text-center">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-gold shadow-glow mb-4">
            <Scale className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Nexus Processual</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestão de Leads e Processos</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 shadow-card text-left">
          <div className="flex items-center gap-2 mb-6 text-primary">
            <ShieldCheck className="w-5 h-5" />
            <span className="text-sm font-semibold uppercase tracking-wider">Acesso ao Sistema</span>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Usuário</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                placeholder="usuario"
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-gradient-gold text-primary-foreground hover:opacity-90 font-bold text-sm shadow-md mt-4"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "ENTRAR"
              )}
            </Button>
          </form>

          <p className="text-[10px] text-muted-foreground text-center mt-6">
            Ambiente seguro e monitorado • {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
