-- ============================================================================
-- Campaigns MVP (module "cm_"): campaigns, creators, participation, shortlists,
-- deliverables + content versions, approvals, publications, metrics, tasks,
-- budget, shipments, portal access, assets, jobs/outbox, audit.
--
-- Additive and idempotent. Nothing existing is dropped or altered in place.
-- The only touch on an existing table is `create table if not exists clients`,
-- a no-op on the live DB (the table already exists there with these columns),
-- needed so the migration also applies to an empty database.
--
-- Access model: every cm_ table has RLS enabled with NO policies and all
-- privileges revoked from anon/authenticated. Browsers can never read these
-- tables through PostgREST. The server connects with a privileged role
-- (CAMPAIGNS_DATABASE_URL) and enforces authorization in
-- src/lib/campaigns/auth/policy.ts.
--
-- Money: numeric(14,2). Business dates: date. Moments: timestamptz.
-- Locking: all tables are new, so no lock on existing tables beyond the
-- catalog lock of `create table if not exists clients`.
-- ============================================================================

create extension if not exists pgcrypto;

-- Existing on live (verified 2026-10-26 via schema introspection). No-op there.
create table if not exists public.clients (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  name_hebrew     text,
  aliases         text[],
  drive_folder_id text,
  metadata        jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create or replace function public.cm_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ── Internal roles for the module ──────────────────────────────────────────
-- users.role='admin' is also treated as module admin.
create table if not exists public.cm_staff_roles (
  user_id     uuid primary key references public.users(id) on delete cascade,
  role        text not null check (role in ('admin','manager','staff')),
  granted_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Campaigns ──────────────────────────────────────────────────────────────
create table if not exists public.cm_campaigns (
  id                          uuid primary key default gen_random_uuid(),
  client_id                   uuid not null references public.clients(id) on delete restrict,
  external_project_reference  text,
  name                        text not null check (length(btrim(name)) between 1 and 200),
  description                 text,
  objectives                  text,
  brief_document_link_id      uuid references public.document_links(id) on delete set null,
  brief_url                   text check (brief_url is null or brief_url ~* '^https?://'),
  owner_user_id               uuid not null references public.users(id) on delete restrict,
  status                      text not null default 'draft'
                              check (status in ('draft','planning','recruiting','active','reporting','closed','cancelled')),
  status_reason               text,
  start_date                  date,
  end_date                    date,
  currency                    char(3) not null default 'ILS' check (currency ~ '^[A-Z]{3}$'),
  approved_budget             numeric(14,2) check (approved_budget is null or approved_budget >= 0),
  amounts_include_vat         boolean not null default false,
  closed_at                   timestamptz,
  closed_with_exceptions      boolean not null default false,
  created_by                  uuid not null references public.users(id) on delete restrict,
  version                     integer not null default 1,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint cm_campaigns_dates check (end_date is null or start_date is null or end_date >= start_date),
  constraint cm_campaigns_cancel_reason check (status <> 'cancelled' or length(btrim(coalesce(status_reason,''))) > 0)
);
create index if not exists cm_campaigns_client_idx on public.cm_campaigns (client_id);
create index if not exists cm_campaigns_owner_idx  on public.cm_campaigns (owner_user_id);
create index if not exists cm_campaigns_status_idx on public.cm_campaigns (status, start_date);

create table if not exists public.cm_campaign_members (
  campaign_id uuid not null references public.cm_campaigns(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  role        text not null check (role in ('manager','staff')),
  added_by    uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
create index if not exists cm_campaign_members_user_idx on public.cm_campaign_members (user_id);

-- ── Agents and creators ────────────────────────────────────────────────────
create table if not exists public.cm_agents (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null check (length(btrim(display_name)) between 1 and 200),
  company       text,
  email         text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone         text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  internal_notes text,
  created_by    uuid references public.users(id) on delete set null,
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists cm_agents_email_uq on public.cm_agents (lower(email)) where email is not null;

create table if not exists public.cm_creators (
  id             uuid primary key default gen_random_uuid(),
  display_name   text not null check (length(btrim(display_name)) between 1 and 200),
  email          text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone          text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  agent_id       uuid references public.cm_agents(id) on delete set null,
  categories     text[] not null default '{}',
  status         text not null default 'active' check (status in ('active','inactive','blocked')),
  internal_notes text,
  created_by     uuid references public.users(id) on delete set null,
  version        integer not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists cm_creators_email_uq on public.cm_creators (lower(email)) where email is not null;
create unique index if not exists cm_creators_phone_uq on public.cm_creators (phone) where phone is not null;
create index if not exists cm_creators_name_idx on public.cm_creators (lower(display_name));
create index if not exists cm_creators_agent_idx on public.cm_creators (agent_id);

-- Handles change; the stable key is (platform, external_user_id) when known.
create table if not exists public.cm_creator_social_accounts (
  id               uuid primary key default gen_random_uuid(),
  creator_id       uuid not null references public.cm_creators(id) on delete cascade,
  platform         text not null check (platform in ('instagram','tiktok','youtube','facebook','x','linkedin','other')),
  handle           text not null check (length(btrim(handle)) between 1 and 100),
  external_user_id text,
  profile_url      text check (profile_url is null or profile_url ~* '^https?://'),
  follower_count   integer check (follower_count is null or follower_count >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists cm_social_handle_uq   on public.cm_creator_social_accounts (platform, lower(handle));
create unique index if not exists cm_social_external_uq on public.cm_creator_social_accounts (platform, external_user_id) where external_user_id is not null;
create index if not exists cm_social_creator_idx on public.cm_creator_social_accounts (creator_id);

-- Which creators an agent is authorized to represent.
create table if not exists public.cm_agent_creators (
  agent_id    uuid not null references public.cm_agents(id) on delete cascade,
  creator_id  uuid not null references public.cm_creators(id) on delete cascade,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (agent_id, creator_id)
);
create index if not exists cm_agent_creators_creator_idx on public.cm_agent_creators (creator_id);

-- Links to records in other systems (Salesforce, Besti, IMAI, Hub).
create table if not exists public.cm_external_references (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null check (entity_type in ('client','campaign','creator','agent','participation')),
  entity_id     uuid not null,
  system        text not null check (system in ('salesforce','besti','imai','hub','other')),
  external_type text not null,
  external_id   text not null check (length(btrim(external_id)) between 1 and 200),
  url           text check (url is null or url ~* '^https?://'),
  linked_by     uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (entity_type, entity_id, system, external_type),
  unique (system, external_type, external_id, entity_type)
);

-- ── Private assets (metadata only; bytes live in object storage) ───────────
create table if not exists public.cm_assets (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references public.cm_campaigns(id) on delete restrict,
  participation_id uuid,
  purpose          text not null check (purpose in ('content','evidence','metric_evidence','brief','other')),
  storage_provider text not null check (storage_provider in ('supabase','local')),
  storage_key      text not null unique,
  original_filename text,
  mime_type        text not null,
  declared_size    bigint not null check (declared_size > 0),
  verified_size    bigint,
  status           text not null default 'pending' check (status in ('pending','ready','failed','deleted')),
  failure_reason   text,
  uploaded_by_user_id  uuid references public.users(id) on delete set null,
  uploaded_by_grant_id uuid,
  verified_at      timestamptz,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists cm_assets_campaign_idx on public.cm_assets (campaign_id);
create index if not exists cm_assets_cleanup_idx  on public.cm_assets (status, created_at) where status in ('pending','failed','ready');

-- ── Participation (creator in a campaign) ──────────────────────────────────
create table if not exists public.cm_participations (
  id                       uuid primary key default gen_random_uuid(),
  campaign_id              uuid not null references public.cm_campaigns(id) on delete restrict,
  creator_id               uuid not null references public.cm_creators(id) on delete restrict,
  agent_id                 uuid references public.cm_agents(id) on delete set null,
  selection_status         text not null default 'proposed'
                           check (selection_status in ('proposed','internal_review','client_review','approved','changes_requested','rejected','withdrawn')),
  participation_status     text not null default 'not_invited'
                           check (participation_status in ('not_invited','invited','accepted','declined','active','completed','cancelled')),
  status_reason            text,
  agreed_fee               numeric(14,2) check (agreed_fee is null or agreed_fee >= 0),
  currency                 char(3) not null,
  payment_status           text not null default 'not_recorded'
                           check (payment_status in ('not_recorded','pending','paid_manual')),
  contract_reference       text,
  contract_signature_request_id uuid references public.signature_requests(id) on delete set null,
  rights_expires_at        date,
  rights_notes             text,
  invitation_status        text not null default 'none' check (invitation_status in ('none','sent','opened','responded')),
  internal_notes           text,
  client_visible_notes     text,
  deliverables_summary     text,
  terms_version            integer not null default 1,
  accepted_terms_version   integer,
  accepted_at              timestamptz,
  accepted_by_grant_id     uuid,
  client_reapproval_required   boolean not null default false,
  creator_reacceptance_required boolean not null default false,
  created_by               uuid references public.users(id) on delete set null,
  version                  integer not null default 1,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint cm_participations_unique unique (campaign_id, creator_id),
  constraint cm_participations_cancel_reason check (participation_status <> 'cancelled' or length(btrim(coalesce(status_reason,''))) > 0)
);
create index if not exists cm_participations_creator_idx on public.cm_participations (creator_id);
create index if not exists cm_participations_agent_idx   on public.cm_participations (agent_id) where agent_id is not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cm_assets_participation_fk') then
    alter table public.cm_assets add constraint cm_assets_participation_fk
      foreign key (participation_id) references public.cm_participations(id) on delete restrict;
  end if;
end $$;

-- ── Shortlist versions (client approval targets a frozen snapshot) ─────────
create table if not exists public.cm_shortlists (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.cm_campaigns(id) on delete restrict,
  version_number  integer not null,
  status          text not null default 'internal_review'
                  check (status in ('internal_review','client_review','completed','superseded')),
  note            text,
  created_by      uuid references public.users(id) on delete set null,
  sent_to_client_at timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (campaign_id, version_number)
);
-- at most one open (non-final) shortlist per campaign
create unique index if not exists cm_shortlists_one_open on public.cm_shortlists (campaign_id)
  where status in ('internal_review','client_review');

create table if not exists public.cm_shortlist_items (
  id                uuid primary key default gen_random_uuid(),
  shortlist_id      uuid not null references public.cm_shortlists(id) on delete cascade,
  participation_id  uuid not null references public.cm_participations(id) on delete restrict,
  participation_terms_version integer not null,
  client_snapshot   jsonb not null,
  internal_decision text not null default 'pending' check (internal_decision in ('pending','approved','changes_requested','rejected')),
  client_decision   text not null default 'pending' check (client_decision in ('pending','approved','changes_requested','rejected')),
  created_at        timestamptz not null default now(),
  unique (shortlist_id, participation_id)
);
create index if not exists cm_shortlist_items_participation_idx on public.cm_shortlist_items (participation_id);

-- ── Deliverables and content versions ──────────────────────────────────────
create table if not exists public.cm_deliverables (
  id                          uuid primary key default gen_random_uuid(),
  participation_id            uuid not null references public.cm_participations(id) on delete restrict,
  campaign_id                 uuid not null references public.cm_campaigns(id) on delete restrict,
  title                       text not null check (length(btrim(title)) between 1 and 200),
  type                        text not null check (type in ('post','reel','story','video','short','live','other')),
  platform                    text not null check (platform in ('instagram','tiktok','youtube','facebook','x','linkedin','other')),
  description                 text,
  submission_due_at           timestamptz,
  original_submission_due_at  timestamptz,
  publication_due_at          timestamptz,
  original_publication_due_at timestamptz,
  status                      text not null default 'awaiting_submission'
                              check (status in ('awaiting_submission','submitted','internal_review','changes_requested',
                                                'client_review','approved','publication_reported','publication_verified','cancelled')),
  status_reason               text,
  required_tags               text[] not null default '{}',
  required_mentions           text[] not null default '{}',
  required_links              text[] not null default '{}',
  current_version_id          uuid,
  assigned_reviewer_id        uuid references public.users(id) on delete set null,
  first_submitted_at          timestamptz,
  submission_breached_at      timestamptz,
  publication_breached_at     timestamptz,
  version                     integer not null default 1,
  created_by                  uuid references public.users(id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint cm_deliverables_cancel_reason check (status <> 'cancelled' or length(btrim(coalesce(status_reason,''))) > 0)
);
create index if not exists cm_deliverables_participation_idx on public.cm_deliverables (participation_id);
create index if not exists cm_deliverables_campaign_status_idx on public.cm_deliverables (campaign_id, status);
create index if not exists cm_deliverables_due_idx on public.cm_deliverables (submission_due_at) where status = 'awaiting_submission';

create table if not exists public.cm_content_versions (
  id              uuid primary key default gen_random_uuid(),
  deliverable_id  uuid not null references public.cm_deliverables(id) on delete restrict,
  version_number  integer not null,
  asset_id        uuid references public.cm_assets(id) on delete restrict,
  external_url    text check (external_url is null or external_url ~* '^https?://'),
  caption         text,
  creator_notes   text,
  submitted_by_user_id  uuid references public.users(id) on delete set null,
  submitted_by_grant_id uuid,
  submitted_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (deliverable_id, version_number),
  constraint cm_content_versions_has_content check (asset_id is not null or external_url is not null)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cm_deliverables_current_version_fk') then
    alter table public.cm_deliverables add constraint cm_deliverables_current_version_fk
      foreign key (current_version_id) references public.cm_content_versions(id) on delete restrict;
  end if;
end $$;

-- Per-version comments (optional video timestamp).
create table if not exists public.cm_content_comments (
  id                 uuid primary key default gen_random_uuid(),
  content_version_id uuid not null references public.cm_content_versions(id) on delete cascade,
  body               text not null check (length(btrim(body)) between 1 and 4000),
  video_timestamp_seconds numeric(8,2) check (video_timestamp_seconds is null or video_timestamp_seconds >= 0),
  visibility         text not null default 'shared' check (visibility in ('internal','shared')),
  author_user_id     uuid references public.users(id) on delete set null,
  author_grant_id    uuid,
  created_at         timestamptz not null default now()
);
create index if not exists cm_content_comments_version_idx on public.cm_content_comments (content_version_id);

-- Deadline change history; original deadlines are kept on the row as well.
create table if not exists public.cm_deadline_changes (
  id             uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.cm_deliverables(id) on delete cascade,
  field          text not null check (field in ('submission_due_at','publication_due_at')),
  old_value      timestamptz,
  new_value      timestamptz,
  reason         text,
  changed_by     uuid references public.users(id) on delete set null,
  changed_at     timestamptz not null default now()
);
create index if not exists cm_deadline_changes_deliverable_idx on public.cm_deadline_changes (deliverable_id);

-- ── Approval decisions (append-only) ───────────────────────────────────────
create table if not exists public.cm_approval_decisions (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.cm_campaigns(id) on delete restrict,
  target_type     text not null check (target_type in ('shortlist_item','content_version')),
  target_id       uuid not null,
  target_version  integer not null,
  approval_stage  text not null check (approval_stage in ('internal','client')),
  decision        text not null check (decision in ('approved','changes_requested','rejected')),
  feedback        text,
  actor_user_id   uuid references public.users(id) on delete set null,
  actor_grant_id  uuid,
  actor_label     text not null,
  decided_at      timestamptz not null default now(),
  constraint cm_approval_actor check (actor_user_id is not null or actor_grant_id is not null),
  constraint cm_approval_feedback check (decision = 'approved' or length(btrim(coalesce(feedback,''))) > 0)
);
-- one decision per target per stage: makes double clicks harmless
create unique index if not exists cm_approval_one_per_stage
  on public.cm_approval_decisions (target_type, target_id, target_version, approval_stage);
create index if not exists cm_approval_campaign_idx on public.cm_approval_decisions (campaign_id, decided_at);

-- ── Publications and metrics ───────────────────────────────────────────────
create table if not exists public.cm_publications (
  id                    uuid primary key default gen_random_uuid(),
  deliverable_id        uuid not null unique references public.cm_deliverables(id) on delete restrict,
  published_url         text not null check (published_url ~* '^https?://'),
  reported_published_at timestamptz not null,
  actual_published_at   timestamptz,
  reported_by_user_id   uuid references public.users(id) on delete set null,
  reported_by_grant_id  uuid,
  verification_status   text not null default 'reported' check (verification_status in ('reported','verified','rejected')),
  verified_by           uuid references public.users(id) on delete set null,
  verified_at           timestamptz,
  verification_notes    text,
  evidence_asset_id     uuid references public.cm_assets(id) on delete restrict,
  version               integer not null default 1,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint cm_publications_verified check (
    verification_status <> 'verified'
    or (verified_by is not null and verified_at is not null and evidence_asset_id is not null and actual_published_at is not null))
);

create table if not exists public.cm_metric_observations (
  id                 uuid primary key default gen_random_uuid(),
  campaign_id        uuid not null references public.cm_campaigns(id) on delete restrict,
  deliverable_id     uuid not null references public.cm_deliverables(id) on delete restrict,
  publication_id     uuid references public.cm_publications(id) on delete restrict,
  metric_name        text not null check (metric_name in ('views','impressions','reach','likes','comments','shares','saves','clicks')),
  metric_value       numeric(18,0) not null check (metric_value >= 0),
  source_type        text not null check (source_type in ('creator_reported','manager_entered','platform_export')),
  captured_at        timestamptz not null,
  measurement_period text not null default 'lifetime' check (measurement_period in ('24h','48h','7d','14d','30d','lifetime')),
  evidence_asset_id  uuid references public.cm_assets(id) on delete restrict,
  entered_by_user_id uuid references public.users(id) on delete set null,
  entered_by_grant_id uuid,
  created_at         timestamptz not null default now()
);
create index if not exists cm_metrics_deliverable_idx on public.cm_metric_observations (deliverable_id, metric_name, captured_at desc);

-- ── Tasks ──────────────────────────────────────────────────────────────────
create table if not exists public.cm_tasks (
  id                 uuid primary key default gen_random_uuid(),
  campaign_id        uuid not null references public.cm_campaigns(id) on delete restrict,
  participation_id   uuid references public.cm_participations(id) on delete restrict,
  deliverable_id     uuid references public.cm_deliverables(id) on delete restrict,
  type               text not null,
  title              text not null check (length(btrim(title)) between 1 and 300),
  description        text,
  audience           text not null default 'internal' check (audience in ('internal','creator')),
  assignee_user_id   uuid references public.users(id) on delete set null,
  due_at             timestamptz,
  status             text not null default 'open' check (status in ('open','in_progress','done','cancelled')),
  priority           text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  completed_at       timestamptz,
  cancel_reason      text,
  automation_key     text unique,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_by_event_id uuid,
  version            integer not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists cm_tasks_campaign_idx on public.cm_tasks (campaign_id, status, due_at);
create index if not exists cm_tasks_assignee_idx on public.cm_tasks (assignee_user_id, status, due_at);
create index if not exists cm_tasks_deliverable_idx on public.cm_tasks (deliverable_id) where deliverable_id is not null;

-- ── Shipments ──────────────────────────────────────────────────────────────
create table if not exists public.cm_shipments (
  id               uuid primary key default gen_random_uuid(),
  participation_id uuid not null unique references public.cm_participations(id) on delete restrict,
  status           text not null default 'not_required'
                   check (status in ('not_required','required','preparing','shipped','delivered','exception')),
  carrier_name     text,
  tracking_number  text,
  tracking_url     text check (tracking_url is null or tracking_url ~* '^https?://'),
  shipping_address text,
  dispatched_at    timestamptz,
  delivered_at     timestamptz,
  notes            text,
  version          integer not null default 1,
  updated_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── Budget ─────────────────────────────────────────────────────────────────
-- One row per cost item. A row moves planned → committed → actual (or
-- cancelled) IN PLACE, so it is counted once, in the bucket of its current
-- status. See src/lib/campaigns/domain/budget.ts for the formulas.
create table if not exists public.cm_budget_lines (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references public.cm_campaigns(id) on delete restrict,
  participation_id  uuid references public.cm_participations(id) on delete restrict,
  category          text not null check (category in ('influencers','production','shipping','rights','misc')),
  description       text not null check (length(btrim(description)) between 1 and 300),
  amount            numeric(14,2) not null check (amount >= 0),
  currency          char(3) not null,
  status            text not null default 'planned' check (status in ('planned','committed','actual','cancelled')),
  source            text not null default 'manual' check (source in ('manual','participation_fee')),
  source_reference  text,
  recorded_by       uuid references public.users(id) on delete set null,
  version           integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists cm_budget_campaign_idx on public.cm_budget_lines (campaign_id, status);
create unique index if not exists cm_budget_one_fee_line on public.cm_budget_lines (participation_id)
  where source = 'participation_fee';

-- ── Portal access for clients, creators and agents ─────────────────────────
create table if not exists public.cm_portal_grants (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('client','creator','agent')),
  campaign_id     uuid not null references public.cm_campaigns(id) on delete restrict,
  client_id       uuid references public.clients(id) on delete restrict,
  creator_id      uuid references public.cm_creators(id) on delete restrict,
  agent_id        uuid references public.cm_agents(id) on delete restrict,
  recipient_name  text not null,
  recipient_email text check (recipient_email is null or recipient_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status          text not null default 'active' check (status in ('active','revoked')),
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  revoked_by      uuid references public.users(id) on delete set null,
  created_by      uuid references public.users(id) on delete set null,
  last_entered_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint cm_portal_grants_scope check (
       (kind = 'client'  and client_id  is not null and creator_id is null and agent_id is null)
    or (kind = 'creator' and creator_id is not null and client_id  is null and agent_id is null)
    or (kind = 'agent'   and agent_id   is not null and client_id  is null and creator_id is null))
);
create index if not exists cm_portal_grants_campaign_idx on public.cm_portal_grants (campaign_id, kind);

-- Raw tokens are never stored: token_hash = sha256(token).
create table if not exists public.cm_portal_tokens (
  id          uuid primary key default gen_random_uuid(),
  grant_id    uuid not null references public.cm_portal_grants(id) on delete cascade,
  token_hash  text not null unique,
  purpose     text not null check (purpose in ('invite','login')),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  revoked_at  timestamptz,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists cm_portal_tokens_grant_idx on public.cm_portal_tokens (grant_id);

create table if not exists public.cm_portal_sessions (
  id            uuid primary key default gen_random_uuid(),
  grant_id      uuid not null references public.cm_portal_grants(id) on delete cascade,
  session_hash  text not null unique,
  token_id      uuid references public.cm_portal_tokens(id) on delete set null,
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists cm_portal_sessions_grant_idx on public.cm_portal_sessions (grant_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cm_assets_grant_fk') then
    alter table public.cm_assets add constraint cm_assets_grant_fk
      foreign key (uploaded_by_grant_id) references public.cm_portal_grants(id) on delete set null;
  end if;
end $$;

-- ── Report snapshots ───────────────────────────────────────────────────────
create table if not exists public.cm_report_snapshots (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.cm_campaigns(id) on delete restrict,
  audience       text not null check (audience in ('internal','client')),
  data           jsonb not null,
  summary_notes  text,
  created_by     uuid references public.users(id) on delete set null,
  published_to_client_at timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists cm_report_snapshots_campaign_idx on public.cm_report_snapshots (campaign_id, created_at desc);

-- ── Durable jobs (outbox) and notifications ────────────────────────────────
create table if not exists public.cm_jobs (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null,
  campaign_id     uuid references public.cm_campaigns(id) on delete cascade,
  subject_type    text,
  subject_id      uuid,
  payload         jsonb not null default '{}'::jsonb,
  dedupe_key      text not null unique,
  run_after       timestamptz not null default now(),
  status          text not null default 'pending' check (status in ('pending','running','done','skipped','cancelled','failed','dead')),
  attempts        integer not null default 0,
  max_attempts    integer not null default 5,
  last_error      text,
  result          text,
  locked_at       timestamptz,
  correlation_id  uuid not null default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists cm_jobs_due_idx on public.cm_jobs (run_after) where status in ('pending','failed');
create index if not exists cm_jobs_subject_idx on public.cm_jobs (subject_type, subject_id, status);

create table if not exists public.cm_notifications (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid references public.cm_campaigns(id) on delete cascade,
  job_id              uuid references public.cm_jobs(id) on delete set null,
  channel             text not null check (channel in ('email','whatsapp')),
  audience            text not null check (audience in ('internal','client','creator','agent')),
  recipient_user_id   uuid references public.users(id) on delete set null,
  recipient_grant_id  uuid references public.cm_portal_grants(id) on delete set null,
  to_address          text not null,
  subject             text not null,
  body_text           text not null,
  link_path           text,
  -- re-checked right before sending; a message that is no longer needed is cancelled
  relevance           jsonb,
  idempotency_key     text not null unique,
  status              text not null default 'pending'
                      check (status in ('pending','sending','sent','dev_not_sent','failed','dead','uncertain','cancelled')),
  provider            text,
  provider_message_id text,
  attempts            integer not null default 0,
  max_attempts        integer not null default 5,
  next_attempt_at     timestamptz not null default now(),
  last_error          text,
  correlation_id      uuid not null,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists cm_notifications_due_idx on public.cm_notifications (next_attempt_at) where status in ('pending','failed');
create index if not exists cm_notifications_campaign_idx on public.cm_notifications (campaign_id, created_at desc);

-- ── Idempotency for create-type requests (double submit) ───────────────────
create table if not exists public.cm_idempotency_keys (
  key            text not null,
  actor          text not null,
  scope          text not null,
  response_status integer not null,
  response_body  jsonb not null,
  created_at     timestamptz not null default now(),
  primary key (actor, scope, key)
);

-- ── Rate limiting (fixed windows) ──────────────────────────────────────────
create table if not exists public.cm_rate_limits (
  bucket        text not null,
  window_start  timestamptz not null,
  count         integer not null default 0,
  primary key (bucket, window_start)
);

-- ── Audit (append-only) ────────────────────────────────────────────────────
create table if not exists public.cm_audit_events (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid references public.cm_campaigns(id) on delete set null,
  entity_type    text not null,
  entity_id      uuid,
  action         text not null,
  actor_type     text not null check (actor_type in ('user','portal','system')),
  actor_user_id  uuid references public.users(id) on delete set null,
  actor_grant_id uuid references public.cm_portal_grants(id) on delete set null,
  actor_label    text not null,
  summary        text,
  changes        jsonb,
  correlation_id uuid,
  created_at     timestamptz not null default now()
);
create index if not exists cm_audit_campaign_idx on public.cm_audit_events (campaign_id, created_at desc);
create index if not exists cm_audit_entity_idx on public.cm_audit_events (entity_type, entity_id, created_at);

-- ── Integrity triggers ─────────────────────────────────────────────────────

-- Audit rows and approval decisions are immutable.
create or replace function public.cm_forbid_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'cm: % rows are append-only', tg_table_name using errcode = 'P0001';
end $$;

-- Original deadlines are set once (first non-null value) and never change;
-- breach timestamps, once set, are never cleared.
create or replace function public.cm_deliverable_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.original_submission_due_at  := coalesce(new.original_submission_due_at, new.submission_due_at);
    new.original_publication_due_at := coalesce(new.original_publication_due_at, new.publication_due_at);
    return new;
  end if;
  if old.original_submission_due_at is not null and new.original_submission_due_at is distinct from old.original_submission_due_at then
    raise exception 'cm: original_submission_due_at is immutable' using errcode = 'P0001';
  end if;
  if old.original_publication_due_at is not null and new.original_publication_due_at is distinct from old.original_publication_due_at then
    raise exception 'cm: original_publication_due_at is immutable' using errcode = 'P0001';
  end if;
  if old.original_submission_due_at is null then
    new.original_submission_due_at := coalesce(new.original_submission_due_at, new.submission_due_at);
  end if;
  if old.original_publication_due_at is null then
    new.original_publication_due_at := coalesce(new.original_publication_due_at, new.publication_due_at);
  end if;
  if old.submission_breached_at is not null and new.submission_breached_at is distinct from old.submission_breached_at then
    raise exception 'cm: submission_breached_at cannot be changed once set' using errcode = 'P0001';
  end if;
  if old.publication_breached_at is not null and new.publication_breached_at is distinct from old.publication_breached_at then
    raise exception 'cm: publication_breached_at cannot be changed once set' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Content versions are immutable once written (a new submission is a new row).
create or replace function public.cm_content_version_guard() returns trigger
language plpgsql as $$
begin
  raise exception 'cm: content versions are immutable' using errcode = 'P0001';
end $$;

do $$
declare t text;
begin
  foreach t in array array['cm_staff_roles','cm_campaigns','cm_agents','cm_creators','cm_creator_social_accounts',
    'cm_assets','cm_participations','cm_shortlists','cm_deliverables','cm_publications','cm_tasks','cm_shipments',
    'cm_budget_lines','cm_portal_grants','cm_jobs','cm_notifications']
  loop
    if not exists (select 1 from pg_trigger where tgname = t || '_touch') then
      execute format('create trigger %I before update on public.%I for each row execute function public.cm_touch_updated_at()', t || '_touch', t);
    end if;
  end loop;

  if not exists (select 1 from pg_trigger where tgname = 'cm_audit_events_append_only') then
    create trigger cm_audit_events_append_only before update or delete on public.cm_audit_events
      for each row execute function public.cm_forbid_mutation();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'cm_approval_decisions_append_only') then
    create trigger cm_approval_decisions_append_only before update or delete on public.cm_approval_decisions
      for each row execute function public.cm_forbid_mutation();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'cm_content_versions_immutable') then
    create trigger cm_content_versions_immutable before update or delete on public.cm_content_versions
      for each row execute function public.cm_content_version_guard();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'cm_deliverables_guard') then
    create trigger cm_deliverables_guard before insert or update on public.cm_deliverables
      for each row execute function public.cm_deliverable_guard();
  end if;
end $$;

-- ── Lock the tables away from client roles ─────────────────────────────────
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'cm\_%'
  loop
    execute format('alter table public.%I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table public.%I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on table public.%I from authenticated', t);
    end if;
  end loop;
end $$;

revoke all on function public.cm_touch_updated_at() from public;
revoke all on function public.cm_forbid_mutation() from public;
revoke all on function public.cm_deliverable_guard() from public;
revoke all on function public.cm_content_version_guard() from public;
