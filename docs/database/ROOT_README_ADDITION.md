# Optional addition to repository-root `README.md`

**This is an insert, not a full-file replacement.** The existing root README on `codex/step-j-chat-persistence` already documents cloning, installation, current features, Auth, environment setup and testing. Replacing it with a new database-focused README would lose useful material. Instead, insert the following under its existing **Start here** links:

---

```markdown
- **Database design and development snapshot:** start with the [Lucie database overview](docs/database/README.md), then consult [schema](docs/database/SCHEMA.md), [architecture](docs/database/ARCHITECTURE.md), and [code-to-database workflows](docs/database/WORKFLOWS.md). Repository-wide coding guidance is in [AGENTS.md](AGENTS.md).
```

**Optional additional clarification** below the root README's introductory branch paragraph, if useful:

```markdown
> **Database environment:** these database references document the Neon **`development`** branch inspected October 23, 2026, and code behavior reviewed on `codex/step-j-chat-persistence`. They do **not** certify production. Production requires an independently verified Neon schema, approved migrations if needed, matching production DB/Auth configuration, securely managed environment variables, manually provisioned workspace access, and separate live security testing. See [database architecture and environment transition](docs/database/ARCHITECTURE.md#7-development-staging-and-production) and [environment setup](docs/ENVIRONMENT.md).
```

No replacement of `docs/ENVIRONMENT.md` or `docs/AUTHORIZATION_MATRIX.md` is recommended for this batch; those maintained docs already reflect development/production separation and workspace-shared Step J permissions. Keep them current as the application changes.
