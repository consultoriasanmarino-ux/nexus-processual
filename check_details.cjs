const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = "https://rlzrcpnjhwjxxwjnytox.supabase.co";
const SUPABASE_KEY = "sb_publishable__ScO4m46ktpqgqAiXTJw9Q_GUj0Vnqb";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
    const { data: callers, error } = await supabase.from('callers').select('*');
    if (error) {
        console.error("Erro:", error.message);
    } else {
        console.log("Callers:", JSON.stringify(callers, null, 2));
    }

    const { data: lawyers } = await supabase.from('lawyers').select('*');
    console.log("Lawyers:", JSON.stringify(lawyers, null, 2));
}
check();
