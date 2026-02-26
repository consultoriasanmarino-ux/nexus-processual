-- Create rifeiros table (similar to callers but for rifa operators)
CREATE TABLE IF NOT EXISTS public.rifeiros (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.rifeiros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rifeiros_all" ON public.rifeiros FOR ALL USING (true);

-- Create rifa_fichas table for imported XLSX lead data
CREATE TABLE IF NOT EXISTS public.rifa_fichas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source TEXT,
  username TEXT,
  nome TEXT NOT NULL,
  celular TEXT,
  email TEXT,
  cpf TEXT,
  birth_date TEXT,
  income TEXT,
  profession TEXT,
  vehicles TEXT,
  banks TEXT,
  phones_extra TEXT,
  notes TEXT,
  status TEXT DEFAULT 'nova',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.rifa_fichas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rifa_fichas_all" ON public.rifa_fichas FOR ALL USING (true);

-- Rifeiro ficha marks (to mark fichas as "done" by a rifeiro)
CREATE TABLE IF NOT EXISTS public.rifeiro_ficha_marks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rifeiro_id UUID NOT NULL REFERENCES public.rifeiros(id) ON DELETE CASCADE,
  ficha_id UUID NOT NULL REFERENCES public.rifa_fichas(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(rifeiro_id, ficha_id)
);

ALTER TABLE public.rifeiro_ficha_marks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rifeiro_ficha_marks_all" ON public.rifeiro_ficha_marks FOR ALL USING (true);
