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

    const systemPrompt = `Você é um assistente jurídico especializado em análise de documentos brasileiros de financiamento e petições iniciais.
    
Você receberá dois textos:
1. TEXTO DA PETIÇÃO: Uma petição inicial de um processo judicial.
2. TEXTO DO CONTRATO (CCB): Um contrato de financiamento (Cédula de Crédito Bancário - CCB).

TAREFA: Extraia dados estruturados combinando as informações de ambos os documentos.

DIRETRIZES DE EXTRAÇÃO DE TELEFONE (ERRO ZERO):
- O campo "phone_petition" é OBRIGATÓRIO se houver qualquer número de telefone na qualificação do autor.
- EXEMPLO DE PADRÃO REAL: "ANDERSON SILVA..., residente em..., e-mail..., fone (54) 99606-3467, por seu procurador..."
- NESTE EXEMPLO: O número (54) 99606-3467 PERTENCE AO AUTOR. 
- REGRA ABSOLUTA: Ignorar a palavra "procurador" ou "advogado" se ela vier DEPOIS do telefone na mesma frase de qualificação. O telefone que vem ANTES de "por seu procurador" é SEMPRE do cliente.
- FORMATO: Extraia apenas os dígitos. Se o número for "54996063467", salve exatamente assim.

DADOS DO CONTRATO (CCB):
- O campo "phone_contract" deve vir do quadro de emitente do contrato (se enviado).

ESTRUTURA DE RESPOSTA (JSON):
{
  "client_name": "NOME DO AUTOR",
  "client_cpf": "CPF DO AUTOR",
  "defendant": "NOME DO RÉU",
  "case_type": "TIPO DA AÇÃO",
  "court": "VARA/COMARCA",
  "process_number": "NÚMERO DO PROCESSO",
  "distribution_date": "YYYY-MM-DD",
  "case_value": 12345.67,
  "lawyers": [{"name": "...", "oab": "...", "role": "..."}],
  "partner_law_firm": "escritório",
  "phone_petition": "apenas_digitos_do_autor_na_peticao",
  "phone_contract": "apenas_digitos_do_contrato",
  "summary": "resumo extremamente conciso em 2-3 frases em linguagem simples para leigos, focando apenas no objetivo da ação e no veículo/banco envolvido."
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
