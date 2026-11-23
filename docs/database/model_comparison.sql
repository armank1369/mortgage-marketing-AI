-- Two-model comparison beta (docs/MODEL_COMPARISON_BETA.md).
-- Apply once on the approved target Neon branch before setting LUCIE_COMPARE_BETA=true.
-- Not applied automatically. Additive only: no existing table is changed.
BEGIN;
CREATE TABLE public.model_comparison (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspace(id) ON DELETE CASCADE,
    created_by_member_id uuid NOT NULL REFERENCES public.workspace_member(id) ON DELETE RESTRICT,
    persona_id uuid REFERENCES public.persona(id) ON DELETE SET NULL,
    prompt text NOT NULL,
    -- [{slot, provider, model, response | error, usage, latency_ms, provider_calls, estimated_cost_usd}]
    candidates jsonb NOT NULL CHECK (jsonb_typeof(candidates) = 'array'),
    estimated_cost_usd numeric(12,6) CHECK (estimated_cost_usd IS NULL OR estimated_cost_usd >= 0),
    -- 'merged' = the user combined both drafts instead of picking one.
    chosen_slot text CHECK (chosen_slot IS NULL OR chosen_slot IN ('A', 'B', 'tie', 'neither', 'merged')),
    -- {"A": {"aspects": [...], "note": "..."}, "B": {...}}: what the user liked in each draft.
    feedback jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(feedback) = 'object'),
    -- Combine/refine rounds: [{round, kind, provider, model, response | error, usage, estimated_cost_usd, change}]
    merges jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(merges) = 'array'),
    chosen_by_member_id uuid REFERENCES public.workspace_member(id) ON DELETE RESTRICT,
    chosen_at timestamptz,
    note text CHECK (note IS NULL OR char_length(note) <= 1000),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_model_comparison_workspace_created
    ON public.model_comparison (workspace_id, created_at DESC);
COMMIT;
