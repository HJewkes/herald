# Decision Brief: Build vs. Deploy — and what to actually build

**Date:** 2026-05-28
**Inputs:** research reports 01–04 (frameworks, focused agents/MCP, building blocks, security) + hjewkes' clarified design.
**Status:** Recommendation. Updated 2026-05-28 with report 05 (iMessage bridge specifics).

---

## 0. The reframe (most important point)

The original `plans/` describe an **OpenClaw deployment** — a gateway-first, multi-channel, always-on, autonomous monolith. The clarified vision is a **different and much smaller thing**:

> A **thin iMessage interface** over a brain (a Claude session on the laptop), whose job is **nagging, data collection, and a portable interface to data** — while the real business logic lives in **separate, co-developed services** (diet plan engine, workout schedule, activity bank, email/calendar triage).

That distinction decides the build-vs-deploy question. Reports 01–04 evaluated the heavyweight *category*; against this narrower design, **most of that category is surface area you don't need and would have to defend.**

---

## 1. Verdict: hand-roll a thin bridge. Do **not** deploy OpenClaw.

| Reason | Detail (sourced from reports) |
|---|---|
| **Scope mismatch** | You need *one* channel (iMessage), *one* brain (your Claude session), a *scheduler*, and a set of *domain tools*. OpenClaw is 24+ channels, a ClawHub skill marketplace, multi-agent routing, a proactive heartbeat — ~95% unused surface, all of which still has to be hardened. (Report 01) |
| **Security** | OpenClaw is the subject of *2026's first major AI-agent security crisis*: RCE CVE-2026-25253, nine CVEs in four days (one CVSS 9.9), "ClawJacked" browser hijack, **~12% of ClawHub skills malicious**, ~245k exposed instances, ~17% defense rate vs sandbox escape. Deploying it means inheriting that whole attack surface for features you won't use. A ~300-line bridge you wrote has a surface you fully understand. (Reports 01, 04) |
| **iMessage isn't first-class anyway** | OpenClaw lists iMessage among many channels, but it's macOS-specific glue regardless — you'd still own that integration. No leverage gained. (Report 01) |
| **Your layering instinct is correct** | "Business logic lives in a separate layer" means the chat layer should be **dumb and thin** — a transport + scheduler + tool host, *not* an autonomous agent platform. OpenClaw is the opposite of that. |
| **Own-the-stack / reproducible** | A small bridge in a git repo is more genuinely "yours" than a pinned fork of a 373k-star monolith that breaks running instances on update. (Reports 01, 04 gotchas) |

**Honest cost of hand-rolling:** you own the maintenance; no community channel plugins; **iMessage automation is brittle** (AppleScript/`chat.db` access can break on macOS upgrades, needs Full Disk Access) and **ties you to an always-on, logged-in Mac** — you cannot run iMessage natively on the Proxmox box later without a Mac relay (e.g. BlueBubbles). If "always-on server" eventually matters more than iMessage's native feel, a Telegram/Slack bot is dramatically easier to run headless. Flagging this now because it's the one decision iMessage forces on you. (Report 05 will detail.)

---

## 2. What to borrow from the research instead of reinventing

You're hand-rolling the *harness*, not the *primitives*. Reuse these:

- **Skill format → SKILL.md folders** (report 03). Each domain behavior (diet coach, workout coach, kids planner, triage Q&A) is a `SKILL.md`: declarative Markdown + frontmatter + bundled scripts, git-versioned, progressively disclosed (~100 tokens until invoked), with `allowed-tools` for least privilege. This is exactly the format for "here's the meal plan and how to nag about it."
- **Tools/access → MCP, stdio, local** (report 03). Your `send_imessage`, `read_food_log`, `log_workout`, `read_triage_digest` are MCP tools over stdio. No network exposure. Enforce OAuth scoping only on the account-touching ones (Gmail/Calendar read).
- **Memory — split it deliberately** (report 03):
  - **Structured domain data** (food log, workout log, adherence, activity bank) → **plain SQLite tables**, *not* vector memory. This is the bulk of your data and it's relational, not "remember what I said."
  - **Conversational/semantic memory** ("user said they hate cilantro") → start with markdown/SQLite; add **Mem0** (Apache-2.0, runs local via Ollama) only if simple recall proves insufficient. Don't reach for a vector DB on day one.
