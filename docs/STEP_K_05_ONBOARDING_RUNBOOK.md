# Joseph Production Onboarding & Access Control Runbook (Step K5)

**Status:** Technical Preparation Complete — Execution Gated on Joseph Input & Approval  
**Guiding Principle:** Least privilege and zero ambient staff cross-workspace access.

---

## 1. Architectural Access Model & Security Gates

1. **Authentication Boundary:** Neon Auth handles user identity issuance via RS256-signed JWTs containing the user's `sub` claim (Auth user ID).
2. **Authorization Boundary:** A valid JWT alone does NOT provide workspace authorization. Access is governed strictly by the `public.workspace_member` table.
3. **No Automatic Staff Access:** Engineering and support staff accounts must NOT be automatically added to Joseph's production workspace. Joseph's tenant data is isolated.
4. **Capability-Based Role Model:** Roles in `public.workspace_member` are checked against `role = ANY (ARRAY['owner', 'admin', 'member', 'developer', 'viewer'])`. Joseph is provisioned with `role = 'admin'`.
5. **Historical Shared Chat Visibility:** In accordance with the Step J contract, all users assigned an active role (`admin`, `member`, `viewer`) inside Joseph's workspace share visibility of that workspace's saved and imported chats.

---

## 2. Gated Production Provisioning Sequence

> **APPROVAL GATE:** Do not run these steps until Joseph's signed `STEP_K_05_JOSEPH_INTAKE_TEMPLATE.md` is received and approved by the project owner.

### Stage 1: Joseph Account Creation
1. Joseph navigates to the production app sign-in URL (`/auth/sign-up`).
2. Joseph registers using his approved email address specified in his intake form.
3. Joseph verifies his email address.

### Stage 2: Identify Joseph's Auth Subject ID
In the production NeonDB SQL console (or admin CLI), locate his internal Neon Auth subject ID from `neon_auth.user`:
```sql
SELECT id, email, created_at 
FROM neon_auth.user 
WHERE email = 'JOSEPH_VERIFIED_EMAIL';
```

Record the returned user subject string (e.g., user_2tX... or Neon Auth user UUID) as :joseph_auth_user_id.

### Stage 3: Provision Production Workspace and Membership

Execute a single atomic transaction in production NeonDB:

```sql
BEGIN;

-- 1. Create Joseph's dedicated production workspace
-- Required columns: id (UUID), slug (TEXT UNIQUE), name (TEXT), environment (TEXT)
INSERT INTO public.workspace (
    id,
    slug,
    name,
    environment,
    created_at,
    updated_at
)
VALUES (
    gen_random_uuid(),
    'joseph-real-estate-mortgage',
    'Joseph Real Estate & Mortgage',
    'production',
    NOW(),
    NOW()
)
RETURNING id;
-- (Record the generated workspace UUID as :workspace_id)

-- 2. Bind Joseph as the workspace admin (least privilege tenant owner)
-- Table is singular: public.workspace_member
-- Subject column is auth_user_id (TEXT), role satisfies check constraint
INSERT INTO public.workspace_member (
    id,
    workspace_id,
    auth_user_id,
    role,
    created_at,
    updated_at
)
VALUES (
    gen_random_uuid(),
    :workspace_id,
    :joseph_auth_user_id,
    'admin',
    NOW(),
    NOW()
);

-- 3. Provision verified Brand Profile from signed intake form
-- Schema requires: nmls_id, dre_number, tone (jsonb), values (jsonb),
-- catchphrases (text[]), banned_words (text[]), blog_examples (jsonb), settings (jsonb)
INSERT INTO public.brand_profile (
    id,
    workspace_id,
    business_name,
    nmls_id,
    dre_number,
    compliance_footer,
    equal_housing_text,
    tone,
    values,
    keywords,
    catchphrases,
    banned_words,
    blog_examples,
    settings,
    created_at,
    updated_at
)
VALUES (
    gen_random_uuid(),
    :workspace_id,
    'VERIFIED_BUSINESS_NAME',
    'VERIFIED_NMLS_ID',
    'VERIFIED_DRE_NUMBER',
    'VERIFIED_COMPLIANCE_FOOTER',
    'Equal Housing Lender. All loans subject to credit approval.',
    '{"primary": "informative", "style": "accessible"}'::jsonb,
    '["transparency", "reliability"]'::jsonb,
    ARRAY['mortgage', 'refinance', 'first-time buyer']::text[],
    ARRAY['VERIFIED_CATCHPHRASE_1', 'VERIFIED_CATCHPHRASE_2']::text[],
    ARRAY['VERIFIED_BANNED_WORD_1', 'VERIFIED_BANNED_WORD_2']::text[],
    '[]'::jsonb,
    '{"licensed_person_name": "Joseph Verified Name"}'::jsonb,
    NOW(),
    NOW()
);

-- 4. Provision Initial Starter Persona
-- Schema requires: slug (TEXT UNIQUE per workspace), name (TEXT),
-- audience_profile (jsonb), prompt_guidance (TEXT), is_starter (BOOLEAN)
INSERT INTO public.persona (
    id,
    workspace_id,
    slug,
    name,
    description,
    audience_profile,
    prompt_guidance,
    is_starter,
    created_at,
    updated_at
)
VALUES (
    gen_random_uuid(),
    :workspace_id,
    'first-time-homebuyers',
    'First-Time Homebuyers',
    'Targeted at emerging residential buyers navigating first loans and down payments.',
    '{"demographics": "First-time buyers, ages 25-40", "knowledge_level": "beginner"}'::jsonb,
    'Maintain a helpful, educational tone. Demystify complex loan terms and escrow details.',
    true,
    NOW(),
    NOW()
);

COMMIT;
```

## 3. Pre-Joseph Test Scenarios (Using Development Identities)

Before executing the above on production, execute these automated and manual verification scenarios against the development database using disposable test UUIDs:

**Scenario 1:** Identity & Profile Load/Save/Reload

Sign in with a test user assigned to development workspace 8bab9643-a7a2-4b5c-989c-d7358393ac6e.

Issue GET /api/brand-profile. Verify HTTP 200 with matching business name and NMLS credentials.

Issue PUT /api/brand-profile with updated voice guidelines (tone JSONB and catchphrases array). Verify HTTP 200 and database persistence.

Reload the Settings page (/settings). Verify that the updated profile loads cleanly without UI cache conflicts.

**Scenario 2:** Persona Lifecycle & Soft-Delete

Issue POST /api/personas to create a test persona (slug: "test-refinance-persona"). Verify HTTP 201.

Issue PUT /api/personas/<id> setting deleted_at = NOW(). Verify HTTP 200.

Issue GET /api/personas. Verify the soft-deleted persona is excluded from active listings.

Confirm no foreign-key cascades broke in public.chat_message.

**Scenario 3:** Cross-Workspace Access Denial (Multi-Tenant Isolation)

Generate a JWT for Test User B (belonging to Workspace B).

Attempt to read Joseph's workspace via GET /api/brand-profile with X-Workspace-Id: :joseph_workspace_id.

Expected Result: HTTP 403 Forbidden ("Access denied: Not a member of the requested workspace").

**Scenario 4:** Member Removal & Session Revocation

Add a temporary test collaborator to the workspace with role = 'member'.

Remove the collaborator row from public.workspace_member. (Note: public.workspace_member has no revoked_at column; membership revocation occurs via row deletion).

Attempt to invoke POST /api/chat/sessions with the removed collaborator's session.

Expected Result: Immediate HTTP 403 Forbidden; subsequent operations are rejected at the middleware boundary.