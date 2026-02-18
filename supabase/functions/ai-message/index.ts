import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_COMPANY_CONTEXT = `Somos uma empresa que acompanha o processo jurídico de alguns casos e notificamos o cliente quando ele tem algo para receber.
Para receber o valor, precisamos que o cliente informe seus dados para pagamento: Banco, Agência e Conta.
REGRAS INTERNAS:
- NUNCA diga percentuais ao cliente.
- Se o processo tem menos de 1 ano, apenas metade é liberada agora.
- Abordagem sutil: confirmar identidade, depois novidades, depois valores.`;

function getTimePolicy(distributionDate: string | null, caseValueInput: any): string {
  if (!distributionDate) return "";
  const dist = new Date(distributionDate);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - dist.getTime()) / (1000 * 60 * 60 * 24));

  const val = typeof caseValueInput === "string" ? parseFloat(caseValueInput) : (Number(caseValueInput) || 0);
  const valorFormatado = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (diffDays < 365) {
    const valorLiberado = val * 0.5;
    return `INFO INTERNA: Processo < 1 ano (${diffDays} dias). Valor total: R$ ${valorFormatado(val)}. Liberar apenas 50%: R$ ${valorFormatado(valorLiberado)}. Informe o valor em REAIS.`;
  }
  return `INFO INTERNA: Processo >= 1 ano (${diffDays} dias). Valor integral: R$ ${valorFormatado(val)}.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("API Key não configurada.");

    const body = await req.json();
    const { action, caseTitle, distributionDate, defendant, caseType, court, companyContext, recentMessages, caseValue, image, userQuery } = body;

    const timePolicy = getTimePolicy(distributionDate, caseValue);
    const compCtx = companyContext || DEFAULT_COMPANY_CONTEXT;

    const contextStr = `Caso: ${caseTitle}\nRéu: ${defendant}\nTipo: ${caseType}\nTribunal: ${court}\n${timePolicy}`;

    let systemPrompt = "";
    let userPrompt = "";

    if (action === "chat_assistant") {
      const chatHistory = (recentMessages || []).map((m: any) => `${m.sender}: ${m.text}`).join("\n");
      systemPrompt = `Você é o "Nexus Assistente", especialista em negociação via WhatsApp.
CONTEXTO DA EMPRESA: ${compCtx}
${contextStr}
Responda em JSON: { "analysis": "...", "suggestions": [{"label": "...", "text": "..."}], "advice": "..." }`;

      userPrompt = `HISTÓRICO:\n${chatHistory}\n\nPERGUNTA:\n${userQuery || "Analisar situação."}${image ? "\n(HÁ IMAGEM EM ANEXO)" : ""}`;
    } else {
      systemPrompt = `Gerador de Mensagens Jurídicas.\n${compCtx}\n${contextStr}\nResponda em JSON: { "message": "...", "short_variant": "...", "confidence": 10, "scam_risk": "baixo", "scam_reasons": [] }`;
      userPrompt = `Ação: ${action}.\nInstrução: ${userQuery || "Gere uma abordagem."}`;
    }

    const aiMessages: any[] = [{ role: "system", content: systemPrompt }];
    if (image) {
      aiMessages.push({
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}` } }
        ]
      });
    } else {
      aiMessages.push({ role: "user", content: userPrompt });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: aiMessages,
        temperature: 0.2
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(JSON.stringify({ error: `IA Indisponível (Gateway ${response.status})`, details: err }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const rawContent = result.choices?.[0]?.message?.content || "{}";

    let parsed = {};
    try {
      // Extrai JSON apenas se houver blocos de código ou texto extra
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(rawContent);
      }
    } catch (parseErr) {
      console.error("Parse Error:", parseErr, rawContent);
      parsed = {
        error: "Resposta da IA em formato inválido",
        details: rawContent.slice(0, 100)
      };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }), {
      status: 200, // Return 200 but with error field
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
