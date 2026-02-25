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

async function cleanupCallers() {
    console.log('Iniciando limpeza da tabela de tecladores...');
    try {
        const { error } = await supabase
            .from('callers')
            .delete()
            .neq('name', '___NON_EXIST_XYZ___'); // Deleta todos

        if (error) {
            console.error('Erro ao deletar tecladores:', error);
        } else {
            console.log('Tabela de tecladores limpa com sucesso!');
        }
    } catch (err) {
        console.error('Erro inesperado:', err);
    }
}

cleanupCallers();
