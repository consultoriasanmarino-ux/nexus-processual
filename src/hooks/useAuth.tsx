import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export type UserRole = "admin" | "caller";

export interface CallerInfo {
  id: string;
  name: string;
  lawyer_ids: string[];
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Role management via localStorage
  const [role, setRoleState] = useState<UserRole>(() => {
    return (localStorage.getItem("nexus_role") as UserRole) || "admin";
  });

  const [callerInfo, setCallerInfoState] = useState<CallerInfo | null>(() => {
    const stored = localStorage.getItem("nexus_caller");
    return stored ? JSON.parse(stored) : null;
  });

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const setRole = (r: UserRole) => {
    setRoleState(r);
    localStorage.setItem("nexus_role", r);
  };

  const setCallerInfo = (info: CallerInfo | null) => {
    setCallerInfoState(info);
    if (info) {
      localStorage.setItem("nexus_caller", JSON.stringify(info));
    } else {
      localStorage.removeItem("nexus_caller");
    }
  };

  const signOut = async () => {
    localStorage.removeItem("nexus_role");
    localStorage.removeItem("nexus_caller");
    await supabase.auth.signOut();
  };

  const isAdmin = role === "admin";
  const isCaller = role === "caller";

  return { user, session, loading, signOut, role, setRole, callerInfo, setCallerInfo, isAdmin, isCaller };
}
