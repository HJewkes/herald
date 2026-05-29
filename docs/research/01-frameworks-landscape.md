# Self-Hosted Personal-Assistant Harness Landscape (2026)

**Research slice:** The full personal-assistant *harness/framework* landscape — OpenClaw itself, Hermes, and the direct comparables — to inform hjewkes' self-hosted, always-on personal AI assistant deployment.

**Date:** 2026-05-28
**Method:** `deep-research` workflow — fan-out WebSearch across angles, fetch primary sources (GitHub repos, official docs, vendor/independent write-ups), adversarially cross-check load-bearing claims. Confidence levels are flagged throughout. Items I could not confirm against a primary source are marked **UNVERIFIED**.

> **Correction note (important for the reader):** An earlier draft of this file concluded that "OpenClaw" and "Hermes" did *not* exist as AI projects. **That was wrong.** Deeper searching with primary-source fetches shows both are real, recently-launched (late-2025 / early-2026) self-hosted AI-assistant projects. This version supersedes that draft. The disambiguation against the *Captain Claw* game and the *Nous Hermes LLM* still matters and is handled below.

---

## Identity findings: what OpenClaw and Hermes actually are

### OpenClaw — **a real, explosively-popular self-hosted personal-AI-agent gateway — with a serious 2026 security record** (Confidence: HIGH)

OpenClaw (`github.com/openclaw/openclaw`, docs at `docs.openclaw.ai`) is a **free, open-source (MIT), self-hosted personal AI agent / multi-channel gateway**, created by Austrian developer **Peter Steinberger** (founder of PSPDFKit). Tagline: *"Your own personal AI assistant. Any OS. Any Platform. The lobster way. 🦞"* It connects 24+ messaging channels to an LLM-backed agent with tools, memory, and scheduling.

- **License + stack (HIGH, verified):** **MIT license; TypeScript on Node.js** (requires Node 24 recommended / Node 22.19+ LTS; pnpm runs TS via tsx; Bun is an *optional/experimental* local runtime, **not** recommended for the production gateway due to WhatsApp/Telegram issues). Install via `curl … openclaw.ai/install.sh | bash` or Docker Compose (`node:22-bookworm` base image). Persists config/workspace via Docker volumes/bind-mounts. Lightweight, but Playwright/Chromium browser automation wants 4GB+ RAM.
- **Origin / naming (HIGH):** Weekend experiment **"Clawdbot"** (Nov 2025) by Steinberger → renamed **"OpenClaw"** late **January 2026** after a trademark dispute. **"Molty"/"Moltbot"** were genuine earlier names (the original "space lobster" assistant persona), confirmed across sources.
- **Traction (HIGH — and staggering):** Hit **100,000 GitHub stars within ~1 week to ~1 month** (sources disagree on the exact window; peak ~710 stars/hour on Jan 30, 2026), **surpassed React to become GitHub's most-starred software project (~250k) around March 3, 2026**, and is reported at **~373k stars** as of the May 2026 fetch. Hundreds of contributors. This is one of the fastest-growing repos in GitHub history — but note that *star velocity ≠ production maturity*.
- **Channels (HIGH):** Standout multi-channel inbox — Slack, Discord, Telegram, WhatsApp, Signal, iMessage, Google Chat, Microsoft Teams, Matrix, Feishu, LINE, Mattermost, Nextcloud Talk, Nostr, Synology Chat, Tlon, Twitch, Zalo, WeChat, QQ, IRC, plus WebChat and native macOS/iOS/Android. (24+ platforms; "50+" claimed by some sources.)
- **Voice (HIGH):** Wake-word + Talk Mode on macOS/iOS, continuous voice on Android; ElevenLabs + system-TTS fallback.
- **Architecture (HIGH):** Hub-and-spoke **Gateway process** = single source of truth for sessions, routing, channels. **Multi-agent routing** with isolated sessions/workspaces per agent/sender. A notable **"heartbeat" architecture**: the agent periodically wakes itself, reviews context, reflects, and decides whether to act — i.e., genuinely *proactive*, not just reactive. **Memory is stored as simple local Markdown files** (personality, rules, memory, daily journals) the agent summarizes/updates over time — plus session tools. Built-in **cron + webhooks + Gmail Pub/Sub** for scheduling. First-class tools: browser, canvas, nodes, cron, sessions, channel actions.
- **MCP (HIGH):** Documented MCP support (`docs.openclaw.ai/cli/mcp`), an MCP Registry, and ACP-agent interop. Skills come from the **ClawHub / "AgentSkills"** registry (13,700+ community skills — both an asset and, see below, a liability).
- **Providers (HIGH):** Model-agnostic — Claude, GPT, DeepSeek, **Llama via Ollama**, and others, with failover. Cloud API keys or fully-local inference.
- **🚨 Security record (HIGH — the single most important finding for this deployment):** OpenClaw triggered **"the first major AI-agent security crisis of 2026."** Documented, cross-confirmed across IBM X-Force, Cisco, Barracuda, The Hacker News, and multiple arXiv papers:
  - **CVE-2026-25253** — a **critical RCE**; reportedly **nine CVEs in four days** in March 2026, one scoring **CVSS 9.9**.
  - **"ClawJacked"** (Oasis Security) — malicious websites could brute-force/hijack locally-running instances and silently exfiltrate data via the agent's autonomy.
  - **Supply-chain poisoning of ClawHub** — audits found **~341 malicious skills in ~2,857 scanned (~12% malware rate)**; some skills actively `curl`-exfiltrated data.
  - **~245,000–258,000 publicly-reachable instances** exposed on the internet; an adversarial test suite reported only **~17% average defense rate** against sandbox-escape attacks.
  - Structural issues: indirect prompt injection, memory poisoning, intent drift, broad default permissions, frequent updates that break running instances. *Prompt injection has no foolproof fix today — it must be governed, not patched.*

