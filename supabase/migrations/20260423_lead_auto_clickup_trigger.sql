-- On every INSERT into `leads`, fire an async HTTP POST to the Next.js
-- endpoint that creates a matching ClickUp task and back-fills
-- metadata.task_id. Uses pg_net so the INSERT is not blocked.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_new_lead_create_clickup_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.metadata ? 'task_id' AND NEW.metadata->>'task_id' <> '' THEN
    RETURN NEW;
  END IF;

  PERFORM extensions.net.http_post(
    url := 'https://leaders-platform.vercel.app/api/leads/' || NEW.id::text || '/ensure-clickup-task',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Trigger-Secret', current_setting('app.leads_trigger_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_lead_create_clickup_task ON public.leads;

CREATE TRIGGER trg_new_lead_create_clickup_task
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_lead_create_clickup_task();

-- Set the trigger secret via:
--   ALTER DATABASE postgres SET "app.leads_trigger_secret" TO 'YOUR_SECRET';
-- (committed migration uses current_setting so the secret stays out of git)
