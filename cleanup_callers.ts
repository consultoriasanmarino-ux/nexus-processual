import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupCallers() {
    console.log('Iniciando limpeza da tabela de tecladores...');
    const { error } = await supabase
        .from('callers')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (error) {
        console.error('Erro ao deletar tecladores:', error);
    } else {
        console.log('Tabela de tecladores limpa com sucesso!');
    }
}

cleanupCallers();
