-- Apply once on the approved target branch after reviewing schema metadata.
BEGIN;
CREATE TABLE public.workspace_schedule_state (
    workspace_id uuid PRIMARY KEY REFERENCES public.workspace ON DELETE CASCADE,
    revision bigint NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.calendar_entry ADD COLUMN display_data jsonb NOT NULL DEFAULT '{}';

CREATE FUNCTION public.bump_schedule_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    old_workspace uuid;
    new_workspace uuid;
    affected uuid;
BEGIN
    IF TG_TABLE_NAME = 'campaign_persona' THEN
        IF TG_OP <> 'INSERT' THEN
            SELECT workspace_id INTO old_workspace FROM public.campaign WHERE id = OLD.campaign_id;
        END IF;
        IF TG_OP <> 'DELETE' THEN
            SELECT workspace_id INTO new_workspace FROM public.campaign WHERE id = NEW.campaign_id;
        END IF;
    ELSE
        IF TG_OP <> 'INSERT' THEN old_workspace := OLD.workspace_id; END IF;
        IF TG_OP <> 'DELETE' THEN new_workspace := NEW.workspace_id; END IF;
    END IF;
    FOR affected IN SELECT DISTINCT w FROM unnest(ARRAY[old_workspace,new_workspace]) w
                    WHERE w IS NOT NULL ORDER BY w LOOP
        INSERT INTO public.workspace_schedule_state(workspace_id,revision)
        SELECT id,1 FROM public.workspace WHERE id = affected
        ON CONFLICT (workspace_id) DO UPDATE
        SET revision = workspace_schedule_state.revision + 1, updated_at = clock_timestamp();
    END LOOP;
    RETURN NULL;
END;
$$;
DO $$
DECLARE name text;
BEGIN
    FOREACH name IN ARRAY ARRAY['campaign','campaign_persona','content_item','calendar_entry'] LOOP
        EXECUTE format('CREATE TRIGGER schedule_revision AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.bump_schedule_revision()', name);
    END LOOP;
END;
$$;
COMMIT;