**Disambiguation (HIGH):** Do **not** confuse with **`pjasicek/OpenClaw`** — an unrelated C++/SDL2 reimplementation of the 1997 *Captain Claw* platformer. Different project entirely.

**Bottom line:** OpenClaw is the *exact category* hjewkes is building in, with a near-1:1 feature overlap to the design doc (channels, cron, Markdown memory, MCP, multi-agent routing, provider-flexible, voice, proactive heartbeat). It is the most likely intended *adoption target* — **but its security track record makes "deploy naively" a non-starter.** Adopting it demands aggressive hardening: user allowlisting, Docker `no-new-privileges`/read-only FS, no public port exposure, sandboxed tools, and *zero* unvetted ClawHub skills.

### Hermes — **Hermes Agent, a real self-hosted, self-improving agent by Nous Research** (Confidence: HIGH it exists; MEDIUM on maturity/specifics)

The relevant "Hermes" is **Hermes Agent** (`github.com/NousResearch/hermes-agent`, site `hermes-agent.org`), released by **Nous Research around February 2026**, tagline *"The agent that grows with you."* This is **distinct from**:
- **Nous Hermes the LLM** (Hermes 2/3 fine-tunes) — those are *models*; Hermes Agent is the *harness* (though it can use Nous Portal models).
- **Meta/Facebook Hermes** — a JavaScript engine for React Native. Irrelevant.

Hermes Agent specifics (verified against GitHub + official site, HIGH unless noted):
- **What it is:** A self-hosted, **self-improving** AI agent — "the only agent with a built-in learning loop." Server-based and persistent (explicitly *not* an IDE coding copilot); remembers projects, auto-builds reusable skills, reaches you across messaging platforms from a single gateway.
- **License / stack (HIGH):** **MIT license; Python (~89%)**, Python 3.11, `uv`-based install script (no sudo). State in a **local SQLite DB**. Latest release **v0.15.1 (May 29, 2026)**; ~15 releases.
- **Traction (HIGH):** **~140,000–172,000 GitHub stars and ~1,000 contributors in ~90 days** from a Feb 2026 launch — and at least one outlet reports Hermes **overtook OpenClaw as the most-used open-source AI agent (May 2026)**. Comparable explosive growth, much shorter track record.
- **Channels (HIGH):** Telegram, Discord, Slack, WhatsApp, Signal, **Email**, CLI — single gateway; voice-memo transcription; cross-platform conversation continuity.
- **Memory + learning loop (HIGH — the differentiator):** Agent-curated persistent memory with periodic self-nudges, **FTS5 session search + LLM summarization**, and **Honcho "dialectic" user modeling** for cross-session recall. After any task with **≥5 tool calls**, a reflection step generates a reusable skill file; an autonomous background **Curator grades/rewrites/prunes** skills weekly. Skills follow the **agentskills.io open standard** (searchable/shareable).
- **Providers (HIGH):** Very provider-flexible — **200–300+ models** via Nous Portal (OAuth), OpenRouter, NovitaAI, NVIDIA NIM, Hugging Face, OpenAI, Anthropic, Kimi/Moonshot, MiniMax, z.ai/GLM, local **vLLM**, or any OpenAI-compatible endpoint. Switch with `hermes model` — no code changes.
- **Scheduling (HIGH):** **Built-in cron scheduler with delivery to any platform** (daily reports, nightly backups, weekly audits); webhook direct-delivery for zero-LLM alerts.
- **Deployment backends (HIGH):** 6 terminal backends — **local, Docker, SSH, Daytona, Singularity, Modal** — with container hardening + namespace isolation; Modal/Daytona give serverless persistence w/ idle hibernation.
- **MCP (HIGH):** Integrated MCP support for external tools (e.g. GitHub MCP via Composio); shell hooks for lifecycle without writing Python plugins.
- **Security (MEDIUM):** **Zero reported agent-specific CVEs as of April 2026** — but it launched in Feb 2026, so *less exposure time ≠ inherently safer*. Its hardened/namespace-isolated backends and lack of a public skills-marketplace malware crisis make it look more conservative than OpenClaw so far.

