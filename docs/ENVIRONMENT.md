# Lucie Environment Configuration

## Purpose

This document records the intended environment configuration pattern for Lucie.
It is documentation only and does not configure deployments.

## Environment Pattern

Lucie is intended to use separate configuration and database environments:

| Environment | Application | Database | Configuration |
|---|---|---|---|
| Local development | Local React + Flask | Neon `development` branch | Local `server/.env` |
| Preview / staging | Deployed application | Dedicated Neon preview/staging branch | Deployment environment variables |
| Production | Production application | Neon `production` branch | Production deployment environment variables |

## Local Development

Local development uses a `.env` file in the `server/` directory.

Example:

```text
server/.env
```

## Preview / Staging

Preview or staging deployments are intended to use a separate Neon database branch and separate environment variables from production.

The purpose of this environment is to provide an isolated environment for testing deployed application changes before they are released to production.

Preview/staging configuration should use deployment environment variables rather than a local `.env` file.

## Production

Production should use a separate Neon production database branch and production deployment secrets.

Production credentials and secrets must not be stored in the repository or in local development `.env` files.

Production configuration should be provided through the production deployment environment.

## Environment Separation Rules

- Local development must use the Neon `development` branch.
- Preview/staging should use an isolated non-production Neon branch.
- Production should use the Neon `production` branch.
- Development, preview/staging, and production credentials should remain separate.
- Never commit real `.env` files, database credentials, API keys, or other secrets to Git.
- `server/.env.example` contains variable names and placeholders only.
- `DATABASE_URL` is a server-side variable and must not be exposed to the React frontend.
- Deployment environment variables should be configured in the appropriate hosting environment rather than committed to the repository.

## Neon Auth and workspace authorization (Steps E/F)

Neon Auth is implemented, not merely planned. `client/.env` contains
`VITE_NEON_AUTH_URL` for browser sessions; `server/.env` contains
`NEON_AUTH_BASE_URL` and optional `NEON_AUTH_JWKS_URL` for Flask JWT verification.
`DATABASE_URL` is the **separate** PostgreSQL connection string. Select the
Neon `development` branch explicitly before copying it; two databases named
`neondb` on different Neon branches do **not** share a schema.

The backend loads `server/.env` relative to `server/app.py`. Use `python app.py`
from `server/`, not a special `runpy` command. Never commit either `.env` file.

A valid JWT proves identity but does not automatically grant workspace access.
`public.workspace_member` must contain an explicit membership for the Neon Auth
user ID, linked to the target `public.workspace`. Development header bypasses
and automatic admin fallback are no longer supported by the Step F patch.

For setup, branch verification, safe testing, and troubleshooting see
[Step F Data Layer and Test Guide](STEP_F_DATA_LAYER_AND_TESTING.md).
