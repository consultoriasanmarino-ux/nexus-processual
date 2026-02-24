import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { aiAnalyze } from "@/lib/gemini";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, FileText, Loader2, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { Document } from "@/lib/types";

interface Props {
  caseId: string;
  documents: Document[];
  onRefresh: () => void;
}

export function DocumentsTab({ caseId, documents, onRefresh }: Props) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    try {
      const filePath = `${user.id}/${caseId}/${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("documents").upload(filePath, file);
      if (uploadErr) throw uploadErr;

      await supabase.from("documents").insert({
        case_id: caseId,
        user_id: user.id,
        doc_type: "petição inicial",
        file_url: filePath,
      });

      toast.success("Documento enviado!");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Erro no upload.");
    }
    setUploading(false);
  };

  const handleProcess = async (doc: Document) => {
    if (!doc.file_url) return;
    setProcessingId(doc.id);
    try {
      const result = await aiAnalyze({
        petitionText: "",
        contractText: "",
        contractType: "outros",
      });
      if (!result.success) throw new Error(result.error || "Erro ao processar.");
      toast.success("PDF processado com IA!");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar.");
    }
    setProcessingId(null);
  };

  const getDownloadUrl = async (filePath: string) => {
    const { data } = await supabase.storage.from("documents").createSignedUrl(filePath, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{documents.length} documento(s)</h3>
        <label>
          <Button size="sm" disabled={uploading} asChild className="bg-gradient-gold text-primary-foreground hover:opacity-90 text-xs cursor-pointer">
            <span>
              {uploading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Upload className="w-3 h-3 mr-1" />}
              Upload PDF
            </span>
          </Button>
          <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} />
        </label>
      </div>

      {documents.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum documento ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div key={doc.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-5 h-5 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{doc.doc_type ?? "Documento"}</p>
                  <p className="text-xs text-muted-foreground">{new Date(doc.created_at).toLocaleDateString("pt-BR")}</p>
                  {doc.extracted_text && <p className="text-[10px] text-success">✓ Texto extraído</p>}
                  {doc.extracted_json && <p className="text-[10px] text-success">✓ Análise IA concluída</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {doc.file_url && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => getDownloadUrl(doc.file_url!)}>
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                )}
                {!doc.extracted_json && (
                  <Button
                    size="sm"
                    onClick={() => handleProcess(doc)}
                    disabled={processingId === doc.id}
                    className="bg-gradient-gold text-primary-foreground hover:opacity-90 text-xs"
                  >
                    {processingId === doc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Sparkles className="w-3 h-3 mr-1" /> Processar</>}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
