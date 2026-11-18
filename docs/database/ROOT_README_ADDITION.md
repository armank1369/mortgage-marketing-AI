# Optional addition to repository-root `README.md`

The repository README already includes the database links. The snippets below use paths relative to the repository root and can be reused when updating that README.

---

```markdown
- **Database design and development snapshot:** start with the [Lucie database overview](docs/database/README.md), then consult [schema](docs/database/SCHEMA.md), [architecture](docs/database/ARCHITECTURE.md), and [code-to-database workflows](docs/database/WORKFLOWS.md). Repository-wide coding guidance is in [AGENTS.md](AGENTS.md).
```

**Optional additional clarification** below the root README's introductory branch paragraph, if useful:

```markdown
> **Database environment:** these database references document the Neon **`development`** branch inspected October 23, 2026, with a subsequent targeted check confirming the Step K2 shared calendar migration on development. The calendar implementation is on `luciev2_newteam`. They do **not** certify production. Production requires an independently verified Neon schema, approved migrations if needed, matching production DB/Auth configuration, securely managed environment variables, manually provisioned workspace access, and separate live security testing. See [database architecture and environment transition](docs/database/ARCHITECTURE.md#7-development-staging-and-production) and [environment setup](docs/ENVIRONMENT.md).
```

No replacement of `docs/ENVIRONMENT.md` or `docs/AUTHORIZATION_MATRIX.md` is recommended for this batch; those maintained docs already reflect development/production separation and workspace-shared Step J permissions. Keep them current as the application changes.
