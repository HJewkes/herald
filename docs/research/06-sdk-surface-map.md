# Claude SDK Surface Capability Map
**Date:** 2026-05-28  
**Research basis:** Official documentation from code.claude.com and platform.claude.com (TS Agent SDK, CLI, Managed Agents API)

---

## Executive Summary

This document maps the "free" capabilities offered by Claude Code (interactive, channel-driven) and the TypeScript Agent SDK against what your library must provide. **Key finding:** the two paths are substantially asymmetric. Interactive Claude Code via channels offers more automatic capability discovery (hooks, skills, permissions, MCP) and state persistence, while the TS SDK is more programmatic and lightweight but requires explicit orchestration at the library level.

The channel path is currently **unfinished research-preview**: reliable unattended use requires `--dangerously-skip-permissions` or `bypassPermissions` mode, and permission relay for remote approval is not yet in all plugins.

---

## Capability Matrix: Interactive Claude Code vs. TS Agent SDK

| **Capability** | **Interactive Claude Code** | **TS Agent SDK (TypeScript)** | **Your Library Owns** |
|---|---|---|---|
| **1. Hooks: PreToolUse blocking** | ✅ Built-in: exits 2 + JSON → `permissionDecision: "deny"` | ✅ Built-in: callback returns `{ hookSpecificOutput: { permissionDecision: "deny" } }` | Orchestration (when to call via channel vs SDK) |
| **1a. Hooks: audit/PostToolUse** | ✅ Built-in: `PostToolUse` fires after every tool, logs via command/HTTP/MCP | ✅ Built-in: `PostToolUse` callback receives tool name, input, output | Log aggregation, retention, storage backend |
| **1b. Hook parity (CC vs SDK)** | Asymmetric: CC has 22+ events (SessionStart, FileChanged, etc.); SDK has ~16 | Asymmetric: SDK missing SessionStart/End as callbacks (Python only); no FileChanged | Event synthesis for missing SDK events |
| **2. Tool calling loop** | ✅ Built-in: full agentic loop, Claude calls → tool runs → result fed back, all automatic | ✅ Built-in: SDK owns loop via `query()` generator; you provide tools + MCP + custom tools, SDK orchestrates | None—both are self-contained |
| **3. Permissions** | ✅ Built-in: 5 modes (default, acceptEdits, plan, auto, bypassPermissions), regex patterns | ✅ Built-in: `permissionMode` + `canUseTool` callback for runtime gating; mode names identical | Allowlist enforcement (library enforces app-level policy beyond SDK permissions) |
| **3a. Permission callback shape** | Via PreToolUse hooks only (shell commands) | Direct: `canUseTool: async (toolName, input, options) => { behavior: "allow"\|"deny", message }` | - |
| **4. MCP client** | ✅ Built-in: auto-discovers `.mcp.json`, stdio + HTTP servers, tools auto-exposed, runs in-process subshells | ✅ Built-in: `mcpServers` array in options; HTTP/SSE only (no stdio), tools auto-exposed to model; **no in-process MCP SDK server** | Bridge between channel MCP and per-event SDK MCP configs |
| **4a. In-process MCP option** | ❌ Absent: all MCP servers are external subprocesses | ❌ Absent: no SDK-native in-process MCP server; only stdio (which SDK doesn't support) | Implement custom `tool()` definitions as substitute for in-process MCP |
| **5. Skills (auto-load)** | ✅ Built-in: `.claude/skills/` auto-discovered + lazy-loaded, CC-native SKILL.md format | ❌ Absent: SDK does NOT auto-load `.claude/skills/`; custom skills must be uploaded via API | Skills auto-discovery for CC path only; SDK requires explicit skill registration |
| **5a. Skill structure** | SKILL.md + optional dir tree; metadata (name, description) always loaded, body on-demand | Managed Skills API only (create via API, fetch by ID); no filesystem discovery | Adapt CC skills → SDK skill format (requires API upload) or replicate as instructions |
| **6. Sessions / resume / fork** | ✅ Built-in: interactive state, can run indefinitely; `/compact` summarizes context | ✅ Partial: `client.beta.sessions` API; sessions persist server-side; **per-event SDK driver must reload session by ID** | Session ID tracking, routing, resumption logic |
| **6a. Context compaction** | Built-in `/compact` command | Absent: no built-in compaction; managed by token limit + context management | Implement compaction logic for long-running sessions |
| **7. Subagents** | ✅ Built-in: `.claude/agents/` custom subagent defs, spawned in fresh context, auto-invoked when relevant | ⚠️ Partial: `agents` config in options; subagents are managed via Managed Agents API (not local files) | Subagent pool management (routing, pooling, scaling) |
| **7a. Subagent isolation** | ✅ Full: isolated context window, custom system prompt, custom permissions, custom tools | ✅ Full: same isolation guarantee | None—both provide it |
| **8. System prompt / instructions** | ✅ Built-in: CLAUDE.md auto-loaded (project + user + org levels), merged; auto memory | ✅ Partial: `system` param (string only, ~100KB max), no CLAUDE.md auto-load, no auto memory | CLAUDE.md synthesis → system prompt for per-event SDK invocations |
| **8a. Instruction injection** | `.claude/rules/` path-scoped rules, frontmatter `paths:`, append at load | None: `system` is flat string; no path scoping | Path-aware instruction selection |
| **9. What is NOT provided** | - Scheduling/cron | - Scheduling/cron | ✅ Your library: cron scheduling engine |
| **9a. NOT provided (cont)** | - Transport adapters (Slack, HTTP webhook receivers) | - Transport adapters | ✅ Your library: Slack/webhook/email transport |
| **9b. Channel push** | ✅ `claude/channel` MCP server protocol (research preview, CC-only) | ❌ Absent entirely; no channel capability in SDK | ✅ Your library: channel server management + event pump for CC path |
| **9c. Multi-driver routing** | N/A (single session) | N/A (single query at a time) | ✅ Your library: router logic + session continuity |
| **9d. Plugin packaging** | .claude/plugins/ (npm, Git, marketplace sources) | N/A | ✅ Your library: plugin discovery, loading, config management |
| **9e. Durable domain state** | Auto memory (.claude/projects/memory/) | Absent | ✅ Your library: memory backend, KB store, domain model |

---

## Hook Shapes: Deep Dive

### Interactive Claude Code Hooks
**Event:** `PreToolUse`  
**Exit code:** `2` = block + parse JSON stderr  
**JSON output:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny|allow|ask|defer",
    "permissionDecisionReason": "...",
    "additionalContext": "..."
  },
  "continue": true,
  "systemMessage": "..."
}
```
**Blocking:** `permissionDecision: "deny"` with exit 2 blocks before permission rules are checked.  
**Audit:** `PostToolUse` fires after tool succeeds; exit 0 (JSON required).

### TS Agent SDK Hooks
**Event:** `PreToolUse`  
**Callback type:** `HookCallback = async (input: HookInput, toolUseID?: string, { signal }: { signal: AbortSignal }) => HookJSONOutput`  
**Input shape:**
```typescript
interface PreToolUseHookInput {
  hook_event_name: "PreToolUse";
  tool_name: string;        // e.g., "Bash", "Write", "mcp__playwright__browser_click"
  tool_input: Record<string, unknown>;  // tool arguments (typed as unknown)
  session_id: string;
  cwd: string;
  agent_id?: string;        // set if hook fires inside a subagent
  agent_type?: string;
}
```
**Return to deny:**
```typescript
{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: "...",
    updatedInput?: { ... }  // can also modify input + approve
  }
}
```
**Audit:** `PostToolUse` callback after tool result; input includes `tool_output` (output from tool).

### Key Difference
- **CC hooks:** shell commands (exit code 2 → block); async, side-channel IO  
- **SDK hooks:** in-process async callbacks; abort signal for cancellation; return object is in-memory

**Asymmetry:** Hook event coverage differs (CC has FileChanged, SessionStart; SDK doesn't expose these as callbacks).

---

## MCP Configuration Shapes

### Interactive Claude Code
**Discovery:** `.mcp.json` in working directory / `.claude/mcp.json`  
**Config format:**
```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["server.js"],
      "env": { "API_KEY": "..." }
    },
    "remote-server": {
      "url": "https://mcp.example.com/sse",
      "authorization": "Bearer token"
    }
  }
}
```
**Tool exposure:** automatic; all tools from all servers are available to Claude (unless denied via permissions).

### TS Agent SDK
**Config:** `options.mcpServers` array (HTTP/SSE only; no stdio)  
**Shape:**
```typescript
mcpServers: [
  {
    name: "my-mcp",
    type: "url",
    url: "https://mcp.example.com/sse",
    authorization_token: "Bearer ..."
  }
]
```
**Tool exposure:** via `tools` array as `{ type: "mcp_toolset", mcp_server_name: "my-mcp", ... }`  
**Per-tool config:**
```typescript
{
  type: "mcp_toolset",
  mcp_server_name: "my-mcp",
  default_config: { enabled: true, defer_loading: false },
  configs: {
    specific_tool: { enabled: false }
  }
}
```
**No stdio:** SDK only speaks HTTP; stdio-based MCP must be shimmed via HTTP bridge.  
**No in-process MCP server:** SDK cannot host a native MCP server in-process; alternative is custom `tool()` definitions.

---

## Skills: Load Path Asymmetry

### Interactive Claude Code
**Auto-discovery:** `.claude/skills/*/SKILL.md`  
**Load timing:** metadata at startup (context-light), body on-demand when Claude is relevant  
**Structure:**
```
.claude/skills/my-skill/
├── SKILL.md          # frontmatter + instructions
├── helper.md         # referenced as @helper.md
└── scripts/
    └── helper.py     # run via bash, output only
```
**Scope:** project (`.claude/skills/`) or user (`~/.claude/skills/`)  
**Persistence:** filesystem-based; checked into git

### TS Agent SDK
**Auto-discovery:** ❌ None; skills must be explicitly registered  
**Load method:** via `skills` array in options:
```typescript
skills: [
  { type: "anthropic", skill_id: "xlsx", version: "1" },
  { type: "custom", skill_id: "skill_011CZk...", version: "2" }
]
```
**Structure:** managed via API only (create, version, upload); no filesystem discovery  
**Scope:** workspace-wide (custom skills) or pre-built (anthropic skills)

### Implication
If you want skills to work in both paths:
- **CC path:** `.claude/skills/` folders work natively
- **SDK path:** must manually convert to API-managed Skills + register in `skills` option

---

## Sessions Across Invocations (Per-Event SDK Driver)

### Challenge
The TS Agent SDK `query()` function runs a single agentic turn (prompt in → response out). For a per-event driver (e.g., channel event → spawn SDK invocation), **context from the previous event is lost** unless you explicitly resume.

### Solution: Session ID + Thread Continuity
```typescript
// First invocation (channel event)
const sessionId = (await client.beta.sessions.create({
  agent: { id: "agent_...", version: 1 },
  environment_id: "env_...",
  title: "Email processor"
})).id;

// Later invocation (new channel event)
const messages = await client.beta.sessions.threads.list(sessionId);
// Read transcript, then append new turn:
for await (const msg of query({
  prompt: "New event: " + newInput,
  options: { sessionId }  // SDK resumes session
})) {
  // ...
}
```

### Pattern
1. **Create session once** (first invocation) → store `session_id` durably
2. **On each event:** retrieve or re-create session, append message via thread
3. **Session state persists** server-side (tokens, chat history, resources)
4. **Context limit:** managed by API; session throws error if exceeded

### Gotchas
- **SDK does NOT auto-load CLAUDE.md:** session inherits system prompt only; instructions must be injected per invocation
- **No auto memory:** unlike interactive CC, SDK sessions don't accumulate learnings; you must manage memory backend yourself
- **Compaction:** manual; SDK has no `/compact` equivalent

---

## Channels & Event Push (Interactive CC Only)

### What Claude Code Offers (Research Preview)
```bash
claude --channels plugin:telegram@claude-plugins-official
```
- **Protocol:** Telegram/Discord/iMessage plugin pushes events as `<channel source="...">` XML
- **Arrival:** event lands in running session, Claude sees it, responds, result pushed back to plugin
- **Scope:** session-scoped; channel must be enabled per session with `--channels` flag

### Mechanics
1. **Activation:** `--channels` enables channel plugins (CLI flag, not SDK)
2. **Event pump:** plugin MCP server queries for new messages on timer, pushes into session
3. **Hooks/permissions/skills all apply:** channel-triggered turns inherit all session config

### What Your Library Must Provide
- **Channel broker:** subscribe to events (Slack, webhooks, email)
- **Session mapper:** route event to session ID (1:1 or N:1)
- **Event pump:** call into interactive CC session via stdin (or equivalent) if channel-aware
- **Dual-path support:** CC can use native channels; SDK path must poll/webhook instead

### Known Limitation
**Permission blocking:** if Claude hits a permission prompt during channel turn (unattended), session pauses. Mitigation: use `bypassPermissions` mode or enable permission relay in plugin.

---

## Division of Responsibility

### Claude Provides (Interactive + SDK)

#### Both Paths
- ✅ **Agentic loop:** model → tool calls → execution → result feedback
- ✅ **Tool calling:** built-in tools (Bash, Read, Write, Glob, Grep, WebFetch, WebSearch)
- ✅ **Permissions:** mode selection + PreToolUse gating
- ✅ **Hooks:** intercept + block/modify/audit tool calls, inject context
- ✅ **MCP tools:** connect external servers, auto-expose tools
- ✅ **Subagents:** spawn isolated agents with custom config

#### Interactive CC Only
- ✅ **CLAUDE.md auto-load:** project + user + org instructions, lazy-loaded
- ✅ **Skills auto-discovery:** `.claude/skills/` filesystem, lazy-load body
- ✅ **Auto memory:** session auto-accumulates learnings
- ✅ **Channels:** event push (research preview, Telegram/Discord/iMessage)
- ✅ **Subagent spawning:** auto-invokes when relevant (rules + keywords)
- ✅ **Session persistence:** runs indefinitely, `/compact` summarizes

#### TS Agent SDK Only
- ✅ **Managed Sessions API:** server-side session storage, resumable by ID
- ✅ **Skill versioning:** API-managed, version pinning
- ✅ **Multi-turn streaming:** append messages mid-session via thread API

---

### Your Library Owns

#### Core Responsibility
| **Area** | **Why** | **Examples** |
|---|---|---|
| **Scheduling / Cron** | Neither CC nor SDK offers timers | Schedule email fetch every 5min; daily digest |
| **Transport adapters** | Neither CC nor SDK speaks Slack/email/HTTP natively | Slack command handler, email receiver, webhook dispatcher |
| **Channel orchestration** | CC has channels (research preview) but your library routes events → sessions | Map Slack DM → session; replay transcript; switch drivers |
| **Multi-driver routing** | Decide which driver per event (CC channel vs SDK per-event) | If session running: push to CC; else spawn SDK |
| **Allowlist + audit backend** | You enforce app-level policy beyond Claude's permissions | Block all file writes to prod paths; log to compliance DB |
| **Plugin packaging + discovery** | Your plugins have config (transport, schedule) Claude doesn't understand | Plugin = transport + schedule + permissions + custom tools |
| **Durable domain state / memory** | Long-term KB, user context, event history | Persist email metadata; recall user preferences; store decisions |
| **System prompt synthesis** | CLAUDE.md → system string for per-event SDK turns | Extract rules, build per-request prompt |
| **In-process tool definitions** | Substitute for in-process MCP | Wrap domain logic (auth, DB) as SDK `tool()` definitions |

#### Integration Points
1. **Hooks:** library registers PreToolUse hooks (or SDK callbacks) to enforce custom allowlist
2. **Permissions:** library respects CC permission modes; SDK respects `canUseTool` callback
3. **MCP:** library bridges plugin MCP tools (if in-process) via custom `tool()` or HTTP shim
4. **Skills:** library replicates CC skills as SDK system prompt instructions or API-managed skills
5. **Sessions:** library manages session ID → plugin instance mapping; resumes on event arrival

---

## Design Implications: 4 Concrete Decisions

### 1. **Allowlist + Audit: PreToolUse Hooks vs. Middleware?**

**Recommendation:** ✅ **Use PreToolUse hooks + audit callbacks for both paths.**

**Why:**
- Interactive CC: native hook support in `.claude/settings.json`; no middleware needed
- TS SDK: `query(options.hooks.PreToolUse)` callback receives full context (tool_name, tool_input, session_id)
- Single policy engine: one allowlist applies to both drivers

**Implementation:**
```typescript
// One allowlist engine
const allowlist = {
  Bash: ["npm run *", "git *"],
  Write: ["!/etc/**", "!/root/**"],
  mcp__my_plugin__*: ["allowed_action"]
};

// SDK hook
options.hooks = {
  PreToolUse: [{
    hooks: [async (input, id, { signal }) => {
      const { tool_name, tool_input } = input;
      if (!isAllowed(tool_name, tool_input, allowlist)) {
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: "Blocked by app allowlist"
          }
        };
      }
      // Log for audit
      await auditLog.record({ session_id: input.session_id, tool_name, tool_input });
      return {};
    }]
  }]
};

// CC hook (in .claude/settings.json)
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "sh /path/to/allowlist-checker.sh"
      }]
    }]
  }
}
```

**Outcome:** centralized audit log; consistent deny decisions across drivers.

---

### 2. **Plugin Tools: In-Process `tool()` vs. HTTP MCP Shim?**

**Recommendation:** ✅ **Prefer in-process `tool()` definitions; offer optional HTTP MCP for CC.**

**Why:**
- **TS SDK:** no stdio MCP support; in-process `tool()` is native and typesafe
- **CC:** can use `.mcp.json` (stdio) for complex plugins, but in-process is simpler for library
- **Latency:** in-process `tool()` is faster; HTTP has network overhead

**Implementation:**
```typescript
// In-process tool for SDK
import { tool } from "@anthropic-ai/claude-agent-sdk";

const emailCheckTool = tool(
  "check_email",
  "Fetch unread emails from user's mailbox",
  { limit: z.number().optional() },
  async ({ limit = 10 }) => {
    const emails = await yourDomainEmailAPI.listUnread(limit);
    return { content: [{ type: "text", text: JSON.stringify(emails) }] };
  }
);

// SDK: register directly
options.tools = [emailCheckTool];

// CC: optionally export as .mcp.json server
// (or let CC use allowlist to restrict it)
```

**CC fallback:** if plugin needs deep filesystem access or external binary, use stdio MCP + `.mcp.json`.

---

### 3. **Skills: `.claude/skills/` Folders vs. SDK Skill API?**

**Recommendation:** ✅ **CC path uses `.claude/skills/` natively; SDK path uses system prompt injection or API-managed skills.**

**Why:**
- **CC:** auto-discovery works out of the box; ship skills as folders
- **SDK:** no auto-discovery; explicit registration only
- **Cost:** system prompt injection (for per-event SDK) is cheaper than API skill upload if instruction is small

**Implementation:**
```typescript
// CC: just create .claude/skills/email-handler/SKILL.md
// Auto-discovered at startup.

// SDK: convert SKILL.md to system prompt for per-event invocations
const skillContent = readFileSync(".claude/skills/email-handler/SKILL.md");
const systemPrompt = `
You have email-handling skills:

${skillContent}

Use these when the user asks about email.
`;

// Or: upload as managed skill once
const skill = await client.beta.skills.create({
  name: "email-handler",
  description: "Handle email triage and response",
  content: skillContent
});
// Then register in session
options.skills = [{ type: "custom", skill_id: skill.id, version: "1" }];
```

---

### 4. **Context Continuity & Compaction: Session Resume Pattern?**

**Recommendation:** ✅ **For per-event SDK driver, always resume by session_id; implement custom compaction.**

**Why:**
- Session API provides persistence server-side
- Without resumption, each event loses context (defeats "assistant" model)
- SDK has no `/compact` equivalent; you must manage token usage

**Implementation:**
```typescript
// Plugin lifecycle
class EmailProcessorPlugin {
  private sessionId: string;
  private transcriptPath: string;

  async initialize() {
    // Create session once
    const session = await client.beta.sessions.create({
      agent: { id: "email-agent-id", version: 1 },
      environment_id: "env_...",
      title: "Email processor for " + this.userId
    });
    this.sessionId = session.id;
    this.transcriptPath = `~/.claude/projects/${slug}/sessions/${this.sessionId}/transcript`;
  }

  async handleEvent(event: EmailEvent) {
    // Resume session, append new event
    const eventPrompt = `New email arrived: ${event.subject}\n${event.body}`;
    
    for await (const msg of query({
      prompt: eventPrompt,
      options: {
        sessionId: this.sessionId,  // Resume by ID
        // CLAUDE.md won't auto-load; inject instructions
        systemPrompt: this.synthesizeSystemPrompt(),
        maxTurns: 3  // Limit turns to prevent runaway
      }
    })) {
      if (msg.type === "result") {
        // Result contains usage; track for compaction decision
        if (msg.input_tokens + msg.output_tokens > 100_000) {
          await this.maybeCompact();
        }
      }
    }
  }

  private async maybeCompact() {
    // Read full transcript
    const transcript = readFileSync(this.transcriptPath, "utf-8");
    const summary = await query({
      prompt: `Summarize the following conversation for archival:\n\n${transcript}`,
      options: { maxTurns: 1 }
    });
    // Store summary in durable backend; reset session if tokens critical
  }
}
```

---

## Asymmetry Summary: Two Driver Paths

### **Interactive Claude Code (ChannelDriver)**
**Strengths:**
- ✅ Auto-discovers skills, rules, hooks, MCP from `.claude/` (no explicit registration)
- ✅ Session runs indefinitely; hooks/permissions/memory all apply continuously
- ✅ CLAUDE.md + auto memory for context carryover
- ✅ Subagents spawn automatically when relevant
- ✅ Native channel support (Telegram, Discord, iMessage; HTTP relay TBD)

**Weaknesses:**
- ❌ Permission prompts can block unattended turns (need `bypassPermissions` or permission relay)
- ❌ Harder to audit (hooks must be shell commands or MCP calls; latency)
- ❌ Channel plugins are pre-built (can't easily ship custom channels)
- ❌ Research preview: API still evolving, no guarantee of backwards compat

**Best for:** always-on, interactive, rich context, unattended but with permission safety.

---

### **TS Agent SDK (SdkDriver)**
**Strengths:**
- ✅ Lightweight: spawn fresh per event (no session overhead)
- ✅ Type-safe hooks (async callbacks, abort signal, full input shape)
- ✅ Full control: you own the agentic loop, tool list, prompt synthesis
- ✅ Scalable: sessions API allows multi-instance orchestration
- ✅ Permissions callback (`canUseTool`) is programmatic, not shell-based
- ✅ Mature & stable API (Managed Agents, Sessions in production)

**Weaknesses:**
- ❌ No filesystem auto-discovery (skills, CLAUDE.md, rules); everything explicit
- ❌ Per-event means no automatic context carryover (must resume by session_id)
- ❌ No auto memory; you manage durable state
- ❌ Subagents don't auto-spawn (registered in options; no keyword matching)
- ❌ HTTP MCP only; no stdio (limits plugin flexibility)
- ❌ System prompt is flat string (no path-scoped rules)

**Best for:** programmatic, event-driven, scalable, strong auditability.

---

## Documentation Sources

All findings cite official Anthropic documentation:

- **[Claude Code Hooks](https://code.claude.com/docs/en/hooks.md)**: PreToolUse blocking, exit codes, JSON schema
- **[Claude Code Permissions](https://code.claude.com/docs/en/permissions.md)**: permission modes, deny rules, regex patterns
- **[Claude Code Skills](https://code.claude.com/docs/en/skills.md)**: auto-discovery, lazy-loading, SKILL.md format
- **[Claude Code Memory (CLAUDE.md)](https://code.claude.com/docs/en/memory.md)**: instruction loading, auto memory, rules directory
- **[Claude Code Subagents](https://code.claude.com/docs/en/subagents.md)**: custom subagent defs, isolation, system prompts
- **[Claude Code Channels](https://code.claude.com/docs/en/channels.md)**: event push, plugin setup, permission relay, research preview status
- **[Agent SDK Hooks (TypeScript)](https://code.claude.com/docs/en/agent-sdk/hooks)**: hook callback shape, HookCallback type, PreToolUseHookInput, permissionDecision field
- **[Agent SDK TypeScript Reference](https://code.claude.com/docs/en/agent-sdk/typescript)**: query(), tool(), options shape, permissionMode, hooks config
- **[Managed Agents API (TypeScript)](https://platform.claude.com/docs/en/api/typescript/beta/agents.md)**: agent creation, system field, tools array, MCP server config
- **[Sessions API (TypeScript)](https://platform.claude.com/docs/en/api/typescript/beta/sessions.md)**: session creation, resumption by ID, thread API
- **[MCP Connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector.md)**: URL-based MCP servers, toolset config, no stdio support
- **[Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview.md)**: API-managed skills, no filesystem discovery in SDK, level-based loading

---

## Conclusion

Your library must **bridge two asymmetric worlds:**

1. **ChannelDriver** (interactive CC + channels): auto-discovers everything, requires unattended permission handling, excellent for context
2. **SdkDriver** (per-event SDK): explicit everything, full control, scalable, excellent for auditability

**Single unified allowlist + audit system** handles both via PreToolUse hooks (CC shell commands + SDK callbacks) and custom permission callbacks (SDK `canUseTool`).

**Skills, CLAUDE.md, MCP, subagents**: replicate in library because SDK won't auto-load.

**Sessions:** managed by library; SDK resumes by `session_id`; you synthesize system prompts on each invocation.

**Channels:** CC has native support (research preview); SDK must poll/webhook instead.

**Verdict:** your library is **necessary and non-redundant**. Neither Claude Code nor the SDK alone provides the transport, scheduling, multi-driver routing, and durable state your assistant requires.
