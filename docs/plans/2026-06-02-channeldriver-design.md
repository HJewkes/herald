# ChannelDriver Design (H-5 / S5 / M1)

**Date:** 2026-06-02
**Status:** Approved — offline build in progress (2026-06-02)

**Decisions locked (2026-06-02):** permissions = `--dangerously-skip-permissions` + PreToolUse deny hook (deferred); M1 hook = **audit-only** (allowlist-deny is a fast follow); loopback reply path = **SSE `/replies`** (Herald is a pure client). Building the Slack-independent steps (§9.1–§9.7) first; the live #diet leg stays blocked on H-11.
**Scope:** M1 — "Registry loads diet plugin; `ChannelDriver` wired to a persistent CC session; 'had eggs' → `log_meal` → confirm." Proves the plugin contract + the subscription-cheap driver end-to-end (MCP + skill + audit hook).
**Supersedes assumptions in:** `docs/research/06-sdk-surface-map.md` §"Channels & Event Push" (that report predates the current `claude/channel` reference and assumed a fixed Telegram/Discord/iMessage plugin set; the capability is now buildable as a plain Node stdio MCP server).

---

## 1. What changed since report 06

I re-read the live `claude/channel` docs (`/en/channels`, `/en/channels-reference`) on 2026-06-02. The mechanics that drive this design:

- **A channel is just a stdio MCP server** that declares `capabilities.experimental['claude/channel'] = {}`. Claude Code spawns it as a subprocess and registers a notification listener. **It does not have to be Bun** — any Node-compatible runtime + `@modelcontextprotocol/sdk` works. → Herald can build the channel server natively in TS, in `core/`.
- **Push** = `mcp.notification({ method: 'notifications/claude/channel', params: { content, meta } })`. The event lands in the open session as `<channel source="<server-name>" k="v" …>content</channel>`. `meta` keys become tag attributes (identifiers only — `[A-Za-z0-9_]`; hyphenated keys are silently dropped).
- **Reply** = a normal MCP tool the channel server exposes (`tools: {}` + a `reply` handler). Claude calls it; the handler does the actual outbound send. The terminal shows only "sent".
- **Two-way + permission relay** are opt-in capabilities (`claude/channel/permission`), relaying tool-approval prompts to the remote side. Requires CC ≥ 2.1.81.
- **Research-preview gating:** custom channels are *not* on the Anthropic allowlist, so they launch with **`--dangerously-load-development-channels server:<name>`**, require **CC ≥ 2.1.80**, and Anthropic auth (claude.ai/Max or Console key — **Max qualifies, stays on the subscription pool**). Not available on Bedrock/Vertex/Foundry.
- **Delivery semantics:** notifications are fire-and-forget (no ack); events queue and are delivered **in order**, batched on the next turn if Claude is busy; one session processes **one turn at a time**. Concurrency ⇒ separate sessions.

**Environment verified on this machine:** `claude 2.1.160` ✓, `node v25.1.0` → `node:sqlite` available ✓ (no `better-sqlite3` needed), `@slack/socket-mode` already a dep ✓. **`@modelcontextprotocol/sdk` is not yet a dependency — it's the one new package M1 needs** (for both the loopback channel server and the diet MCP server).

---

## 2. The central decision: where does Slack I/O live?

The `claude/channel` examples (webhook receiver, Telegram) put platform I/O *inside* the channel-server subprocess. That suggests an obvious-but-wrong shortcut for Herald.

### Rejected — Architecture A: "fat channel server" (channel server talks to Slack directly)

The CC-spawned channel server runs Slack Socket Mode itself, applies the sender allowlist, emits `<channel>` events, and its `reply` tool posts back to Slack. Herald's host process nearly disappears from the inbound path.

**Why rejected:** it quietly throws away everything S1–S3 built.
- Events flow Slack → channel-server → CC **directly**, never through `router.dispatch → driver.handle`. The `BrainDriver` seam evaporates — there's no Herald-side `handle()`, so **M6 (swap diet to `SdkDriver` with zero plugin edits) becomes impossible**. The whole "identical substrate, swappable driver" thesis (plan §5) dies.
- Sender allowlist + audit + routing would have to be re-implemented inside the channel subprocess instead of living once in Herald (violates plan §8: allowlist "in the transport/router… dropped before the model sees text").
- It doesn't generalize across plugins or channels — each would need its own Slack-aware channel server.

### Chosen — Architecture B: "thin loopback channel server" (Herald owns Slack; the channel is a local pipe into CC)

Herald keeps the parts it already has and already tests:

