const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = "https://rlzrcpnjhwjxxwjnytox.supabase.co";
const SUPABASE_KEY = "sb_publishable__ScO4m46ktpqgqAiXTJw9Q_GUj0Vnqb";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
    const { count, error } = await supabase.from('cases').select('*', { count: 'exact', head: true });
    if (error) {
        console.error("Erro:", error.message);
    } else {
        console.log("Total de casos no banco rlzrcpnjhwjxxwjnytox:", count);
    }
}
check();
