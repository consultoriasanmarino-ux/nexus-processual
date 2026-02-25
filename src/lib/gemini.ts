import { supabase } from "@/integrations/supabase/client";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODELS = ["gemini-2.5-flash"];

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

    // 1. Fetch keys from Supabase
    let dbKeys: any[] = [];
    try {
        const { data } = await supabase
            .from("gemini_api_keys" as any)
            .select("key_value")
            .order("created_at", { ascending: true });
        dbKeys = data || [];
    } catch (e) {
        console.warn("Could not fetch keys from Supabase table:", e);
    }

    // 2. Combine with .env keys (legacy support)
    const envKeys = (import.meta.env.VITE_GEMINI_API_KEY || "").split(",").map((k: string) => k.trim()).filter(Boolean);
    const apiKeys = [...dbKeys.map(k => k.key_value), ...envKeys];

    if (apiKeys.length === 0) {
        throw new Error("Nenhuma chave de API configurada. Adicione chaves em Configurações.");
    }

    let lastErrorDetails = "";
    const MAX_RETRIES = 3;

    // Rotativo: Try each API Key starting from a random index for better distribution
    const startIndex = Math.floor(Math.random() * apiKeys.length);
    for (let i = 0; i < apiKeys.length; i++) {
        const key = apiKeys[(startIndex + i) % apiKeys.length];
        const url = `${BASE_URL}/${MODELS[0]}:generateContent?key=${key}`;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                console.log(`Tentando Gemini 2.5 Flash (chave ${key.substring(0, 5)}..., tentativa ${attempt + 1}/${MAX_RETRIES})`);
                const res = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });

                // Read body ONCE as text, then parse
                const responseText = await res.text();
                let responseJson: any = {};
                try { responseJson = JSON.parse(responseText); } catch { }

                if (res.ok) {
                    const text = responseJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
                    console.log(`✅ Gemini 2.5 Flash: Sucesso!`);
                    return text;
                }

                const errMsg = responseJson.error?.message || `Status ${res.status}`;
                lastErrorDetails = errMsg;
                console.error(`❌ Gemini erro (${res.status}):`, errMsg);

                // 429 = Rate Limit: wait and retry with this same key
                if (res.status === 429) {
                    const waitSeconds = Math.pow(2, attempt + 1) * 5; // 10s, 20s, 40s
                    console.warn(`⏳ Rate limit atingido. Aguardando ${waitSeconds}s antes de tentar novamente...`);
                    await sleep(waitSeconds * 1000);
                    continue; // Retry same key
                }

                // 403/400 = Key or permission issue, try next key
                if (res.status === 403 || res.status === 400) {
                    break; // Next key
                }

                // 404 = Model not found
                if (res.status === 404) {
                    throw new Error("Modelo gemini-2.5-flash não encontrado. Verifique se a API Gemini está habilitada no seu projeto Google Cloud.");
                }

                // Other errors: try next key
                break;

            } catch (err: any) {
                lastErrorDetails = err.message;
                console.error(`Erro de rede:`, err);
                if (err.message.includes("Modelo gemini-2.5-flash")) throw err; // Re-throw model errors
                break; // Network error, try next key
            }
        }
    }

    throw new Error(`Falha na API Gemini: ${lastErrorDetails}`);
}