```
 Slack (#diet) ──Socket Mode──▶ SlackTransport.listen ──▶ withAllowlist ──▶ router.dispatch("diet", msg)
                                                                                      │
                                                                       ChannelDriver.handle(channel, event, plugin)
                                                                                      │ POST /event {content, meta}  (127.0.0.1)
                                                                                      ▼
                                            ┌──────────── loopback channel server (core/, stdio MCP, spawned by CC) ───────────┐
                                            │  experimental['claude/channel'] + reply tool                                      │
                                            │  POST /event ─▶ mcp.notification('notifications/claude/channel')                  │
                                            └───────────────────────────────────┬──────────────────────────────────────────────┘
                                                                                 │ <channel source="herald" channel="diet" chat_id="…">had eggs</channel>
                                                                                 ▼
                                                        ┌──────── persistent interactive Claude Code session ────────┐
                                                        │  + diet SKILL.md   + diet MCP server (log_meal→SQLite)       │
                                                        │  + PreToolUse hook (allowlist + audit)                       │
                                                        └───────────────────────────────┬──────────────────────────────┘
                                                          calls mcp__herald__reply(chat_id, text)  ── "Logged eggs ✅"
                                                                                         │  (reply tool handler) broadcast on GET /replies (SSE)
 Slack (#diet) ◀── SlackTransport.send ◀── ChannelDriver reply-pump (subscribes /replies, maps chat_id → channel/thread)
```

**Why B:** it is the *only* shape where `ChannelDriver` and `SdkDriver` are genuinely swappable behind `handle(channel, event, plugin)`; the sender allowlist + audit + routing stay in one Herald chokepoint; the existing `SlackTransport` (built + tested) is the sole Slack client; and it matches plan §5 ("the service exposes two faces of one thing: tool calls *and* an event-push channel"). The loopback server is **generic and Herald-owned** — it carries any plugin's events via `meta.channel`, so multiple plugins later share one server.

**The cost B accepts:** a localhost loopback between the Herald host process and the CC-spawned channel-server subprocess (they are different processes — CC spawns the channel server, not Herald), plus supervising the persistent CC session. Both are bounded; details in §4.

---

## 3. The loopback transport (Herald host ⇄ channel-server subprocess)

The channel server is the only HTTP listener (mirrors the documented webhook pattern; Herald stays a pure client). Two endpoints, **127.0.0.1 only**:

| Endpoint | Direction | Body | Effect |
|---|---|---|---|
| `POST /event` | Herald → CC | `{ content, channel, sender, chat_id }` | server emits `notifications/claude/channel` with `meta:{ channel, sender, chat_id }` |
| `GET /replies` (SSE) | CC → Herald | `data: {chat_id, text}` | the `reply` tool handler broadcasts each reply; Herald's reply-pump consumes |

- **Correlation:** Herald sets `meta.chat_id` per inbound event (= the Slack `thread_ts`, or the channel id for a top-level message). The skill instructs Claude to pass `chat_id` straight from the `<channel>` tag into `reply`. The reply-pump maps `chat_id → (slack channel id, thread_ts)` and calls `SlackTransport.send`.
- **Why SSE for replies, not a Herald-side inbound port:** keeps all listeners on the channel server; Herald already owns the Slack socket and shouldn't also bind an inbound HTTP port. (Alternative considered: `reply` POSTs to a Herald callback port — simpler correlation, one more surface. Open decision, §8.)
- Port is fixed in config (default `127.0.0.1:8799`); the channel server and the Herald host both read it.

### `handle()` is fire-and-forget; the reply-pump is separate

`ChannelDriver.handle()` POSTs the event to `/event` and returns. It does **not** await a reply. Replies arrive asynchronously (a turn may emit zero, one, or several `reply` calls, plus proactive sends), so a single long-lived **reply-pump** — started once when the driver is constructed — consumes `/replies` and routes each to `SlackTransport.send`. This fits the medium (channels are genuinely async/bidirectional) better than forcing `handle()` into one request/response.

> Symmetry note: `SdkDriver.handle()` *will* produce its reply inline (invoke → result → send). That asymmetry is fine — both still satisfy `handle(channel, event, plugin): Promise<void>` and both ultimately call `SlackTransport.send`. The contract holds; only the internal mechanism differs, which is the entire point of the seam.

`ChannelDriver` is a concrete class constructed in the `serve` wiring with `{ transport, loopbackPort, channelMap }`. The `BrainDriver` interface is unchanged.

---

## 4. The persistent CC session

