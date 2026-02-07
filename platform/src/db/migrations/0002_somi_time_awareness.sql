-- Migration: Somi time awareness, post querying, and past-date prevention
-- Run via: cd platform && source ../.env && npx tsx -e "import postgres from 'postgres'; const sql = postgres(process.env.DATABASE_URL!); await sql.file('src/db/migrations/0002_somi_time_awareness.sql'); await sql.end(); console.log('done')"

-- 1. get_current_time() — returns current UTC time as structured JSON
CREATE OR REPLACE FUNCTION get_current_time()
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT json_build_object(
    'utc_now',     to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'utc_date',    to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
    'utc_time',    to_char(now() AT TIME ZONE 'UTC', 'HH24:MI:SS'),
    'day_of_week', trim(to_char(now() AT TIME ZONE 'UTC', 'Day')),
    'unix_epoch',  extract(epoch from now())::bigint
  );
$$;

-- 2. get_scheduled_posts(...) — query posts with optional filters
CREATE OR REPLACE FUNCTION get_scheduled_posts(
  p_tenant_id uuid,
  p_agent_slug text DEFAULT 'somi',
  p_status text DEFAULT NULL,
  p_platform text DEFAULT NULL,
  p_upcoming_only text DEFAULT 'true',
  p_month text DEFAULT NULL,
  p_limit integer DEFAULT 10
) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_rows json;
  v_total integer;
  v_returned integer;
  v_effective_limit integer;
  v_upcoming boolean;
BEGIN
  -- Coerce empty strings to NULL (YAML sends "" for undefined optional params)
  IF p_status = '' THEN p_status := NULL; END IF;
  IF p_platform = '' THEN p_platform := NULL; END IF;
  IF p_month = '' THEN p_month := NULL; END IF;
  IF p_upcoming_only = '' THEN p_upcoming_only := 'true'; END IF;

  -- Parse upcoming_only as boolean
  v_upcoming := (lower(p_upcoming_only) IN ('true', '1', 'yes'));

  -- Hard cap at 50
  v_effective_limit := LEAST(GREATEST(p_limit, 1), 50);

  -- Count total matching
  SELECT count(*) INTO v_total
  FROM posts
  WHERE tenant_id = p_tenant_id
    AND (p_agent_slug IS NULL OR agent_slug = p_agent_slug)
    AND (p_status IS NULL OR status = p_status)
    AND (p_platform IS NULL OR platform = p_platform)
    AND (NOT v_upcoming OR scheduled_date >= now())
    AND (p_month IS NULL OR to_char(scheduled_date, 'YYYY-MM') = p_month);

  -- Fetch rows
  SELECT json_agg(row_data) INTO v_rows
  FROM (
    SELECT json_build_object(
      'id', id,
      'platform', platform,
      'title', title,
      'content_preview', left(content, 80),
      'image_url', image_url,
      'scheduled_date', to_char(scheduled_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'status', status
    ) AS row_data
    FROM posts
    WHERE tenant_id = p_tenant_id
      AND (p_agent_slug IS NULL OR agent_slug = p_agent_slug)
      AND (p_status IS NULL OR status = p_status)
      AND (p_platform IS NULL OR platform = p_platform)
      AND (NOT v_upcoming OR scheduled_date >= now())
      AND (p_month IS NULL OR to_char(scheduled_date, 'YYYY-MM') = p_month)
    ORDER BY scheduled_date ASC
    LIMIT v_effective_limit
  ) sub;

  v_returned := COALESCE(json_array_length(v_rows), 0);

  RETURN json_build_object(
    'total_count', v_total,
    'returned', v_returned,
    'posts', COALESCE(v_rows, '[]'::json)
  );
END;
$$;

-- 3. Trigger to prevent scheduling in the past (5-min grace period)
CREATE OR REPLACE FUNCTION check_post_not_in_past()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.scheduled_date < (now() - interval '5 minutes') THEN
    RAISE EXCEPTION 'Cannot schedule a post in the past. scheduled_date=% is before current time=%',
      NEW.scheduled_date, now()
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Drop trigger if exists (idempotent)
DROP TRIGGER IF EXISTS trg_posts_no_past_date ON posts;

CREATE TRIGGER trg_posts_no_past_date
  BEFORE INSERT OR UPDATE OF scheduled_date ON posts
  FOR EACH ROW EXECUTE FUNCTION check_post_not_in_past();

-- 4. Grants
GRANT EXECUTE ON FUNCTION get_current_time() TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION get_scheduled_posts(uuid, text, text, text, text, text, integer) TO service_role, authenticated;