function extractJson(raw: string): any {
    try {
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

    const fullPetition = petitionText || "";
    const MAX_TOTAL = 14000;
    let pText: string;
    if (fullPetition.length <= MAX_TOTAL) {
        pText = fullPetition;
    } else {
        const HEAD = 7000;
        const TAIL = 7000;
        const head = fullPetition.slice(0, HEAD);
        const tail = fullPetition.slice(-TAIL);
        pText = head + "\n\n[... PÁGINAS INTERMEDIÁRIAS OMITIDAS ...]\n\n" + tail;
    }

    const userParts: GeminiPart[] = [
        { text: `Telefone fornecido pelo operador: ${phoneProvided || "não informado"}\n\nTEXTO DA PETIÇÃO:\n${pText || "Não fornecido"}` },
    ];

    if (contractImages && contractImages.length > 0) {
        userParts[0] = { text: `Telefone fornecido pelo operador: ${phoneProvided || "não informado"}\n\nTEXTO DA PETIÇÃO:\n${pText || "Não fornecido"}\n\nAs imagens abaixo são páginas do contrato/CCB. Extraia TODOS os dados, especialmente o CELULAR do cliente:` };
        for (const img of contractImages) {
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

// ==================== AI ANALYZE OFÍCIO (ZIP import) ====================

// Local parser for structured TXT files — no AI needed for the TXT!
export function parseTxtProcesso(txt: string): {
    process_number: string;
    client_name: string;
    client_cpf: string;
    client_birth_date: string;
    client_age: string;
    client_income: string;
    client_phones: string[];
    client_mother: string;
    client_score: string;
    additional_parties: { name: string; cpf: string; birth_date: string; age: string; income: string; phones: string[]; mother: string; score: string }[];
    defendant: string;
    defendant_cnpj: string;
    additional_defendants: { name: string; cnpj: string }[];
    tribunal: string;
    grau: string;
    classe: string;
    orgao_julgador: string;
    ultimo_movimento: string;
    oab_consultante: string;
} {
    const result = {
        process_number: "",
        client_name: "",
        client_cpf: "",
        client_birth_date: "",
        client_age: "",
        client_income: "",
        client_phones: [] as string[],
        client_mother: "",
        client_score: "",
        additional_parties: [] as any[],
        defendant: "",
        defendant_cnpj: "",
        additional_defendants: [] as { name: string; cnpj: string }[],
        tribunal: "",
        grau: "",
        classe: "",
        orgao_julgador: "",
        ultimo_movimento: "",
        oab_consultante: "",
    };

    // Process number
    const procMatch = txt.match(/PROCESSO:\s*(.+)/);
    if (procMatch) result.process_number = procMatch[1].trim();

    // Split into sections
    const ativoSection = txt.match(/REQUERENTE \(POLO ATIVO\):\s*[-]+\s*([\s\S]*?)(?=REQUERIDO \(POLO PASSIVO\):|$)/i);
    const passivoSection = txt.match(/REQUERIDO \(POLO PASSIVO\):\s*[-]+\s*([\s\S]*?)(?=DADOS DA A|$)/i);
    const dadosSection = txt.match(/DADOS DA A[CÇ][AÃ]O:\s*[-]+\s*([\s\S]*?)(?====|$)/i);

    // Parse POLO ATIVO (may have multiple parties)
    if (ativoSection) {
        const ativoText = ativoSection[1];
        // Split by "Nome:" to get individual parties
        const partyBlocks = ativoText.split(/(?=Nome:)/);
        let isFirst = true;

        for (const block of partyBlocks) {
            if (!block.trim()) continue;

            const nameMatch = block.match(/Nome:\s*(.+)/);
            const cpfMatch = block.match(/CPF:\s*(\d+)/);
            const birthMatch = block.match(/Data Nascimento:\s*([^\(]+)/);
            const ageMatch = block.match(/Idade:\s*(\d+)/);
            const incomeMatch = block.match(/Renda Presumida:\s*(.+)/);
            const phonesMatch = block.match(/Telefones?:\s*(.+)/);
            const motherMatch = block.match(/Nome da M[aã]e:\s*(.+)/);
            const scoreMatch = block.match(/Score:\s*(\d+)/);

            const party = {
                name: nameMatch?.[1]?.trim() || "",
                cpf: cpfMatch?.[1]?.trim() || "",
                birth_date: birthMatch?.[1]?.trim() || "",
                age: ageMatch?.[1]?.trim() || "",
                income: incomeMatch?.[1]?.trim() || "",
                phones: phonesMatch?.[1]?.split(",").map(p => p.trim()).filter(Boolean) || [],
                mother: motherMatch?.[1]?.trim() || "",
                score: scoreMatch?.[1]?.trim() || "",
            };

            if (isFirst) {
                result.client_name = party.name;
                result.client_cpf = party.cpf;
                result.client_birth_date = party.birth_date;
                result.client_age = party.age;
                result.client_income = party.income;
                result.client_phones = party.phones;
                result.client_mother = party.mother;
                result.client_score = party.score;
                isFirst = false;
            } else {
                result.additional_parties.push(party);
            }
        }
    }

    // Parse POLO PASSIVO (may have multiple defendants)
    if (passivoSection) {
        const passivoText = passivoSection[1];
        const defBlocks = passivoText.split(/(?=Nome:)/);
        let isFirst = true;

        for (const block of defBlocks) {
            if (!block.trim()) continue;
            const nameMatch = block.match(/Nome:\s*(.+)/);
            const cnpjMatch = block.match(/CNPJ:\s*(\d+)/);

            if (isFirst) {
                result.defendant = nameMatch?.[1]?.trim() || "";
                result.defendant_cnpj = cnpjMatch?.[1]?.trim() || "";
                isFirst = false;
            } else {
                result.additional_defendants.push({
                    name: nameMatch?.[1]?.trim() || "",
                    cnpj: cnpjMatch?.[1]?.trim() || "",
                });
            }
        }
    }

    // Parse DADOS DA AÇÃO
    if (dadosSection) {
        const dadosText = dadosSection[1];
        const tribunalMatch = dadosText.match(/Tribunal:\s*(.+)/);
        const grauMatch = dadosText.match(/Grau:\s*(.+)/);
        const classeMatch = dadosText.match(/Classe:\s*(.+)/);
        const orgaoMatch = dadosText.match(/[OÓ]rg[aã]o Julgador:\s*(.+)/);
        const movMatch = dadosText.match(/[UÚ]ltimo Movimento:\s*(.+)/);
        const oabMatch = dadosText.match(/OAB Consultante:\s*(.+)/);

        result.tribunal = tribunalMatch?.[1]?.trim() || "";
        result.grau = grauMatch?.[1]?.trim() || "";
        result.classe = classeMatch?.[1]?.trim() || "";
        result.orgao_julgador = orgaoMatch?.[1]?.trim() || "";
        result.ultimo_movimento = movMatch?.[1]?.trim() || "";
        result.oab_consultante = oabMatch?.[1]?.trim() || "";
    }

    return result;
}

export async function aiAnalyzeOficio(params: {
    oficioText: string;
    txtContent: string;
    folderName: string;
}): Promise<{ success: boolean; extracted: any; error?: string }> {
    const { oficioText, txtContent, folderName } = params;

    // Step 1: Parse the TXT locally (fast & reliable)
    const txtData = parseTxtProcesso(txtContent);

    // Step 2: Use AI ONLY for the ofício PDF to get financial data & case type details
    const systemPrompt = `Você é um especialista em análise de ofícios judiciais.
Sua tarefa é extrair APENAS as informações que estão NO OFÍCIO que NÃO estão disponíveis no TXT já parseado.

INFORMAÇÕES JÁ EXTRAÍDAS DO TXT (NÃO REPITA, apenas complemente):
- Nome do Cliente: ${txtData.client_name || "não encontrado"}
- CPF: ${txtData.client_cpf || "não encontrado"}
- Réu: ${txtData.defendant || "não encontrado"}
- Processo: ${txtData.process_number || "não encontrado"}
- Classe: ${txtData.classe || "não encontrada"}
- Tribunal: ${txtData.tribunal || "não encontrado"}
- Órgão Julgador: ${txtData.orgao_julgador || "não encontrado"}

O QUE PRECISO QUE VOCÊ EXTRAIA DO OFÍCIO:
1. VALOR DA CAUSA / RPV / Precatório / Valor a depositar (o que encontrar)
2. Tipo de ação mais detalhado (baseado no conteúdo do ofício)
3. Advogados mencionados no ofício (nome e OAB)
4. Qualquer valor financeiro mencionado
5. Escritório de advocacia se mencionado
6. Resumo em 2-3 frases sobre o que é o caso

Responda APENAS com JSON:
{
  "case_value": 0.00,
  "principal_value": 0.00,
  "lawyer_fee_percent": 0.00,
  "lawyer_fee_value": 0.00,
  "client_net_value": 0.00,
  "case_type_detail": "TIPO DETALHADO DA AÇÃO",
  "lawyers": [{"name": "...", "oab": "...", "role": "..."}],
  "partner_law_firm": "ESCRITÓRIO",
  "summary": "RESUMO_DO_CASO"
}`;

    const MAX_TOTAL = 10000;
    let pdfText = oficioText || "";
    if (pdfText.length > MAX_TOTAL) {
        const HEAD = Math.floor(MAX_TOTAL * 0.5);
        const TAIL = Math.floor(MAX_TOTAL * 0.5);
        pdfText = pdfText.slice(0, HEAD) + "\n\n[... OMITIDO ...]\n\n" + pdfText.slice(-TAIL);
    }

    const userParts: GeminiPart[] = [
        { text: `TEXTO DO OFÍCIO JUDICIAL:\n${pdfText || "Não fornecido"}` },
    ];

    try {
        const raw = await callGemini(systemPrompt, userParts);
        const aiData = extractJson(raw);

        // Step 3: Merge TXT data (reliable) with AI data (supplementary)
        // Pick best phone: prefer mobile (11 digits starting with 9)
        const allPhones = txtData.client_phones;
        let bestPhone = "";
        if (allPhones.length > 0) {
            // Prefer mobile numbers (11 digits, area code + 9xxxx)
            const mobile = allPhones.find(p => {
                const digits = p.replace(/\D/g, "");
                return digits.length === 11 && digits[2] === "9";
            });
            bestPhone = mobile || allPhones[0];
        }

        // Build defendant string with all defendants
        let fullDefendant = txtData.defendant;
        if (txtData.additional_defendants.length > 0) {
            fullDefendant += " / " + txtData.additional_defendants.map(d => d.name).join(" / ");
        }

        const merged = {
            client_name: txtData.client_name,
            client_cpf: txtData.client_cpf,
            defendant: fullDefendant,
            case_type: aiData?.case_type_detail || txtData.classe || "",
            court: txtData.orgao_julgador
                ? `${txtData.orgao_julgador} — ${txtData.tribunal}`
                : txtData.tribunal,
            process_number: txtData.process_number,
            case_value: aiData?.case_value || 0,
            principal_value: aiData?.principal_value || 0,
            lawyer_fee_percent: aiData?.lawyer_fee_percent || 0,
            lawyer_fee_value: aiData?.lawyer_fee_value || 0,
            client_net_value: aiData?.client_net_value || 0,
            lawyers: aiData?.lawyers || [],
            partner_law_firm: aiData?.partner_law_firm || "",
            phone_contract: bestPhone,
            all_phones: allPhones.join(", "),
            summary: aiData?.summary || `${txtData.classe || "Processo"} — ${txtData.client_name} vs ${txtData.defendant}`,
            // Extra data from TXT
            client_birth_date: txtData.client_birth_date,
            client_age: txtData.client_age,
            client_income: txtData.client_income,
            client_mother: txtData.client_mother,
            client_score: txtData.client_score,
            additional_parties: txtData.additional_parties,
            defendant_cnpj: txtData.defendant_cnpj,
            oab_consultante: txtData.oab_consultante,
            ultimo_movimento: txtData.ultimo_movimento,
            classe_processual: txtData.classe,
        };

        return { success: true, extracted: merged };
    } catch (err: any) {
        // If AI fails, still return TXT data (better than nothing)
        const allPhones = txtData.client_phones;
        const mobile = allPhones.find(p => {
            const digits = p.replace(/\D/g, "");
            return digits.length === 11 && digits[2] === "9";
        });
        const bestPhone = mobile || allPhones[0] || "";

        let fullDefendant = txtData.defendant;
        if (txtData.additional_defendants.length > 0) {
            fullDefendant += " / " + txtData.additional_defendants.map(d => d.name).join(" / ");
        }

        const fallback = {
            client_name: txtData.client_name,
            client_cpf: txtData.client_cpf,
            defendant: fullDefendant,
            case_type: txtData.classe || "",
            court: txtData.orgao_julgador
                ? `${txtData.orgao_julgador} — ${txtData.tribunal}`
                : txtData.tribunal,
            process_number: txtData.process_number,
            case_value: 0,
            principal_value: 0,
            lawyer_fee_percent: 0,
            lawyer_fee_value: 0,
            client_net_value: 0,
            lawyers: [],
            partner_law_firm: "",
            phone_contract: bestPhone,
            all_phones: allPhones.join(", "),
            summary: `${txtData.classe || "Processo"} — ${txtData.client_name} vs ${txtData.defendant}. (Análise do ofício falhou: ${err.message})`,
            client_birth_date: txtData.client_birth_date,
            client_age: txtData.client_age,
            client_income: txtData.client_income,
            client_mother: txtData.client_mother,
            client_score: txtData.client_score,
            additional_parties: txtData.additional_parties,
            defendant_cnpj: txtData.defendant_cnpj,
            oab_consultante: txtData.oab_consultante,
            ultimo_movimento: txtData.ultimo_movimento,
            classe_processual: txtData.classe,
        };

        console.warn(`AI falhou para ofício, usando apenas dados do TXT:`, err.message);
        return { success: true, extracted: fallback };
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
Se houver uma IMAGEM (print de WhatsApp), transcreva o diálogo.
Responda APENAS em JSON: 
{ 
  "analysis": "...", 
  "suggestions": [{"label": "...", "text": "..."}], 
  "advice": "...",
  "transcription": [
    {"sender": "client", "text": "o que o cliente disse"},
    {"sender": "user", "text": "o que o usuário respondeu no print"}
  ]
}`;
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
