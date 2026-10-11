

> Step G update: [Current implementation and testing](STEP_G_IMPLEMENTATION_AND_TESTING.md) and [authorization matrix](AUTHORIZATION_MATRIX.md) supersede Step F security/test status below. Default tests now block database access; live tests require explicit opt-in and an approved isolated URL. Live Step G validation remains pending.
# Lucie Environment Configuration

## Purpose

This document describes how Lucie should separate local development, staging, and production configuration.

It records the intended architecture and the configuration used for Step F testing.

**This document does not deploy or automatically configure any environment.**

For practical setup and testing instructions, see [Step F Data Layer and Testing](STEP_F_DATA_LAYER_AND_TESTING.md).

---

## Environment Pattern

| Environment | Application | Database | Configuration |
|---|---|---|---|
| Local development | Local React + Flask | Neon `development` branch | Local `.env` files |
| Preview / staging | Deployed test application | Dedicated preview/staging branch | Deployment environment variables |
| Production | Production Lucie application | Neon `production` branch | Production secrets and deployment configuration |

The local development configuration has been used for Step F testing.

Preview/staging and production are intended target environments; this table does not confirm that each deployment is fully configured or tested.

---

## Local Development

Local development runs React and Flask on the developer's device.

Typical local addresses:

- React: `http://localhost:3000`
- Flask: `http://localhost:5001`

The Vite frontend forwards `/api` requests to the configured Flask backend.

### Backend Configuration

Backend configuration is stored locally in:

`server/.env`

Required or commonly used values include:

```dotenv
DATABASE_URL=postgresql://ROLE:PASSWORD@DEVELOPMENT-POOLER/neondb?sslmode=require
NEON_AUTH_BASE_URL=https://DEVELOPMENT-AUTH/neondb/auth
NEON_AUTH_JWKS_URL=
ANTHROPIC_API_KEY=YOUR_DEVELOPMENT_KEY
ANTHROPIC_MODEL=YOUR_WORKING_MODEL
```

`DATABASE_URL` connects Flask to PostgreSQL.

`NEON_AUTH_BASE_URL` and the optional `NEON_AUTH_JWKS_URL` configure server-side JWT verification.

The database URL and authentication URL are separate values.

### Frontend Configuration

Frontend configuration is stored locally in:

`client/.env`

Example:

```dotenv
VITE_NEON_AUTH_URL=https://DEVELOPMENT-AUTH/neondb/auth
```

`VITE_NEON_AUTH_URL` is browser-visible and must reference the intended development Auth environment.

Do not place database passwords, database connection strings, or backend API keys in variables prefixed with `VITE_`.

### Loading Environment Variables

`server/app.py` loads `server/.env` relative to its own file location before importing the PostgreSQL database layer.

Normal local startup from `server/` is:

```powershell
python app.py
```

A special `runpy` startup workaround is not required.

After changing `.env`, restart the affected development servers so the updated settings take effect.

---

## Preview / Staging

A preview or staging environment should use:

- A separately deployed application.
- An isolated non-production Neon database branch.
- Matching Neon Auth configuration.
- Environment variables managed by the deployment provider.
- Synthetic or approved test data.

The purpose is to verify deployed behavior without affecting Joseph's production data.

Preview/staging should not automatically receive production credentials or unrestricted copies of sensitive production records.

Any cloning of production data should follow an approved privacy and data-handling process.

---

## Production

Production should use:

- The approved production application deployment.
- Neon `production` database branch.
- Matching production Neon Auth configuration.
- Deployment-managed secrets.
- Approved user and workspace provisioning.
- Backend authentication and authorization across all sensitive routes.
- Appropriate monitoring, backups, operational controls, and usage limits.

Production secrets must not be committed to GitHub or reused in local development.

The current Step F branch should not be considered production-ready solely because local repository and API tests passed.

Step G protects generation and retires global SQLite endpoints; real Auth/database and deployment acceptance remain required.

---

## Neon Database Branch Selection

In Neon, the database name may remain `neondb` across multiple branches.

This does not mean the branches share the same tables or records.

During development we encountered a connection string pointing to a different Neon branch. The backend connected to PostgreSQL but could not find `public.workspace`.

When selecting a connection string:

1. Open the correct Neon project.
2. Select the intended branch, usually `development` for local testing.
3. Select the intended database and role.
4. Copy the connection string from the Neon Connect panel.
5. Place it in `server/.env` as `DATABASE_URL`.
6. Verify the expected tables exist.

Do not change working Neon Auth URLs merely because the database connection string needed correction. Verify each environment independently.

---

## Neon Auth and Workspace Authorization

Neon Auth uses Better Auth to handle identities and sign-in sessions.

Flask validates Neon Auth bearer JWTs.

Step F additionally checks `public.workspace_member` to determine which workspace an authenticated user may access.

### Authentication Versus Authorization

Authentication:

> Is this a valid signed-in user?

Authorization:

> Is this user permitted to access this particular Lucie workspace?

These are separate checks.

### Critical Development Requirement

A development Neon Auth account may exist and sign in successfully without any record in `public.workspace_member`.

In that situation:

- `/api/auth/me` may succeed.
- `/api/brand-profile` may return 403.
- `/api/chat/sessions` may return 403.

That can be correct behavior: the account is authenticated but has not been assigned to a workspace.

The final F.10 implementation requires actual workspace membership.

It does not grant implicit admin access through development fallbacks or a client-supplied identity header.

### Development Membership Setup

An authorized developer or administrator must provision the approved test account against the correct development workspace.

For verification and the controlled development SQL procedure, see:

[Step F Guide — Section 7: Neon Auth Users Must Have Workspace Membership](STEP_F_DATA_LAYER_AND_TESTING.md#7-critical--neon-auth-users-must-have-workspace-membership)

Do not assign every newly registered account to a workspace automatically.

### Future Production Onboarding

Manual SQL membership assignment is a development/bootstrap workaround, not the desired permanent experience.

The future application should support controlled account provisioning, approval, or invitations.

For example:

1. A user signs up with Neon Auth.
2. The backend verifies their identity.
3. The application checks for approved workspace membership.
4. If membership exists, the user accesses their workspace.
5. If it does not exist, the user must be invited or approved.

Access to Joseph's production workspace must be explicitly authorized.

---

## Environment Separation Rules

- Local development uses the approved Neon development database branch.
- Preview/staging uses an isolated non-production environment.
- Production uses an approved production database and Auth configuration.
- Do not interchange branch-specific credentials.
- Do not commit real `.env` files, JWTs, Anthropic keys, or database passwords.
- Keep `DATABASE_URL` exclusively on the backend.
- Use only approved development/test data in automated write tests.
- Never run destructive development scripts against production.
- Use secure deployment-managed environment variables for deployed applications.
- Treat successful sign-in and successful workspace authorization as separate acceptance checks.

---

## Current Limitations

The Step F implementation has validated the new database-backed routes in local development.

However:

- The normal ChatPage still uses browser localStorage.
- Existing historical chats have not been migrated.
- Step G protects generation endpoints and retires global SQLite history/preferences without deleting their data.
- Automatic workspace onboarding is not implemented.
- Step G implements explicit capabilities; live integration acceptance remains pending.
- Cross-device synchronization is not implemented.

These are future integration and security-hardening tasks, not completed features.

---

## Related Documentation

- [Step F Data Layer and Testing Guide](STEP_F_DATA_LAYER_AND_TESTING.md)
- [Authorization Matrix](AUTHORIZATION_MATRIX.md)
- [Step E Neon Auth Recap](Lucie_Step_E_Neon_Auth_and_Session_Identity_Recap.md)
