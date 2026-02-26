import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export type UserRole = "admin" | "caller" | "rifeiro";

export interface CallerInfo {
  id: string;
  name: string;
  lawyer_ids: string[];
}

export interface RifeiroInfo {
  id: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: UserRole;
  setRole: (r: UserRole) => void;
  callerInfo: CallerInfo | null;
  setCallerInfo: (info: CallerInfo | null) => void;
  rifeiroInfo: RifeiroInfo | null;
  setRifeiroInfo: (info: RifeiroInfo | null) => void;
  isAdmin: boolean;
  isCaller: boolean;
  isRifeiro: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Role management via localStorage - initialized IMMEDIATELY
  const [role, setRoleState] = useState<UserRole>(() => {
    return (localStorage.getItem("nexus_role") as UserRole) || "admin";
  });

  const [callerInfo, setCallerInfoState] = useState<CallerInfo | null>(() => {
    const stored = localStorage.getItem("nexus_caller");
    return stored ? JSON.parse(stored) : null;
  });

  const [rifeiroInfo, setRifeiroInfoState] = useState<RifeiroInfo | null>(() => {
    const stored = localStorage.getItem("nexus_rifeiro");
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

  const setRifeiroInfo = (info: RifeiroInfo | null) => {
    setRifeiroInfoState(info);
    if (info) {
      localStorage.setItem("nexus_rifeiro", JSON.stringify(info));
    } else {
      localStorage.removeItem("nexus_rifeiro");
    }
  };

  const signOut = async () => {
    localStorage.removeItem("nexus_role");
    localStorage.removeItem("nexus_caller");
    localStorage.removeItem("nexus_rifeiro");
    await supabase.auth.signOut();
  };

  const isAdmin = role === "admin";
  const isCaller = role === "caller";
  const isRifeiro = role === "rifeiro";

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, role, setRole, callerInfo, setCallerInfo, rifeiroInfo, setRifeiroInfo, isAdmin, isCaller, isRifeiro }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
