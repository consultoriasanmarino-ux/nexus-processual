// Test each Gemini model with each API key
const fs = require('fs');

// Read .env file manually
const envContent = fs.readFileSync('.env', 'utf-8');
const match = envContent.match(/VITE_GEMINI_API_KEY="?([^"\n]+)"?/);
const keys = match ? match[1].split(',').map(k => k.trim()) : [];

const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

async function testModel(key, model) {
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

        if (res.ok) {
            const result = await res.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
            return { status: "OK", text: text.substring(0, 50) };
        } else {
            const errJson = await res.json().catch(() => ({}));
            return {
                status: `ERRO ${res.status}`,
                message: errJson.error?.message || "Sem detalhes",
                code: errJson.error?.status || "UNKNOWN"
            };
        }
    } catch (err) {
        return { status: "NETWORK_ERROR", message: err.message };
    }
}

async function main() {
    console.log(`\n=== TESTE DE API KEYS DO GEMINI ===\n`);
    console.log(`Chaves encontradas no .env: ${keys.length}\n`);

    for (const key of keys) {
        const keyLabel = key.substring(0, 8) + "..." + key.slice(-4);
        console.log(`\n--- Chave: ${keyLabel} ---`);

        for (const model of models) {
            const result = await testModel(key, model);
            if (result.status === "OK") {
                console.log(`  ✅ ${model}: FUNCIONA! Resposta: "${result.text}"`);
            } else {
                console.log(`  ❌ ${model}: ${result.status} - ${result.message} (${result.code || ''})`);
            }
        }
    }

    console.log(`\n=== FIM DO TESTE ===\n`);
}

main();
