-- ============================================================================
-- Price quotes: mutable draft (price_quotes) + append-only frozen revisions
-- (price_quote_revisions). Additive & idempotent. Nothing existing is dropped
-- or altered in place.
--
-- Schema reality (verified 2026-07-20): signature_requests already has
-- parent_signature_request_id and deck_document_id. This migration adds only
-- quote_revision_id, cancelled_at, cancel_reason to it.
-- ============================================================================
create extension if not exists pgcrypto;

-- ── 1. human-readable quote numbers ────────────────────────────────────────
create sequence if not exists public.price_quote_number_seq start 1001;

create or replace function public.next_quote_number() returns text
language sql volatile as $$
  select 'Q-' || to_char(now(), 'YYYY') || '-'
       || lpad(nextval('public.price_quote_number_seq')::text, 4, '0');
$$;

-- ── 2. the draft. one row per deal. draft_data = full PriceQuoteData ────────
create table if not exists public.price_quotes (
  id                    uuid primary key default gen_random_uuid(),
  quote_number          text not null unique default public.next_quote_number(),
  owner_email           text not null,
  owner_user_id         uuid references auth.users(id) on delete set null,
  title                 text not null default 'הצעת מחיר',
  client_name           text not null default '',
  campaign_name         text not null default '',

  draft_data            jsonb   not null default '{}'::jsonb,
  draft_version         integer not null default 1,      -- optimistic lock
  draft_updated_at      timestamptz not null default now(),
  draft_updated_by      text,

  current_revision_id   uuid,
  published_count       integer not null default 0,

  origin                text not null default 'price-quote'
                          check (origin in ('price-quote','salesforce-quote')),
  salesforce_project_id text,
  lead_id               uuid,
  brief_link_token      text,
  clickup_list_id       text,
  deck_document_id      uuid references public.documents(id) on delete set null,

  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists price_quotes_owner_idx   on public.price_quotes (owner_email);
create index if not exists price_quotes_updated_idx on public.price_quotes (draft_updated_at desc);
create index if not exists price_quotes_client_idx  on public.price_quotes (client_name);
create index if not exists price_quotes_sf_idx      on public.price_quotes (salesforce_project_id)
  where salesforce_project_id is not null;

-- ── 3. the revisions. append-only. data frozen at publish. ─────────────────
create table if not exists public.price_quote_revisions (
  id                        uuid primary key default gen_random_uuid(),
  quote_id                  uuid not null references public.price_quotes(id) on delete restrict,
  revision_number           integer not null,
  data                      jsonb not null,        -- FROZEN PriceQuoteData
  template_version          text  not null,
  legacy_backfill           boolean not null default false,
  published_by_email        text not null,
  published_at              timestamptz not null default now(),

  signature_request_id      uuid references public.signature_requests(id) on delete set null,
  signature_token           uuid,
  pdf_drive_file_id         text,
  pdf_drive_view_link       text,

  supersedes_revision_id    uuid references public.price_quote_revisions(id),
  superseded_by_revision_id uuid references public.price_quote_revisions(id),
  superseded_at             timestamptz,
  superseded_a_signed_rev   boolean not null default false,
  sf_event_sent             text,
  sf_event_sent_at          timestamptz,

  unique (quote_id, revision_number)
);

create index if not exists pqr_quote_idx  on public.price_quote_revisions (quote_id, revision_number desc);
create index if not exists pqr_sigreq_idx on public.price_quote_revisions (signature_request_id);

alter table public.price_quotes
  drop constraint if exists price_quotes_current_revision_fk;
alter table public.price_quotes
  add constraint price_quotes_current_revision_fk
  foreign key (current_revision_id) references public.price_quote_revisions(id)
  deferrable initially deferred;

-- ── 4. immutability of a published revision, enforced in the DB ─────────────
create or replace function public.price_quote_revisions_immutable()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'price_quote_revisions is append-only (revision %)', old.id;
  end if;

  if new.data                is distinct from old.data
  or new.template_version    is distinct from old.template_version
  or new.quote_id            is distinct from old.quote_id
  or new.revision_number     is distinct from old.revision_number
  or new.published_at        is distinct from old.published_at
  or new.published_by_email  is distinct from old.published_by_email then
    raise exception 'published revision % is immutable; publish a new revision instead', old.id;
  end if;

  -- artifacts: one NULL -> value transition each, never value -> other value
  if old.signature_request_id is not null
     and new.signature_request_id is distinct from old.signature_request_id then
    raise exception 'revision % already bound to a signature request', old.id;
  end if;
  if old.pdf_drive_file_id is not null
     and new.pdf_drive_file_id is distinct from old.pdf_drive_file_id then
    raise exception 'revision % already has a Drive artifact', old.id;
  end if;

  return new;
end $$;

drop trigger if exists price_quote_revisions_immutable_trg on public.price_quote_revisions;
create trigger price_quote_revisions_immutable_trg
  before update or delete on public.price_quote_revisions
  for each row execute function public.price_quote_revisions_immutable();

-- ── 4b. optimistic lock on the draft ───────────────────────────────────────
create or replace function public.price_quotes_bump()
returns trigger language plpgsql as $$
begin
  if new.draft_data is distinct from old.draft_data then
    if new.draft_version <= old.draft_version then
      raise exception 'draft_version must increase (% -> %)', old.draft_version, new.draft_version;
    end if;
    new.draft_updated_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists price_quotes_bump_trg on public.price_quotes;
create trigger price_quotes_bump_trg
  before update on public.price_quotes
  for each row execute function public.price_quotes_bump();

-- ── 5. the join that never existed + signature_requests link columns ───────
alter table public.signature_requests
  add column if not exists quote_revision_id uuid references public.price_quote_revisions(id),
  add column if not exists cancelled_at       timestamptz,
  add column if not exists cancel_reason      text;

create index if not exists sig_req_revision_idx on public.signature_requests (quote_revision_id);

-- ── 6. RLS: global read (hub is deliberately global), writes via service-role ─
alter table public.price_quotes          enable row level security;
alter table public.price_quote_revisions enable row level security;

drop policy if exists pq_select  on public.price_quotes;
drop policy if exists pqr_select on public.price_quote_revisions;

create policy pq_select  on public.price_quotes          for select to authenticated using (true);
create policy pqr_select on public.price_quote_revisions for select to authenticated using (true);
-- no insert/update/delete policy for any role. no anon. all writes via the API.
