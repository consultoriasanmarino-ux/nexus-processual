const GEMINI_API_KEYS = (import.meta.env.VITE_GEMINI_API_KEY || "").split(",").map((k: string) => k.trim()).filter(Boolean);
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODELS = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-flash"];

interface GeminiPart {
    text?: string;
    inlineData?: { mimeType: string; data: string };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(systemPrompt: string, userParts: GeminiPart[]): Promise<string> {
    const body = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: userParts }],
        generationConfig: {
            temperature: 0.15,
            responseMimeType: "application/json",
        },
    };

    if (GEMINI_API_KEYS.length === 0) {
        throw new Error("Nenhuma chave de API do Gemini configurada no arquivo .env");
    }

    // Try each API Key
    for (const key of GEMINI_API_KEYS) {
        // For each key, try available models
        for (const model of MODELS) {
            const url = `${BASE_URL}/${model}:generateContent?key=${key}`;

            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const res = await fetch(url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body),
                    });

                    if (res.ok) {
                        const result = await res.json();
                        const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
                        console.log(`Gemini OK (${model}, chave iniciada em ${key.substring(0, 6)})`);
                        return text;
                    }

                    if (res.status === 429) {
                        console.warn(`Limite (429) na chave ${key.substring(0, 6)} modelo ${model} (tentativa ${attempt + 1})`);
                        if (attempt === 0) {
                            await sleep(1000);
                            continue;
                        }
                        break;
                    }

                    if (res.status === 404) {
                        console.warn(`Modelo ${model} não encontrado para a chave ${key.substring(0, 6)} (404). Tentando próximo...`);
                        break; // Try next model
                    }

                    // Non-429, non-404 error: throw immediately
                    const errText = await res.text();
                    console.error(`Gemini error (${model}):`, res.status, errText);
                    throw new Error(`Erro na API do Gemini (${res.status})`);
                } catch (err: any) {
                    if (err.message?.includes("Erro na API")) throw err;
                    console.error(`Fetch error (${model}):`, err);
                    // Continue to next model/key
                    break;
                }
            }
        }
    }

    throw new Error("Limite de requisições atingido em TODAS as chaves disponíveis. Aguarde alguns instantes.");
}

function extractJson(raw: string): any {
    try {
        // Remove markdown code blocks if present
        let jsonStr = raw;
        const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) jsonStr = codeBlockMatch[1];
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
        return JSON.parse(raw);
    } catch {
        console.error("Failed to parse Gemini JSON:", raw.slice(0, 500));
        return null;
    }
}

// ==================== AI ANALYZE (PDF extraction) ====================

