# Focused / Single-Domain Agentic Projects, MCP Servers & Skills for OpenClaw

**Research slice:** Best open-source single-domain projects that plug into a self-hosted, always-on personal AI assistant (OpenClaw, wrapping Claude Code) as MCP servers, skills, or workflow building blocks. NOT full harness frameworks.

**Scope domains:** Slack, Calendar/scheduling, Email/inbox triage, Notes/PKM, Daily briefings, Tasks/reminders/nudges, Browser/web automation, Personal RAG.

**Method & caveats:** Findings below are drawn from primary GitHub repos and project docs via web search + targeted WebFetch reads of the repo pages. Star counts and "last active" are **approximate and drift fast** — verify the exact numbers on GitHub before committing. Where a security or scope claim is load-bearing, I flag the uncertainty inline. Today's date: 2026-05-28.

**Guiding principles from the deployment** (used to score every option): own-the-stack, least privilege, observable/auditable, incremental trust (read-only → write), provider-flexible, reproducible-as-code. The assistant has **real account access** (Slack, Google Calendar, Gmail, files), so the dominant risk theme throughout is **over-broad OAuth scopes + prompt-injection-driven misuse of write tools**.

---

## 0. Cross-cutting security model (read this first)

Every MCP server below runs as a **local subprocess (stdio) or a localhost HTTP service** that holds long-lived credentials (OAuth refresh tokens, API tokens, browser cookies). For OpenClaw that means:

- **Token storage is the crown jewel.** Most of these tools dump tokens to a dotfile (`~/.gmail-mcp/`, `saved-tokens` paths, `.env`). Treat the home-lab box's filesystem and the OpenClaw process user as the trust boundary. Use a dedicated low-privilege service user, encrypt at rest where the tool supports it, and never bind HTTP transports to `0.0.0.0`.
- **Scope down at the OAuth/Google-Cloud layer, not just at the tool layer.** The Google servers (Gmail, Calendar) default to read+write scopes, but **both expose a real read-only lever**: Gmail-MCP-Server lets you limit OAuth scopes at auth time (authorize only `gmail.readonly`+`gmail.labels`), and nspady's Calendar server has `ENABLED_TOOLS`/`--enable-tools` to expose read tools only. Use these for phase 1 and widen when you graduate a domain to write.
- **Enforce least privilege a second time at the tool gate.** OpenClaw's scoped/auditable permission model should allow-list which MCP *tools* are callable per workflow (e.g. allow `list-events`, deny `delete-event`) and per channel (voice/Slack triggers get tighter gates than CLI).
- **Prompt injection is the systemic threat.** Email bodies, web pages, and Slack messages are untrusted input that the agent reads and then acts on. Browser automation and email-send are the highest-blast-radius tools — gate them behind human confirmation and run them with the narrowest scope/sandbox.
- **Audit everything.** Log every write tool call (recipient, channel, event id) to OpenClaw's observability layer so a runaway loop is catchable.

---

## 1. Slack agents / Slack MCP servers

### 1a. korotovsky/slack-mcp-server — **primary recommendation**
- **What:** The most feature-complete community Slack MCP server. Reads channels/threads/DMs/group-DMs, smart history fetch (by date range `1d/7d/1m` or count), message search, unread + @mention filtering, user/usergroup management. Write tools (post message, reactions, mark-read) exist but are **disabled by default**.
- **License / stack:** MIT. Written in Go (~98%). Single static binary — easy to containerize. ~1.6k stars, 31 releases, production-ready.
- **Auth modes:** Three. (1) **Stealth mode** using browser tokens (`xoxc-`/`xoxd-`) — *no workspace admin approval, no bot, no scopes*. (2) User OAuth (`xoxp-`). (3) Bot token (`xoxb-`). Transports: stdio, SSE, HTTP, with proxy support.
- **MCP-readiness:** Native MCP server. Drop straight into OpenClaw as a stdio MCP server.
- **Maturity:** ~1.6k stars, 320 forks, 31 releases, active; the README claims 30k monthly repo visits / 9k users. Treat exact numbers as approximate. Source: <https://github.com/korotovsky/slack-mcp-server>
- **Security notes:** Stealth mode is powerful *and* a governance smell — it impersonates a user session and **bypasses admin controls**, which may violate workspace policy and breaks the "scoped/auditable" principle. For a self-owned workspace it's fine; if hjewkes's Slack is a shared/employer workspace, prefer a **bot token with explicit narrow scopes** instead. Write tools are off by default — keep them off until you graduate Slack to write. Posting can be whitelisted per-channel via `conversations_add_message` config (all / comma-list of channel IDs / `!`-prefixed deny-list) — **use this to constrain where the agent can post.**
- **Pattern to steal:** *Write tools disabled by default + per-channel posting allow/deny-list*. This is exactly the incremental-trust model OpenClaw wants. Mirror it for every write-capable adapter.