**Bottom line:** Hermes Agent is the **closest philosophical sibling to OpenClaw and to hjewkes' design** — same always-on/multi-channel/self-hosted/memory-bearing category, but **Python/SQLite with a marquee self-improving skill-learning loop, broader provider routing, hardened sandbox backends, and (so far) a cleaner security record.** Newer and less battle-tested. Independent comparisons converge on: **OpenClaw = gateway-first (breadth of integration); Hermes = agent-first (depth of learning)** — and a growing cohort runs *both* (OpenClaw for orchestration/channels, Hermes for execution/learning).

---

## Comparison table

Stars/licenses are as of May 2026 searches; star counts are approximate and time-sensitive. ✓ = supported, ~ = partial/via-plugin, ✗ = not really, ? = UNVERIFIED.

| Project | What it is | License | Stack | Channels (Slack/voice/web/CLI) | Scheduling | Memory | MCP | Provider-flex | Self-host fit | Maturity |
|---|---|---|---|---|---|---|---|---|---|---|
| **OpenClaw** | Self-hosted multi-channel personal AI agent gateway | **MIT** | **TypeScript/Node 22+** | **All four ✓** (24+ chat channels, wake-word voice, WebChat/Canvas, CLI) | ✓ cron+webhooks+Gmail Pub/Sub | ✓ persistent (Markdown files) | ✓ (+ACP, MCP Registry) | ✓ Claude/GPT/DeepSeek/Ollama | High (VPS/desktop/Docker) **but major CVEs** | **~250k–373k★**, launched Nov 2025, very active; **2026 security crisis** |
| **Hermes Agent** | Self-hosted self-improving multi-channel agent | **MIT** | **Python 3.11 + SQLite** | Slack/Telegram/Discord/WA/Signal/Email + CLI; voice memo in | ✓ built-in cron→any platform | ✓ + **skill-learning Curator + Honcho user model** | ✓ | ✓✓ 300+ via OpenRouter/Nous/NIM/vLLM | High (local/Docker/SSH/Modal/Daytona/Singularity) | **~140k–172k★**, launched Feb 2026, v0.15.1; 0 known CVEs (but young) |
| **Claude Agent SDK** | Anthropic's official harness-as-a-library (powers Claude Code) | MIT | Python / TS | CLI/headless; you build rest | You build | Sessions + CLAUDE.md | ✓ first-class | Claude (API/Bedrock/Vertex) | High (logic local; inference via API) | Official, very active |
| **OpenAI Agents SDK** | Lightweight multi-agent SDK (Swarm successor) | MIT | Python / TS | You build | You build | Sessions (auto history) | ✓ | ✓ 100+ via LiteLLM | High | Active since Mar 2025 |
| **OpenHands** (ex-OpenDevin) | Autonomous software-dev agent platform | MIT (core) | Python+TS, Docker runtime | Web, CLI, headless | ~ triggers | Event-sourced state | ✓ | ✓ LiteLLM | High (Docker sandbox) | **~75k★, v1.7.0 (May 2026)**, very active |
| **Letta** (ex-MemGPT) | Stateful agents w/ hierarchical long-term memory | Apache 2.0 | Python (99.5%) +TS SDK | REST API; ADE UI; Letta Code CLI | ~ (Letta Code channels/schedules) | **Core/archival/recall, self-editing** | ✓ | ✓ model-agnostic (OpenAI/Anthropic/Ollama/vLLM) | High (Docker+Postgres server) | **~22–23k★, v0.16.8 (May 2026)**, active, VC-backed |
| **Khoj** | Self-hosted "second brain" personal assistant | AGPL-3.0 | Python + multi-client | Web/Obsidian/Emacs/Desktop/WhatsApp; voice in/out | ✓ built-in automations | Doc index + vector | ? | ✓ incl. offline Ollama | High | ~30k★, active |
| **LibreChat** | Self-hosted ChatGPT-style UI + agents | MIT | TypeScript+React, MongoDB | Web + STT/TTS voice (OpenAI/Azure/ElevenLabs) | ✗ native | Conversations + RAG | ✓ | ✓ 30+ (OpenAI/Anthropic/Bedrock/Vertex/OpenRouter/Ollama) | High (Docker) | **~37.6k★**, very active |
| **Open WebUI** | Most popular self-hosted LLM web UI | **Custom (branding clause, non-OSI)** | Python+Svelte | Web, voice/video call | ~ via pipelines | RAG/knowledge | ✓ native + mcpo | ✓ Ollama + OpenAI-compat | Very high (local-first) | **~90k★+**, very active |
| **Home Assistant + Assist** | Home-automation OS w/ LLM voice pipeline | Apache 2.0 | Python | **Voice ✓** (local Whisper/Piper), web | ✓✓ powerful triggers | Entity state (not chat) | ✓ server+client (2025) | ✓ OpenAI/Google/Anthropic/Ollama | Very high (Pi/NUC/Docker) | Very active |
| **n8n** | Workflow automation ("agentic glue") | **Sustainable Use (fair-code, source-available)** | TypeScript | 400+ incl. Slack/TG/Discord/email | ✓✓ cron+events | Vector nodes | ✓ nodes | ✓ many incl. Ollama | High (Docker) | **~181k★**, very active |
| **Activepieces** | Workflow automation, more permissive | **MIT** | TypeScript | Many (Slack/Discord/…) | ✓✓ cron+triggers | Via pieces | **✓✓ auto-exposes 400+ pieces as MCP** | ✓ many LLM pieces | High (Docker) | Active, smaller |
| **Leon** | Privacy-first voice/text personal assistant | MIT | Node/TS + Python | Voice + text + CLI | ~ | Skill-based | ? | Moving to local LLMs | High (offline-first) | **~17k★ but uneven dev** (2.0 dev-preview) |
| **AutoGPT (Platform)** | Low-code continuous-agent builder | **Polyform Shield (platform) + MIT (rest)** | Python+TS | Web builder | ✓ scheduled/triggered | Block-based | ? | ✓ multi | Medium (Docker, heavy) | **~183k★** but reliability concerns |

