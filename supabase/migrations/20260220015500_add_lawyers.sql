-- Create lawyers table for specific lawyers
CREATE TABLE IF NOT EXISTS public.lawyers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  oab TEXT,
  specialty TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.lawyers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lawyers_all" ON public.lawyers FOR ALL USING (true);

-- Add lawyer_type and lawyer_id columns to cases
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS lawyer_type TEXT DEFAULT 'geral';
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS lawyer_id UUID REFERENCES public.lawyers(id);
