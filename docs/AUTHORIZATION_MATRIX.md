
# Lucie Authorization Matrix

**Status:** Step E and Step F backend foundation implemented; full application authorization remains incomplete.

This document distinguishes implemented authorization behavior from planned functionality.

For environment setup, membership provisioning, and tests, see [Step F Data Layer and Testing](STEP_F_DATA_LAYER_AND_TESTING.md).

---

## 1. Authentication and Authorization

### Authentication

Neon Auth verifies who the user is.

Flask validates bearer JWTs through the Step E authentication utilities.

### Workspace Authorization

Step F uses `public.workspace_member` to determine which workspace an authenticated identity may access.

A valid Neon Auth account does not automatically receive workspace membership.

The identity used for workspace authorization comes from the verified JWT, not a client-supplied user ID.

### Role-Based Authorization

The membership table includes a `role` field.

The current backend reads this role, but detailed permissions for different roles are not yet enforced across the application.

Do not assume that a `viewer` account is currently read-only or that an `admin` account has a completed administrative interface.

---

## 2. Current Backend Authorization Matrix

| Operation | No JWT | Valid JWT without membership | Valid JWT with membership |
|---|---|---|---|
| `GET /api/auth/me` | 401 | Allowed | Allowed |
| `GET /api/brand-profile` | 401 | 403 | Allowed in authorized workspace |
| `GET /api/chat/sessions` | 401 | 403 | Allowed in authorized workspace |
| `POST /api/chat/sessions` | 401 | 403 | Allowed in authorized workspace |
| `GET /api/chat/sessions/<id>` | 401 | 403 | Allowed only for session in authorized workspace |
| Request an unauthorized foreign workspace | 401 without JWT | 403 | 403 unless explicitly a member of that workspace |

Additional notes:

- An authorized brand-profile request can return 404 if the profile does not exist.
- A chat-session request can return 404 if the session is not in the selected workspace.
- Malformed or invalid requests may produce additional 4xx errors.
- Service/configuration failures may produce 5xx responses.
- These guarantees apply to the listed new Step F workspace-protected routes, not automatically to legacy Flask routes.

---

## 3. Role Definitions

The current database schema accepts these role values:

| Role | Intended purpose | Detailed authorization implemented? |
|---|---|---|
| `owner` | Workspace ownership | No |
| `admin` | Administrative access | No |
| `member` | Standard workspace participation | No |
| `developer` | Development-related membership | No |
| `viewer` | Read-oriented membership | No |

The current new chat endpoints generally check for workspace membership rather than enforcing separate read/write permissions by role.

For example, do not describe the present `viewer` role as enforcing read-only access.

Fine-grained authorization must be designed and tested separately.

---

## 4. Features Implemented Versus Planned

| Capability | Current status |
|---|---|
| Neon Auth sign-in | Implemented |
| JWT verification in Flask | Implemented |
| Authorized workspace resolution | Implemented for Step F routes |
| Rejection of missing JWTs on Step F routes | Implemented |
| Rejection of unauthorized workspace selection | Implemented |
| Workspace-scoped brand profile retrieval | Implemented |
| Workspace-scoped chat session creation and retrieval | Implemented |
| Persona repository operations | Implemented at backend repository level |
| Frontend chat persistence in Neon | Not implemented |
| Per-user private chat access | Not implemented |
| Fine-grained workspace role permissions | Not implemented |
| Workspace invitations and approval | Not implemented |
| Automatic approved workspace provisioning | Not implemented |
| Admin interface for managing users | Not implemented |
| Complete legacy API authorization | Not implemented |
| Joseph's historical chat migration | Not implemented |
| Cross-device chat synchronization | Not implemented |

---

## 5. Known Security Boundary — Legacy Endpoints

The normal React ChatPage still uses legacy application routes.

At the reviewed Step F commit, selected older routes, including:

- `/api/chat`
- `/api/history`
- `/api/preferences`

do not consistently use the new Flask authentication and workspace authorization decorators.

Other legacy routes also require review.

Do not treat a React sign-in screen as sufficient protection for backend endpoints.

Before public production deployment:

1. Inventory every Flask API endpoint.
2. Identify which endpoints access sensitive data or consume paid services.
3. Apply verified authentication where required.
4. Apply workspace and user-level authorization where required.
5. Add negative security tests.
6. Review CORS, rate limits, debugging configuration, and deployment settings.

Step F validated selected new endpoints. It was not a complete security audit of Lucie's legacy backend.

---

## 6. Workspace Membership Provisioning

Neon Auth registration and workspace membership are separate operations.

### Current Development Process

An authorized developer can manually assign an approved development account to `lucie-development` using the database schema and procedure documented in the Step F guide.

This is intended for controlled testing and bootstrap configuration.

### Recommended Future Process

Production should use an approved user invitation, account onboarding, or administrator-controlled provisioning mechanism.

A newly registered user should not receive automatic access to Joseph's workspace merely because their Neon Auth account exists.

Users with no membership should receive a clear access-pending or invitation experience.

---

## 7. Chat Privacy Decision Required

The new chat repository primarily scopes sessions by `workspace_id`.

It does not yet enforce private conversation visibility per individual user.

If several users belong to the same workspace, current API behavior may permit those members to retrieve the same workspace's chat sessions.

Before enabling additional users or migrating Joseph's private conversations, decide whether chats should be:

- Shared across all workspace members.
- Private to the chat creator.
- Shared only through explicit access rules.

The final design must be implemented and tested at the backend, not only hidden in the UI.

---

## 8. Required Security Acceptance Tests

For the new Step F workspace routes:

- [ ] Missing JWT receives 401.
- [ ] Invalid JWT receives 401.
- [ ] Valid JWT resolves the correct authenticated identity.
- [ ] Authenticated account without membership receives 403.
- [ ] Authorized member can read their workspace's brand profile.
- [ ] Authorized member can list and create workspace chat sessions.
- [ ] Foreign workspace selection is rejected.
- [ ] Client-supplied development identity headers cannot bypass JWT verification.
- [ ] Requests for another workspace's sessions do not disclose records.
- [ ] Real Neon Auth integration is tested separately from mocked unit tests.

For overall production readiness:

- [ ] Legacy endpoint authorization is reviewed and corrected.
- [ ] Role permissions are designed and implemented.
- [ ] User versus workspace chat privacy is defined and enforced.
- [ ] Secure onboarding and membership provisioning are implemented.
- [ ] End-to-end and deployment-environment security tests are completed.

---

## Related Documentation

- [Step F Data Layer and Testing Guide](STEP_F_DATA_LAYER_AND_TESTING.md)
- [Environment Configuration](ENVIRONMENT.md)
- [Step E Neon Auth Recap](Lucie_Step_E_Neon_Auth_and_Session_Identity_Recap.md)