---

## Per-project notes & takeaways

### OpenClaw — the closest existing match to "OpenClaw the design doc," but a hardening project
*(Sources: github.com/openclaw/openclaw (MIT, TS/Node, ~373k★ at fetch); docs.openclaw.ai; DigitalOcean/Milvus/LaoZhang/Simon Willison guides; IBM X-Force, Cisco, Barracuda, The Hacker News, arXiv security papers.)*
Created by Peter Steinberger; "Molty/Clawdbot" (Nov 2025) → "OpenClaw" (Jan 2026). **MIT, TypeScript/Node 22+**, Docker Compose deploy. Gateway hub-and-spoke with multi-agent routing, **proactive "heartbeat"** loop, **Markdown-file memory**, built-in cron/webhooks, 24+ channels, wake-word voice, MCP + ACP + ClawHub skills, model-agnostic (incl. Ollama). Reached GitHub's #1 most-starred project (~250k+) in ~60 days.
**Takeaways:** (1) **"Build OpenClaw" most likely means "deploy and harden upstream OpenClaw"** — it already implements nearly the entire design-doc feature set, and re-creating its channel breadth + cron + Canvas + skill ecosystem would cost months. (2) **Security is THE gating concern, not a footnote:** CVE-2026-25253 RCE, nine CVEs in four days (one CVSS 9.9), ClawJacked browser-driven hijack, ~12% malware rate in ClawHub skills, ~245k exposed instances, ~17% defense rate vs sandbox escape. hjewkes' WS-07 (permission tiers, audit logging) and WS-01 (network security) workstreams are *mandatory*, not optional. (3) Concrete hardening to require from day one: pin a known-good version (frequent updates break instances), **never expose ports publicly** (Tailscale-only, matching the user's network-security plan), Docker `no-new-privileges` + read-only FS, strict per-channel user allowlists, **install zero unvetted ClawHub skills**, and sandbox all exec/browser tools. (4) The **Markdown-file memory** model is simple and auditable — a nice fit for "reproducible-as-code," though weaker than Letta's structured tiered memory for long-horizon recall.

