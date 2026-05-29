# v0 Implementation Plan — Reusable Chat Harness + Diet Coach Plugin

**Date:** 2026-05-28
**Status:** Draft — awaiting approval
**Supersedes:** the OpenClaw-deployment approach in `2025-02-25-openclaw-design.md` for the *interface layer*. (The security/network/secrets thinking from those docs still applies; the OpenClaw monolith does not — see `research/00-decision-brief.md`.)

**Decisions locked:** Channel = **private single-user Slack workspace** (Socket Mode). First vertical = **Diet coach**. Core must be **use-case agnostic** — a reusable harness; verticals are plugins. **Language = TypeScript** (npm-distributable; MCP SDK + Claude Agent SDK are first-class in TS). **Deliverable shape = library-first, layered + template**: Layer 1 composable primitives (own nothing, embeddable in an existing MCP server) + Layer 2 opt-in `createAssistant()` convenience wrapper + a `create-*`/degit starter template carrying the canonical wiring. Not a framework (can't embed), not boilerplate-only (no upgrade path).

> **⚠️ Boundary pending review (06-sdk-surface-map).** Before solidifying which capabilities live in this library vs. are inherited from Claude, a deep review of the **TypeScript Agent SDK + interactive Claude Code** is in flight. Likely shifts: allowlist+audit may become **PreToolUse hooks we ship** rather than middleware we write; the tool-call loop, permission gating, skill loading (`.claude/skills/`), and session/resume are probably **SDK-owned** (we don't reimplement). The library's confirmed value-add is the stuff Claude does NOT provide: **transport/channels, scheduler, the driver abstraction, plugin packaging, durable domain state.** §5 and §8 below are provisional until that review lands. **Execution model = driver-agnostic service**: the service owns the loop/scheduler/logic/tools; the *brain* is a swappable driver. **v0 default driver = channel-driven** (persistent interactive Claude Code, subscription-billed on Max), with selective graduation to **Agent SDK / `claude -p`** per workload where it proves optimal.

> **Billing reality (verified 2026-05-28).** The June 15 2026 change moves **`claude -p` and the Agent SDK** onto a separate monthly credit pool billed at full API rates (no subscription discount; Max 20x = $200 credit, no rollover). **Interactive Claude Code stays on the Max subscription pool, unchanged** — and **channels are a feature of interactive Claude Code**. So a persistent interactive session fed by a channel is the *subscription-cheap, ToS-blessed* always-on path (the channels docs explicitly sanction running Claude "in a background process or persistent terminal"). There is **no** subscription-backed path for `claude -p`/SDK after June 15. Hence: build the substrate driver-agnostic; default to the channel driver now; route specific workloads to SDK/headless only when isolation or concurrency (not cost) justifies the metered rate.

---

## 1. The core idea: a harness + plugins, not an app

There are **two independently valuable things** here, and keeping them separate is the design:

1. **The harness** (`core/`) — a use-case-agnostic library that provides *the chat + channels + scheduling + brain-driving + security machinery*. It knows nothing about diet, workouts, or email. Its job: take an inbound message (or a timer) on some channel, run the configured brain with the configured tools/skill for that channel, and send replies back — with allowlisting, auditing, and session continuity handled for you.

2. **Plugins** (`plugins/<name>/`) — self-contained bundles that give the harness a *purpose*. A plugin = its MCP tool server(s) + a SKILL.md + scheduled jobs + a channel binding, described by one manifest. Diet is the first; workout/kids/triage are later folders. **Adding a purpose = adding a plugin folder + registering it. Zero core changes.**

> v0 ships the harness *and* the diet plugin, but they're built so the harness could power a completely different assistant tomorrow by swapping the plugin set.

**Success = (a) the harness runs a plugin end-to-end, and (b) a second plugin could be added without touching `core/`.**

---

## 2. The plugin contract (the load-bearing abstraction)

Everything hinges on a small, stable contract. A plugin declares itself; the harness consumes the declaration. Nothing in `core/` imports anything from `plugins/`.

```python
# core/contract.py  — the ONLY thing plugins depend on from core

@dataclass(frozen=True)
class ScheduledJob:
    id: str
    cron: str                      # APScheduler cron expr
    kind: Literal["fixed", "dynamic"]
    payload: str                   # fixed: literal text to send
                                   # dynamic: prompt handed to the brain
    channel: str                   # logical channel name to act on

@dataclass(frozen=True)
class McpServerSpec:
    name: str
    command: list[str]             # how to launch the stdio MCP server
    # (env/cwd as needed)

@dataclass(frozen=True)
class Plugin:
    name: str                      # "diet"
    channels: list[str]            # logical channels it binds, e.g. ["diet"]
    skill_dir: Path                # folder containing SKILL.md
    mcp_servers: list[McpServerSpec]
    jobs: list[ScheduledJob]
    # optional: system_prompt_extra, model override, allowed_tools subset

def register() -> Plugin: ...      # each plugin module exposes this
```

That's the entire surface. A plugin author writes an MCP server, a SKILL.md, and a `register()` returning this struct. The harness does the rest.

**What the harness derives from the contract:**
- which logical channels exist and which plugin owns each (routing),
- which MCP servers to spawn and attach to that channel's brain session,
- which skill to load,
- which scheduled jobs to install.

**Channel mapping** stays in harness config (logical name → physical Slack channel ID), so the *same* diet plugin works on Slack now and Discord/Telegram later by changing config, not plugin code.

---

## 3. Architecture

```
   Slack (your phone)                 ┌──────────────────────────────────────────┐
   #diet ──── message event ─────────▶│  HARNESS  (core/, use-case agnostic)      │
                                       │                                           │
                                       │  Transport adapter (Slack Bolt/Socket)    │
   #diet ◀──── post message ──────────│  Router      channel → owning plugin       │
                                       │  Scheduler   runs plugins' ScheduledJobs   │
                                       │  BrainDriver Agent SDK, session per channel│
                                       │  Hooks       allowlist + audit + rate-limit│
                                       │  Registry    loads plugins via register()  │
                                       └───────────────┬───────────────────────────┘
                       attaches the owning plugin's MCP servers + skill, then invokes
                                                       ▼
                                            ┌──────────────────────┐
                                            │   CLAUDE (brain)      │  + plugin's SKILL.md
                                            │   Claude Agent SDK    │
                                            └──────────┬───────────┘
                                                       │ stdio MCP (plugin-provided)
                       ┌───────────────────────────────┴───────────────┐
                       ▼                                                ▼
            plugins/diet/ MCP server                        plugins/<other>/ MCP server
            (get_today_plan, log_meal, …)                   (future, no core change)
            + send_message  ◀── provided by CORE, not the plugin (shared tool)
```

The harness owns one cross-cutting tool — **`send_message`** — because it's transport-bound. Plugins provide only domain tools.

---

## 4. Repo layout (the separation made physical)

```
openclaw/
  core/                         # the reusable harness — NO domain knowledge
    contract.py                 # Plugin / ScheduledJob / McpServerSpec / BrainDriver / BrainEvent
    registry.py                 # discover + load plugins' register()
    router.py                   # channel → plugin + channel → driver resolution
    drivers/
      base.py                   # BrainDriver protocol + BrainEvent
      channel.py                # ChannelDriver — persistent interactive CC + claude/channel (v0 default)
      sdk.py                    # SdkDriver — Agent SDK / claude -p per event (graduate selectively)
    channel_server.py           # the claude/channel MCP capability the service exposes
    scheduler.py                # installs ScheduledJobs (fixed vs dynamic)
    hooks.py                    # PreToolUse: allowlist + rate-limit + audit
    transport/
      base.py                   # Transport protocol + InboundMsg
      slack.py                  # SlackTransport (Bolt, Socket Mode)
    tools/
      send_message.py           # the one core-provided MCP tool
    config.py                   # logical-channel → physical-channel map, allowlist
    main.py                     # wire-up: load plugins, start transport+scheduler
  plugins/
    diet/                       # the first plugin — entirely self-contained
      __init__.py               # register() -> Plugin
      mcp/server.py             # stdio MCP: get_today_plan, log_meal, …
      mcp/db.py                 # SQLite access
      skill/SKILL.md            # diet-coach behavior
      skill/meal_plan_template.md
      jobs.py                   # ScheduledJob list (reminders, adherence nag)
      data/diet.sqlite          # gitignored
    # workout/  kids/  triage/  ... later: same shape, no core edits
  audit/tool-calls.log          # append-only, harness-written
  config.toml                   # channel map, allowlist, model, plugin enable-list
  .env                          # gitignored secrets
```

Test of correctness: **`core/` has no `import plugins...` anywhere, and `plugins/diet/` imports only `core.contract`.** If both hold, the harness is genuinely use-case agnostic.

---

## 5. Execution model — the service owns the loop; the brain is a driver

The harness owns the event loop + scheduler + deterministic logic + tools + transport + audit log. **Who calls the LLM is a swappable `BrainDriver`.** This is the load-bearing decision that lets the same service run cheaply now (subscription) and graduate selectively later (metered) without touching plugins.

```python
# core/contract.py (cont.)
class BrainDriver(Protocol):
    async def handle(self, channel: str, event: BrainEvent) -> None:
        """Get the brain to react to event on channel, using the
        plugin's MCP tools + skill. Implementations send replies via
        the transport/send_message tool. The driver is the ONLY part
        that differs between subscription-channel and metered-SDK paths."""

# BrainEvent = inbound message | dynamic scheduled prompt  (fixed jobs never reach a driver)
```

**Two drivers over the identical substrate:**

| | `ChannelDriver` (v0 default) | `SdkDriver` (graduate selectively) |
|---|---|---|
| Brain | one persistent **interactive** Claude Code session | fresh **Agent SDK / `claude -p`** per event |
| Event delivery | service **pushes** a `<channel>` block into the open session | service **invokes** the brain with event-as-prompt + `resume` |
| Tools | CC ↔ service MCP (incl. the `claude/channel` capability) | SDK ↔ service MCP (stdio) |
| Billing | **Max subscription pool** (cheap, unchanged by June 15) | Agent SDK credit → API rates |
| ToS | sanctioned ("background process or persistent terminal") | sanctioned (commercial terms) |
| Isolation | shared session context | fresh, isolated context per event |

In Claude Code's model a **channel is itself an MCP server** (declares `claude/channel`). So the service exposes two faces of one thing: tool calls *and* an event-push channel. (Report on CC mechanics: channels are exclusive to interactive CC and only deliver while the session is open; the SDK does not get channels — for the SDK path the service feeds the event as the prompt instead.)

**Trigger → driver routing:**

| Trigger | Path | LLM? |
|---|---|---|
| Inbound message | Slack event → router → **driver**.handle(channel, msg) → plugin tools → reply | yes |
| Fixed `ScheduledJob` | scheduler → transport posts `payload` directly | **no** (free — bypasses the driver entirely) |
| Dynamic `ScheduledJob` | scheduler → **driver**.handle(channel, prompt) + plugin tools | yes |

**Driver choice is per-channel/per-workload, and it doubles as the security boundary (report 04):** keep coach chat on the cheap shared `ChannelDriver`; run the **triage** workload (untrusted email = lethal-trifecta exposure) on an **isolated `SdkDriver`** invocation with read-only scoped tools, no `send`, no outbound — fresh context, never sharing the coach session. The thing that's cheap and the thing that needs isolation want different drivers anyway.

**Operational risks of the channel driver (accepted; mitigated by service-owns-state):**
- *Context growth* in the long session → restart anytime (durable state lives in SQLite, lost nothing); design channel events self-contained; `/compact`.
- *Single-session concurrency* (one turn at a time) → fine at personal scale; batch-y work graduates to per-event `SdkDriver`.
- *Channels are research-preview* → the `BrainDriver` seam is the insurance; swap to `SdkDriver` if channels change.
- *Session must stay alive/logged-in* → supervise the background CC process (launchd now, systemd on Proxmox later).

---

## 6. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Language | **Python 3.12** | Slack Bolt, APScheduler, Agent SDK, MCP SDK all first-class |
| Channel | **slack-bolt** (Socket Mode) | event-driven inbound, no public port, no Mac dependency |
| Brain | **claude-agent-sdk** (Python), headless | `permission_mode`, `resume`, `mcp_servers`, hooks |
| Tools | **mcp** (Python SDK), stdio | plugin-provided + core's `send_message` |
| Scheduler | **APScheduler** | installs plugins' `ScheduledJob`s |
| Data | **sqlite3** (stdlib), per-plugin DB | relational logs; no vector DB in v0 |
| Skill | **SKILL.md** per plugin | git-versioned behavior |
| Secrets | Keychain / `.env` → SOPS+age before server | no plaintext in repo |

---

## 7. Diet plugin specifics (the v0 proof)

**MCP tools** (`plugins/diet/mcp/server.py`):

| Tool | Signature | Notes |
|---|---|---|
| `get_today_plan` | `() -> [meals]` | read |
| `log_meal` | `(meal, description, on_plan?) -> id` | core capture path |
| `get_adherence` | `(date?) -> {planned, logged, missing[]}` | powers the nag |
| `record_deviation` | `(context, note) -> id` | "ate out, had pasta" |

(`send_message` comes from core, not the plugin.) Tightly scoped — no `run_sql`/`query_all`.

**Data** (`plugins/diet/data/diet.sqlite`): `meal_plan`, `food_log`, `deviations` (schema as before — moved into the plugin so each plugin owns its storage).

**SKILL.md:** `name: diet-coach`; `description` is the matcher; `allowed-tools` = the 4 diet tools + `send_message`. Body: supportive-accountability tone, free-text → `log_meal`, restaurant flow, nag-only-when-off-plan policy, never invent macros.

**Jobs** (`plugins/diet/jobs.py`): fixed meal reminders per `meal_plan.time_local`; 20:00 dynamic adherence check.

---

## 8. Security baseline (harness-level, so every plugin inherits it)

Because these live in `core/hooks.py` and `core/config.py`, **every current and future plugin gets them for free** — you can't add a purpose that forgets to be safe:

- **Sender allowlist** in the transport/router: only your Slack user ID is processed, dropped before the model sees text. (Private workspace scopes it; allowlist is defense-in-depth + the seam other channels need.)
- **PreToolUse hook:** allow only the active plugin's declared tools, rate-limit `send_message`, **append every tool call to `audit/tool-calls.log`**.
- **Secrets** in `.env`/Keychain, never committed.
- **Untrusted-by-default:** inbound text is data, not instructions — the habit that makes the triage plugin safe to add later (it's the one where the lethal-trifecta risk is real; report 04).
- **Deferred (not v0):** containerization + egress allow-list (Proxmox move); the read-only triage split (its own plugin, with no `send`/outbound tools).

---

## 9. Milestones

| # | Deliverable | Proves |
|---|---|---|
| **M0** | Harness skeleton + `contract.py` + Slack transport; echoes your `#diet` message back (no LLM yet) | transport, Socket Mode, allowlist, the contract compiles |
| **M1** | Registry loads diet plugin; **`ChannelDriver`** wired to a persistent CC session; "had eggs" → `log_meal` → confirm | plugin contract + the cheap subscription driver end-to-end; MCP + skill + audit hook |
| **M2** | Fixed meal reminders fire (plugin-declared jobs) | scheduler installs plugin jobs; fixed path (no LLM, driver bypassed) |
| **M3** | 20:00 dynamic adherence nag, only when off-plan | dynamic job → driver path + `get_adherence` |
| **M4** | "I'm at an Italian place" → fitting suggestion; `record_deviation` | skill reasoning over plan + intake |
| **M5** *(agnosticism proof)* | A trivial stub plugin (e.g. `echo` or `workout` skeleton) added with **zero `core/` edits** | the harness is genuinely use-case agnostic |
| **M6** *(driver-swap proof, optional)* | Route one workload through `SdkDriver` instead of `ChannelDriver` with **zero plugin edits** | the driver seam holds; the metered path is one swap away when isolation/concurrency justify it |

M0–M1 is the weekend core (on the subscription-cheap channel driver); M5 proves use-case agnosticism; M6 proves driver agnosticism.

---

## 10. Setup prerequisites (you do once)

1. Create a **free Slack workspace** (just you).
2. Create a **Slack app** (Socket Mode on): bot scopes `chat:write`, `channels:history`, `channels:read`, `im:history`, `app_mentions:read`; event subs `message.channels`, `message.im`, `app_mention`; **bot token** (`xoxb-`) + **app token** (`xapp-`, `connections:write`).
3. Create channels: `#diet` now; `#workout`/`#kids`/`#triage` later.
4. **Anthropic API key** + a daily spend cap in the console.
5. One **meal plan** in mind to seed `meal_plan` (M2 needs it).

---

## 11. Open decisions before coding

- **Reply mechanism:** auto-post the brain's final text for normal replies, reserve `send_message` for proactive/multi-message sends? (Recommend yes — simpler, fewer tokens.)
- **One MCP server per plugin vs one shared:** v0 = one stdio server per plugin (clean isolation, matches the contract). Revisit only if process count becomes a problem.
- **Plugin discovery:** explicit enable-list in `config.toml` (recommended, auditable) vs. auto-discover every folder in `plugins/`. (Recommend explicit — you choose what's live.)
- **Meal-plan authoring:** seed via script/SQL for v0, build conversational plan-editing into the skill later? (Recommend seed-via-script for v0.)

---

*Next: on approval, I'll build M0 — the harness skeleton with the plugin contract and the Slack echo — so you can verify the round-trip on your phone and see the core/plugin seam before any domain logic lands.*
