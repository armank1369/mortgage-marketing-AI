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