### Hermes Agent — the self-improving-memory sibling; a strong alternative or co-runtime
*(Sources: github.com/NousResearch/hermes-agent (MIT, Python, v0.15.1 May 2026, ~172k★); hermes-agent.nousresearch.com; Unsloth/Composio integration docs; The New Stack & multiple head-to-head comparisons.)*
Nous Research, Feb 2026. **MIT, Python 3.11 + SQLite**, `uv` install. Channels: TG/Discord/Slack/WhatsApp/Signal/Email/CLI + voice-memo. **Differentiators:** autonomous skill-learning **Curator** (writes a skill file after ≥5-tool-call tasks; grades/prunes weekly; agentskills.io standard), **Honcho dialectic user modeling** + FTS5 session search, built-in cron→any-platform delivery, 300+ models via OpenRouter/Nous/NIM/vLLM (`hermes model`, no code change), 6 hardened deploy backends. **Zero known CVEs as of Apr 2026** (but only ~3 months old).
**Takeaways:** (1) **Borrow the Curator + Honcho patterns** — auto-writing/pruning reusable skill docs and a structured cross-session user model are exactly the "persistent memory/skills that improve over time" the design implies, and they're cleanly portable. (2) Its **provider-routing layer** (OpenRouter + local vLLM, no code change) is a ready-made answer to "provider-flexible, local fallback." (3) **Consider it a serious alternative *or* co-runtime, not just a reference:** independent comparisons frame OpenClaw = gateway/orchestration, Hermes = execution/learning, and many users run both sharing memory via MCP. Given OpenClaw's security crisis, Hermes' younger-but-cleaner record + hardened/namespace-isolated backends may make it the *safer* primary brain for a least-privilege deployment — at the cost of a shorter track record and fewer channels.

### Claude Agent SDK — the most direct *foundation* if building rather than adopting
*(Sources: code.claude.com/docs/agent-sdk; github.com/anthropics/claude-agent-sdk-python.)*
MIT; Python & TS; the same harness powering Claude Code, exposed as a library: agent loop, **subagents** (isolated context), **lifecycle hooks** (PreToolUse/PostToolUse/SessionStart/…), **session resume/fork**, fine-grained **permission system** (allow/deny/ask + modes), auto context-compaction, 14+ built-in tools, **first-class MCP**. Inference via Anthropic API/Bedrock/Vertex; harness runs locally. Note: Anthropic's *unreleased* "Chyros"/"KAIROS" daemon codenames hint at a future always-on mode, but **those have not shipped** — don't design around them.
**Takeaways:** (1) If you build custom, this is the core to use — hooks + permission modes directly satisfy "scoped/auditable, incremental trust read-only→write." (2) Weak spot for "local fallback": inference is Claude-centric, so front it with **LiteLLM**. (3) Best paired with Claude Managed Agents' **self-hosted sandboxes** if you want Anthropic-side orchestration but local tool execution.

### OpenAI Agents SDK — provider-neutral alternative core with best tracing
*(Sources: openai.github.io/openai-agents-python; github.com/openai/openai-agents-python.)*
MIT; Python+JS/TS; Swarm successor (Mar 2025). Primitives: agents, **handoffs**, **guardrails** (input/output/tool-level), **sessions**, **built-in tracing dashboard**; MCP; 100+ models via LiteLLM.
**Takeaways:** (1) Best-in-class **observability/tracing** — strong for the "observable/auditable" principle. (2) More provider-neutral than the Claude SDK → better if local fallback is a hard requirement. (3) Lighter abstraction = you build more of the assistant product.

### OpenHands — sandboxed-autonomy reference (verified ~75k★, v1.7.0 May 2026)
*(Source: github.com/OpenHands/OpenHands, fetched.)* MIT core; Python+TS; event-sourced state with deterministic replay, **opt-in Docker sandboxing**, typed tools + MCP, LiteLLM providers, web/CLI/headless; V1 refactored into a modular SDK.
**Takeaways:** (1) Borrow its **sandboxed-runtime + event-sourced log** patterns for any tool that executes code/commands — directly serves least-privilege and auditability. (2) Heavier than needed for a general assistant; use as a *capability module* (code execution) invoked by the main harness. (3) Its V1 SDK is itself a clean composition reference.

### Letta (ex-MemGPT) — the memory layer to borrow
*(Sources: github.com/letta-ai/letta (Apache-2.0, Python 99.5%, ~22–23k★, v0.16.8 May 2026); docs.letta.com.)* From UC Berkeley's MemGPT. **Hierarchical self-editing memory**: in-context **core memory** (RAM-like) vs external **archival** (vector, queried via tool) vs **recall** (conversation history). Runs as a REST server (`letta server`, or Docker with Postgres on :8283) with the ADE visual UI; model-agnostic; MCP support; also ships a "Letta Code" memory-first CLI with channels/schedules. The **Agent File (.af)** format lets you serialize/version stateful agents across frameworks.
**Takeaways:** (1) **Adopt Letta (or its tiered-memory design) as the persistent-memory subsystem** — the most mature OSS answer to "persistent memory." (2) Apache-2.0 + self-hostable server fits own-the-stack. (3) Expose it as an MCP memory service that OpenClaw/Hermes/Claude-SDK all call.

