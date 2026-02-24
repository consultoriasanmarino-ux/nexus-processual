import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Briefcase, Users, LogOut, Scale, Settings, Headphones } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: ReactNode }) {
  const { user, signOut, isAdmin, isCaller, callerInfo } = useAuth();
  const location = useLocation();

  // Admin sees everything, caller sees only Casos
  const navItems = isAdmin
    ? [
      { to: "/", label: "Casos", icon: Briefcase },
      { to: "/clients", label: "Clientes", icon: Users },
      { to: "/settings", label: "Configurações", icon: Settings },
    ]
    : [
      { to: "/", label: "Casos", icon: Briefcase },
    ];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar border-r border-sidebar-border">
        <div className="flex items-center gap-2.5 px-6 py-5 border-b border-sidebar-border">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-gold">
            <Scale className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground tracking-tight">Central</h1>
            <p className="text-[11px] text-muted-foreground">Comunicação Processual</p>
          </div>
        </div>

        {/* Caller badge */}
        {isCaller && callerInfo && (
          <div className="mx-3 mt-3 flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-lg px-3 py-2">
            <Headphones className="w-4 h-4 text-violet-400" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-bold text-violet-400">Teclador</p>
              <p className="text-xs text-foreground font-medium truncate">{callerInfo.name}</p>
            </div>
          </div>
        )}

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${active
                  ? "bg-sidebar-accent text-primary font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
                  }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-primary-foreground ${isCaller ? "bg-violet-500" : "bg-gradient-gold"}`}>
              {isCaller ? callerInfo?.name?.[0]?.toUpperCase() ?? "T" : user?.email?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground truncate">
                {isCaller ? callerInfo?.name ?? "Teclador" : user?.email}
              </p>
              {isCaller && (
                <p className="text-[10px] text-muted-foreground">Modo Leitura</p>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={signOut} className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-gold">
              <Scale className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-bold">Central</span>
            {isCaller && (
              <span className="text-[10px] bg-violet-500/15 text-violet-400 px-2 py-0.5 rounded-full font-bold">{callerInfo?.name}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {navItems.map((item) => (
              <Link key={item.to} to={item.to}>
                <Button variant={location.pathname === item.to ? "secondary" : "ghost"} size="icon" className="h-8 w-8">
                  <item.icon className="w-4 h-4" />
                </Button>
              </Link>
            ))}
            <Button variant="ghost" size="icon" onClick={signOut} className="h-8 w-8 text-muted-foreground">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
