# Step G testing for teammates — no Codex required

This guide assumes Windows PowerShell. If you use macOS/Linux, ask Jaime for adapted commands before starting. You need a browser and local development tools; Codex is not required. ChatGPT or Gemini can explain errors, but GitHub access alone does not let them run tests on your device.

## What changed

Step G checks who you are, which workspace you may access, and which actions your role permits. Backend conversations are private to their creator, including against owners/admins. AI requests now include authentication. Browser chats, preferences, and calendar entries are separated by account and workspace.

Old SQLite and unscoped browser data are preserved, but the new flow does not use them. Old browser history may appear empty and preferences may need setup again. Cross-chat duplicate-idea suppression is temporarily unavailable.

**Normal chat history still saves in your browser. Jaime's browser chats should not appear on your device.** Backend chat privacy is tested separately.

## 1. Jaime prepares the handoff

Before the teammate starts, provide:

- This guide and `STEP_G_USER_TESTING_GUIDE.md`, which contains advanced API tests.
- The exact implementation commit: `1cb3c1aefd4d326a38cff0142a0ba484262057f3`, message `Step G attempt 1`, or a newer explicitly reviewed test commit.
- Confirmation that this commit is available on GitHub. The local record points to `origin/luciev2_newteam`, but a fresh remote check failed with a certificate error. Remote availability remains unverified.
- For live testing: matching development configuration, approved synthetic accounts and workspace names, and approval for the intended AI usage. Send credentials privately, never through an AI chat or GitHub issue.
- Test accounts covering: one workspace, two workspaces, viewer role, no membership, and another member plus owner/admin in the same workspace for advanced privacy tests.

The testing guides are local files until deliberately shared or published. An assistant reading GitHub will not automatically see them. This guide does not publish any changes.

## 2. Check your tools

Open PowerShell from the Start menu. Enter each command separately:

```powershell
git --version
py --version
node --version
npm.cmd --version
```

Each should print a version. If a command is missing, ask Jaime for help installing that tool, then reopen PowerShell. You need Git, Python, and Node.js (which includes npm).

The project's installed Vite requires Node 20.19+ within version 20, or Node 22.12+. Jaime's current machine uses Node 24.11.0 and Python 3.14.6. Follow the team's Python setup choice and run the checks below on your machine.

Use `npm.cmd` in PowerShell to avoid the common npm script execution-policy error. No execution-policy changes or virtual-environment activation are needed in this guide.

## 3. Download the exact code

For a new copy, run one command at a time:

```powershell
Set-Location $env:USERPROFILE
New-Item -ItemType Directory -Path LucieTesting -Force
Set-Location LucieTesting
git clone https://github.com/armank1369/mortgage-marketing-AI.git
Set-Location mortgage-marketing-AI
git fetch origin
git switch --detach 1cb3c1aefd4d326a38cff0142a0ba484262057f3
git rev-parse HEAD
```

The final output must match the full commit above. “Detached HEAD” is expected: it pins your copy to the version being tested. You are not being asked to edit or publish code. Do not substitute `main`.

If the commit is unavailable, stop and ask Jaime to verify it was shared. If GitHub asks for sign-in, use your approved GitHub account. Report certificate errors; do not disable SSL verification. If the folder already exists, do not delete/reset it; ask for help or use a new folder.

Alternatively, Jaime can provide a GitHub source ZIP for the exact commit. Extract it and open PowerShell in the folder containing `client` and `server`; skip Git-only commands. Do not exchange a raw working-folder ZIP containing credentials, database files, or private data.

The folder containing `client` and `server` is called the **project root** below.

## 4. Install the project libraries

From the project root:

```powershell
py -m venv server/.venv
.\server\.venv\Scripts\python.exe -m pip install -r server/requirements.txt
npm.cmd --prefix client ci
```

The first command creates a Python environment for this project. The next commands install its libraries. Wait for each to finish; installation may take several minutes.

