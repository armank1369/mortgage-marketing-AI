# Lucie UI and workflow guide

Current behavior after the October 19 UI hotfixes and workspace-chat sharing patch.
For installation, start with the [README](../README.md#clone-and-install). For API
contracts, use the [feature reference](STEP_J_FEATURE_AND_OPERATIONS_GUIDE.md).

## Choose an audience and start a chat

1. Sign in and select a workspace if you have access to more than one.
2. On first use or **New Chat**, choose a persona card. Cards show initials, name,
   description and active selection. Authorized editors also see edit controls and
   **New persona**, with a short name/description form.
3. Review its numbered guidelines: **01 Brand Voice**, **02 Tone of Voice** and
   **03 Target Audience**. Confirm with **Set Brand Guidelines** before composing.
   Readers can review/use a persona; configuration changes require editor permission.
4. Send your first request to create the saved conversation. Before this, the chat
   is an unsaved local draft and its persona selection may change.

Once saved, a chat has one locked persona UUID. Multiple chats may use the same
persona. The header shows a persistent persona badge and **Brand Summary**, rather
than a persona dropdown. Use **Start another chat** or **New Chat** for a different
audience. Editing the persona definition affects future generations in its chats;
it does not change the saved messages or their historical persona labels.

**Brand Summary** shows current configuration: audience needs/guidance, shared brand
voice, values and tone. Historical output labels describe the configuration snapshot
saved with those messages. Mixed/ambiguous old histories and unavailable personas
remain readable, exportable and archivable; new provider work is blocked and the UI
offers a new-chat action. Nothing silently rewrites or assigns that history.

## Edit brand and persona guidelines

Brand voice, core values and tone are **shared workspace settings**, even when you
reach them while reviewing one persona. Audience information and prompt guidance
belong to the selected persona. Configuration-write roles are owner/admin, plus
developer in development/test environments. Members and viewers can review them.

The four tone rows restore the original **1–5 number buttons**:

| Left / 1 | Right / 5 |
|---|---|
| Professional | Casual |
| Authoritative | Conversational |
| Serious | Humorous |
| Matter of Fact | Enthusiastic |

Three is balanced. Clear selection leaves a scale unset. Keyboard arrows navigate
choices; numbers and their meanings reach generation context. Audience-specific
communication differences belong in persona guidance.

Target Audience restores an optional **two-handle age-range slider (1–100)** and
household-income/education choices. The 25–45 preview is not saved automatically;
use its explicit action or adjust the control. These are stored reference/context
fields, not evidence of eligibility or qualification. Pain points and the expanded
**More audience and writing guidance** section provide needs, common questions,
explanation preferences and free-text prompt guidance. Named list fields currently
use one phrase per line, with visible field labels; ordinary brand word lists use
tags as described below. Existing custom JSON keys are retained. An advanced editor
is available for incompatible audience shapes; changing them is an expert action.

**Set Brand Guidelines** saves changed audience fields, then changed shared brand
settings through separate authorized requests. If only the first save succeeds, the
form reports that partial outcome and stays open for retry. It does not falsely
claim both were saved.

## Tags and writing examples

In the brand profile, **Keywords**, **Catchphrases**, **Banned words** and **Values**
use small entry fields and removable tags:

1. Type one complete word or phrase, then press **Enter** or **Add**.
2. Repeat to add more; remove a tag with its remove button.
3. Choose **Save brand profile**, or **Set Brand Guidelines** when editing core values
   in the guidelines form, to persist the changes.

A tag is a draft item until the form is saved. Commas remain part of a phrase.
Duplicate additions are ignored. Limits are 40 items, 200 Unicode characters each;
errors explain the limits without silently truncating stored content. Saving also
includes any final phrase still in the entry field, so forgetting Enter loses no text.

**Writing examples** are samples of captions, posts or articles in your preferred
voice. Add a sample with Enter or **Add example**; use Shift+Enter for a new paragraph.
Each example has its own editable card. They are serialized to the existing
`blog_examples` field automatically, preserving existing text/object formats and
metadata. Unfamiliar legacy shapes are shown read-only rather than requiring JSON
editing. Saving includes a pending last example; failed saves retain your draft.

**Supplemental disclosure** and **Supplemental equal-housing text** provide additional
brand wording used alongside the server's fixed identity/disclosure rules. They do
not disable or replace required compliance policy. Review all publication content.
See the [Step I contract](STEP_I_CONTEXT_CONTRACT.md) for the precise fields.

## Optional starters and voice draft

**Persona starters** are two built-in reviewable proposals added during UI recovery:
**The Business Owner** and **First-Time Homebuyer**. They are not imported client
personas or proof of a database migration. Selecting Review opens a draft; an
approved editor must explicitly save it. The server owns the `is_starter` field;
using a proposal does not let the browser set that flag or overwrite another persona.

**Review legacy-inspired voice draft (fills empty voice only)** fills the editable
voice field with a proposed professional, authoritative, serious, matter-of-fact
voice only when the current draft voice is empty. It does not open a dialog, overwrite
existing voice, or save automatically. With existing voice, clicking it makes no
change. It is disabled with other profile controls for readers, while saving, or
when no brand profile exists. Review wording and choose **Save brand profile** to
persist it. This is a proposal, not an automatic copy of historical client settings.

## Sidebar, output and shared chats

The left side restores stacked **Chat**, **Calendar** and **New Chat** navigation,
active-view styling and a persona chip. Saved entries show title, persona, a preview
and output-type badges. Archive and Local history remain separate views; Settings
is at the bottom. Three suggestions appear per category; **More** rotates them.
They otherwise stay stable until a submission is durably accepted.

Workspace members can open the same saved chats. Writers can continue, rename,
revise, archive/restore and recover uncertain operations. Viewers can read and export.
Archive/restore affects everyone. The original creator and each new request's author
are preserved. Updates refresh on focus/reconnect and about every 15–16 seconds while
visible/online; this is not simultaneous text co-editing. Concurrent generation in
one chat is serialized; uncertainty requires explicit acknowledgement before retry.

Use **Previous versions** to inspect earlier output. **Make it shorter** is a
model-free revision of text; regeneration and media creation can invoke a paid model.
Rich cards, slides, hashtags, review flags and image/video specifications remain saved.
Loading animation reflects real operation state and respects reduced-motion settings.

**Export chat** downloads versioned JSON only after every history page succeeds. It
includes structured outputs, revisions, persona snapshots and review flags, excluding
internal operation secrets. Local-history export uses its existing scoped records.
There is no import endpoint or live transactional backup guarantee during concurrent
appends.

Only database chats are shared. Calendar, pending browser requests and scoped legacy
Local history retain their browser/account/workspace boundaries. No automatic upload,
calendar synchronization or ownership reassignment occurs. Bounded recent-idea
avoidance can use completed outputs from other creators in the selected workspace;
it does not provide full cross-chat memory or access to another workspace.

## Checks after pulling the hotfixes

- Start a chat through persona review, confirm the locked header badge, and open Brand Summary.
- Try number controls and the slider; save, reopen and confirm the values.
- Add/remove tags and writing samples, including a pending item saved without Enter.
- Open a saved chat from a second account in the same workspace; continue, rename,
  archive/restore, and verify a viewer cannot perform those writes.
- Review Previous versions, export a full chat, and check the sidebar/mobile layout.

Use the [synthetic browser harness](STEP_J_TESTING_GUIDE.md) for free automated checks.
Normal-app generation can incur provider charges. Live checks remain distinct from
the synthetic test results in the [sharing report](WORKSPACE_CHAT_SHARING.md).
