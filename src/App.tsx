import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth, AuthProvider } from "@/hooks/useAuth";
import Auth from "./pages/Auth";
import Index from "./pages/Index";
import NewCase from "./pages/NewCase";
import CaseDetail from "./pages/CaseDetail";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import NotFound from "./pages/NotFound";
import Settings from "./pages/Settings";
import RifaFichas from "./pages/RifaFichas";
import RifaClients from "./pages/RifaClients";
import RifaSettings from "./pages/RifaSettings";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RifaRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin, isRifeiro } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin && !isRifeiro) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isRifeiro } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (user) {
    // Rifeiros go directly to /rifas
    if (isRifeiro) return <Navigate to="/rifas" replace />;
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function DefaultRedirect() {
  const { isRifeiro } = useAuth();
  if (isRifeiro) return <Navigate to="/rifas" replace />;
  return <Index />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
            <Route path="/" element={<ProtectedRoute><DefaultRedirect /></ProtectedRoute>} />
            <Route path="/new-case" element={<AdminRoute><NewCase /></AdminRoute>} />
            <Route path="/case/:id" element={<ProtectedRoute><CaseDetail /></ProtectedRoute>} />
            <Route path="/clients" element={<AdminRoute><Clients /></AdminRoute>} />
            <Route path="/client/:id" element={<AdminRoute><ClientDetail /></AdminRoute>} />
            <Route path="/settings" element={<AdminRoute><Settings /></AdminRoute>} />
            {/* Rifa routes */}
            <Route path="/rifas" element={<RifaRoute><RifaFichas /></RifaRoute>} />
            <Route path="/rifas/clientes" element={<AdminRoute><RifaClients /></AdminRoute>} />
            <Route path="/rifas/config" element={<AdminRoute><RifaSettings /></AdminRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
