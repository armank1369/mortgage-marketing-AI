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

## Neon Auth

Neon Auth configuration is separate from the PostgreSQL `DATABASE_URL`.

The Neon Auth URL and JWKS information are intended for authentication and will be used in the later authentication implementation.