### Khoj — closest existing "second-brain product"
*(Source: github.com/khoj-ai/khoj.)* AGPL-3.0; Python; ~30k★. Doc indexing (md/pdf/org/Notion/docx), chat-with-docs + web, multi-client (web/Obsidian/Emacs/Desktop/WhatsApp), voice in/out, **built-in scheduled automations / deep research**, custom agents, provider-flexible incl. offline Ollama.
**Takeaways:** (1) Its **automations/scheduled-research** is a working model for proactive briefings. (2) **AGPL-3.0 caveat** — fine for personal self-hosting, but viral copyleft if you expose modified code as a network service; don't fork its code into a differently-licensed project. (3) Strong reference for document-grounded memory + multi-client design.

### LibreChat — polished multi-provider web channel
*(Source: github.com/danny-avila/LibreChat (MIT, TypeScript 76.9%, ~37.6k★, very active).)* 30+ providers (OpenAI/Anthropic/Google Vertex/Bedrock/OpenRouter/Ollama/…), **native MCP**, **Agents** feature (no-code custom assistants, marketplace, skills, subagents) + code interpreter, RAG, web search, **STT/TTS voice** (OpenAI/Azure/ElevenLabs), secure multi-user auth (social/LDAP).
**Takeaways:** (1) **Use it as the web channel** rather than building a chat UI; MIT + multi-user auth suits a household. (2) Native MCP + its own Agents/subagents make it a clean front-end for your MCP tool fleet. (3) No native cron — pair with n8n/Activepieces/Home Assistant for scheduling.

