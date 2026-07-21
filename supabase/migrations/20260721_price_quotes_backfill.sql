-- ============================================================================
-- Backfill: one price_quotes + one revision_number=1 per signature_requests row
-- that carries quote_data. NO automatic merging — one row is one quote.
-- `project_id` is an opportunity key, not a document key: the two signed rows
-- sharing a00d100000FATuYAAX (different recipients) stay two quotes, and the two
-- live לפמ requests stay two quotes.
--
-- Idempotent: only backfills rows whose quote_revision_id is still NULL.
-- The 3 signature_requests without a quote_data snapshot are excluded.
-- ============================================================================
with src as (
  select
    sr.id as sig_req_id,
    gen_random_uuid() as quote_id,
    gen_random_uuid() as revision_id,
    sr.title, sr.created_by_email, sr.created_at, sr.lead_id,
    sr.pdf_drive_file_id, sr.pdf_drive_view_link, sr.token,
    sr.payload -> 'quote_data' as qd,
    coalesce(sr.payload ->> 'source', 'price-quote') as src_kind,
    sr.payload ->> 'project_id' as sf_project
  from signature_requests sr
  where sr.payload -> 'quote_data' is not null
    and sr.quote_revision_id is null
),
ins_q as (
  insert into price_quotes
    (id, owner_email, title, client_name, campaign_name, draft_data,
     draft_updated_at, origin, salesforce_project_id, lead_id, created_at,
     published_count, current_revision_id)
  select s.quote_id, s.created_by_email, s.title,
         coalesce(s.qd ->> 'clientName',''), coalesce(s.qd ->> 'campaignName',''),
         s.qd, s.created_at,
         case when s.src_kind = 'salesforce-quote' then 'salesforce-quote' else 'price-quote' end,
         s.sf_project, s.lead_id, s.created_at, 1, s.revision_id
  from src s returning id
),
ins_r as (
  insert into price_quote_revisions
    (id, quote_id, revision_number, data, template_version, legacy_backfill,
     published_by_email, published_at, signature_request_id, signature_token,
     pdf_drive_file_id, pdf_drive_view_link)
  select s.revision_id, s.quote_id, 1, s.qd, 'legacy', true,
         s.created_by_email, s.created_at, s.sig_req_id, s.token,
         s.pdf_drive_file_id, s.pdf_drive_view_link
  from src s returning id, signature_request_id
)
update signature_requests sr
   set quote_revision_id = ir.id
  from ins_r ir
 where sr.id = ir.signature_request_id;

-- Manual review query (NOT run automatically): clusters that look like the same
-- deal re-sent instead of revised — currently the two hadar@lapam.gov.il rows.
--   select title, recipient_email, count(*), array_agg(id)
--   from signature_requests where payload -> 'quote_data' is not null
--   group by 1,2 having count(*) > 1;