If installation fails, share the error text without secrets. Do not upgrade packages, delete lockfiles, or run `npm audit fix` as a troubleshooting shortcut: that changes what you are testing.

## 5. Run the safe local checks

These require no database credentials and make no paid AI requests. Run separately:

```powershell
.\server\.venv\Scripts\python.exe -m pytest server/tests -q
npm.cmd --prefix client test
npm.cmd --prefix client run lint
npm.cmd --prefix client run build
```

| Check | Expected at the specified commit |
|---|---|
| Backend tests | 89 passed, 20 skipped |
| Frontend tests | 11 passed |
| Lint | No errors; three existing fast-refresh warnings |
| Build | Success; an existing large JavaScript chunk warning |

Save the summary lines. The 20 skipped tests have **not passed**: they require live SQL testing. Building creates local files; it does not deploy a site. If you stop here, report the remaining steps as NOT RUN.

## 6. Obtain development settings for live tests

Continue only after Jaime provides the approved development configuration and test accounts. A newly registered account does not automatically have workspace access.

Only if the destination files do not already exist, copy the examples:

```powershell
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
notepad server/.env
notepad client/.env
```

Fill in the values Jaime provides:

- Backend: `DATABASE_URL`, `NEON_AUTH_BASE_URL`, optional `NEON_AUTH_JWKS_URL`, `ANTHROPIC_API_KEY`, and `ANTHROPIC_MODEL`.
- Frontend: `VITE_NEON_AUTH_URL` for the matching development Auth environment.

Do not overwrite existing configured files. Confirm they are named `.env`, not `.env.txt`. Use no production credentials. Never paste these files, passwords, database URLs, AI keys, or session tokens into ChatGPT/Gemini, screenshots, or GitHub.

## 7. Start the two servers

In the first PowerShell window, from the project root:

```powershell
.\server\.venv\Scripts\python.exe server/app.py
```

Leave it running. This is the backend, normally on port 5001. If it reports an error, stop and investigate.

Open a second PowerShell window:

```powershell
Set-Location "$env:USERPROFILE\LucieTesting\mortgage-marketing-AI"
npm.cmd --prefix client run dev
```

Use your actual folder if different. Open the localhost address it prints, normally `http://localhost:3000`. This is your local application, not Joseph's hosted site. Leave both terminals running. Stop them later with Ctrl+C in each window. If a port is occupied, ask for help rather than terminating unfamiliar processes.

## 8. Check sign-in and connectivity

1. Sign in with the assigned development account.
2. Open `/settings` in your local app and confirm the intended account.
3. Click **Test Backend Identity**.
4. Expect **JWT verified by Flask** and the correct user ID.
5. Return to the home page.

If identity succeeds but workspace data is unavailable, Auth may work while the database connection fails. Database connectivity previously timed out on Jaime's machine. Record the message and mark dependent checks BLOCKED; do not attempt schema changes.

A no-membership message for an account intentionally lacking access is expected, and differs from a connection failure.

## 9. Test workspace selection

Sign out through `/settings` between accounts.

| Account/scenario | Expected |
|---|---|
| One workspace, fresh selection | Enters automatically |
| Two workspaces, no stored choice | Must select before using Lucie |
| Refresh after selecting | Keeps the valid selection |
| No memberships | No-workspace message, Check again, and account settings |

If you lack a required account, mark that scenario BLOCKED or NOT RUN. Do not provision memberships yourself.

## 10. Test browser data separation

1. As the two-workspace member, select W1 and complete preferences if prompted.
2. Create a synthetic chat and calendar item labelled `TEST teammate W1`. Use no real client information.
3. Refresh: saved items should remain.
4. Switch to W2: W1 items must not appear. Create a different W2 item.
5. Return to W1: its items should return without W2 items.
6. Sign out, then sign in as another assigned account in the **same browser profile**. The first account's items and preferences must not appear.
7. Sign back into the first account: its items should remain.