export async function aiAnalyze(params: {
    petitionText: string;
    contractText: string;
    contractType: string;
    phoneProvided?: string;
    contractImages?: string[];
}): Promise<{ success: boolean; extracted: any; error?: string }> {
    const { petitionText, contractText, contractType, phoneProvided, contractImages } = params;

    const systemPrompt = `Você é um especialista em análise de petições judiciais e cálculos de liquidação.
Sua tarefa é extrair os dados do cliente e, principalmente, os valores financeiros do processo com precisão cirúrgica.

ONDE ENCONTRAR OS DADOS (IMPORTANTE):
- DADOS DO CLIENTE (nome, CPF, telefone): Geralmente nas PRIMEIRAS páginas, na "Qualificação do Autor".
- VALORES FINANCEIROS: Geralmente nas ÚLTIMAS páginas da petição. Procure por:
  * "Valor da causa", "Dá-se à causa o valor de", "Valor total", "Total devido"
  * Tabelas de cálculo com valores discriminados
  * "Valor incontroverso" vs "Valor controverso" (diferença devida)
  * "Valor a ser depositado", "Montante a ser liberado"
  * Valores em formato R$ XX.XXX,XX
- PRESTE ATENÇÃO ESPECIAL ao final do documento onde os valores são consolidados.

REGRAS DE OURO PARA VALORES (CRÍTICO):
1. PRIORIDADE "VALOR CONTROVERSO": Se a petição mencionar um "valor incontroverso" e um "valor controverso" (ou "diferença devida", "valor remanescente"), PRIORIZE o VALOR CONTROVERSO para o campo 'case_value' e 'principal_value'. É esse valor que o sistema precisa para o ofício.
2. DISTINÇÃO SUCUMBÊNCIA VS CONTRATUAL: 
   - Honorários de Sucumbência: Pagos pelo réu ao advogado (geralmente fixados pelo juiz).
   - Honorários Contratuais: Descontados do valor do cliente (geralmente 30% ou 35%).
   - Se a petição listar valores separados para o cliente e para os advogados, identifique o percentual e certifique-se de que 'client_net_value' reflete o que o CLIENTE recebe após os descontos contratuais.
3. CÁLCULO DE VALORES:
   - case_value: O montante total que o advogado quer que seja depositado/liberado agora (geralmente Principal + Sucumbência daquela parcela).
   - principal_value: O valor bruto destinado ao cliente (sem contar a sucumbência).
   - lawyer_fee_percent: % de honorários CONTRATUAIS (quem o cliente paga ao advogado).
   - lawyer_fee_value: O valor em R$ desses honorários contratuais.
   - client_net_value: O valor líquido final do cliente (Principal - Honorários Contratuais).
4. Se encontrar apenas um valor total (ex: "Valor da causa: R$ 50.000,00"), use-o como case_value E principal_value.

REGRAS DE OURO PARA TELEFONE (CRÍTICO):
1. O telefone do cliente é a informação mais importante.
2. NO CONTRATO: Procure no bloco "Dados do Emitente" ou "Dados do Cliente". 
3. NA PETIÇÃO: Procure na "Qualificação do Autor".
4. FORMATO: Apenas dígitos.

Responda APENAS com JSON:
{
  "client_name": "NOME COMPLETO",
  "client_cpf": "CPF_SO_DIGITOS",
  "defendant": "BANCO_REU/INSS/ETC",
  "case_type": "TIPO_DA_ACAO",
  "court": "VARA_E_COMARCA",
  "process_number": "NUMERO_PROCESSO",
  "case_value": 0.00,
  "principal_value": 0.00,
  "lawyer_fee_percent": 0.00,
  "lawyer_fee_value": 0.00,
  "client_net_value": 0.00,
  "lawyers": [{"name": "...", "oab": "...", "role": "..."}],
  "partner_law_firm": "ESCRITORIO",
  "phone_contract": "DIGITOS_DO_CELULAR",
  "client_details": {
    "age": "IDADE",
    "profession": "PROFISSÃO",
    "income": "RENDA_MENSAL",
    "vehicles": ["VEICULO_1", "VEICULO_2"],
    "banks": ["BANCO_1", "BANCO_2"]
  },
  "summary": "RESUMO_2_OU_3_FRASES_SOBRE_O_DIREITO_E_VALORES"
}`;

    // Smart text truncation: keep beginning (client data) + end (financial values)
    // Values are almost always in the last pages of the petition
    const fullPetition = petitionText || "";
    const MAX_TOTAL = 14000;
    let pText: string;
    if (fullPetition.length <= MAX_TOTAL) {
        pText = fullPetition;
    } else {
        const HEAD = 7000; // First pages: client info, case details, court
        const TAIL = 7000; // Last pages: financial values, totals, signatures
        const head = fullPetition.slice(0, HEAD);
        const tail = fullPetition.slice(-TAIL);
        pText = head + "\n\n[... PÁGINAS INTERMEDIÁRIAS OMITIDAS ...]\n\n" + tail;
    }

    const userParts: GeminiPart[] = [
        { text: `Telefone fornecido pelo operador: ${phoneProvided || "não informado"}\n\nTEXTO DA PETIÇÃO:\n${pText || "Não fornecido"}` },
    ];

    // Add contract images for OCR (as inline data)
    if (contractImages && contractImages.length > 0) {
        userParts[0] = { text: `Telefone fornecido pelo operador: ${phoneProvided || "não informado"}\n\nTEXTO DA PETIÇÃO:\n${pText || "Não fornecido"}\n\nAs imagens abaixo são páginas do contrato/CCB. Extraia TODOS os dados, especialmente o CELULAR do cliente:` };
        for (const img of contractImages) {
            // data:image/jpeg;base64,/9j/...
            const match = img.match(/^data:(image\/\w+);base64,(.+)$/);
            if (match) {
                userParts.push({ inlineData: { mimeType: match[1], data: match[2] } });
            }
        }
    }

    try {
        const raw = await callGemini(systemPrompt, userParts);
        const extracted = extractJson(raw);
        if (!extracted) return { success: false, extracted: null, error: "Resposta da IA em formato inválido." };
        return { success: true, extracted };
    } catch (err: any) {
        return { success: false, extracted: null, error: err.message };
    }
}