- **Local-model fallback later** (report 03): Ollama → Qwen3-30B-A3B or gpt-oss-20b behind an OpenAI-compatible endpoint, via LiteLLM, gated by a privacy router. Slots in *after* v0; don't block on it.

---

## 3. Security, scaled to *this* design (report 04)

The coach use cases are **low-risk**: you're the only one texting, the data is yours, no untrusted content. The risk concentrates in two places:

1. **The Personal-Assistant triage use case.** The moment an agent *reads your email* and *can also act/exfiltrate*, you've assembled the **lethal trifecta** (private data + untrusted content + outbound channel) — the exact pattern behind EchoLeak, ShadowLeak, etc.
   **Your described split is already the correct fix:** keep triage as a **separate read-only service** (Gmail/Calendar read, scope-limited, *no send tools, no outbound channel in that context*) that writes a priority digest to SQLite/markdown. The chat interface only *reads the finished digest*. Affirmed — build it that way, don't let the chatting agent hold both inbox-read and send-anywhere in one context.
2. **iMessage is an injection surface.** Anyone who can text you can put text into the agent's context — and report 05 confirms **none of the existing bridges build in any defense**. Mitigations, in priority order: **hard-allowlist your own handle(s) in code *before the model ever sees the text*** (deterministic, not a prompt instruction); treat all inbound text as **untrusted data** for any tool-calling step; gate every side-effecting tool with a **deterministic PreToolUse hook** (recipient ∈ allowlist + rate-limit) via the Agent SDK; never auto-send anything consequential — draft-and-confirm only. Note Full Disk Access exposes your *entire* message history to the daemon, so scope the read tool tightly (don't hand the agent a `query_all_messages`).

Baseline regardless: secrets in **Keychain / SOPS+age**, not plaintext; an **audit log of every tool call**; egress allow-list once you containerize; Google OAuth app must be **"In production"/Internal**, not "Testing" (testing-mode refresh tokens **expire every 7 days** and silently kill an always-on box — report 04).

---

## 4. Recommended v0 architecture

```
                    ┌────────────────────────────────────────────┐
   iMessage  ──────▶│  BRIDGE DAEMON  (the thing you hand-roll)   │
   (you text it)    │                                            │
                    │  • watches chat.db for new msgs (inbound)   │
                    │  • holds the cron schedule                  │
   iMessage  ◀──────│  • on msg OR timer → drives a Claude session│
   (it texts you)   └───────────────┬────────────────────────────┘
                                     │ invokes (headless, per event)
                                     ▼
                          ┌──────────────────────┐
                          │   CLAUDE (the brain)  │  Claude Agent SDK
                          │  Agent SDK / headless │  → permission modes
                          └──────────┬───────────┘     + hooks (audit)
                                     │ calls MCP tools (stdio)
            ┌────────────────────────┼───────────────────────────┐
            ▼            ▼            ▼             ▼              ▼
     send_imessage   food_log     workout_log   activity_bank   read_triage_digest
        (reply)      (SQLite)     (SQLite)       (SQLite)        (read-only)
                                                                      ▲
                                                                      │ writes digest
                                              ┌───────────────────────┴────────────┐
                                              │  TRIAGE SERVICE (separate, read-only)│
                                              │  Gmail/Calendar read (scoped) → rank │
                                              │  NO send tools, NO outbound channel  │
                                              └──────────────────────────────────────┘
   Domain "business logic" = SKILL.md skills + scripts the agent calls. Brain stays thin.
```

