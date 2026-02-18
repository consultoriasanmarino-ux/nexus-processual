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

    const { petitionText, contractText, contractType, phoneProvided, contractImages } = await req.json();

    if (!petitionText?.trim() && !contractText?.trim() && (!contractImages || contractImages.length === 0)) {
      return new Response(JSON.stringify({ error: "Nenhum texto ou imagem disponível para análise." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isOmni = contractType === "omni";

    const systemPrompt = `Você é um especialista em análise de contratos de financiamento de veículos (CCB) e petições judiciais.
Sua tarefa é extrair os dados do cliente e do processo para um sistema de gestão.

REGRAS DE OURO PARA TELEFONE (CRÍTICO):
1. O telefone do cliente é a informação mais importante.
2. NO CONTRATO OMNI: Procure o bloco "Dados do Emitente". O telefone está quase sempre no campo "Celular:", posicionado logo abaixo ou ao lado do e-mail. 
   Exemplo Real: "E-mail: fulano@gmail.com Celular: (53) 99999-9999".
3. NA PETIÇÃO: Procure na "Qualificação do Autor" no início do texto.
4. MAPEAMENTO: Salve qualquer telefone encontrado do cliente no campo "phone_contract". 
5. FORMATO: Apenas dígitos.

RESUMO DO CASO:
- Escreva um resumo completo mas curto (2 a 3 frases).
- Deve dizer quem é o autor, contra qual banco é a ação e qual o motivo (ex: revisão de contrato ou negativação indevida).
- PROIBIDO: Listar CPFs, RGs ou jurisprudências longas.

Responda APENAS com JSON:
{
  "client_name": "NOME COMPLETO",
  "client_cpf": "CPF_SO_DIGITOS",
  "defendant": "BANCO_REU",
  "case_type": "TIPO_DA_ACAO",
  "court": "VARA_E_COMARCA",
  "process_number": "NUMERO_PROCESSO",
  "distribution_date": "YYYY-MM-DD",
  "case_value": 0.00,
  "lawyers": [{"name": "...", "oab": "...", "role": "..."}],
  "partner_law_firm": "ESCRITORIO",
  "phone_contract": "DIGITOS_DO_CELULAR",
  "summary": "RESUMO_2_OU_3_FRASES"
}`;

    // Truncate texts to avoid token limits
    const pText = (petitionText || "").slice(0, 10000);
    const cText = (contractText || "").slice(0, 5000);
    const hasImages = contractImages && contractImages.length > 0;
    console.log("Sending to AI, petition length:", pText.length, "contract length:", cText.length, "contract images:", hasImages ? contractImages.length : 0);

    // Build multimodal user content
    const userContent: any[] = [
      { type: "text", text: `Telefone fornecido pelo operador: ${phoneProvided || "não informado"}\n\nTEXTO DA PETIÇÃO:\n${pText || "Não fornecido"}\n\nTEXTO DO CONTRATO/CCB:\n${cText || "Não fornecido"}` },
    ];

    // Add contract images for OCR if text extraction failed
    if (hasImages) {
      userContent[0] = { type: "text", text: `Telefone fornecido pelo operador: ${phoneProvided || "não informado"}\n\nTEXTO DA PETIÇÃO:\n${pText || "Não fornecido"}\n\nAs imagens abaixo são páginas do contrato/CCB. Extraia TODOS os dados, especialmente o CELULAR do cliente:` };
      for (const img of contractImages) {
        userContent.push({ type: "image_url", image_url: { url: img } });
      }
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
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
