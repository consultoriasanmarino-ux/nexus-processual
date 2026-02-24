const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable() {
    console.log("Checking gemini_api_keys table...");
    const { data, error } = await supabase
        .from('gemini_api_keys')
        .select('*')
        .limit(1);

    if (error) {
        if (error.code === '42P01') {
            console.log("Table 'gemini_api_keys' does not exist.");
        } else {
            console.error("Error checking table:", error);
        }
    } else {
        console.log("Table exists. Current data count:", data.length);
    }
}

checkTable();
