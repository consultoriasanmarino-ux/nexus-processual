import { supabase } from "./src/integrations/supabase/client";

async function checkColumns() {
    const { data, error } = await supabase.from("callers").select("*").limit(1);
    if (error) {
        console.error("Error fetching callers:", error);
    } else if (data && data.length > 0) {
        console.log("Caller columns:", Object.keys(data[0]));
    } else {
        console.log("No callers found to check columns.");
    }
}

checkColumns();