**The key architectural call — who drives the loop:** MCP's normal flow is *agent-calls-server*; servers don't push events into a session. So inbound iMessages and scheduled nags need a **host daemon that owns the event loop + scheduler** and invokes a fresh Claude session per trigger, with MCP supplying the tools. (MCP *sampling*/*elicitation* can server-initiate LLM calls, but client support is thin and it inverts control awkwardly — not for v0. Report 05 confirms.)

So your phrasing maps cleanly: the **reply tool** is a clean MCP tool (outbound); the **inbound "channel"** is better modeled as the **daemon feeding the session**, not the agent being pushed to. Two trigger types:
- **Fixed message** ("12:00 — lunch reminder") → daemon sends a template *directly*, no LLM, ~free.
- **Dynamic** ("has lunch been logged? if not, nag with context") → daemon invokes the agent with a prompt + tool access.

**Concrete stack:**
| Layer | Choice | Why |
|---|---|---|
| Host | macOS laptop (your "Claude session on my laptop") | iMessage requires it; Full Disk Access for `chat.db` |
| Brain | **Claude Agent SDK** (TS or Python), headless per event | Permission modes + hooks give you incremental-trust + per-action audit for free (reports 01, 04) |
| Channel in | poll `~/Library/Messages/chat.db` on a `ROWID` high-water mark; **decode `attributedBody`** (the `text` column is now often NULL on modern macOS) | report 05; needs Full Disk Access |
| Channel out | `osascript`/AppleScript → Messages.app, wrapped as `send_imessage` tool — **behind a channel-agnostic adapter** | osascript send is the fragile part; the adapter makes osascript → BlueBubbles → Telegram a one-file swap (report 05) |
| Scheduler | launchd / cron / tiny scheduler in the daemon | fixed-send vs agent-trigger split |
| Domain data | **SQLite** tables | relational adherence/log data, not vectors |
| Domain behavior | **SKILL.md** skills + scripts | declarative, git-versioned, portable |
| Triage | separate read-only job → digest in SQLite | breaks the lethal trifecta by construction |

**Effort:** v0 (iMessage echo + one coach + a couple of scheduled nags) is a weekend, not OpenClaw's multi-week "day-2 wall" (report 01).

**Migration path:** the daemon + SQLite + SKILL.md + MCP servers all port to the Proxmox box later — *except* iMessage itself (needs a Mac or a BlueBubbles relay). The fix report 05 lands on: **build a channel-agnostic transport adapter now** (`receive() → events`, `send(handle, text)`), so the rest of the system never knows the channel. Then iMessage→BlueBubbles→Telegram is a one-adapter change, not a rewrite. Local-model fallback slots in behind the SDK later too.

**Existing code to reuse (report 05, verified):**
- **imessage-exporter** (Rust, GPL-3.0, 5.2k★, supports macOS Tahoe 26.5) — best-in-class `chat.db` reader + `attributedBody`/typedstream decoder. Study or shell out to it rather than hand-writing the decoder.
- **carterlasalle/mac_messages_mcp** (Python, MIT) — closest existing read+send MCP server; the right tool-shape reference. ⚠️ Like *all* the bridges reviewed, it has **no sender allowlist and no injection handling** — that's on you to add.
- **BlueBubbles Server** — robust REST send + inbound webhooks; the path that survives moving off the laptop.

---

## 5. Suggested next steps (your call)

1. **The channel tradeoff is now de-risked, not blocking.** Report 05's answer: **don't choose yet — abstract it.** Build the channel-agnostic adapter and start on iMessage (the native feel you want). The always-on-Mac constraint stays real (iMessage can't run on the Proxmox box without a Mac/BlueBubbles relay), but because the adapter isolates it, the eventual iMessage→Telegram decision costs one file, not a rewrite. The only thing to decide *now* is whether you accept "v0 runs on the laptop / a Mac mini" — which the design already assumes.
2. **Pick the first vertical** to prove the loop end-to-end — diet coach is the richest test (fixed reminders + dynamic "I'm at a restaurant" + adherence logging).
3. If you want, I can write a **v0 implementation plan**: the daemon (chat.db poller + scheduler + Agent SDK invocation + PreToolUse allowlist hook), the channel adapter, one MCP tool server, one SKILL, and one scheduled job — scoped to one vertical.

The original `plans/` aren't wasted: the security/network workstreams (Tailscale, secrets, audit, egress) still apply, and the brain/SQLite/skills are server-portable. What changes is dropping the OpenClaw monolith for a thin bridge you own.
