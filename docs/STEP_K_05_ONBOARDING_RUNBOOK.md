# Joseph Production Onboarding & Access Control Runbook (Step K5)

**Status:** Technical Preparation Complete — Execution Gated on Joseph Input & Approval  
**Guiding Principle:** Least privilege and zero ambient staff cross-workspace access.

---

## 1. Architectural Access Model & Security Gates

1. **Authentication Boundary:** Neon Auth handles user identity issuance via RS256-signed JWTs containing the user's `sub` claim (Auth user ID).
2. **Authorization Boundary:** A valid JWT alone does NOT provide workspace authorization. Access is governed strictly by the `public.workspace_members` table.
3. **No Automatic Staff Access:** Engineering and support staff accounts must NOT be automatically added to Joseph's production workspace. Joseph's tenant data is isolated.
4. **Historical Shared Chat Visibility:** In accordance with the Step J contract, all users assigned an active role (`admin`, `member`, `viewer`) inside Joseph's workspace share visibility of that workspace's saved and imported chats.

---

## 2. Gated Production Provisioning Sequence

> **APPROVAL GATE:** Do not run these steps until Joseph's signed `STEP_K_05_JOSEPH_INTAKE_TEMPLATE.md` is received and approved by the project owner.

### Stage 1: Joseph Account Creation
1. Joseph navigates to the production app sign-in URL (`/auth/sign-up`).
2. Joseph registers using his approved email address specified in his intake form.
3. Joseph verifies his email address.

### Stage 2: Identify Joseph's Auth Subject ID
In the production NeonDB SQL console (or admin CLI), locate his internal `auth.users` ID:
```sql
SELECT id, email, created_at 
FROM auth.users 
WHERE email = 'JOSEPH_VERIFIED_EMAIL';
```

Record the returned user UUID (e.g., user_2tX...).

### Stage 3: Provision Production Workspace and Membership
Execute a single atomic transaction in production NeonDB:

```sql
BEGIN;

-- 1. Create Joseph's dedicated production workspace
INSERT INTO public.workspace (id, name, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    'Joseph Real Estate & Mortgage', -- from intake form
    NOW(),
    NOW()
)
RETURNING id;
-- (Record the generated workspace UUID as :workspace_id)

-- 2. Bind Joseph as the workspace admin (least privilege owner)
INSERT INTO public.workspace_members (id, workspace_id, user_id, role, created_at)
VALUES (
    gen_random_uuid(),
    :workspace_id,
    :joseph_auth_user_id,
    'admin',
    NOW()
);

-- 3. Provision verified Brand Profile from signed intake form
INSERT INTO public.brand_profile (
    id,
    workspace_id,
    business_name,
    license_number,
    compliance_footer,
    brand_voice,
    approved_phrases,
    prohibited_phrases,
    created_at,
    updated_at
)
VALUES (
    gen_random_uuid(),
    :workspace_id,
    'VERIFIED_BUSINESS_NAME',
    'VERIFIED_NMLS_OR_DRE',
    'VERIFIED_COMPLIANCE_FOOTER',
    'VERIFIED_BRAND_VOICE',
    '["APPROVED_1", "APPROVED_2"]'::jsonb,
    '["PROHIBITED_1", "PROHIBITED_2"]'::jsonb,
    NOW(),
    NOW()
);

-- 4. Provision Initial Default Persona
INSERT INTO public.persona (
    id,
    workspace_id,
    name,
    audience_description,
    pacing_preference,
    tone_tags,
    is_default,
    created_at,
    updated_at
)
VALUES (
    gen_random_uuid(),
    :workspace_id,
    'VERIFIED_PERSONA_1_NAME',
    'VERIFIED_PERSONA_1_DESCRIPTION',
    'VERIFIED_PACING_PREFERENCE',
    '["educational", "accessible"]'::jsonb,
    TRUE,
    NOW(),
    NOW()
);

COMMIT;
```

### 3. Pre-Joseph Test Scenarios (Using Development Identities)

Before executing the above on production, execute these automated and manual verification scenarios against the development database using disposable test UUIDs:

**Scenario 1:** Identity & Profile Load/Save/Reload
Sign in with a test user assigned to development workspace 8bab9643-a7a2-4b5c-989c-d7358393ac6e.

Issue GET /api/brand-profile. Verify HTTP 200 with matching business name and NMLS credentials.

Issue PUT /api/brand-profile with updated voice guidelines. Verify HTTP 200 and database persistence.

Reload the Settings page (/settings). Verify that the updated profile loads cleanly without UI cache conflicts.

**Scenario 2:** Persona Lifecycle & Soft-Delete
Issue POST /api/personas to create a test persona ("Test Refinance Persona"). Verify HTTP 201.

Issue PUT /api/personas/<id> with "deleted_at": NOW(). Verify HTTP 200.

Issue GET /api/personas. Verify the soft-deleted persona is excluded from active listings.

Confirm no foreign-key cascades broke in chat_message.

**Scenario 3:** Cross-Workspace Access Denial (Multi-Tenant Isolation)
Generate a JWT for Test User B (belonging to Workspace B).

Attempt to read Joseph's workspace via GET /api/brand-profile with X-Workspace-Id: :joseph_workspace_id.

Expected Result: HTTP 403 Forbidden ("Access denied: Not a member of the requested workspace").

**Scenario 4:** Member Removal & Session Revocation
Add a temporary test collaborator to the workspace with role 'member'.

Remove the collaborator row from public.workspace_members.

Attempt to invoke POST /api/chat/sessions with the removed collaborator's session.

Expected Result: Immediate HTTP 403 Forbidden; subsequent operations are rejected at the middleware boundary.