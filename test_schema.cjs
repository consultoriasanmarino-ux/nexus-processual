const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env
const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length === 2) {
        env[parts[0].trim()] = parts[1].trim().replace(/^"|"$/g, '');
    }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
    const { error } = await supabase
        .from('callers')
        .insert({
            name: 'Test',
            username: 'test_user',
            password: 'test_password',
            lawyer_ids: [],
            active: true
        });

    if (error) {
        if (error.message.includes('column "username" does not exist')) {
            console.error('ERRO CRÍTICO: As colunas username e password NÃO existem no banco de dados!');
            console.error('Você precisa adicioná-las manualmente no painel do Supabase -> SQL Editor:');
            console.error('ALTER TABLE callers ADD COLUMN username TEXT UNIQUE;');
            console.error('ALTER TABLE callers ADD COLUMN password TEXT;');
        } else {
            console.error('Erro ao testar inserção:', error);
        }
    } else {
        console.log('Sucesso! As colunas existem e a inserção funcionou.');
        // Cleanup the test record
        await supabase.from('callers').delete().eq('username', 'test_user');
    }
}

testInsert();
