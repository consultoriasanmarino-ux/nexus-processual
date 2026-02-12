import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_COMPANY_CONTEXT = `Somos uma empresa que acompanha o processo jurídico de alguns casos, e notificamos o cliente quando ele tem algo para receber, no caso, quando as causas são favoráveis.
Quando tem menos de 1 ano do processo, somente 50% do valor é pago de forma imediata e o restante vai ser pago ao longo do restante do processo. Para receber esse valor vamos precisar que informe seus dados para pagamento, Banco, Agência e Conta e então depois o Dr Bruno vai entrar em contato para fazer a realização do pagamento e validação da conta.`;

function getTimePolicy(distributionDate: string | null): string {
  if (!distributionDate) return "";
  const dist = new Date(distributionDate);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - dist.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 365) {
    return `POLÍTICA DE TEMPO (< 1 ano desde distribuição, ${diffDays} dias):
Quando o tema for "percentual", trate como política operacional do serviço com repasse/adiantamento parcial (50%) condicionado a validação e documentação, sem afirmar liberação judicial.`;
  }
  return `POLÍTICA DE TEMPO (≥ 1 ano desde distribuição, ${diffDays} dias):
A política pode permitir repasse integral (100%) condicionado a validação e documentação, sem afirmar liberação judicial.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const body = await req.json();
    const { action, caseId, caseTitle, distributionDate, defendant, caseType, court, partnerFirm, partnerLawyer, companyContext, context, objective, tone, formality, existingOutputs, recentMessages } = body;

    const timePolicy = getTimePolicy(distributionDate);
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

    if (action === "suggest_reply") {
      const msgsText = (recentMessages || []).map((m: any) => `${m.sender}: ${m.text}`).join("\n");
      systemPrompt = `Você é um assistente de comunicação processual para uma empresa que acompanha processos judiciais e se comunica com clientes via WhatsApp, em parceria com escritórios de advocacia.

CONTEXTO DA EMPRESA (USE COMO BASE PARA TODAS AS RESPOSTAS):
${compCtx}

IMPORTANTE SOBRE ABORDAGEM:
- Na PRIMEIRA mensagem ou quando o cliente ainda não sabe dos detalhes, seja sutil. Não mencione valores, percentuais ou pagamentos diretamente.
- Comece com uma abordagem amigável, confirmando se a pessoa recebeu a mensagem e se é a pessoa correta.
- Só aprofunde sobre valores e dados bancários DEPOIS que o cliente demonstrar interesse e responder positivamente.
- A progressão deve ser: 1) Contato inicial sutil → 2) Confirmação de identidade → 3) Explicar que há novidades sobre o processo → 4) Quando o cliente perguntar, explicar sobre o valor → 5) Solicitar dados bancários → 6) Informar que o Dr. Bruno entrará em contato.

${caseContext}

REGRAS:
- Nunca se apresente como advogado
- Nunca prometa resultados judiciais
- Seja transparente sobre o papel da empresa
- Adapte a linguagem ao nível de compreensão do cliente
- NÃO revele valores ou percentuais até que o cliente demonstre interesse
${timePolicy}

Analise a conversa e classifique o estado emocional do cliente (desconfiado/curioso/resistente/ansioso/interessado).
Sugira 2 respostas: uma curta e uma padrão, adequadas ao MOMENTO da conversa (se é início, meio ou fim do funil).

Responda em JSON:
{"state": "...", "short": "resposta curta", "standard": "resposta padrão completa"}`;

      userPrompt = `Conversa recente:\n${msgsText}\n\nSugira respostas adequadas ao momento atual da conversa.`;
    } else {
      const count = action === "variations_v1" ? 3 : 1;
      const modifier = action === "make_trustworthy" ? "\nFoque em tornar a mensagem mais confiável, incluindo referências ao escritório parceiro e ao processo."
        : action === "reduce_scam" ? "\nReduza elementos que possam parecer golpe. Evite urgência, valores específicos prematuros, e links. Inclua formas de verificação."
        : action === "simplify" ? "\nSimplificar ao máximo a linguagem. Use frases curtas, evite jargão jurídico."
        : "";

      systemPrompt = `Você é um assistente de comunicação processual.

CONTEXTO DA EMPRESA:
${compCtx}

Contexto adicional: ${context || "N/A"}
Objetivo: ${objective || "N/A"}
Tom: ${tone || "profissional"}
Formalidade: ${formality || "média"}

${caseContext}

REGRAS:
- Nunca se apresente como advogado
- Nunca prometa resultados judiciais
- Seja transparente sobre o papel da empresa
- Mencione o escritório parceiro quando relevante
- Na abordagem inicial, NÃO mencione valores ou percentuais
${modifier}
${timePolicy}

Gere ${count} mensagem(ns). Para cada uma, avalie:
- confidence: nota de 0 a 10
- scam_risk: baixo/médio/alto
- scam_reasons: lista de motivos do risco

Responda em JSON:
{"messages": [{"message": "...", "short_variant": "versão curta", "confidence": N, "scam_risk": "...", "scam_reasons": ["..."]}]}`;

      userPrompt = action === "approach_v1"
        ? "Gere uma mensagem de abordagem inicial para o primeiro contato com o cliente sobre este processo. Seja sutil, não mencione valores."
        : action === "variations_v1"
        ? "Gere 3 variações diferentes de mensagem para este caso."
        : `Reescreva/melhore esta mensagem existente:\n${existingOutputs?.[0] || "Gere uma mensagem nova."}`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
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
