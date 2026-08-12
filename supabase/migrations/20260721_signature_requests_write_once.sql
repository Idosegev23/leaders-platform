-- ============================================================================
-- signature_requests: write-once payload + status-transition guard.
--
-- Closes three live hazards:
--   1. payload.quote_data (the snapshot the sign route regenerates the signed
--      PDF from) could be mutated after signing — retroactively changing what
--      the client signed. Now write-once once quote_data/contract_data exists.
--   2. status='signed' was not terminal at the DB layer.
--   3. A superseded/stale request could reach 'signed' via a race between the
--      sign route's status read and its final UPDATE (TOCTOU). 'signed' is now
--      reachable only from 'pending'/'opened'.
--
-- Verified safe against every existing write path (2026-07-20): no legitimate
-- UPDATE mutates payload on a quote row, and no legitimate path performs an
-- illegal status transition (sign route reaches the signed-UPDATE only from
-- pending/opened; the expired-UPDATE explicitly excludes signed rows).
--
-- Idempotent.
-- ============================================================================

create or replace function public.signature_requests_write_once()
returns trigger language plpgsql as $$
begin
  -- 1. payload is write-once once it carries a quote/contract snapshot
  if (old.payload ? 'quote_data' or old.payload ? 'contract_data')
     and new.payload is distinct from old.payload then
    raise exception 'signature_requests.payload is write-once (request %)', old.id;
  end if;

  -- 2. signed is terminal
  if old.status = 'signed' and new.status is distinct from old.status then
    raise exception 'signature request % is signed and terminal', old.id;
  end if;

  -- 3. signed reachable only from pending/opened (closes supersede -> sign race).
  --    `old.status <> 'signed'` scopes this to a genuine TRANSITION — without it
  --    the guard freezes already-signed rows against any update (e.g. stamping
  --    quote_revision_id during backfill). Rule 2 covers status changes away
  --    from signed.
  if new.status = 'signed' and old.status <> 'signed'
     and old.status not in ('pending','opened') then
    raise exception 'signature request % cannot be signed from status %', old.id, old.status;
  end if;

  return new;
end $$;

drop trigger if exists signature_requests_write_once_trg on public.signature_requests;
create trigger signature_requests_write_once_trg
  before update on public.signature_requests
  for each row execute function public.signature_requests_write_once();
