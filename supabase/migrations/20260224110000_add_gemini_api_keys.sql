-- Create table for rotating Gemini API keys
CREATE TABLE IF NOT EXISTS public.gemini_api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  key_value TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gemini_api_keys ENABLE ROW LEVEL SECURITY;

-- Simple policy (for demo/small team purposes)
-- In a larger app, you'd want to restrict this by auth.uid()
CREATE POLICY "gemini_api_keys_all" ON public.gemini_api_keys FOR ALL USING (true);
