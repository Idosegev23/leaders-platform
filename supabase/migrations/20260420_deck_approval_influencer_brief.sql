-- supabase/migrations/20260420_deck_approval_influencer_brief.sql
-- Phase 4: deck approval + influencer-brief document lineage.
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS parent_document_id UUID;

-- Lineage: influencer_brief rows point at their parent deck.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'documents_parent_document_id_fkey'
      AND table_name = 'documents'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_parent_document_id_fkey
      FOREIGN KEY (parent_document_id)
      REFERENCES public.documents(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS documents_parent_document_id_idx
  ON public.documents (parent_document_id);