### Open WebUI — best local-first UI, but watch the license
*(Source: github.com/open-webui/open-webui.)* ~90k★+; Python+Svelte. Deepest Ollama integration, Pipelines/Functions/Tools, **native MCP (Streamable HTTP) + mcpo proxy**, RAG, voice/video call, RBAC.
**Takeaways:** (1) Best for the "local models" principle. (2) **License changed (Apr 2025) to a custom non-OSI "Open WebUI License" with a mandatory-branding clause** (can't remove branding at 50+ users without a commercial license) — fine for a home lab, but it constrains rebranding into "OpenClaw." (3) Prefer LibreChat (MIT) if license purity matters; prefer Open WebUI if Ollama UX matters most.

### Home Assistant + Assist — the voice / event-trigger / home layer
*(Sources: home-assistant.io/integrations/ollama; HA Voice Chapter 10.)* Apache 2.0; Python. **Assist** voice pipeline (local Whisper STT + Piper TTS, streaming since June 2025), LLM conversation agents (OpenAI/Google/Anthropic/Ollama) that call HA services as tools, a **powerful automation/trigger engine**, and **MCP server + client (2025)**. Two-tier routing (fast intent match → LLM fallback).
**Takeaways:** (1) **Best answer for the voice channel + event triggers**; local STT/TTS satisfies privacy/own-the-stack. (2) Expose your assistant to HA via MCP so voice and home events invoke it. (3) Not a coding-agent harness — use as the ambient/voice/trigger front-end, not the brain.

### n8n & Activepieces — scheduling + integration glue
*(Sources: github.com/n8n-io/n8n ~181k★; activepieces vs n8n comparisons.)*
- **n8n**: Sustainable-Use (fair-code, source-available, **not OSI**); TS; cron+event triggers, AI Agent node + LangChain, vector stores, 400+ integrations, MCP nodes, Ollama. Largest community/template library.
- **Activepieces**: **MIT** (more permissive); TS; **auto-exposes its 400+ pieces as MCP tools** (killer feature for agents); cron+triggers; smaller community.
**Takeaways:** (1) Use one as the **scheduler + channel-fan-out** layer instead of hand-rolling cron + Slack/email plumbing. (2) **License steer:** Activepieces (MIT) for own-the-stack purity + its MCP auto-exposure; n8n if you want the biggest ecosystem and can accept fair-code. (3) Webhook triggers are the cleanest way to wire external "event triggers" into the agent.

### AutoGPT (Platform) — caution
*(Source: github.com/Significant-Gravitas/AutoGPT ~183k★.)* Pivoted from the unreliable 2023 CLI to a low-code DAG/block builder with **scheduled/triggered continuous agents** + marketplace. **autogpt_platform/ is Polyform Shield (source-available); rest MIT.**
**Takeaways:** (1) Scheduled-continuous-agent model is conceptually relevant, but (2) source-available license + operational heft make it a **poor base to own**; (3) inspiration only.

### Leon, Open Interpreter, OVOS/Neon/Rhasspy, Fabric — situational
- **Leon** (MIT, ~17k★, last updated May 2026 but **uneven dev**, 2.0 dev-preview): privacy-first voice/text assistant; not recommended as a 2026 base due to inconsistent shipping and older NLU.
- **Open Interpreter** (MIT): NL→local code execution; useful as a local code-exec tool, overlapping with OpenHands / the Claude SDK bash tool.
- **OVOS/Neon (ex-Mycroft) / Rhasspy**: solid **offline voice** stacks; consider only for a non-HA voice path.
- **Fabric** (MIT, ~42k★, verified): a **prompt/"Patterns" CLI**, *not* an agent harness — useful only as a curated prompt library.

---

## Recommendations for hjewkes' deployment

1. **Re-frame the build/adopt decision around the real OpenClaw — and lead with security.** OpenClaw is a real, MIT/TypeScript, ~250k–373k-star project that already implements nearly your entire spec (24+ channels, voice, cron, Markdown memory, MCP, Claude/GPT/Ollama, proactive heartbeat). **But it is the subject of 2026's first major AI-agent security crisis** (RCE CVEs, ClawHub supply-chain malware, ClawJacked, ~245k exposed instances). So decide deliberately among: (a) **deploy + aggressively harden** a pinned OpenClaw version (Tailscale-only, no public ports, Docker `no-new-privileges`/read-only FS, strict allowlists, zero unvetted skills, sandboxed tools — i.e., execute WS-01 + WS-07 *before* exposing it); (b) build a custom harness on the Claude Agent SDK; or (c) **run Hermes Agent as the primary brain** (younger but cleaner security record, hardened backends). Given your own-the-stack/least-privilege/auditable principles, a hybrid is attractive: **OpenClaw or Hermes as the channel+voice+cron gateway, with a brain + memory + exec layer you control and audit.** Do *not* run any of these on a publicly-reachable port.

2. **Strongly consider Hermes Agent as an equal (or safer-default) candidate, and mine it regardless.** Independent comparisons frame OpenClaw = gateway-first, Hermes = agent-first/learning; many users run both (OpenClaw for orchestration/channels, Hermes for execution/learning, sharing memory via MCP). Even if you pick OpenClaw, **port two Hermes patterns:** the self-improving **Curator** skill loop (auto-write/prune reusable skill docs after ≥5-tool-call tasks) and its **provider-routing layer** (OpenRouter + local vLLM, no code change) — both directly serve "persistent memory/skills" and "provider-flexible, local fallback." If security weighs heaviest, Hermes' namespace-isolated backends + zero-CVE record (caveat: only ~3 months old) make it the more conservative primary.

3. **Compose proven blocks rather than monolith:**
   - **Core agent loop (if building):** Claude Agent SDK (MIT) — hooks + permission modes for incremental trust; front with **LiteLLM** for local fallback. Use **OpenAI Agents SDK** instead if tracing/provider-neutrality is paramount.
   - **Memory:** Letta (Apache-2.0), exposed via MCP.
   - **Web channel:** LibreChat (MIT, native MCP) — preferred over Open WebUI to dodge the branding clause, unless deep Ollama UX matters.
   - **Voice + event triggers:** Home Assistant + Assist (local Whisper/Piper), bridged via MCP.
   - **Scheduler + Slack/email fan-out:** Activepieces (MIT, MCP auto-exposure) over n8n (fair-code).
   - **Sandboxed code execution:** borrow OpenHands' Docker-sandbox + event-sourced-log pattern as a capability module.

4. **Mind licenses for an own-the-stack project — and here the news is good for the two headliners.** **OpenClaw and Hermes Agent are both MIT** (verified) — safe to fork/embed — as are Claude SDK, OpenAI SDK, OpenHands, LibreChat, Activepieces; Letta and Home Assistant are Apache-2.0. **Caveats:** Khoj = AGPL-3.0 (viral if exposed as a service), Open WebUI = custom branding clause (non-OSI), n8n = fair-code, AutoGPT platform = Polyform Shield. Consume the restrictive ones only as standalone running services you don't modify.

5. **Map principles to mechanisms now, and treat agent autonomy + prompt injection as the top risk.** OpenClaw's crisis proves the category-level point: *prompt injection has no foolproof fix and must be governed, not patched.* Least-privilege/incremental-trust → Claude SDK permission modes + hooks + OpenHands-style/namespace sandboxing for exec tools, behind your WS-07 permission tiers; observable/auditable → OpenAI Agents SDK tracing or an OpenHands-style event log + your WS-07 audit logging; reproducible-as-code → Docker Compose with **pinned versions** stitching the stack; provider-flexible → LiteLLM/OpenRouter with Ollama/vLLM fallback (Hermes' `hermes model` is the reference). **Validate every channel and tool read-only before granting write/send scopes, vet every skill/MCP server before enabling it, and keep the gateway Tailscale-only** — a multi-channel autonomous agent is a prime prompt-injection and supply-chain target.

