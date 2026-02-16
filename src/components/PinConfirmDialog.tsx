import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

const ACCESS_CODE = "171033";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
}

export function PinConfirmDialog({ open, onOpenChange, title, description, onConfirm }: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleComplete = async (value: string) => {
    if (value !== ACCESS_CODE) {
      toast.error("Código inválido.");
      setCode("");
      return;
    }
    setLoading(true);
    await onConfirm();
    setLoading(false);
    setCode("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!loading) { onOpenChange(v); setCode(""); } }}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-center">{title}</DialogTitle>
          <DialogDescription className="text-center">{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Confirme com o PIN</span>
          </div>
          {loading ? (
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          ) : (
            <InputOTP maxLength={6} value={code} onChange={setCode} onComplete={handleComplete}>
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} className="w-10 h-11 text-lg font-bold bg-secondary border-border" />
                ))}
              </InputOTPGroup>
            </InputOTP>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