Launched **once**, supervised, kept logged in. v0 = launchd (reuse `core/scheduler.ts`'s plist mechanism; systemd later on Proxmox).

Launch command (conceptually):
```
claude --dangerously-load-development-channels server:herald \
       --dangerously-skip-permissions \
       --mcp-config <session>/.mcp.json \      # loopback "herald" server + diet plugin's MCP server(s)
       # session cwd carries .claude/skills/diet/ and .claude/settings.json (audit+allowlist hook)
```

- **What configures the session = the resolved plugin(s).** At launch Herald assembles, from the registry: each plugin's `mcpServers` (→ `.mcp.json`), each plugin's `skillDir` (→ `.claude/skills/`), `systemPromptExtra`/`model`, and `allowedTools` (→ the PreToolUse hook). The loopback `herald` channel server is always added.
- **One session for v0** (diet only). Multi-plugin later: either one session loaded with every plugin's MCP+skill (CC routes by skill description; `meta.channel` disambiguates) or one session per channel (more isolation, more processes). Decide when the second plugin lands (§8).
- **Permissions (unattended):** v0 uses `--dangerously-skip-permissions`, **bounded by our own PreToolUse hook** which denies any tool not in `plugin.allowedTools`. PreToolUse hooks fire before permission checks and a deny (exit 2) still blocks even under skip-permissions — **this is the security net and must be verified empirically before relying on it** (§7). Permission *relay* to Slack (the `claude/channel/permission` capability, already supported at 2.1.81+) is a clean future upgrade, not v0.
- **Context growth / restart:** the session can be killed and relaunched anytime — all durable state is in SQLite, nothing is lost. Channel events are self-contained; `/compact` available. Supervisor restarts on crash.

---

## 5. The diet plugin (the M1 proof payload)

Minimal slice for M1 — just enough for "had eggs → logged → confirm". Lives entirely in `src/plugins/diet/`; imports only `core/contract`.

- **`register(): Plugin`** → `{ name:"diet", channels:["diet"], skillDir:"…/skill", mcpServers:[{ name:"diet", command:["node","…/mcp/server.js"] }], jobs:[], allowedTools:["mcp__diet__log_meal","mcp__herald__reply"] }`.
- **MCP server** (`mcp/server.js`, stdio, `@modelcontextprotocol/sdk`, `node:sqlite`):
  - `log_meal(meal, description, on_plan?) → { id }` — inserts into `food_log`.
  - (`get_today_plan`, `get_adherence`, `record_deviation` are M2–M4; **out of M1 scope**. Optionally a read-only `get_today_plan` stub for context — keep it cut unless cheap.)
- **SQLite** (`data/diet.sqlite`, gitignored): M1 needs only
  `food_log(id INTEGER PK, ts TEXT, meal TEXT, description TEXT, on_plan INTEGER)`.
  (`meal_plan`, `deviations` arrive with M2/M4.)
- **`skill/SKILL.md`** — `name: diet-coach`; `description` is the matcher; body: free-text → `log_meal`; supportive-accountability tone; **never invent macros**; reply via `mcp__herald__reply`, passing `chat_id` from the `<channel>` tag.
- **Outbound tool:** the channel path's `reply` *is* the core-provided send path — no separate `send_message` tool needed for M1. (A distinct proactive `send_message` can come later, mainly for the SdkDriver path.)

---

## 6. Allowlist + audit PreToolUse hook (unifies plan §8 + report 06 §1)

One CC-side hook, registered in the session's `.claude/settings.json` as `PreToolUse` matcher `"*"`, implemented as a Herald subcommand:

```
herald hook pretooluse   # reads the hook JSON on stdin
```
- **Audit (always on):** append `{ts, session, tool, input}` to `audit/tool-calls.log` (append-only, Herald-written).
- **Allowlist (deny):** if the tool is not in the active plugin's `allowedTools`, exit 2 with `permissionDecision:"deny"`. `Plugin.allowedTools` already exists in the contract — the hook just reads it. This is what bounds `--dangerously-skip-permissions`.
- **LOCKED: M1 = audit-only.** The hook appends every tool call to `audit/tool-calls.log` and always exits 0. **Allowlist-deny (exit 2 on tools outside `plugin.allowedTools`) is a fast follow**, not M1. Note the consequence: until allowlist-deny lands, `--dangerously-skip-permissions` is *unbounded* by our hook — so the persistent session must stay scoped by the launch flags (`--allowedTools` / a tight `.mcp.json`) and run only against the diet workspace in the interim.

---

## 7. Risks / must-verify-before-relying

1. **PreToolUse deny survives `--dangerously-skip-permissions`.** The whole safety story rests on this. Verify empirically (a hook that denies `Bash` while skip-permissions is on must still block) before trusting it. If it doesn't hold, fall back to permission relay or a tighter `--allowedTools` launch flag.
2. **Research-preview drift.** `--channels` flag/protocol "may change." The `BrainDriver` seam is the insurance (swap to `SdkDriver`). Pin/record the CC version that works.
3. **Reply correlation under batching.** If several events are delivered together on one turn, Claude may reply to them as a group. `chat_id`-per-event + skill instruction mitigates; verify with two rapid messages.
4. **Single-turn serialization.** One session = one turn at a time; fine at personal scale. Batchy/concurrent work graduates to `SdkDriver` (by design).
5. **`node:sqlite` is experimental** (emits a warning, API "might change"). Acceptable for a personal single-user DB; revisit if it churns.

---

## 8. Open decisions (please confirm before coding)

1. **Loopback reply path:** SSE `/replies` (Herald stays pure client) **[recommended]** vs. `reply` POSTs to a Herald callback port (simpler correlation, one more listener)?
2. **Permissions for v0:** `--dangerously-skip-permissions` + PreToolUse allowlist-deny **[recommended]** vs. wire permission relay to Slack now?
3. **M1 hook scope:** ship allowlist-deny + audit together **[recommended]** vs. audit-only first, allowlist-deny as a fast follow?
4. **`get_today_plan` in M1:** cut it (pure log_meal proof) **[recommended]** vs. include a read stub for richer context?
5. **`channelMap` config:** add `config.channelMap` (physical Slack id ↔ logical `"diet"`) — needed so the router can resolve the owning plugin. (M0 echo sidestepped this; M1 needs it.) Confirm shape.
6. **Sessions when a 2nd plugin lands:** one shared session vs. one-per-channel — defer to that milestone (noted, not blocking M1).

---

## 9. Proposed build order (each step independently testable)

Most of M1 is testable **without live Slack** — drive the loopback directly (curl `/event`, watch `/replies`), which only needs the `claude` binary + Max auth (present on this machine). Only the final Slack leg is blocked on **H-11** (tokens).

1. ✅ **Add `@modelcontextprotocol/sdk` dependency.** (also pinned `zod` as a direct dep.)
2. ✅ **Diet plugin** — `db.ts` (`node:sqlite`), `mcp/server.ts` (`log_meal`), `register.ts`, `skill/SKILL.md`. *Unit tests (db + register) green; spawn smoke confirmed `log_meal` writes `food_log`.*
3. ✅ **Loopback channel server** (`core/channel-server.ts`) — `claude/channel` cap + `reply` tool + `POST /event` + `GET /replies` SSE. *7 unit tests (pure helpers + HTTP listener over a real socket); built-artifact MCP+HTTP smoke round-trips event-in → notification, reply-tool → SSE-out.*
4. ✅ **`herald hook pretooluse`** — audit append (audit-only; allowlist-deny deferred). *Unit tests (`core/audit.ts`) + built-CLI stdin smoke: exit 0, correct JSON line.*
5. ✅ **ChannelDriver** (`drivers/channel.ts`) — `handle()` POSTs `/event`; `deliverReply`/`startReplyPump` route `/replies` SSE → `transport.send`. *Unit tests: POST shape, error path, chat_id round-trip, reply routing.*
6. ⬜ **Session launcher + supervisor** — assemble `.mcp.json`/`.claude/` from the registry, launch CC with the flags, keep alive (launchd). *Test: assert assembled config; smoke-launch manually.*
7. ⬜ **Wire `serve`** — `router.dispatch` replaces the M0 echo handler; `config.channelMap` resolves logical channel. *Integration test offline: curl an event → CC → `log_meal` writes SQLite → reply on `/replies`.*
8. ⬜ **Live (blocked on H-11):** swap the curl/SSE ends for `SlackTransport`; verify "had eggs → logged → confirm" in #diet on the phone.

**Status:** steps 1–5 done (2026-06-02), all gates green (typecheck/lint/build clean; tests 210 → 233). Steps 6–7 are the integration glue; 8 stays blocked on H-11. Step 7 needs the `config.channelMap` shape confirmed (open decision #5).

**Build infra touched:** added `src/core/channel-server.ts` + `src/plugins/diet/mcp/server.ts` as tsup entries (they ship as standalone files CC spawns); added the `^_` unused-var ignore to `eslint.config.js` (interface-required params recur across drivers/transports); gitignored `src/plugins/diet/data/`.
