-- Add is_chat_active column to cases table
ALTER TABLE public.cases ADD COLUMN is_chat_active BOOLEAN NOT NULL DEFAULT false;
