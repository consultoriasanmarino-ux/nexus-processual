import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Scale, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/hooks/useAuth";

const ACCESS_CODE = "171033";
const DEFAULT_EMAIL = "operador@nexusprocessual.com";
const DEFAULT_PASS = "Nexus#2026!SecureAccess";

export default function Auth() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const { setRole, setCallerInfo } = useAuth();

  const doLogin = async () => {
    // Try login first
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: DEFAULT_EMAIL,
      password: DEFAULT_PASS,
    });

    if (signInErr) {
      // If login fails, try to create user
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: DEFAULT_EMAIL,
        password: DEFAULT_PASS,
      });

      if (signUpErr) {
        console.error("Signup error:", signUpErr);
        toast.error("Erro ao criar acesso. Verifique as configurações do Supabase.");
        return false;
      }

      if (signUpData?.user?.identities?.length === 0) {
        toast.error("O Supabase exige confirmação de email. Desabilite em Authentication > Providers > Email.");
        return false;
      }

      const { error: retryErr } = await supabase.auth.signInWithPassword({
        email: DEFAULT_EMAIL,
        password: DEFAULT_PASS,
      });

      if (retryErr) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          toast.error("Conta criada! Se o acesso não funcionar, desabilite 'Confirm email' no Supabase.");
          return false;
        }
      }
    }
    return true;
  };

  const handleComplete = async (value: string) => {
    setLoading(true);

    // Check if it's the admin code
    if (value === ACCESS_CODE) {
      const ok = await doLogin();
      if (ok) {
        setRole("admin");
        setCallerInfo(null);
        toast.success("Acesso admin autorizado!");
      } else {
        setCode("");
      }
      setLoading(false);
      return;
    }

    // Check if PIN matches a caller
    // Need to login first to query the callers table
    const ok = await doLogin();
    if (!ok) {
      setCode("");
      setLoading(false);
      return;
    }

    // Now query callers table for matching PIN
    const { data: callers } = await supabase
      .from("callers" as any)
      .select("*")
      .eq("pin", value)
      .eq("active", true);

    const matchedCaller = (callers as any[])?.[0];

    if (matchedCaller) {
      setRole("caller");
      setCallerInfo({
        id: matchedCaller.id,
        name: matchedCaller.name,
        lawyer_ids: matchedCaller.lawyer_ids || [],
      });
      toast.success(`Bem-vindo, ${matchedCaller.name}!`);
    } else {
      // No match — sign out and show error
      await supabase.auth.signOut();
      toast.error("Código inválido.");
      setCode("");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-xs animate-fade-in text-center">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-gold shadow-glow mb-4">
            <Scale className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Central de Comunicação</h1>
          <p className="text-sm text-muted-foreground mt-1">Processual</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-card">
          <div className="flex items-center justify-center gap-2 mb-5">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Código de acesso</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={code}
                onChange={setCode}
                onComplete={handleComplete}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} className="w-11 h-12 text-lg font-bold bg-secondary border-border" />
                  <InputOTPSlot index={1} className="w-11 h-12 text-lg font-bold bg-secondary border-border" />
                  <InputOTPSlot index={2} className="w-11 h-12 text-lg font-bold bg-secondary border-border" />
                  <InputOTPSlot index={3} className="w-11 h-12 text-lg font-bold bg-secondary border-border" />
                  <InputOTPSlot index={4} className="w-11 h-12 text-lg font-bold bg-secondary border-border" />
                  <InputOTPSlot index={5} className="w-11 h-12 text-lg font-bold bg-secondary border-border" />
                </InputOTPGroup>
              </InputOTP>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground mt-5">
            Digite o código de 6 dígitos para acessar
          </p>
        </div>
      </div>
    </div>
  );
}
