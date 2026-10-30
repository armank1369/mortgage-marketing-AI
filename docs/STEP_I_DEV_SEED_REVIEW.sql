-- REVIEW ONLY. No SQL in this file was executed by the implementation agent.
-- Confirm the Neon DEVELOPMENT branch in the owner's console and the intended
-- workspace independently before replacing NULL::uuid below or enabling writes.
-- Verify relevant types/defaults/UNIQUE(workspace_id, slug) only if necessary.
-- Do not run against production. No identity values are seeded here.

-- Narrow read-only review: NULL deliberately selects no workspace until confirmed.
WITH target AS (SELECT NULL::uuid AS workspace_id)
SELECT w.id, w.name, w.environment, bp.business_name, bp.nmls_id, bp.dre_number,
       bp.settings ->> 'licensed_person_name' AS licensed_person_name,
       bp.tone, bp.values, bp.keywords, bp.catchphrases, bp.banned_words
FROM public.workspace AS w
JOIN target AS t ON t.workspace_id = w.id
LEFT JOIN public.brand_profile AS bp ON bp.workspace_id = w.id
WHERE w.environment = 'development';

WITH target AS (SELECT NULL::uuid AS workspace_id)
SELECT p.id, p.slug, p.name, p.description, p.audience_profile, p.prompt_guidance
FROM public.persona AS p
JOIN target AS t ON t.workspace_id = p.workspace_id
JOIN public.workspace AS w ON w.id = p.workspace_id
WHERE w.environment = 'development' AND p.deleted_at IS NULL;

-- PROPOSED brand voice: derived from the former Flask BASE_PROMPT, not live facts.
-- Obtain approval for the exact workspace and statements before uncommenting.
-- Replace both NULL::uuid targets with the independently confirmed UUID.
-- Leave ROLLBACK until RETURNING has been reviewed. No overwrite of nonempty fields.
-- BEGIN;
-- UPDATE public.brand_profile AS bp
-- SET tone = CASE WHEN bp.tone IS NULL OR bp.tone = '{}'::jsonb
--       THEN '{"voice":"Professional, authoritative, serious and matter-of-fact; trusted advisor, without hype"}'::jsonb ELSE bp.tone END,
--     values = CASE WHEN bp.values IS NULL OR bp.values = '[]'::jsonb
--       THEN '["Accuracy","Transparency","Responsiveness"]'::jsonb ELSE bp.values END,
--     keywords = CASE WHEN bp.keywords IS NULL OR cardinality(bp.keywords)=0
--       THEN ARRAY['clear','strategic','thorough','reliable','precise','trusted']::text[] ELSE bp.keywords END,
--     catchphrases = CASE WHEN bp.catchphrases IS NULL OR cardinality(bp.catchphrases)=0
--       THEN ARRAY['Financing with clarity.','Mortgage guidance without the guesswork.']::text[] ELSE bp.catchphrases END,
--     banned_words = CASE WHEN bp.banned_words IS NULL OR cardinality(bp.banned_words)=0
--       THEN ARRAY['guaranteed','easy money','lowest rates','best lender','no-brainer','stress-free','magic','amazing','game changer','rock star','crush it']::text[] ELSE bp.banned_words END,
--     updated_at = now()
-- WHERE bp.workspace_id = NULL::uuid
--   AND EXISTS (SELECT 1 FROM public.workspace w WHERE w.id=bp.workspace_id AND w.environment='development')
-- RETURNING bp.id,bp.workspace_id,bp.tone,bp.values,bp.keywords,bp.catchphrases,bp.banned_words;
-- ROLLBACK;

-- PROPOSED personas: business-owner from legacy onboarding/backend; first-time
-- homebuyer from the supplied handoff's interview summary (original interview
-- not independently accessed). Neither proposal assumes protected characteristics.
-- ON CONFLICT never replaces an existing or soft-deleted slug; review a conflict.
-- BEGIN;
-- INSERT INTO public.persona
--   (workspace_id,slug,name,description,audience_profile,prompt_guidance,is_starter)
-- SELECT w.id,'business-owner','The Business Owner',
--   'Business owners navigating complex income documentation.',
--   '{"needs":["complex income documentation","clear financing education"]}'::jsonb,
--   'Explain documentation and financing options neutrally; never promise qualification, pricing or underwriting outcomes.',true
-- FROM public.workspace AS w WHERE w.id=NULL::uuid AND w.environment='development'
-- ON CONFLICT (workspace_id,slug) DO NOTHING
-- RETURNING id,workspace_id,slug,name;
-- INSERT INTO public.persona
--   (workspace_id,slug,name,description,audience_profile,prompt_guidance,is_starter)
-- SELECT w.id,'first-time-homebuyer','First-Time Homebuyer',
--   'People new to the mortgage process who want understandable guidance.',
--   '{"needs":["mortgage process education","clear next steps"]}'::jsonb,
--   'Explain terms step by step without assuming age, income, family status or eligibility; no guarantees.',true
-- FROM public.workspace AS w WHERE w.id=NULL::uuid AND w.environment='development'
-- ON CONFLICT (workspace_id,slug) DO NOTHING
-- RETURNING id,workspace_id,slug,name;
-- ROLLBACK;

-- Prefer the authorized Settings editor and reviewed starter UI for manual setup.
-- Proposed business-name correction "Lucent Brokerage" is not an approved write.
-- Joseph Kim, NMLS 684894 and DRE 02190229 are historical code references only,
-- not independently verified licensing facts. Configure verified identity manually.
-- This template does not create a missing brand_profile, change identity, or roles.
