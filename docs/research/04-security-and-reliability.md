# 04 — Security, Trust-and-Safety, and Reliability Architecture for OpenClaw

**Scope:** Architecture patterns and known failure modes for a self-hosted, always-on autonomous personal assistant (OpenClaw wrapping Claude Code / compatible agents) that *reads untrusted content* (email bodies, Slack messages, web pages, calendar invites) and *acts on real accounts* (Gmail, Google Calendar, Slack, files).

**Audience:** hjewkes' home-lab deployment. Maps every recommendation to OpenClaw's planned workstreams: `network-security`, `permission-escalation`, `docker-prep`, `accounts-credentials`, plus a `server-standup` stream.

**Method note / uncertainty flag:** This report was assembled by fan-out web search (multiple independent queries per theme) plus direct page fetches of the key primary sources (Simon Willison's lethal-trifecta post and the OWASP LLM01 page were fetched in full; the rest are grounded in cross-corroborated search results from the cited URLs). Incident facts (EchoLeak CVSS, ShadowLeak fix, CaMeL benchmark, Gemini calendar stats, Claude Code sandbox mechanics) were each confirmed across two or more independent reports. **Where a specific number is load-bearing for a decision, re-open the linked primary source.** A small number of items I could not fully pin down are flagged `[VERIFY]`.

---

## 0. Threat Model Summary

### What we are defending
An autonomous agent that holds **standing credentials** to your most sensitive accounts (inbox, calendar, chat, files) and runs **unattended** on triggers (schedule, message, voice). Unlike a chatbot, it has *tools* (send email, write calendar, run shell, fetch URLs) and it *ingests attacker-controlled text by design* — anyone who can email you or invite you to a calendar event can put text in front of your agent.

### The core insight: the "lethal trifecta"
Simon Willison's framing is the single most useful lens for this deployment. An agent is at risk of catastrophic data theft when it combines **all three** of:
1. **Access to private data** (your inbox, files, secrets),
2. **Exposure to untrusted content** (email/Slack/web/calendar text the attacker controls), and
3. **The ability to externally communicate / exfiltrate** (send email, post to web, fetch a URL with data in it).
Source: https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/

The key design move is therefore **break the trifecta**: never let a single agent context simultaneously hold private data, ingest untrusted content, *and* have an unconstrained outbound channel. Every real-world incident below is an instance of the trifecta closing.

### Adversaries
- **Remote, unauthenticated attacker** (primary): sends a crafted email/calendar-invite/Slack message containing an *indirect prompt injection*. Zero clicks from the user required.
- **Malicious/compromised web page** the agent fetches during a task.
- **Malicious or compromised MCP server / tool** in the agent's tool set (supply chain).
- **Insider error / the agent itself**: a benign-but-confused agent that loops, deletes, or over-sends ("excessive agency").

### Crown-jewel assets, ranked
1. OAuth refresh tokens for Google + Slack (compromise = full account takeover, survives restarts).
2. Anthropic / model-provider API keys (compromise = unbounded spend + impersonation).
3. Inbox + file contents (confidentiality).
4. The host itself (lateral movement into the home lab / VLANs).

### Top failure modes (each detailed below)
| # | Failure mode | Trifecta leg | Real-world precedent |
|---|---|---|---|
| F1 | Indirect prompt injection → data exfiltration | all three | EchoLeak, ShadowLeak, Slack AI, Gemini calendar |
| F2 | Excessive agency (over-broad tools/scopes) | private data + comms | OWASP LLM06 |
| F3 | Confused-deputy via malicious MCP/tool | all three | GitHub MCP |
| F4 | Credential theft / oversized blast radius | private data | generic |
| F5 | Runaway loop / cost blowout | reliability | generic agent ops |
| F6 | Silent/unauditable action | observability | generic |

---

## 1. Prompt Injection via Untrusted Content (THE dominant risk)

### 1.1 The concern
**Prompt injection** is the #1 risk in the OWASP Top 10 for LLM Applications (LLM01:2025). It occurs when attacker-controlled text reaching the model is interpreted as instructions. **Indirect** prompt injection — where the malicious instruction arrives inside *content the agent was asked to process* (an email body, a web page, a calendar description) — is the dangerous variant for an inbox-reading agent, because the user never typed or saw the payload.
- OWASP LLM01:2025 Prompt Injection: https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- OWASP Top 10 for LLM Applications 2025 (index): https://genai.owasp.org/llm-top-10/ and https://owasp.org/www-project-top-10-for-large-language-model-applications/
- Closely related entries: **LLM06 Excessive Agency** (https://genai.owasp.org/llmrisk/llm06-excessive-agency/) and **LLM02 Sensitive Information Disclosure**.

A structural truth to internalize: **prompt injection is not reliably solvable at the model layer.** There is no known prompt or filter that makes an LLM robustly distinguish trusted instructions from untrusted data in the same context window. Defenses must be *architectural* (constrain what the agent can do with injected instructions), not merely *behavioral* (ask the model nicely to ignore them).

### 1.2 Real-world incidents (precedents that map directly to OpenClaw)

**EchoLeak — CVE-2025-32711 (Microsoft 365 Copilot; disclosed publicly June 2025 by Aim Labs/Aim Security; CVSS 9.3 critical).**
The first publicly documented **zero-click** AI exfiltration. An attacker emails the victim; Copilot's RAG layer later pulls the malicious email into context while answering an *unrelated* user question; the injected instructions cause Copilot to gather sensitive context and embed it in a **reference-style markdown image** URL; auto-fetch of that image exfiltrates the data. The chain bypassed four controls: Microsoft's **XPIA** (cross-prompt-injection) classifier (by phrasing the email as if addressed to the human, not an AI), link redaction (via reference-style markdown), CSP (by abusing **SharePoint/Teams proxy domains already on the allow-list**), and Copilot's reference-mentions handling. Aim Labs named the root cause an **"LLM Scope Violation"** — untrusted email content steering the model to act on privileged data, a structural flaw of RAG copilots. Timeline: reported to Microsoft Jan 2025, patched server-side ~May 2025; no customer action required; no evidence of in-the-wild exploitation.
- https://www.aim.security/post/echoleak-blog (note: now redirects to catonetworks.com)
- https://nvd.nist.gov/vuln/detail/CVE-2025-32711 — https://thehackernews.com/2025/06/zero-click-ai-vulnerability-exposes.html — https://checkmarx.com/zero-post/echoleak-cve-2025-32711-show-us-that-ai-security-is-challenging/ — academic write-up: https://arxiv.org/abs/2509.10540
**Lesson for OpenClaw:** an inbox-reading agent that can render/fetch URLs *is* EchoLeak. Note that an allow-list with broad, attacker-reachable domains (SharePoint/Teams) was the CSP bypass — your egress allow-list must be *narrow* (no general-purpose hosted domains). Block image/URL auto-fetch on ingested content entirely.

**ShadowLeak (ChatGPT Deep Research + Gmail connector, Radware; disclosed Sept 2025).**
Zero-click **service-side** exfiltration: instructions hidden in an email's HTML (white-on-white text / CSS / metadata) caused the Deep Research agent to leak inbox PII when it later summarized the inbox. Radware reported a **100% exfiltration success rate** in testing. Critically, exfiltration originated **from OpenAI's own cloud infrastructure**, not the user's browser/network — so endpoint, firewall, DLP, and EDR controls were all blind to it. Reported to OpenAI June 2025, fixed Sept 3 2025. **OpenAI's fix is instructive:** ChatGPT now "can only open URLs *exactly as provided* and refuses to add parameters, even if explicitly instructed" — i.e., they removed the agent's ability to *construct* an exfiltration URL.
- https://www.radware.com/getattachment/7bf74537-e90e-414e-a82b-d7b4935bae08/Threat-Advisory-ShadowLeak-Sept-2025.pdf.aspx — https://thehackernews.com/2025/09/shadowleak-zero-click-flaw-leaks-gmail.html — https://www.theregister.com/2025/09/19/openai_shadowleak_bug/
**Lesson:** egress filtering must sit at the *agent/tool execution boundary*, not the UI. And: forbid the agent from *templating data into outbound URLs/parameters* — a cheap, high-value output constraint.

**Slack AI exfiltration (PromptArmor, Aug 2024).**
Indirect injection let an attacker exfiltrate data from **private** Slack channels they were not in: a malicious message in a public channel instructed Slack AI, and the rendering of a crafted link leaked secrets (e.g., API keys) when a user clicked.
- https://promptarmor.substack.com/p/data-exfiltration-from-slack-ai-via
- https://www.theregister.com/2024/08/21/slack_ai_prompt_injection/
**Lesson:** "private channel" is not a trust boundary once an AI summarizer spans channels.

**Gemini via Google Calendar — "Invitation Is All You Need" (SafeBreach/academic; disclosed to Google Feb 2025, presented 2025).**
Researchers embedded "promptware" in **calendar invite titles/descriptions** (also emails and shared-doc names); when the user later asked Gemini routine questions ("what's on my calendar?"), the injected instructions executed. Demonstrated **14 attack scenarios across 5 threat classes** (short-term context poisoning, *permanent memory poisoning*, tool misuse, automatic agent invocation, automatic app invocation) against Gemini web/mobile/Assistant — including email exfiltration, location tracking, video-call streaming, and smart-home control (lights, windows, heating). **73% of the threats were rated high-to-critical.** Two notable mechanics: (a) **delayed/triggered execution** — the payload lay dormant until a benign user phrase like "thanks" triggered it; (b) **UI concealment** — Calendar shows only the 5 most recent events, so a 6th malicious invite hid under "Show more" while still being parsed. Google deployed mitigations after disclosure.
- https://sites.google.com/view/invitation-is-all-you-need/ — https://arxiv.org/abs/2508.12175 — https://www.safebreach.com/blog/invitation-is-all-you-need-hacking-gemini/
**Lesson:** calendar invites are a fully attacker-controlled, zero-click ingestion vector requiring no acceptance. Treat invite text as hostile; beware *persistent* memory poisoning (an injection that survives into the agent's long-term memory/notes) and *triggered* payloads.

**GitHub MCP server (Invariant Labs, 2025) — "toxic agent flow".**
A malicious GitHub *issue* in a public repo injected the agent; via the *fully-trusted, uncompromised* official GitHub MCP server, the agent then read the user's **private** repos and leaked them into a public PR — a classic **confused-deputy**: untrusted content + a high-privilege tool acting with the user's standing credentials. Invariant stresses this is an **architectural** problem, **not** a bug in the MCP server code, and **not** tool poisoning — it occurs even with entirely trusted tools. Their recommended mitigations: **restrict an agent to one repository per session** and **give the agent least-privilege access tokens** (so private repos simply aren't reachable in a session triggered by public content).
- https://invariantlabs.ai/blog/mcp-github-vulnerability
**Lesson:** tool scope (the MCP server's own credential) *is* the blast radius; one tool/session spanning public+private content is the bug. **Generalize the "one resource per session, least-privilege token" rule to OpenClaw**: a triage run reading an untrusted email should hold a token scoped to *that* task, not your whole mailbox.

**MCP supply-chain note (tool poisoning).** Separately from confused-deputy, MCP introduces a tool-description attack surface: malicious instructions hidden in a tool's *description/parameter schema/return values* are read by the model but invisible to the user. A 2025 study of 1,899 open-source MCP servers found **~5.5% exhibited tool-poisoning vulnerabilities**. The MCP spec itself mandates **human-in-the-loop approval** before consequential tool calls and warns on confused-deputy and token-passthrough.
- OWASP MCP Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html — MCP spec security best practices: https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices
**Lesson:** vet/pin every MCP server you add (treat it as installing privileged code); prefer first-party/audited servers; pin versions.

### 1.3 Mitigations (architectural, defense-in-depth)

**(a) Break the trifecta first.** For any workflow, ensure at most two legs co-exist. Practical separations:
- A **read-only triage agent** that ingests untrusted content but has *no* send/write tools and *no* outbound network → removes the "exfiltration" leg.
- An **action agent** that performs writes but operates only on *structured, sanitized* instructions (not raw email text) → removes the "untrusted content" leg from the privileged context.

**(b) Dual-LLM / CaMeL pattern.** The strongest published design is **CaMeL** ("Defeating Prompt Injections *by Design*", Debenedetti et al. / Google DeepMind, 2025 — "Capabilities for Machine Learning"). A **Privileged LLM (P-LLM)** sees only the trusted user request and emits a *plan as pseudo-Python* expressing the control flow; a **Quarantined LLM (Q-LLM)** parses untrusted content into typed values but *cannot call tools*; a custom **Python interpreter** executes the plan, tagging every value with **capabilities** (provenance + allowed uses) and enforcing **data-flow policies** — so injected text in the quarantined channel can never alter control flow or be passed to a sink (e.g. `send_email`) it isn't authorized for; the interpreter blocks or asks for confirmation instead. This converts "trust the model" into "enforce policy in code," *without retraining the model*. On the AgentDojo agent-security benchmark CaMeL blocked **~67% of prompt-injection attacks** (a floor, not a ceiling — it provably prevents the data-flow class; the residual is tasks it can't express). It does not stop the Q-LLM from being *misled about content* (misinformation), only from causing unauthorized *actions*.
- Paper: https://arxiv.org/abs/2503.18813 — Willison's walkthrough: https://simonwillison.net/2025/Apr/11/camel/ — enterprise operationalization: https://arxiv.org/abs/2505.22852
**OpenClaw mapping:** even a lightweight version — a planner agent that never sees raw email + a quarantined summarizer whose output is treated strictly as *data* (never re-fed as instructions, never templated into a tool argument without a policy check) — captures most of the benefit.

**(c) Content/tool isolation & provenance tagging.** Tag every token by source (user vs. fetched-untrusted) and forbid untrusted-origin text from authorizing privileged tool calls. Strip/neutralize active markup (auto-rendering images, links, HTML) before content enters context.

**(d) Egress allow-listing (kills the exfil leg directly).** This is the highest-ROI single control. Default-deny outbound network from the agent's execution sandbox; allow only the model-provider API and the specific account APIs (googleapis.com, slack.com). This defeats EchoLeak-style URL/image exfiltration and ShadowLeak-style server-side beaconing regardless of how good the injection is. (See §4.)

**(e) Human-in-the-loop for irreversible/external actions** (send email, calendar writes, anything with a recipient outside you). See §2.

**(f) Output filtering.** Scan agent outputs for secret patterns (API keys, tokens) and for outbound URLs containing high-entropy/encoded data before any send/render.

**(g) Don't rely on these alone:** prompt-level "ignore injections" instructions, jailbreak classifiers, and delimiter tricks are *reductions*, not *guarantees*. Defense-in-depth assumes injection succeeds and limits damage.

---

## 2. Permissioning & Incremental Trust

### 2.1 The concern — Excessive Agency (OWASP LLM06)
The damage from a successful injection equals the agent's *capability surface*: how many tools, how broad their scopes, how reversible their actions. OWASP LLM06 names excessive functionality, excessive permissions, and excessive autonomy as the root causes. https://genai.owasp.org/llmrisk/llm06-excessive-agency/

### 2.2 Recommended pattern: graduated permission tiers + HITL
Design explicit tiers and graduate each capability from low to high trust as confidence grows (matches OpenClaw's "incremental trust" principle):

- **Tier 0 — Read-only / observe.** Search/read mail, list calendar, read Slack, read files. Default state for every new capability. (Maps to Google `*.readonly` scopes, Slack `:read` scopes.)
- **Tier 1 — Draft / propose.** Create *drafts*, *tentative* calendar holds, *proposed* replies — staged, never sent. (Gmail `gmail.compose`/draft creation rather than send; calendar event with status the user confirms.)
- **Tier 2 — Reversible writes with auto-execute.** Label/archive mail, move files, accept/decline invites — actions you can undo. Allowed autonomously but **logged + reversible**.
- **Tier 3 — Irreversible / external effects, HITL-gated.** *Send* email, message external Slack users, delete data, anything touching money. Requires **typed, explicit human approval** with the exact payload shown.

**Human-in-the-loop confirmation** is the backstop for the trifecta: even if injected, a "send email to attacker@evil.com" requires you to approve a clearly-rendered diff. This is the same model Claude Code uses for risky tool calls (permission prompts / allow-deny rules), and the MCP spec explicitly calls for human approval before consequential tool invocations.
- Claude Code permissions / allow-deny: https://docs.anthropic.com/en/docs/claude-code/settings and https://docs.anthropic.com/en/docs/claude-code/security
- MCP security best practices (human-in-the-loop, confused-deputy, token passthrough): https://modelcontextprotocol.io/specification/draft/basic/security_best_practices
- Anthropic on agent design / guardrails: https://www.anthropic.com/engineering/building-effective-agents and https://www.anthropic.com/engineering/claude-code-best-practices

### 2.3 OAuth scope minimization

**Google (Gmail, Calendar).** Prefer the narrowest scope that works and use **incremental authorization** — Google's explicit best practice is to request scopes *only when needed* for a feature, never up front (e.g. don't ask for calendar write until the user invokes "add to calendar").
- Start read-only: `.../auth/gmail.readonly` and `.../auth/calendar.readonly`.
- Avoid the full-mailbox `https://mail.google.com/` scope. For writes use the narrowest: `gmail.send` / `gmail.compose` (drafts) rather than broad ones.
- **Counterintuitive but important scope-tier fact:** Google classifies `gmail.readonly` as a **restricted** scope (the heavyweight tier — for a published, server-side app it triggers an annual CASA **Tier-3 penetration test**), whereas **`gmail.modify` is only "sensitive" (Tier 2)**, because `gmail.modify` cannot *permanently delete* mail (can archive/trash but not purge) and Google treats that as a safety boundary. So *more capability* can paradoxically sit in a *lower* verification tier — don't pick a scope on the assumption that "read-only is always the cheapest to ship." For a **single-user, self-hosted app kept in OAuth "Testing" mode (or an internal Workspace app)**, you generally avoid the public-app verification/CASA process entirely — which is the right posture for OpenClaw.
- **OPERATIONAL GOTCHA — confirmed verbatim from Google's OAuth2 docs:** *"A Google Cloud Platform project with an OAuth consent screen configured for an external user type and a publishing status of 'Testing' is issued a refresh token expiring in 7 days"* (unless the only scopes are basic `userinfo.email`/`userinfo.profile`/`openid`). For an always-on assistant this means a Testing-mode app **silently loses Google access every 7 days.** Fixes: set publishing status to **"In production"**, or (better for one user) use an **Internal** user type on a Google Workspace, or a **service account with domain-wide delegation** (Workspace only). Also confirmed from the same page: refresh tokens break if **unused for 6 months**, on **password change when the token holds Gmail scopes**, when an admin sets a requested service to **Restricted**, and there is a hard limit of **100 live refresh tokens per account per client ID** (oldest silently invalidated). Source: https://developers.google.com/identity/protocols/oauth2#expiration
- Refs: scopes list https://developers.google.com/identity/protocols/oauth2/scopes ; Gmail scopes https://developers.google.com/workspace/gmail/api/auth/scopes ; incremental/best practices https://developers.google.com/identity/protocols/oauth2/resources/best-practices ; restricted-scope verification/CASA https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification ; user-data policy https://developers.google.com/terms/api-services-user-data-policy

**Slack.** Use a **bot token (xoxb)** with granular per-action scopes, not a user token, and not legacy broad scopes. Request only e.g. `channels:history`, `chat:write` for the specific channels needed; avoid `:read` across the whole workspace where possible.
- Scopes: https://api.slack.com/scopes ; OAuth v2 https://api.slack.com/authentication/oauth-v2 ; token types https://api.slack.com/authentication/token-types

### 2.4 Capability tokens
Where possible, mint **short-lived, narrowly-scoped capability tokens** per task rather than handing the agent the long-lived refresh token. The agent receives a token good for "read calendar for the next 7 days, expires in 10 min" — so a stolen working token has minimal value and lifetime. This is the token analog of CaMeL's capabilities and pairs with Vault dynamic secrets (§3).

---

## 3. Credential & Secret Management

### 3.1 The concern
OAuth refresh tokens and the model API key are the crown jewels (see threat model). If they live in plaintext env files or in the agent's reachable filesystem, a single injection + file-read + exfil = total account takeover that **persists across restarts**.

### 3.2 Recommended patterns

**Centralize in a secret store; never in the agent's context or repo.**
- **HashiCorp Vault** for a home lab that wants rotation and dynamic secrets. Use **dynamic secrets** (short-lived, generated on demand) and **leases/TTLs** so credentials auto-expire, shrinking blast radius. Follow Vault **production hardening** (auto-unseal or careful unseal-key custody, audit device enabled, minimal root-token use, TLS).
  - Dynamic secrets: https://developer.hashicorp.com/vault/docs/secrets
  - Leases/TTL concept: https://developer.hashicorp.com/vault/docs/concepts/lease
  - Production hardening: https://developer.hashicorp.com/vault/tutorials/operations/production-hardening
- **Lighter-weight alternative for v0: SOPS + age.** Encrypt secrets at rest in git (reproducible-as-code) with `age` keys; decrypt only into the runtime. Good fit for OpenClaw's "reproducible-as-code" principle without standing up Vault.
  - SOPS: https://github.com/getsops/sops ; age: https://github.com/FiloSottile/age

**Inject at runtime, never bake into images.** Pass secrets via runtime-mounted files (tmpfs) or a secrets API, not Docker image layers or `ENV` in the Dockerfile (OWASP Docker cheat sheet). The agent process should reach account APIs through a **broker** that holds the token, so the token itself never enters the LLM context.

**Token rotation & revocation drills.** Schedule rotation of OAuth tokens and API keys; keep a one-command revoke for every credential (Google account security page, Slack app token rotation, Anthropic key revoke). Test the revoke path before you trust the agent.

**Blast-radius limiting.** Distinct credentials per capability/tier; never reuse the action-tier Slack token for the read-tier triage agent. A compromised read agent should not be able to send.

---

## 4. Sandboxing & Isolation

### 4.1 The concern
The agent runs a shell and fetches URLs; a successful injection or a malicious MCP server can attempt host compromise, lateral movement into the home lab, or direct exfiltration. Containment limits all of these.

### 4.2 Recommended patterns

**Run each agent in a hardened container** (OWASP Docker Security Cheat Sheet, Docker security docs, CIS Docker Benchmark):
- Non-root user (`USER`), `--read-only` root filesystem with explicit writable tmpfs, `--cap-drop=ALL` (add back only what's needed), `--security-opt=no-new-privileges`, a tailored **seccomp** profile, drop SETUID, set memory/CPU/PID limits.
- One container per trust tier; don't co-locate the untrusted-content reader with the action executor.
- Refs: https://docs.docker.com/engine/security/ ; https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html ; https://www.cisecurity.org/benchmark/docker

**Stronger isolation for the untrusted-content / shell tier: gVisor.** gVisor interposes an application kernel between the container and the host kernel, drastically reducing the host syscall attack surface — appropriate for the component that executes arbitrary tool/shell code on attacker-influenced input.
- https://gvisor.dev/docs/ ; security model: https://gvisor.dev/docs/architecture_guide/security/

**Network egress control = the most important sandbox control (kills the exfil leg).**
- Default-deny outbound from the agent container; allow-list only required API hosts (model provider, `*.googleapis.com`, `slack.com`). Out of the box **Docker gives every container unrestricted outbound access** — a compromised/injected container can phone home freely — so this must be added deliberately. (https://docs.docker.com/engine/network/packet-filtering-firewalls/)
- This is precisely Claude Code's own model, which OpenClaw should mirror. Anthropic's sandboxed bash tool enforces **two boundaries**: (1) **filesystem isolation** (read/write only the working dir, block everything outside) and (2) **network isolation** — internet access is allowed *only* through a **unix-domain socket to a proxy running outside the sandbox**, which enforces a **domain allow-list** and prompts for newly requested domains. Built on **Linux bubblewrap / macOS Seatbelt** OS primitives (covers spawned subprocesses too), it cut permission prompts ~84% internally; Anthropic states it ensures "even a successful prompt injection is fully isolated... a compromised Claude Code can't steal your SSH keys, or phone home to an attacker's server." Open-sourced as `sandbox-runtime`.
  - https://www.anthropic.com/engineering/claude-code-sandboxing — config: https://code.claude.com/docs/en/sandboxing — code: https://github.com/anthropic-experimental/sandbox-runtime — https://www.anthropic.com/engineering/secure-coding-sandboxes
- Implement via the proxy-on-a-unix-socket pattern above and/or host firewall rules on the container's network namespace (forward proxy bound to the bridge + iptables FORWARD allow-list). This single control would have blunted EchoLeak *and* ShadowLeak.

**Home-lab segmentation (defense-in-depth around the host):**
- **Tailscale** for remote access with **ACLs + tags**: ACLs are **deny-by-default and directional** ("all connections between devices in your tailnet are denied unless explicitly permitted") — tag the agent host (e.g. `tag:agent`) and grant it the *minimum* connectivity (e.g. reach the secret broker, not the whole tailnet). Use **ACL tests** to assert reproducibly-as-code that the agent host *cannot* reach the NAS/management hosts. Avoid public port-forwarding entirely.
  - ACLs: https://tailscale.com/kb/1018/acls ; tags: https://tailscale.com/kb/1068/tags ; grants: https://tailscale.com/kb/1393/grants
- **Enable Tailnet Lock.** Confirmed from Tailscale docs: *"With Tailnet Lock enabled, even if Tailscale were malicious or Tailscale infrastructure hacked, attackers can't send or receive traffic in your tailnet"* — a new node's public key must be **signed by one of your own trusted nodes** before peers accept it, so a compromised coordination server cannot inject a rogue node. High-value, low-cost hardening for a tailnet fronting your most sensitive accounts. https://tailscale.com/kb/1226/tailnet-lock
- **UniFi/VLAN**: put the agent host on an isolated VLAN with firewall rules blocking lateral access to NAS, IoT, and management networks; allow only the egress it needs. Pairs with Proxmox host isolation in `server-standup`.

---

## 5. Audit & Observability

### 5.1 The concern
An autonomous agent acting on your accounts is only trustworthy if **every action is logged, attributable, and replayable** (OpenClaw's "observable/auditable" principle). Without this you cannot detect a successful injection, do incident response, or graduate trust with evidence.

### 5.2 Recommended patterns

**Trace agent runs with OpenTelemetry GenAI semantic conventions.** OTel's GenAI Semantic Conventions SIG defines a vendor-neutral schema for AI workloads spanning four areas — **LLM client spans, agent spans, events (prompt/completion content), and metrics** — and now covers agent orchestration, **MCP tool calling**, content capture, and evaluation. Each tool call / LLM invocation / retrieval step becomes a child span, yielding a full trace of the reasoning chain; a span from one framework looks identical to another, which is exactly what "own-the-stack" needs (route to your own collector/backend; Datadog, Honeycomb, New Relic and frameworks like LangChain/CrewAI already emit these). Capture per run: trigger source, inputs *with untrusted-content provenance tags*, each tool call + args + result, model + token counts + cost, and final outcome.
- OTel GenAI semantic conventions: https://opentelemetry.io/docs/specs/semconv/gen-ai/ — overview: https://uptrace.dev/blog/opentelemetry-ai-systems . `[VERIFY]` the exact stability/version of specific attributes — the GenAI conventions were still evolving through 2025–2026.

**Tamper-evident audit log for security-relevant actions.** Note the distinction practitioners stress: **"append-only" is not the same as "tamper-evident."** A file you only append to can still be rewritten by anyone with disk/DB access. Tamper-evidence requires cryptographic chaining: each entry includes the hash (or **HMAC-SHA256**) of the prior entry over a canonical schema — `entry_hash = H(timestamp ‖ actor ‖ action ‖ resource ‖ metadata ‖ prev_hash)` — so altering any past record invalidates every subsequent hash. For external verifiability use a Merkle/transparency-log structure (RFC 9162, the Certificate-Transparency design) and **anchor/ship the head hash off-host** to a write-once sink so a host compromise can't silently rewrite history.
- HMAC hash-chain how-to: https://tracehold.ai/blog/immutable-audit-log-hmac-hash-chain/ — tamper-evident logging (Crosby/Wallach, USENIX): https://static.usenix.org/event/sec09/tech/full_papers/crosby.pdf — Merkle transparency log RFC 9162: https://www.rfc-editor.org/rfc/rfc9162.html — agent-specific audit trail: https://nono.sh/blog/secure-agent-audit

**Make runs replayable.** Persist the full input/decision/tool-call sequence so you can replay an incident deterministically and understand exactly how an injection propagated. (Durable-execution event histories, §6, double as replay logs.)

**Alerting.** Trip alerts on: any Tier-3 action, outbound URL with encoded data, spend over threshold, scope/permission change, or repeated failures (possible loop).

---

## 6. Reliability (always-on scheduler)

### 6.1 The concern
An always-on agent can **loop** (re-trigger itself, retry forever), **double-act** (send the same email twice on retry), or **blow up cost** (unbounded model calls). These are availability/financial failure modes and also a *safety* issue — a runaway agent acting on accounts at machine speed.

### 6.2 Recommended patterns

**Durable, idempotent workflows.** Use a durable-execution engine (e.g. **Temporal**) or equivalent so workflows survive crashes and resume from a persisted event history, with **idempotency keys** on every external side-effect (send-email, calendar-write) so retries don't duplicate actions.
- Durable execution: https://temporal.io/blog/durable-execution and https://docs.temporal.io/evaluate/understanding-temporal
- Idempotency in workflows: https://docs.temporal.io/develop/idempotency
- For v0, a lighter design works: a persistent task queue + an idempotency-key table (dedupe on a deterministic key per intended action) gives "act at most once" without full Temporal.

**Runaway-loop / cost guardrails:**
- Hard **max-turns / max-tool-calls** per run and a **wall-clock timeout** (Anthropic's effective-agents guidance; OpenAI Agents SDK exposes an explicit `max_turns`). Fail safe (stop, alert) on hit.
  - https://www.anthropic.com/engineering/building-effective-agents ; https://openai.github.io/openai-agents-python/
- **Token/cost budget** per run and per day; circuit-break + alert when exceeded.
- **Re-trigger dampening:** rate-limit triggers; detect "agent action that re-triggers the agent" (e.g., it emails itself) and break the cycle.
- **Backoff with caps** on retries; after N failures, stop and surface to human rather than retry forever.

**Safe failure posture:** on any uncertainty, degrade to *draft/propose* (Tier 1), never auto-execute Tier 3. The default failure of the system should be "do nothing and ask," not "guess and act."

---

## 7. Hardening Checklist for OpenClaw v0 (prioritized)

Each item: **risk → mitigation → owning workstream**. Ordered by ROI / risk-reduction.

**P0 — do before connecting any real account**
1. **Trifecta-aware architecture split.** Risk: single context with private data + untrusted content + egress (EchoLeak/ShadowLeak class). → Split read-only **triage agent** (no send/write, no open egress) from a **action agent** that consumes only sanitized/structured instructions. → `permission-escalation`.
2. **Default-deny egress allow-list** on the agent sandbox (model API + googleapis.com + slack.com only). Risk: URL/image/beacon exfiltration. → Egress proxy + host firewall on the container netns. → `network-security` + `docker-prep`.
3. **Secrets out of the agent context.** Risk: token theft → persistent account takeover. → SOPS+age (v0) or Vault; tokens held by a broker, runtime-mounted, never in images/repo/LLM context. → `accounts-credentials`.
4. **Least-privilege OAuth scopes, read-only first; keep the app in Testing/internal mode.** Risk: excessive agency + verification overhead. → Gmail/Calendar `*.readonly` (note: `gmail.readonly` is a *restricted* scope; `gmail.modify` is only *sensitive* — see §2.3), Slack `xoxb` granular read scopes, incremental auth, single-user OAuth app unpublished to avoid CASA. → `accounts-credentials` + `permission-escalation`.
5. **HITL approval for Tier-3 actions** (send email / external Slack / delete / money) with the exact payload shown. Risk: injected irreversible action. → Claude-Code-style permission gate / approval queue. → `permission-escalation`.

**P1 — before granting any write capability**
6. **Permission tiers (0 read / 1 draft / 2 reversible / 3 HITL).** → graduate capabilities with evidence. → `permission-escalation`.
7. **Hardened containers** (non-root, read-only FS, cap-drop ALL, no-new-privileges, seccomp, resource limits); **gVisor** for the shell/untrusted tier. Risk: host compromise / lateral movement. → `docker-prep` + `server-standup`.
8. **Strip active markup** (auto-render images/links/HTML) from ingested email/Slack/calendar content. Risk: rendering-based exfil (EchoLeak). → `permission-escalation` (content pipeline).
9. **Tamper-evident, off-host audit log** of all tool calls + Tier-2/3 actions; OTel GenAI tracing of runs. Risk: undetectable compromise. → `network-security` (logging infra) + `permission-escalation`.
10. **VLAN + Tailscale ACL isolation** of the agent host (deny-by-default, tag-scoped, ACL tests; enable **Tailnet Lock**; no public port-forward). Risk: blast radius into home lab / control-plane compromise. → `network-security` + `server-standup`.
11. **Pin Google app to "In production"/Internal (or service-account + DWD).** Risk: Testing-mode refresh tokens **expire every 7 days**, silently breaking the always-on assistant. → `accounts-credentials`.

**P2 — reliability & maturation**
12. **Idempotency keys + durable workflow** for every external side-effect. Risk: duplicate/lost actions on retry. → `permission-escalation` / scheduler.
13. **max-turns + wall-clock + daily token-budget circuit breakers** with fail-safe stop, enforced at an LLM gateway (LiteLLM/Helicone) *outside* agent code. Risk: runaway loop / cost blowout (OWASP LLM10). → scheduler / `permission-escalation`.
14. **Re-trigger dampening** (rate-limit triggers, detect self-triggering cycles). → scheduler.
15. **Output secret/exfil scanning** (block sends containing API-key patterns or encoded-data URLs). → `permission-escalation`.
16. **Capability tokens + dynamic/short-TTL secrets** (Vault) to shrink stolen-token value. → `accounts-credentials`.
17. **Token rotation + tested one-command revoke** for every credential. → `accounts-credentials`.
18. **Consider CaMeL-style P-LLM/Q-LLM** with a policy interpreter for the highest-risk write workflows once v0 is stable. → `permission-escalation`.

---

## 8. Source Index (primary sources cited above)

Prompt injection / incidents / mitigations
- Lethal trifecta: https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/
- CaMeL paper: https://arxiv.org/abs/2503.18813 — walkthrough: https://simonwillison.net/2025/Apr/11/camel/
- OWASP LLM Top 10 2025: https://genai.owasp.org/llm-top-10/ — LLM01: https://genai.owasp.org/llmrisk/llm01-prompt-injection/ — LLM06: https://genai.owasp.org/llmrisk/llm06-excessive-agency/
- EchoLeak (CVSS 9.3): https://nvd.nist.gov/vuln/detail/CVE-2025-32711 — https://thehackernews.com/2025/06/zero-click-ai-vulnerability-exposes.html — https://checkmarx.com/zero-post/echoleak-cve-2025-32711-show-us-that-ai-security-is-challenging/ — academic: https://arxiv.org/abs/2509.10540 (orig. Aim Labs post https://www.aim.security/post/echoleak-blog now redirects)
- ShadowLeak: Radware advisory PDF https://www.radware.com/getattachment/7bf74537-e90e-414e-a82b-d7b4935bae08/Threat-Advisory-ShadowLeak-Sept-2025.pdf.aspx — https://thehackernews.com/2025/09/shadowleak-zero-click-flaw-leaks-gmail.html — https://www.theregister.com/2025/09/19/openai_shadowleak_bug/
- Slack AI: https://promptarmor.substack.com/p/data-exfiltration-from-slack-ai-via — https://simonwillison.net/2024/Aug/20/data-exfiltration-from-slack-ai/ — https://www.theregister.com/2024/08/21/slack_ai_prompt_injection/
- Gemini calendar / promptware: https://sites.google.com/view/invitation-is-all-you-need/ — https://arxiv.org/abs/2508.12175 — https://www.safebreach.com/blog/invitation-is-all-you-need-hacking-gemini/
- GitHub MCP confused-deputy ("toxic agent flow"): https://invariantlabs.ai/blog/mcp-github-vulnerability
- MCP security: spec best practices https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices — OWASP MCP cheat sheet https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html

Permissioning / OAuth
- Claude Code security: https://code.claude.com/docs/en/security — sandboxing: https://code.claude.com/docs/en/sandboxing — best practices: https://www.anthropic.com/engineering/claude-code-best-practices
- Google OAuth scopes: https://developers.google.com/identity/protocols/oauth2/scopes — Gmail scopes: https://developers.google.com/workspace/gmail/api/auth/scopes — best practices/incremental auth: https://developers.google.com/identity/protocols/oauth2/resources/best-practices — restricted-scope verification/CASA: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification — user-data policy: https://developers.google.com/terms/api-services-user-data-policy — **refresh-token expiration conditions (verbatim 7-day Testing-mode expiry): https://developers.google.com/identity/protocols/oauth2#expiration**
- Macaroons (capability tokens / attenuating caveats), Google Research: https://research.google/pubs/macaroons-cookies-with-contextual-caveats-for-decentralized-authorization-in-the-cloud/
- Tailscale Tailnet Lock (control-plane-compromise resistance): https://tailscale.com/kb/1226/tailnet-lock
- OWASP LLM10 Unbounded Consumption (denial-of-wallet): https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/
- Slack scopes: https://api.slack.com/scopes — OAuth v2: https://api.slack.com/authentication/oauth-v2 — token types: https://api.slack.com/authentication/token-types

Secrets
- Vault dynamic secrets: https://developer.hashicorp.com/vault/docs/secrets — leases: https://developer.hashicorp.com/vault/docs/concepts/lease — hardening: https://developer.hashicorp.com/vault/tutorials/operations/production-hardening
- SOPS: https://github.com/getsops/sops — age: https://github.com/FiloSottile/age

Sandboxing / network
- Docker security: https://docs.docker.com/engine/security/ — packet filtering/egress: https://docs.docker.com/engine/network/packet-filtering-firewalls/ — OWASP cheat sheet: https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html — seccomp: https://docs.docker.com/engine/security/seccomp/ — CIS benchmark: https://www.cisecurity.org/benchmark/docker
- gVisor: intro/security https://gvisor.dev/docs/architecture_guide/intro/ — runsc runtime https://gvisor.dev/docs/
- Anthropic Claude Code sandboxing: https://www.anthropic.com/engineering/claude-code-sandboxing — open-source runtime: https://github.com/anthropic-experimental/sandbox-runtime — https://www.anthropic.com/engineering/secure-coding-sandboxes
- Tailscale access control (deny-by-default): https://tailscale.com/docs/features/access-control/acls — tags: https://tailscale.com/docs/features/tags — grants: https://tailscale.com/docs/reference/syntax/grants

Observability
- OTel GenAI semantic conventions: https://opentelemetry.io/docs/specs/semconv/gen-ai/ `[VERIFY version]` — overview https://uptrace.dev/blog/opentelemetry-ai-systems
- Tamper-evident logging: HMAC hash-chain how-to https://tracehold.ai/blog/immutable-audit-log-hmac-hash-chain/ — Crosby/Wallach USENIX paper https://static.usenix.org/event/sec09/tech/full_papers/crosby.pdf — Merkle transparency log RFC 9162 https://www.rfc-editor.org/rfc/rfc9162.html

Reliability
- Temporal durable execution: https://temporal.io/blog/durable-execution — https://docs.temporal.io/evaluate/understanding-temporal — idempotency: https://temporal.io/blog/idempotency-and-durable-execution / https://docs.temporal.io/develop/idempotency
- Anthropic building effective agents: https://www.anthropic.com/engineering/building-effective-agents — OpenAI Agents SDK (max_turns): https://openai.github.io/openai-agents-python/ — agent cost/loop guardrails: https://docs.litellm.ai/docs/a2a_iteration_budgets

---

*Verification status: this run combined fan-out web search (multiple independent queries per theme) with direct full-page fetches of the lethal-trifecta post and the OWASP LLM01 page. Incident facts (EchoLeak/CVE-2025-32711 CVSS 9.3; ShadowLeak server-side exfil + URL-parameter fix; Slack AI cross-channel exfil; Gemini calendar 14-attack/73%-critical study; GitHub MCP "toxic agent flow"), the CaMeL ~67% AgentDojo figure, the Gmail readonly=restricted vs modify=sensitive scope-tier nuance, and the Claude Code sandbox mechanics (bubblewrap/Seatbelt + unix-socket egress proxy, ~84% prompt reduction, open-sourced) were each corroborated across two or more independent reports. Items marked `[VERIFY]` (OTel attribute versions; Google verification policy for single-user/test-mode apps) warrant a direct read before being treated as load-bearing.*