### 1b. Duolingo/slack-mcp — read-only, OAuth 2.1
- **What:** Deliberately **read-only** Slack MCP with multi-user OAuth 2.1 and HTTP transport. Adds only history/read scopes (`channels:history`, `groups:history`, `im:history`, `mpim:history`, `*:read`, `users:read.email`, `search:read`).
- **License/stack:** Open source on GitHub (verify exact license). Source: <https://github.com/duolingo/slack-mcp>
- **MCP-readiness:** Native MCP, HTTP transport — good if you want a shared multi-user service rather than per-user stdio.
- **Why it matters here:** The cleanest fit for **phase-1 incremental trust** — it is *architecturally incapable of posting*. Run this first; swap/augment with korotovsky (write enabled) only when you trust the loop.

### 1c. Official Slack MCP (now maintained by Zencoder) — middle ground
- **What:** Originally Anthropic's reference server, now community-maintained by Zencoder. ~8 operations: list channels, post message, reply to thread, add reaction, channel history, thread replies, list users, get profile. Uses Slack's Real-time Search API; no external data storage.
- **License/stack:** MIT. Source: <https://github.com/zencoderai/slack-mcp-server>
- **Why it matters:** "Official-ish" provenance and a small, predictable bot-scoped surface — best if you want a **bot token with a documented, minimal scope set** (the auditable path).

**Slack pick:** Start with **Duolingo (read-only)**; graduate to **korotovsky** with write tools + per-channel allow-list once trusted. Use Zencoder/official if you want a conventional bot-scope footprint.

---

## 2. Calendar & scheduling

### 2a. nspady/google-calendar-mcp — **primary recommendation**
- **What:** The de-facto Google Calendar MCP. 12 tools: `list-calendars`, `list-events`, `get-event`, `search-events`, `create-event`, `update-event`, `delete-event`, `respond-to-event`, `get-freebusy`, `get-current-time`, `list-colors`, `manage-accounts`. Multi-account + multi-calendar in one request, cross-account conflict detection, free/busy availability, natural-language smart scheduling, and "intelligent import" of events from images/PDFs/links.
- **License / stack:** MIT (confirmed via WebFetch of repo). TypeScript (~95%) / Node.js. Runs via `npx`, local install, or Docker. Latest release v2.6.1 (Mar 2026).
- **Auth / scopes:** Google OAuth 2.0. You create your **own** Google Cloud OAuth client (Desktop app type — required), add yourself as a test user, set `GOOGLE_OAUTH_CREDENTIALS`, and tokens are stored in the system config dir. Scopes requested are `.../auth/calendar.events` or the broader `.../auth/calendar` (read+write). **Confirmed: the server supports tool filtering for read-only operation** via the `--enable-tools` flag / `ENABLED_TOOLS` env var — you can expose only `list-*`/`search-*`/`get-*` and never the write tools. This is the clean incremental-trust lever.
- **MCP-readiness:** Native. Drop-in stdio MCP for OpenClaw.
- **Maturity:** ~1.1k stars, 317 forks, 23 releases, actively maintained. Source: <https://github.com/nspady/google-calendar-mcp>
- **Security notes:** Self-minted OAuth client = you own the consent screen and can keep the app in "testing" with only yourself as a user (good least-privilege posture). **Gotcha:** in test mode, OAuth tokens **expire after 7 days** and require re-auth — for an always-on assistant you'll want to publish the app to "production" (still private, just removes the 7-day cap) or automate re-auth. Token file on disk is the sensitive asset. **Recommend:** phase 1 = `ENABLED_TOOLS` limited to read tools; phase 2 = enable write tools.
- **Pattern to steal:** *Bring-your-own-OAuth-client + tool-filter for read-only phase + multi-account aggregation.* The free/busy + cross-account conflict tools are exactly what a "find me a slot" scheduling workflow needs.

### 2b. j3k0/mcp-google-workspace — Gmail + Calendar combined
- **What:** One MCP server covering **both** Gmail and Calendar. Source: <https://github.com/j3k0/mcp-google-workspace>
- **Why it matters:** Fewer moving parts / one OAuth consent for two domains. Trade-off: one token blast radius spans email *and* calendar, which **hurts least-privilege isolation**. Prefer separate servers (nspady + a dedicated Gmail server) unless operational simplicity wins.

**Calendar pick:** **nspady/google-calendar-mcp**, using `ENABLED_TOOLS` to expose read-only tools first, and publishing the OAuth app to avoid 7-day token expiry on an always-on box.

> Note: GongRzhe also publishes a Calendar-Autoauth-MCP-Server (parallel to its Gmail server), but nspady's is more mature and actively maintained — prefer nspady.

