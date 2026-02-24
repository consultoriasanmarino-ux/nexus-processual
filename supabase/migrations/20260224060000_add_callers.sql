-- Create callers (tecladores/ligadores) table
CREATE TABLE IF NOT EXISTS public.callers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  pin TEXT NOT NULL,
  lawyer_ids UUID[] DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.callers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "callers_all" ON public.callers FOR ALL USING (true);

-- Caller case marks (to mark cases as "used/done" by a caller)
CREATE TABLE IF NOT EXISTS public.caller_case_marks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  caller_id UUID NOT NULL REFERENCES public.callers(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(caller_id, case_id)
);

ALTER TABLE public.caller_case_marks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "caller_case_marks_all" ON public.caller_case_marks FOR ALL USING (true);
