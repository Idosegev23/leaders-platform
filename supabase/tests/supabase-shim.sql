-- Local stand-in for the parts of a Supabase project that the Hub migrations
-- assume already exist. Used ONLY to apply the migration history to an empty
-- local Postgres (scripts/campaigns/db.ts). Never run this on Supabase.
--
-- 1. Platform objects: roles, auth schema, storage.buckets, realtime publication.
-- 2. pptmaker base tables that predate supabase/migrations (users, documents,
--    templates), with the columns the live DB has (introspected 2026-10-26).

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
-- Supabase grants client roles access to new public tables by default; mimic
-- that so the migration's revokes are actually exercised by the tests.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

create extension if not exists pgcrypto;
create schema if not exists extensions;
create schema if not exists auth;
create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;
grant usage on schema auth to anon, authenticated, service_role;

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin','user');
  end if;
  if not exists (select 1 from pg_type where typname = 'document_type') then
    create type public.document_type as enum ('quote','deck','influencer_brief');
  end if;
  if not exists (select 1 from pg_type where typname = 'document_status') then
    create type public.document_status as enum ('draft','preview','generated','archived');
  end if;
end $$;

create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  full_name   text not null,
  avatar_url  text,
  role        public.user_role not null default 'user',
  google_drive_folder_id text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.document_type,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete set null,
  template_id uuid references public.templates(id) on delete set null,
  type        public.document_type not null,
  title       text not null,
  data        jsonb not null default '{}'::jsonb,
  status      public.document_status not null default 'draft',
  pdf_url     text,
  drive_file_id text,
  drive_file_url text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
