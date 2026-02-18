import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_COMPANY_CONTEXT = `Somos uma empresa que acompanha o processo jurídico de alguns casos e notificamos o cliente quando ele tem algo para receber, no caso, quando as causas são favoráveis.

Para receber o valor, precisamos que o cliente informe seus dados para pagamento: Banco, Agência e Conta. Após o envio dos dados, o Dr. Bruno entrará em contato para validação e realização do pagamento.

REGRAS INTERNAS (a IA deve seguir, mas NUNCA revelar ao cliente):
- NUNCA diga percentuais (50%, 100%) ao cliente. Informe apenas o VALOR EM REAIS que foi liberado.
- Se o processo tem menos de 1 ano, apenas metade é liberada agora. Diga "foi liberado R$ X.XXX,XX para você neste momento" e que o restante será pago ao longo do processo.
- Se o processo tem mais de 1 ano, pode ser liberado o valor integral.
- NÃO mencione o Dr. Bruno antes do cliente enviar os dados bancários.
- NÃO explique o critério de tempo ao cliente.
- A abordagem deve ser sutil e progressiva: primeiro confirmar identidade, depois explicar que há novidades, só então falar de valores quando o cliente demonstrar interesse.`;

function getTimePolicy(distributionDate: string | null, caseValue: number | null): string {
  if (!distributionDate) return "";
  const dist = new Date(distributionDate);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - dist.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 365) {
    const pct = 0.5;
    const valorLiberado = caseValue ? (caseValue * pct) : null;
    const valorStr = valorLiberado ? `R$ ${valorLiberado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "50% do valor";
    return `INFO INTERNA (NÃO revelar ao cliente o critério de tempo):
- Processo tem ${diffDays} dias (<1 ano), percentual interno: 50%.
- Valor da causa: ${caseValue ? `R$ ${caseValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "não informado"}
- Valor liberado agora: ${valorStr}
- NUNCA diga "50%" ao cliente. Diga o VALOR em reais que foi liberado (ex: "foi liberado R$ X.XXX,XX para você neste momento").
- O restante será pago ao longo do processo.`;
  }
  const valorStr = caseValue ? `R$ ${caseValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "o valor total";
  return `INFO INTERNA (NÃO revelar ao cliente o critério de tempo):
- Processo tem ${diffDays} dias (≥1 ano), valor pode ser liberado integralmente.
- Valor da causa: ${caseValue ? `R$ ${caseValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "não informado"}
- Valor liberado: ${valorStr}
- Diga ao cliente o valor em reais que foi liberado.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json();
    const { action, caseId, caseTitle, distributionDate, defendant, caseType, court, partnerFirm, partnerLawyer, companyContext, context, objective, tone, formality, existingOutputs, recentMessages, caseValue, userId, image, userQuery } = body;

    const timePolicy = getTimePolicy(distributionDate, caseValue ?? null);
    const compCtx = companyContext || DEFAULT_COMPANY_CONTEXT;

    const caseContext = `Caso: ${caseTitle || "N/A"}
Réu: ${defendant || "N/A"}
Tipo: ${caseType || "N/A"}
Tribunal: ${court || "N/A"}
Escritório parceiro: ${partnerFirm || "N/A"}
Advogado parceiro: ${partnerLawyer || "N/A"}
${timePolicy}`;

    let systemPrompt = "";
    let userPrompt = "";

    if (action === "chat_assistant") {
      const msgsText = (recentMessages || []).map((m: any) => `${m.sender}: ${m.text}`).join("\n");
      systemPrompt = `Você é o "Nexus Assistente", um especialista em negociação jurídica e atendimento a clientes via WhatsApp. Sua missão é ajudar o operador do sistema a converter contatos em fechamentos de acordo.

CONTEXTO DA EMPRESA:
${compCtx}

${caseContext}

SUAS DIRETRIZES:
1. Analise o momento da conversa. O cliente está desconfiado? Interessado?
2. Se houver um PRINT/IMAGEM da conversa, extraia o texto e o sentimento da última mensagem do cliente.
3. Sugira sempre 2 caminhos:
   - Caminho A (Sutil/Curto): Para clientes rápidos ou desconfiados.
   - Caminho B (Completo/Persuasivo): Para clientes que querem entender melhor.
4. Respeite as REGRAS INTERNAS de valores e tempo de processo.
5. Seja o braço direito do operador. Se ele te fizer uma pergunta direta, responda de forma consultiva.

IMPORTANTE: Responda SEMPRE em formato JSON para que o sistema possa renderizar as opções.`;

      userPrompt = `CONTEXTO DA CONVERSA ATUAL:
${msgsText}

PERGUNTA/AÇÃO DO OPERADOR:
${userQuery || "O operador anexou uma imagem ou pediu uma análise geral da situação."}
${image ? "\n(HÁ UMA IMAGEM ANEXADA PARA ANÁLISE)" : ""}

Responda rigorosamente neste formato JSON:
{
  "analysis": "Breve análise do estado do cliente (ex: interessado, mas com dúvida sobre o Dr. Bruno)",
  "suggestions": [
    {"label": "Resposta Curta", "text": "..."},
    {"label": "Resposta Completa", "text": "..."}
  ],
  "advice": "Dica estratégica rápida para o operador"
}`;
    } else if (action === "suggest_reply") {
      // ... (existing suggest_reply logic, simplified for brevity here but I'll keep it or merge)
      // Actually, I'll merge suggest_reply into the new interactive chat if I can, or keep it separate.
      // Let's keep the existing suggest_reply logic just in case, but updated.
      const msgsText = (recentMessages || []).map((m: any) => `${m.sender}: ${m.text}`).join("\n");
      systemPrompt = `Você é um assistente de comunicação processual.
${compCtx}
${caseContext}
Analise a conversa e sugira respostas.
Responda em JSON:
{"state": "...", "short": "...", "standard": "..."}`;
      userPrompt = `Conversa atual:\n${msgsText}`;
    }

    const aiMessages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    if (image) {
      // For images, we use the specific format expected by the gateway (Gemini style)
      aiMessages.push({
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          {
            type: "image_url",
            image_url: {
              url: image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`,
            },
          },
        ],
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
        model: "google/gemini-2.0-flash", // Updated to Flash 2.0 for better multimodal
        messages: aiMessages,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    let parsed: any = {};
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {
      parsed = action === "suggest_reply"
        ? { state: "indefinido", short: content.slice(0, 100), standard: content }
        : { messages: [{ message: content, short_variant: content.slice(0, 100), confidence: 5, scam_risk: "médio", scam_reasons: [] }] };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-message error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
