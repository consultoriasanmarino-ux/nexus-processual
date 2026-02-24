const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
const key = "AIzaSyDlr6EYhcNT_zu5OVygn45wpluiDBrwl_4";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

async function testModel(model) {
    const url = `${BASE_URL}/${model}:generateContent?key=${key}`;
    const body = {
        contents: [{ role: "user", parts: [{ text: "Responda apenas: OK" }] }],
        generationConfig: { temperature: 0.1 }
    };

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        const result = await res.json().catch(() => ({}));
        if (res.ok) {
            return { status: "OK", text: result.candidates?.[0]?.content?.parts?.[0]?.text || "" };
        } else {
            return {
                status: `ERRO ${res.status}`,
                message: result.error?.message || "Sem detalhes",
                code: result.error?.status || "UNKNOWN"
            };
        }
    } catch (err) {
        return { status: "NETWORK_ERROR", message: err.message };
    }
}

async function main() {
    console.log(`\n=== TESTE DA NOVA CHAVE: ${key.substring(0, 10)}... ===\n`);

    for (const model of models) {
        const result = await testModel(model);
        if (result.status === "OK") {
            console.log(`  ✅ ${model}: FUNCIONA!`);
        } else {
            console.log(`  ❌ ${model}: ${result.status} - ${result.message}`);
        }
    }
    console.log(`\n=== FIM DO TESTE ===\n`);
}

main();
