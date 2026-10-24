# AGENTS.md

Lucie is a React/Vite + Flask mortgage-marketing assistant with Neon PostgreSQL, Neon Auth, workspace authorization and durable shared workspace chats.

Before changing authentication, database access, personas, chat persistence or AI generation:

1. Read [`docs/database/README.md`](docs/database/README.md) for basic boundaries and the **development-only** baseline.
2. Read the relevant [schema](docs/database/SCHEMA.md), [architecture](docs/database/ARCHITECTURE.md) or [workflow](docs/database/WORKFLOWS.md) sections.
3. Treat the current code and target Neon branch as authoritative. The docs use an October 23, 2026 **development** schema inspection; do not assume matching production schema, account mappings, Auth endpoint or privileges.
4. Enforce server-side JWT, current workspace membership, capabilities and workspace-scoped data access. Current saved-chat policy is workspace-shared, not creator-private; historical attribution and versioned messages must remain intact.
5. Never read out or commit real `.env` secrets, actual user/chat records or production connection strings. Never run SQL writes, seeds, migrations, account provisioning or production operations without explicit approval. Do not auto-retry unknown paid AI calls.
6. Distinguish implemented features from reserved schema. Memory, RAG, calendar sync, auto workspace provisioning and historical chat imports are not automatically available merely because their tables exist.
7. Run and report appropriate tests; separate synthetic/local test success from live integration or production certification. Update the docs when changing the current behavior.

Existing maintained references: `docs/ENVIRONMENT.md`, `docs/AUTHORIZATION_MATRIX.md`, `docs/STEP_I_CONTEXT_CONTRACT.md`, `docs/STEP_J_FEATURE_AND_OPERATIONS_GUIDE.md`, and `docs/WORKSPACE_CHAT_SHARING.md`.