---

## 3. Email / inbox triage

### 3a. GongRzhe/Gmail-MCP-Server (+ maintained forks) — **primary MCP, with a maintenance caveat**
- **What:** The most widely used community Gmail MCP. ~18 tools: `send_email`, `draft_email`, `read_email`, `search_emails` (full Gmail query syntax), `modify_email` (labels), `delete_email`, `list_email_labels`, label CRUD, Gmail **filter** CRUD, plus **batch ops** (`batch_modify_emails`, `batch_delete_emails`, up to ~50/call with chunking) and attachment download/send.
- **License / stack:** **Conflicting signals — the GitHub README footer says MIT, but the npm package and several listings say ISC.** Both are permissive; verify the actual `LICENSE` file before relying on it. Node.js / TypeScript+JS. Auto-OAuth: opens the browser, saves credentials to `~/.gmail-mcp/`. Transports: stdio, HTTP, SSE.
- **Auth / scopes:** **Confirmed: you CAN limit OAuth scopes at auth time, which directly controls which tools are available** — e.g. authorize only `gmail.readonly`+`gmail.labels` and the send/delete tools are effectively inert. (Note their docs flag that `gmail.modify` is a superset of read, so you don't need both.) This is better than I initially assumed — scope-limiting is a first-class, documented lever here.
- **MCP-readiness:** Native stdio/HTTP MCP, drop-in.
- **Maturity / MAINTENANCE FLAG:** ~0.8–1.1k stars (sources vary; PulseMCP ~822, GitHub shows ~1.1k), ~117k estimated downloads. **The original repo was ARCHIVED ~March 2026 and has been effectively unmaintained since ~Aug 2025.** There is an **actively maintained fork by ArtyMcLabin** and a **"security-hardened" fork (zenrith-fluxman)**. **Recommendation: prefer a maintained fork over the archived original.** Source: <https://github.com/GongRzhe/Gmail-MCP-Server>, fork: <https://github.com/ArtyMcLabin/Gmail-MCP-Server>
- **Security notes (critical):** Use **read-only Gmail OAuth scopes for phase 1** (`gmail.readonly` + `gmail.labels`) so triage/labeling works but the agent literally cannot send or delete. Gate `send_email`/`delete_email`/`batch_delete_emails` behind human confirmation forever, or behind a draft-only policy (agent only `draft_email`, human sends). Email is the top prompt-injection target — never let an email body trigger an unconfirmed send.
- **Alternative if you want a maintained-from-day-one server:** `taylorwilsdon/google_workspace_mcp` (one MCP across Gmail+Calendar+Drive+Docs+Tasks, actively maintained) — broader scope blast radius but one well-kept codebase. Source: <https://github.com/taylorwilsdon/google_workspace_mcp>
- **Pattern to steal:** *Scope-limit at OAuth time + draft-not-send by default.* Have the triage workflow produce labels + drafts; a human (or a high-trust later phase) does the send.

### 3b. elie222/inbox-zero — Inbox-Zero-style LLM triage app (not an MCP, but steal the design)
- **What:** Open-source AI email assistant: natural-language rules engine, automatic categorization/triage, AI auto-reply/drafting, cold-email blocker, bulk unsubscribe, analytics. Self-hostable.
- **License / stack:** **License is ambiguous — the repo has a LICENSE file plus a Contributor License Agreement (CLA) that assigns broad rights to Inbox Zero; it is "open source" and self-hostable but NOT a clean standard OSS license. Verify the LICENSE file before any redistribution.** ~11k stars, 1.4k forks, very active. Next.js / Tailwind / shadcn/ui / Prisma / Turborepo, TypeScript ~99%. Self-host via CLI (`@inbox-zero/cli`) or Docker. Connects to Gmail via OAuth; also integrates Slack/Telegram for on-the-go inbox control. Source: <https://github.com/elie222/inbox-zero>
- **MCP-readiness:** It's a full web app, **not** an MCP server. Two integration options for OpenClaw: (1) run it standalone and let the agent observe/act through its rules, or (2) **lift the rule/triage logic into an OpenClaw skill** that calls the Gmail MCP. Option 2 is the better fit — you want the agent, not a parallel app, owning the inbox.
- **Security notes:** AGPL means any networked modification you distribute must be open-sourced — for a private home-lab deployment that's a non-issue. It needs the same broad Gmail OAuth as any triage tool.
- **Pattern to steal:** *The natural-language rules engine* ("if it's a newsletter, label + archive; if it's from my landlord, flag + draft reply"). Reimplement this as an OpenClaw skill prompt + a small rules file, executed against the Gmail MCP on a schedule.

### 3c. marlinjai/email-mcp — multi-provider fallback
- **What:** Unified MCP across Gmail, Outlook, iCloud, and generic IMAP; OAuth2 browser flows + token refresh. Source: <https://github.com/marlinjai/email-mcp>
- **Why it matters:** Provider-flexible (matches the deployment principle). Useful if hjewkes later adds a non-Gmail account or wants IMAP as a Gmail-API-free fallback.

**Email pick:** **GongRzhe Gmail-MCP-Server** for the tool surface, started with **read-only scopes + draft-only sends**; steal **inbox-zero's rules engine** as an OpenClaw triage skill.

---

## 4. Notes / PKM / second-brain

### 4a. Obsidian via coddingtonbear/obsidian-local-rest-api (**now ships a built-in MCP server**) — **primary if hjewkes uses Obsidian**
- **What (updated finding):** The **Local REST API community plugin now bundles its own first-party MCP server** running inside Obsidian at `https://127.0.0.1:27124/mcp/` (bearer-token auth; optional plain-HTTP at `:27123/mcp/`). It has direct access to live vault metadata, the active file, periodic notes, and the command palette — so you **no longer need a third-party wrapper** for the basics. It also offers fuzzy search + JsonLogic queries over frontmatter/tags/path/content.
- **License / stack:** MIT. The plugin runs inside Obsidian (TypeScript) and exposes the HTTPS REST+MCP API on localhost with **API-key/bearer auth**.
- **MCP-readiness:** **Native, first-party MCP** — point OpenClaw straight at the `/mcp/` endpoint. Source: <https://github.com/coddingtonbear/obsidian-local-rest-api>
- **Third-party wrappers (still useful for richer/task-oriented tooling):** `MarkusPfundstein/mcp-obsidian` (Python; list/get/search/patch/append/delete), `cyanheads/obsidian-mcp-server` (section-aware editing across headings/block-refs/frontmatter, tag reconciliation, JSONLogic), `ToKiDoO/mcp-obsidian-advanced` (link/structure-aware). `StevenStavrakis/obsidian-mcp` works **directly on vault files without the plugin** (good if you don't want Obsidian running headless). Sources: <https://github.com/MarkusPfundstein/mcp-obsidian>, <https://github.com/cyanheads/obsidian-mcp-server>
- **Security notes:** Requires Obsidian *running* with the plugin + API key. The REST/MCP API is localhost-only by default — keep it that way; never expose `:27124` off-box. File-delete/patch tools should be gated; notes are usually OK to write but capping at append-only is a safe phase-1 posture.
- **Pattern to steal:** *Append-only memory sink.* Point OpenClaw's persistent-memory layer at a daily note via the append tool — the assistant writes a running log a human can read in their own PKM.

### 4b. Khoj (khoj-ai/khoj) — **second brain + RAG + scheduled automations in one**
- **What:** Self-hostable "AI second brain." Ingests PDF/markdown/org-mode/Word/**Notion/GitHub**, semantic search, custom agents, **scheduled automations** (natural-language research tasks on a cron that **email you results**), online search, local-LLM support (Llama/Qwen) or online models. Runs as server + Obsidian/Emacs/Desktop clients.
- **License / stack:** AGPL-3.0. Python; Docker / pip install. ~30k stars — by far the most mature option in this section. Source: <https://github.com/khoj-ai/khoj>
- **MCP-readiness:** **Not a native MCP server**; its integration surface is a **REST API (OpenAI-compatible chat endpoint) + Obsidian/Emacs plugins**. Community MCP wrappers exist but aren't first-party — verify before depending on one. Easiest OpenClaw integration: call Khoj's REST API from a thin OpenClaw skill/MCP adapter.
- **Security notes:** AGPL (fine for private deployment). Can run **fully local** (Ollama embeddings + local LLM) — strong fit for the "local fallback / own-the-stack" principle. It holds connectors to Notion/GitHub, so the same scope-minimization rules apply to those tokens.
- **Pattern to steal:** *Scheduled research-task → email digest.* This is a near-drop-in template for OpenClaw's daily-briefing workflow (see §5).

### 4c. Reor (reorproject/reor) — local-first AI notes (desktop, not a server)
- **What:** Private, **fully local** AI PKM desktop app. Auto-links related notes, RAG Q&A over your notes, semantic search; runs models locally via Ollama/Transformers.js. Stores notes as plain markdown.
- **License / stack:** AGPL-3.0. Electron / TypeScript. ~7k+ stars. Source: <https://github.com/reorproject/reor>
- **MCP-readiness:** **None** — it's a desktop app with no server API. Because notes are **plain markdown on disk**, the integration path is "point a filesystem/RAG MCP at the same folder," not "talk to Reor." Include it as a *human-facing* PKM client that shares a vault with the agent, not as an agent tool.

### 4d. Memos (usememos/memos) — lightweight note/memo backend, **now with a built-in MCP endpoint**
- **What:** Minimalist self-hosted note/memo service (Twitter-like quick notes), markdown-native, with a **REST + gRPC API**. Single Go binary (~20MB Docker image), SQLite/MySQL/Postgres. Source: <https://github.com/usememos/memos>
- **License / stack:** **MIT (confirmed).** Go backend + React frontend. **~45–47k stars** — by far the most popular tool in this section, very active.
- **MCP-readiness (updated finding):** Memos now exposes an **in-process MCP endpoint at `/mcp` over Streamable HTTP, authenticated with a Personal Access Token (PAT)**, exposing memo CRUD, comments, attachments, relations, reactions, tag listing, prompts, and memo resources. So it's a **native MCP server now** — no wrapper needed. (Community wrappers like `LeslieLeung/mcp-server-memos` and `RyoJerryYu/mcp-server-memos-py` also exist if you want stdio.) Good "frictionless capture" sink for voice-channel memos.
- **Security notes:** PAT = full account; treat as a secret. Low blast radius (just memos).

### 4e. Logseq via dailydaniel/logseq-mcp
- **What:** Logseq exposes a **local HTTP API server** (enabled in settings with an auth token); `logseq-mcp` wraps it so an agent can query the DB, get/create blocks and pages, and read journals. Source: <https://github.com/dailydaniel/logseq-mcp> and <https://github.com/logseq/logseq>
- **MCP-readiness:** Native MCP wrapper over Logseq's local API. Community-maintained — vet activity/maintenance before relying on it.

**PKM pick:** If hjewkes is on **Obsidian** → `mcp-obsidian` (append-only first). For an all-in-one **search + scheduled-digest** brain → **Khoj** via its REST API. **Memos** as the voice/quick-capture sink.

---

## 5. Daily briefing / digest agents

**Key finding (verified across multiple searches): there is no single dominant "morning brief" MCP server.** The established pattern is a **scheduled OpenClaw workflow that fans out across the MCP servers above** and composes a digest. Building blocks:

### 5a. Khoj scheduled automations — closest off-the-shelf
- Khoj's cron-driven "research tasks → email" feature (§4b) is the nearest thing to a turnkey morning-brief agent. Source: <https://github.com/khoj-ai/khoj>. Pattern: define an automation like "every weekday 7am, summarize my unread important email + today's calendar + top 3 AI headlines, email it to me."

### 5b. Miniflux (miniflux/v2) + miniflux-ai — RSS/news source for the digest
- **What:** Minimalist self-hosted RSS reader, statically compiled, with a clean **REST/JSON API** and fetch-original-content. The agent polls unread entries via the API and summarizes them. The **`Qetesh/miniflux-ai`** companion auto-adds AI summaries/translations to Miniflux entries via Ollama/OpenAI/Gemini (docker-compose included), so you can pre-summarize at ingest time. Sources: <https://github.com/miniflux/v2>, <https://github.com/Qetesh/miniflux-ai>
- **License / stack:** Miniflux = Apache-2.0, Go. miniflux-ai = OSS companion.
- **MCP-readiness:** No first-party MCP; the JSON API is trivially wrappable as an OpenClaw skill ("get unread entries since X"). (Note: some newer AI-RSS readers like `precis` ship MCP servers — see below.)
- **Pattern to steal:** *Self-hosted feed store + LLM summarizer on top.* Keeps news ingestion reproducible-as-code and out of third-party hands.

### 5c. Meridian (iliane5/meridian) — turnkey personalized daily-brief generator
- **What:** Scrapes hundreds of sources, dedupes/scores/filters/enriches stories with an LLM, and produces a concise **personalized daily brief**. The clearest "reference implementation" of the brief-composition pattern to study.
- **MCP-readiness:** Not an MCP — a standalone pipeline. Study it for the scoring/dedup/enrichment design, then port the prompts into your OpenClaw routine. Source: <https://github.com/iliane5/meridian>
- **Also worth a look:** `kylenewm/ai-morning-briefing` (LangGraph orchestration: articles + podcasts + newsletters → personalized email), `finaldie/auto-news` (multi-source aggregator: RSS/Tweets/YouTube/Reddit + LLM), `leozqin/precis` (self-hosted AI RSS reader **with a built-in MCP server**). Sources: <https://github.com/kylenewm/ai-morning-briefing>, <https://github.com/finaldie/auto-news>, <https://github.com/leozqin/precis>

### 5d. The composition pattern (the real recommendation)
OpenClaw cron trigger (e.g. 07:00) → call **Calendar MCP** (`list-events` today) + **Gmail MCP** (`search_emails is:unread is:important`) + **Miniflux API** (unread feeds) + a weather API → LLM composes a brief → deliver to **Slack** (post via Slack MCP) and/or **Gmail draft**. Every input is read-only; the only write is the one delivery channel. This is the canonical multi-MCP workflow and exercises the scheduler + channels + memory all at once.

**Briefing pick:** Build the **composition workflow** as the flagship OpenClaw daily routine; use **Khoj automations** as a quick-start template and **Miniflux** as the news source.

---

## 6. Task & reminder / follow-up nudge agents

**Key finding: reminders/nudges are mostly a *scheduler + task-store* problem, not a dedicated agent.** Use a task-store MCP for state and OpenClaw's own cron/event triggers for the nudging.

### 6a. Doist/todoist-ai (formerly Doist/todoist-mcp) — **primary (official)**
- **What:** Official Todoist agent tooling from Doist. **`Doist/todoist-mcp` is now DEPRECATED and superseded by `Doist/todoist-ai`** — same idea, refactored so the tools aren't MCP-specific (reusable via Vercel AI SDK etc.) and adds "MCP Apps" interactive widgets. Full Todoist API: create/get/update/close/reopen/delete tasks, projects, sections, labels, comments, filters.
- **License / stack:** TypeScript / Node. Auth = personal Todoist API token (single-user) **or** the hosted Streamable-HTTP server at `https://ai.todoist.net/mcp`. Source: <https://github.com/Doist/todoist-ai> (deprecated: <https://github.com/Doist/todoist-mcp>)
- **MCP-readiness:** Native, drop-in. For OpenClaw, prefer the **self-run/token mode** over the hosted endpoint if you want to keep credentials on-box (own-the-stack).
- **Security notes:** Single API token = full account access; store it like any secret. Low blast radius (it's only tasks), so this is a reasonable early "write-enabled" domain.
- **Community alternatives** (some expose richer reminder primitives): `shayonpal/mcp-todoist` (relative/absolute/location reminders), `greirson/mcp-todoist` (19 tools incl. reminders), `abhiz123/todoist-mcp-server` (NL task tools), `dvcrn/mcp-server-ticktick` (TickTick).
- **Pattern to steal:** *Task-store as durable state for nudges.* Agent writes tasks with due dates; OpenClaw cron scans for due/overdue items and pings Slack/voice. The "follow-up nudge" = a scheduled query over the task store + an email/Slack search for "did they reply?"

### 6b. Follow-up nudge composition
A "did X reply to my email?" nudge = **Gmail MCP `search_emails`** (find the thread, check for a reply after date) + a Todoist task + an OpenClaw cron that re-checks and nudges if no reply. No bespoke project needed — it's a workflow over §3 + §6a + the scheduler.

**Tasks pick:** **Doist/todoist-mcp** as the state store; nudging logic lives in OpenClaw's scheduler + a follow-up skill.

---

## 7. Browser / web automation as a tool

### 7a. microsoft/playwright-mcp — **primary recommendation**
- **What:** Microsoft's official Playwright MCP. Drives the browser via the **accessibility tree (structured snapshots), not pixels/screenshots** — fast, deterministic, LLM-friendly, low token cost. Tools: navigate, click, type, snapshot, screenshot, fill forms, handle dialogs, tabs, network requests. Headless or headed, Docker-friendly.
- **License / stack:** Apache-2.0 (confirmed). Node/TypeScript. **~31k stars, ~2.5k forks**, maintained by Microsoft. The accessibility-tree snapshot is ~2–5KB of structured data vs. 500KB–2MB for a screenshot — far cheaper in tokens and more deterministic. Source: <https://github.com/microsoft/playwright-mcp>
- **MCP-readiness:** Native, first-party. The safest, most reproducible browser tool to give OpenClaw.
- **Security notes:** Still high-risk by nature (an agent driving a browser). Mitigate by running it against a **fresh/sandboxed browser profile with no logged-in sessions** for general browsing, and only granting a logged-in profile for specific, confirmed tasks. Accessibility-tree approach reduces (not eliminates) prompt-injection surface vs. vision agents.
- **Pattern to steal:** *Default to a clean, logged-out browser profile; require explicit elevation for authenticated sessions.*

### 7b. browser-use/browser-use — autonomous task agent + MCP
- **What:** Python library that lets an LLM autonomously complete browsing *tasks* (higher-level than Playwright MCP's primitives). The agent works largely from **screenshots + vision reasoning** (not the accessibility tree), identifying clickable elements by index. Works with any LLM (OpenAI/Anthropic/Gemini/local Ollama).
- **License / stack:** MIT (confirmed). Python (~98%). **~96k stars, ~11k forks** — one of the most-starred agent projects on GitHub, extremely active (v0.12.x, May 2026). Source: <https://github.com/browser-use/browser-use>
- **MCP-readiness:** MCP support exists but is **provided via wrappers / a documented MCP mode rather than one canonical first-party binary** — multiple packages expose it (`uvx --from 'browser-use[cli]' browser-use --mcp`, plus community servers `mcp-browser-use`, `browser-use-mcp-server`). Pick one and pin it. MCP docs: <https://docs.browser-use.com/customize/integrations/mcp-server>
- **Security notes:** **Highest blast radius in this report.** An autonomous, vision-driven LLM controlling a *logged-in* browser invites prompt-injection hijacking from any visited page; the screenshot/vision approach also has a larger injection surface than accessibility-tree tooling. Run in a sandboxed/isolated profile; gate behind human confirmation for anything authenticated. (Robust CAPTCHA/anti-bot handling is gated behind their paid Cloud.)
- **When to pick over Playwright MCP:** when you want "accomplish this goal on the web" autonomy rather than step-by-step primitives. For a personal assistant, prefer **Playwright MCP as the default** and reach for browser-use only for genuinely autonomous, sandboxed tasks.

### 7c. Skyvern (Skyvern-AI/skyvern) — vision-based, resilient flows
- **What:** Automates browser workflows with LLMs **+ computer vision**, resilient to layout changes, handles sites it's never seen, supports 2FA/TOTP and proxies. REST API + MCP support.
- **License / stack:** AGPL-3.0 (confirmed — **except anti-bot measures, which are cloud-only**). Python, self-hostable via Docker Compose, bring-your-own-LLM (OpenAI/Anthropic/Gemini/Ollama). **~20k+ stars.** Provides a Playwright-compatible SDK (Python + TS). Source: <https://github.com/Skyvern-AI/skyvern>
- **MCP-readiness:** Has MCP support + REST API.
- **Trade-offs:** Heavier and more resource-intensive than Playwright MCP; vision models cost more. Best reserved for **gnarly multi-step flows** (logins, complex forms) that break Playwright/browser-use.

**Browser pick:** **Playwright MCP** as the default web tool (clean profile); **browser-use** for sandboxed autonomous tasks; **Skyvern** only for resilient login/form flows.

---

## 8. Personal RAG over your own files/email/notes (local-first)

### 8a. Khoj (again) — best all-in-one local-first personal RAG
- See §4b. AGPL-3.0, **~33–35k stars** (YC W24), runs **fully local** (Ollama embeddings + LLM), indexes notes/PDF/Markdown/org/Word/Notion/GitHub/images, semantic search + chat with citations. **Confirmed it has first-party MCP support** plus a REST API and Obsidian/Emacs clients, and its **cron-based automations email you results** (`docs.khoj.dev/features/automations`) — the single strongest answer for "RAG over my own stuff + scheduled digests, self-hosted." Source: <https://github.com/khoj-ai/khoj>

### 8b. Onyx (onyx-dot-app/onyx, formerly Danswer) — connector-rich RAG platform
- **What:** Open-source RAG/assistant platform with **40+ native connectors** (Google Drive, **Gmail**, **Slack**, Confluence, local files…), hybrid search (keyword+semantic), contextual retrieval, LLM knowledge-graphs, chat-with-citations, **permission syncing**, web search, code execution, local-LLM support. Self-hosted via Docker.
- **License / stack:** **Onyx Community Edition is MIT and covers all core Chat/RAG/Agents/Actions features** (some enterprise directories are separately licensed — check before redistribution). Python/TypeScript. ~13k+ stars; formerly named Danswer. Source: <https://github.com/onyx-dot-app/onyx>
- **MCP-readiness:** Not a native MCP server; exposes an API you'd wrap. Heavier (full platform) — overkill unless you want a unified searchable index spanning Slack+Gmail+Drive+files with permission awareness.
- **Why notable here:** It already has **Gmail and Slack connectors**, so it can be the *unified personal index* the assistant queries, complementing the per-domain MCP servers.

### 8c. LlamaIndex (run-llama/llama_index) — build-your-own local RAG
- **What:** The leading Python RAG framework — data ingestion, indexing, retrieval. MIT, ~30k+ stars. Fully local-first capable (Ollama embeddings + LLM), and has an **MCP integration**. Source: <https://github.com/run-llama/llama_index>
- **MCP-readiness:** Can be exposed as an MCP tool; it's the DIY route when off-the-shelf RAG doesn't fit.
- **Pattern to steal:** A thin LlamaIndex-backed MCP that indexes a folder (notes + downloaded email + files) and exposes one `search_my_stuff` tool — minimal, fully local, exactly the "personal RAG" primitive OpenClaw needs.

**Personal RAG pick:** **Khoj** for turnkey local-first second-brain RAG; **Onyx** if you want a connector-rich unified index across Gmail/Slack/Drive; **LlamaIndex-MCP** for a minimal DIY folder-RAG tool.

---

## Plug-in shortlist for OpenClaw

| Domain | Project | License | MCP-ready? | OpenClaw slot | Trust phase / gate |
|---|---|---|---|---|---|
| Slack (read) | **Duolingo/slack-mcp** | OSS (verify) | Native (HTTP, OAuth2.1) | Slack channel adapter (ingest) | Phase 1 — read-only by design |
| Slack (write) | **korotovsky/slack-mcp-server** | MIT | Native (Go, stdio/HTTP) | Slack channel adapter (post) | Phase 2 — enable write + per-channel allow-list |
| Calendar | **nspady/google-calendar-mcp** | MIT | Native (TS, stdio) | Calendar MCP / scheduling workflows | `ENABLED_TOOLS` read-only → write; publish app to avoid 7-day token expiry |
| Email tools | **GongRzhe/Gmail-MCP-Server** (use a maintained fork — orig archived) | MIT/ISC (verify) | Native (TS, stdio/HTTP) | Email MCP (triage/draft) | Read-only OAuth scope + **draft-only sends**; delete behind confirm |
| Email triage logic | **elie222/inbox-zero** (design) | OSS + CLA (verify) | No (web app) | OpenClaw **skill** (rules engine) over Gmail MCP | Reuse rules pattern, not the app |
| PKM (Obsidian) | **obsidian-local-rest-api** (built-in MCP) | MIT | **Native, first-party MCP** | Memory sink / notes skill | Localhost-only; append-only first; gate delete/patch |
| PKM / RAG / digest | **Khoj** | AGPL-3.0 | **Native MCP** + REST | RAG skill + daily-brief template | Local-LLM mode for own-the-stack |
| Quick capture | **usememos/memos** | MIT | **Native MCP** (`/mcp`, PAT) | Voice/quick-capture skill | Low risk; single-user PAT |
| Daily briefing | **Composition workflow** (Calendar+Gmail+Miniflux); study **Meridian** | — | Uses above MCPs | Flagship cron routine → Slack/email | Read-only inputs, one delivery write |
| News source | **miniflux/v2** (+ miniflux-ai) | Apache-2.0 | REST (wrap) | RSS skill for the brief | Read-only |
| Tasks/reminders | **Doist/todoist-ai** (todoist-mcp deprecated) | OSS | Native MCP | Task store + nudge state | Early write-enabled (low blast radius) |
| Follow-up nudges | **Workflow** (Gmail search + Todoist + cron) | — | Uses above | Scheduler + follow-up skill | Read Gmail; write task only |
| Browser (default) | **microsoft/playwright-mcp** | Apache-2.0 | Native (TS) | Web-tool MCP | Clean/logged-out profile by default |
| Browser (autonomous) | **browser-use** | MIT | MCP mode (pin a wrapper) | Web-tool MCP (sandboxed) | Highest gate; sandbox + confirm; vision = wider injection surface |
| Browser (resilient flows) | **Skyvern** | AGPL-3.0 | MCP + REST | Web-tool (login/form flows) | Confirm; isolated profile; reserve for hard cases |
| Personal RAG (unified) | **Onyx** (ex-Danswer) | MIT CE (+ent dirs) | API (wrap) | Unified index over Gmail/Slack/files | Permission-sync aware; heavier |
| Personal RAG (DIY) | **LlamaIndex** | MIT | MCP integration | `search_my_stuff` folder-RAG tool | Fully local; minimal surface |

---

## Open questions / things to verify before committing
1. **Is hjewkes's Slack a personal or shared/employer workspace?** Determines whether korotovsky stealth mode is acceptable or a policy violation — pick bot-scoped (Zencoder/official) if shared.
2. **Gmail server choice + license.** The popular GongRzhe Gmail-MCP-Server is **archived/unmaintained** — decide between a maintained fork (ArtyMcLabin / zenrith-fluxman security fork) and the actively maintained `taylorwilsdon/google_workspace_mcp`. Confirm the actual LICENSE file (MIT vs ISC signals conflict).
3. **inbox-zero license** — it ships a LICENSE + a CLA that assigns broad rights; confirm exact terms before treating it as standard OSS (fine for private self-host either way).
4. **Read-only enforcement for Gmail & Calendar is now confirmed available** (Gmail: scope-limit at OAuth time; Calendar: `ENABLED_TOOLS`) — but **test it end-to-end** to be sure the write tools are truly inert under narrowed scopes.
5. **Calendar 7-day token expiry** in OAuth "testing" mode will break an always-on assistant — publish the app to production (still private) or automate re-auth.
6. **Confirm exact star counts** on GitHub before quoting (numbers drift weekly). AGPL items (Khoj, Reor, Skyvern, Onyx-enterprise-dirs) are fine for private deployment but matter if anything is ever redistributed.
