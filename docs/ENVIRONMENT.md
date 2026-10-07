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