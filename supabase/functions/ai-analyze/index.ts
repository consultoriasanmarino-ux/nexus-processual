import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { petitionText, contractText, contractType, phoneProvided } = await req.json();

    if (!petitionText?.trim() && !contractText?.trim()) {
      return new Response(JSON.stringify({ error: "Nenhum texto disponível para análise." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isOmni = contractType === "omni";

    const systemPrompt = `Você é um especialista em análise de documentos jurídicos brasileiros (Petições Iniciais e Contratos de Financiamento/CCB).
Sua missão é extrair dados estruturados para cadastrar um novo caso no sistema.

DIRETRIZES DE EXTRAÇÃO (CRÍTICO):
1. TELEFONES DO CLIENTE (AUTOR):
   - Os telefones são a informação mais importante. Procure exaustivamente.
   - NA PETIÇÃO: Geralmente no primeiro parágrafo (qualificação), junto ao Nome, CPF e Endereço. Ex: "...telefone (54) 99606-3467...".
   - NO CONTRATO: Procure no bloco "Dados do Emitente" ou "Dados do Devedor".
   - MAPEAMENTO:
     - Se o fone estiver na Petição Inicial -> salve em "phone_petition".
     - Se o fone estiver no Contrato/CCB -> salve em "phone_contract".
     - Se encontrar um fone e não tiver certeza absoluta de onde veio, priorize o campo "phone_petition".
   - FILTRO: Ignore telefones claramente associados a advogados (que tenham OAB ao lado) ou do fórum/tribunal.

2. DADOS CADASTRAIS:
   - Extraia Nome Completo, CPF (apenas números), Réu (Banco/Financeira), Número do Processo e Valor da Causa.
   - Forneça um resumo conciso (summary) de 2-3 frases.

Responda APENAS com JSON válido conforme este modelo:
{
  "client_name": "Nome",
  "client_cpf": "12345678901",
  "defendant": "Nome do Banco",
  "case_type": "Tipo da ação",
  "court": "Vara e Comarca",
  "process_number": "Número",
  "distribution_date": "YYYY-MM-DD",
  "case_value": 0.00,
  "lawyers": [{"name": "...", "oab": "...", "role": "..."}],
  "partner_law_firm": "Escritório",
  "phone_petition": "apenas_numeros",
  "phone_contract": "apenas_numeros",
  "summary": "Resumo aqui."
}`;

    // Truncate texts to avoid token limits
    const pText = (petitionText || "").slice(0, 10000);
    const cText = (contractText || "").slice(0, 5000);
    console.log("Sending text to AI, petition length:", pText.length, "contract length:", cText.length);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Telefone fornecido pelo operador: ${phoneProvided || "não informado"}\n\nTEXTO DA PETIÇÃO:\n${pText || "Não fornecido"}\n\nTEXTO DO CONTRATO/CCB:\n${cText || "Não fornecido"}` },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({
        error: `Erro no gateway de IA: ${response.status}`,
        details: errText
      }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";
    console.log("AI response length:", content.length, "First 200 chars:", content.slice(0, 200));

    let extracted: any = {};
    try {
      // Try to find JSON in the response, handling markdown code blocks
      let jsonStr = content;
      // Remove markdown code blocks if present
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      }
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      } else {
        console.error("No JSON found in AI response:", content.slice(0, 500));
        extracted = { summary: content, client_name: "", defendant: "" };
      }
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr, "Content:", content.slice(0, 500));
      extracted = { summary: content, client_name: "", defendant: "" };
    }

    return new Response(JSON.stringify({ success: true, extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-analyze error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
