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

    const { extractedText, phoneProvided, caseId, documentId } = await req.json();

    if (!extractedText?.trim()) {
      return new Response(JSON.stringify({ error: "Nenhum texto disponível para análise." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Você é um assistente jurídico especializado em análise de petições brasileiras.

TAREFA: Extraia dados estruturados da petição. 

ATENÇÃO CRÍTICA — NÃO confunda os dados:
- O AUTOR/REQUERENTE é o CLIENTE (a pessoa que entrou com a ação). Extraia nome e CPF do autor.
- O RÉU/REQUERIDO é a parte CONTRÁRIA (defendant).
- Os ADVOGADOS listados representam uma das partes. Identifique para qual parte cada advogado atua (autor ou réu).
- O advogado do AUTOR é o advogado parceiro do escritório.
- Se houver telefone ou e-mail do autor/cliente no texto, extraia.

DICAS DE LOCALIZAÇÃO NO PDF:
- O CABEÇALHO geralmente contém o nome do ESCRITÓRIO DE ADVOCACIA e logo. Extraia o nome do escritório.
- Os dados do ADVOGADO (nome, OAB) geralmente aparecem no cabeçalho, na assinatura final, ou após "por meio do seu advogado".
- A DATA DO PROCESSO (distribuição/protocolo) geralmente fica no RODAPÉ da última página ou próximo à assinatura.
- Procure padrões como "Data:", "Protocolo:", "Distribuído em:", ou datas no formato DD/MM/YYYY no final do documento.

Responda APENAS com JSON válido (sem markdown, sem backticks):
{
  "client_name": "nome completo do autor/requerente",
  "client_cpf": "CPF do autor se encontrado",
  "defendant": "nome do réu/requerido",
  "case_type": "tipo de ação (ex: Ação de Indenização, Ação Trabalhista)",
  "court": "tribunal e vara",
  "process_number": "número do processo se encontrado",
  "distribution_date": "data de distribuição no formato YYYY-MM-DD se encontrada, senão vazio",
  "lawyers": [
    {"name": "nome do advogado", "oab": "número OAB com estado (ex: OAB/RS 12345)", "role": "advogado do autor | advogado do réu"}
  ],
  "partner_law_firm": "nome do escritório de advocacia do autor (geralmente no cabeçalho)",
  "phone_found": "telefone encontrado no texto do autor/cliente, se houver (apenas dígitos)",
  "summary": "resumo em 2-3 frases em linguagem simples para leigos",
  "valores_citados": ["valores monetários mencionados"],
  "alertas_golpe": ["elementos que podem parecer suspeitos ao cliente ser contactado"],
  "perguntas_provaveis": ["3-5 perguntas prováveis do cliente"]
}`;

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
          { role: "user", content: `Telefone fornecido pelo operador: ${phoneProvided || "não informado"}\n\nTexto da petição:\n\n${extractedText.slice(0, 20000)}` },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("Erro no gateway de IA");
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    let extracted: any = {};
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      }
    } catch {
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