// ==================== AI MESSAGE (chat + message generation) ====================

const DEFAULT_COMPANY_CONTEXT = `Advogado Paulo Tanaka. Somos uma empresa parceira que acompanha o processo jurídico de alguns casos, e notificamos o cliente quando ele tem algo para receber, no caso, quando as causas são favoráveis.
O valor é sempre pago 100% integralmente, sem parcelamento.
Para receber esse valor, vamos precisar que o cliente informe seus dados para pagamento: Banco, Agência e Conta. Após o envio dos dados, o Dr. Bruno entra em contato para fazer a validação da conta e efetuar o pagamento ao titular.
REGRAS INTERNAS:
- NUNCA diga percentuais ao cliente. Informe o valor total em reais.
- O valor integral da causa deve ser informado como disponível para recebimento.
- NÃO mencione o Dr. Bruno antes do cliente enviar os dados bancários.
- Abordagem sutil: confirmar identidade, depois novidades, depois valores.
- O pagamento é feito ao titular da conta informada pelo cliente.`;

function getTimePolicy(caseValueInput: any): string {
    const val = typeof caseValueInput === "string" ? parseFloat(caseValueInput) : (Number(caseValueInput) || 0);
    const valorFormatado = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `INFO INTERNA: Liberar sempre o valor INTEGRAL do caso. Valor total disponível: R$ ${valorFormatado(val)}. Diga ao cliente este valor total em reais.`;
}

export async function aiMessage(params: {
    action: string;
    caseTitle?: string;
    defendant?: string;
    caseType?: string;
    court?: string;
    companyContext?: string;
    recentMessages?: { sender: string; text: string }[];
    caseValue?: any;
    image?: string | null;
    userQuery?: string;
    [key: string]: any;
}): Promise<any> {
    const { action, caseTitle, defendant, caseType, court, companyContext, recentMessages, caseValue, image, userQuery } = params;

    const timePolicy = getTimePolicy(caseValue);
    const compCtx = companyContext || DEFAULT_COMPANY_CONTEXT;
    const contextStr = `Caso: ${caseTitle}\nRéu: ${defendant}\nTipo: ${caseType}\nTribunal: ${court}\n${timePolicy}`;

    let systemPrompt = "";
    let userPrompt = "";

    if (action === "chat_assistant") {
        const chatHistory = (recentMessages || []).map((m) => `${m.sender}: ${m.text}`).join("\n");
        systemPrompt = `Você é o "Nexus Assistente", especialista em negociação via WhatsApp.
CONTEXTO DA EMPRESA: ${compCtx}
${contextStr}
Responda em JSON: { "analysis": "...", "suggestions": [{"label": "...", "text": "..."}], "advice": "..." }`;
        userPrompt = `HISTÓRICO:\n${chatHistory}\n\nPERGUNTA:\n${userQuery || "Analisar situação."}${image ? "\n(HÁ IMAGEM EM ANEXO)" : ""}`;
    } else {
        systemPrompt = `Gerador de Mensagens Jurídicas.\n${compCtx}\n${contextStr}\nResponda em JSON: { "message": "...", "short_variant": "...", "confidence": 10, "scam_risk": "baixo", "scam_reasons": [] }`;
        userPrompt = `Ação: ${action}.\nInstrução: ${userQuery || "Gere uma abordagem."}`;
    }

    const userParts: GeminiPart[] = [{ text: userPrompt }];

    if (image) {
        const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match) {
            userParts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        }
    }

    const raw = await callGemini(systemPrompt, userParts);
    const parsed = extractJson(raw);

    if (!parsed) {
        return { error: "Resposta da IA em formato inválido", details: raw.slice(0, 100) };
    }

    return parsed;
}
