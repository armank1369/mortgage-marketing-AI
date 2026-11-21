-- Insights dashboard storage. Apply once on the approved target branch after review.
-- Adds imported post performance (from platform CSV exports) and cached written analyses.
-- Nothing here changes existing tables. Rollback: DROP TABLE public.insight_report, public.post_metric;
BEGIN;

CREATE TABLE public.post_metric (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspace ON DELETE CASCADE,
    platform text NOT NULL CHECK (platform IN ('Instagram','Facebook','LinkedIn')),
    external_id text NOT NULL,
    posted_at timestamptz NOT NULL,
    permalink text,
    caption text,
    post_type text,
    impressions integer CHECK (impressions >= 0),
    reach integer CHECK (reach >= 0),
    views integer CHECK (views >= 0),
    likes integer CHECK (likes >= 0),
    comments integer CHECK (comments >= 0),
    shares integer CHECK (shares >= 0),
    saves integer CHECK (saves >= 0),
    clicks integer CHECK (clicks >= 0),
    follows integer CHECK (follows >= 0),
    -- Best-effort link to the Lucie calendar slot the post came from (same platform and local day).
    calendar_entry_id uuid REFERENCES public.calendar_entry ON DELETE SET NULL,
    imported_by_member_id uuid REFERENCES public.workspace_member ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, platform, external_id)
);
CREATE INDEX ix_post_metric_workspace_posted ON public.post_metric (workspace_id, posted_at DESC);
CREATE TRIGGER trg_post_metric_updated BEFORE UPDATE ON public.post_metric
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.insight_report (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspace ON DELETE CASCADE,
    period_days integer NOT NULL CHECK (period_days IN (7, 30, 90)),
    period_end date NOT NULL,
    kpi_hash text NOT NULL,
    model text NOT NULL,
    analysis jsonb NOT NULL,
    created_by_member_id uuid REFERENCES public.workspace_member ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, period_days, period_end)
);

COMMIT;