---

## Open questions / things to verify before committing
- **Current OpenClaw CVE/patch status** — confirm the specific version you deploy is past CVE-2026-25253 and the March 2026 CVE cluster; track its security advisories. This is the single most important pre-deployment check.
- **OpenClaw's true live star count** — sources range 100k → 373k across Feb–May 2026; the trajectory (fastest-growing repo, briefly #1 on GitHub) is the real signal, not the exact number.
- **Hermes Agent production maturity** — only ~3 months old; "zero CVEs" likely reflects limited exposure time, not proven hardening. Pilot before trusting with write/send scopes.
- **MCP depth in OpenClaw vs Hermes** — both advertise MCP; validate which servers/transports each actually supports for your specific tools (calendar/email/files) before committing.
- *(Resolved this pass: OpenClaw = MIT, TypeScript/Node; Hermes = MIT, Python; "Molty/Moltbot" were genuine OpenClaw predecessor names.)*

---

### Source list (primary where possible)
- OpenClaw (AI agent): https://github.com/openclaw/openclaw (MIT, TS/Node, ~373k★ at fetch) · https://docs.openclaw.ai/ · https://docs.openclaw.ai/cli/mcp · install/docker + bun docs · DigitalOcean: https://www.digitalocean.com/resources/articles/what-is-openclaw · Milvus: https://milvus.io/blog/openclaw-formerly-clawdbot-moltbot-explained-a-complete-guide-to-the-autonomous-ai-agent.md · Simon Willison TIL: https://til.simonwillison.net/llms/openclaw-docker · star-history: https://www.star-history.com/openclaw/openclaw/
- **OpenClaw security crisis:** IBM X-Force: https://www.ibm.com/think/x-force/what-openclaw-reveals-about-agentic-ai-security-risks · Cisco: https://blogs.cisco.com/ai/personal-ai-agents-like-openclaw-are-a-security-nightmare · The Hacker News (CVE-2026-25253): https://thehackernews.com/2026/03/openclaw-ai-agent-flaws-could-enable.html · Barracuda: https://blog.barracuda.com/2026/04/09/openclaw-security-risks-agentic-ai · arXiv security taxonomy: https://arxiv.org/pdf/2603.27517
- OpenClaw (game, disambiguation): https://github.com/pjasicek/OpenClaw
- Hermes Agent: https://github.com/NousResearch/hermes-agent (MIT, Python, v0.15.1 May 2026, ~172k★) · https://hermes-agent.nousresearch.com/ · https://hermes-agent.org/ · Composio MCP: https://composio.dev/toolkits/github/framework/hermes-agent · The New Stack (OpenClaw vs Hermes): https://thenewstack.io/persistent-ai-agents-compared/
- Claude Agent SDK: https://code.claude.com/docs/en/agent-sdk/overview · https://github.com/anthropics/claude-agent-sdk-python · hosting/daemon: https://code.claude.com/docs/en/agent-sdk/hosting
- OpenAI Agents SDK: https://github.com/openai/openai-agents-python · https://openai.github.io/openai-agents-python/
- OpenHands: https://github.com/OpenHands/OpenHands (fetched: MIT, ~75.2k★, v1.7.0 May 2026)
- Letta: https://github.com/letta-ai/letta (Apache-2.0, Python, ~22–23k★, v0.16.8 May 2026) · https://docs.letta.com/ · Agent File: https://github.com/letta-ai/agent-file
- Khoj: https://github.com/khoj-ai/khoj (AGPL-3.0)
- LibreChat: https://github.com/danny-avila/LibreChat (MIT, TS, ~37.6k★)
- Open WebUI: https://github.com/open-webui/open-webui (custom non-OSI license, ~90k★)
- Home Assistant: https://www.home-assistant.io/integrations/ollama/
- n8n: https://github.com/n8n-io/n8n (Sustainable Use, ~181k★)
- Activepieces: https://aicoolies.com/comparisons/activepieces-vs-n8n (MIT, MCP auto-exposure)
- AutoGPT: https://github.com/Significant-Gravitas/AutoGPT (Polyform Shield platform, ~183k★)
- Leon: https://github.com/leon-ai/leon (MIT, ~17k★)
- Fabric (not an agent framework): https://github.com/danielmiessler/fabric (fetched: MIT, ~41.9k★)

*Star counts and license states are as of May 2026 searches and shift over time; re-verify before committing architectural decisions. Items marked UNVERIFIED were not confirmed against a primary source in this pass.*