A fresh browser cannot test preservation of Jaime's old local records. Mark legacy preservation “not applicable on this fresh browser”; Jaime tests that on the original device. Do not clear storage or copy real browser records between computers for this test.

## 11. Test AI features

Use the member account and approved provider usage; these calls can incur charges.

1. Ask for a short educational social post using synthetic content. Expect readable output.
2. Request a campaign with clear duration, platforms, and posting frequency. Expect an appropriate clarification or a usable campaign.
3. Generate a video brief from a campaign entry. Expect it to render.
4. Use the social-image action where available. Expect the existing image layout to render.
5. Switch to the viewer account and attempt generation. Expect a permission-denied message. A button may remain visible; backend denial is what matters.

Wording may vary. Report blank/broken output or unauthorized successful generation, rather than differences in exact wording. Duplicate ideas across separate chats are possible while global duplicate suppression is retired.

## 12. Optional: inspect a failed request

Press F12, open **Network**, filter by `/api/`, repeat the action, and click the request. Record its path, status number, and error code in the Response tab.

| Status | Typical meaning here |
|---|---|
| 200 / 201 | Success / record created |
| 400 | Invalid request |
| 401 | Authentication rejected; inspect error code to distinguish provider errors |
| 403 | Workspace or action denied |
| 404 | Record missing or hidden by privacy |
| 409 | Workspace selection required |
| 410 | Old history/preferences endpoint retired |
| 503 | Service unavailable; inspect error code for database/provider |

Generation request headers should include Authorization and X-Workspace-Id. Do not share raw header values or “Copy as cURL”: those can expose your sign-in token. Share only redacted status/error details. The normal UI should not request `/api/history` or `/api/preferences`.

## 13. Complete advanced testing with Jaime

The UI checks do not establish all backend privacy guarantees. Follow `STEP_G_USER_TESTING_GUIDE.md` together to test:

- Missing tokens, unauthorized workspace references, conflicting selectors, and retired endpoints directly.
- A persisted synthetic chat that another member and owner/admin cannot read, even with its ID.
- Spoofed creator/author fields and foreign-workspace persona references.
- Role changes taking effect on the next request.
- Revocation denying subsequent requests while retaining private records.
- The 20 live SQL tests against an approved disposable database.

These require verified schema and approval for relevant synthetic writes. Do not run `--run-integration`, change memberships, or execute migrations without coordination. The revocation design is approved, but migration execution still needs separate approval. Missing prerequisites mean BLOCKED, not PASS.

Automated frontend tests cover cancellation and workspace changes while a session loads. You do not need to reproduce that race by clicking quickly.

## 14. Report the results

Use PASS, FAIL, BLOCKED (missing prerequisites), or NOT RUN. Do not mark something passed merely because an assistant says the code looks correct.

```text
Device/OS and browser:
Exact commit:
Python / Node versions:
Backend test summary:
Frontend test summary:
Lint/build results:
Real sign-in and backend identity:
One / two / zero workspace scenarios:
Browser data isolation:
Chat / campaign / video / social image:
Viewer denied generation:
Advanced checks completed with Jaime:
Blocked/not-run checks and reasons:

For each problem:
Account/workspace aliases (no credentials):
Steps taken:
Expected result:
Actual result, API path/status/error if available:
```

## Getting help from ChatGPT or Gemini

Attach this guide and the advanced guide. Ask the assistant to read the exact commit, not simply the default GitHub branch. Suggested prompt:

> I am testing mortgage-marketing-AI at commit 1cb3c1aefd4d326a38cff0142a0ba484262057f3. I am a beginner using Windows PowerShell. Follow the attached teammate guide one step at a time, explain what I should see, and wait for my result. Do not change code, dependencies, database schema, memberships, or deployments. Do not request passwords, .env contents, database URLs, or session tokens. If you cannot access this exact commit, say so. I am at step [number], with this redacted error: [error].

If it cannot access GitHub, attach the relevant non-secret source file or error text. Repository access does not let an assistant run tests on your computer: you must run the commands and report what actually happened.
