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

async function checkColumns() {
    const { data, error } = await supabase
        .from('callers')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Erro ao acessar a tabela callers:', error);
    } else {
        console.log('Columns in callers:', data && data[0] ? Object.keys(data[0]) : 'Tabela vazia');

        // Check table info more specifically if possible
        const { data: cols, error: colErr } = await supabase.rpc('get_table_columns', { t_name: 'callers' });
        if (colErr) {
            console.log('RPC get_table_columns failed or not available.');
        } else {
            console.log('Columns via RPC:', cols);
        }
    }
}

checkColumns();
