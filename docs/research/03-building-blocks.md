# Building-Block Ecosystems for a Self-Hosted Claude-Code Personal Assistant (2026)

**Scope.** Reusable building blocks that shape how the OpenClaw assistant is composed and run: (1) composable **skill/plugin** systems, (2) agent **memory** systems, (3) the **MCP** server/SDK ecosystem, (4) self-hosted **voice** (STT/TTS), (5) **local-model** serving for the privacy fallback.

**Method.** Deep research with fan-out web search + primary-source fetches (specs, official docs, source repos), cross-checked where possible. Inline URLs accompany every nontrivial claim. A "Confidence & gaps" note closes each section; vendor-reported benchmarks are flagged. Last verified: 2026-05-28.

**Bottom line up front.** The OpenClaw stack should lean on **Anthropic Agent Skills (SKILL.md folders)** as its native declarative capability format, **MCP** as the access/integration layer (with strict OAuth 2.1 scoping because this assistant has real account access), a **memory layer (Mem0 or Letta) backed by a local-first store** for durable cross-session memory, a **Wyoming-based voice stack (faster-whisper + Piper/Kokoro + openWakeWord)** for self-hosted voice, and **Ollama (dev) / vLLM (serving)** running **Qwen3 / gpt-oss** as the local privacy fallback behind a Claude-primary router.

---

## 1. Skills / Plugin Architectures

### The pattern
A good capability format for an autonomous assistant is **declarative, progressively disclosed, and composable**: cheap to advertise, lazily loaded, and able to bundle both *instructions* (how to do a task) and *executable code* (scripts that don't need token-by-token reasoning).

### Claude Agent Skills (the SKILL.md convention) — recommended primary format
Anthropic's Agent Skills package expertise into **folders** that Claude loads dynamically. A Skill is a folder with a `SKILL.md` file plus optional supporting files (scripts, references, assets) ([Anthropic engineering](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills); [Claude Docs](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)).

**Format** — YAML frontmatter + Markdown body ([Claude Docs](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)):
- Required: `name` (lowercase-hyphenated, ≤64 chars), `description` (≤1024 chars — the field Claude matches against to decide whether to load the skill).
- Optional: `allowed-tools` (restrict tools the skill may use — important for least-privilege), plus platform-specific metadata/license.

**Folder structure** ([Claude Docs](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)):
```
my-skill/
  SKILL.md        # required: frontmatter + instructions
  scripts/        # optional: executable code (run, not necessarily read into context)
  references/      # optional: docs loaded on demand
  assets/          # optional: templates/files
```

**Progressive disclosure (3 levels)** — the key efficiency property ([Claude Docs](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview); [Simon Willison](https://simonwillison.net/2025/Oct/16/claude-skills/)):
1. **Metadata** (`name` + `description`) is always in context — cheap awareness of every installed skill.
2. **SKILL.md body** loads only when Claude judges the skill relevant.
3. **Bundled files** load (or *execute*) only on demand — scripts can run without their source entering the context window, saving tokens.

**Composition & invocation.** Multiple skills can be active simultaneously and Claude composes them; skills are model-invoked autonomously based on description match ([Claude Docs](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)). In Claude Code, skills live in `~/.claude/skills/` (personal), `.claude/skills/` (project), or are plugin-bundled ([Claude Docs](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)). Templates: [github.com/anthropics/skills](https://github.com/anthropics/skills).

### Skills vs MCP — complementary, not competing
- **Skills** = procedural knowledge + instructions + code loaded into the model's context: they tell Claude **how** to do something.
- **MCP** = connection to external systems/data via tools/resources: it gives Claude **access** to something.
- They compose: a Skill can instruct Claude how to use specific MCP tools effectively ([Claude Docs](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)).

Simon Willison argues Skills may be "a bigger deal than MCP" precisely because the format is so simple — a folder of Markdown plus scripts, no protocol/server to run, low token cost via progressive disclosure ([Simon Willison](https://simonwillison.net/2025/Oct/16/claude-skills/)). The practical reading: **Skills for capability/behavior, MCP for integration/access.**

### Other plugin models (for cross-pollination, not adoption)
| System | Plugin model | Notes |
|---|---|---|
| **LangChain** | `@tool`-decorated Python functions / Tool objects bound to an LLM | Code-first, in-process; powerful but couples capability to a framework runtime, not declarative/portable. |
| **Open WebUI** | **Tools**, **Functions** (Filters/Pipes/Actions), **Pipelines**; increasingly supports OpenAPI tool servers and MCP | Python plugins executed by the server; good UI ecosystem ([trychroma/openwebui ecosystem](https://www.trychroma.com/)). MCP/OpenAPI bridging makes it interoperable. |
| **LibreChat** | Agents + native **MCP server** support + actions/plugins | Self-hostable chat UI that consumes MCP servers directly — a useful reference for how a UI layer can ride the MCP ecosystem rather than a bespoke plugin format. |

### What makes a good declarative skill format for OpenClaw
1. **Declarative + filesystem-native** (Markdown + frontmatter + a folder) so skills are git-versioned, reviewable, and reproducible — matches the "own the stack / reproducible" principles.
2. **Progressive disclosure** to keep the always-on context small.
3. **`allowed-tools` scoping** baked into the frontmatter for least privilege.
4. **Bundled executable scripts** for deterministic work (no token reasoning).
5. **Portable** — the SKILL.md convention works across Claude Code and the Agent SDK, so OpenClaw can reuse the same artifacts.

**Recommendation:** Adopt the **SKILL.md folder convention as OpenClaw's native skill format**, store skills in the repo (`.claude/skills/` + a project skills dir), require `allowed-tools` on every skill that touches accounts, and treat MCP as the access layer that skills orchestrate.

**Confidence:** High on the SKILL.md format and skills-vs-MCP distinction (primary docs + Anthropic engineering post). Medium on Open WebUI/LibreChat plugin internals (search-level; verify exact APIs before integrating).

---

## 2. Memory Systems

### The pattern
An always-on assistant needs **durable, cross-session memory** decoupled from any single conversation. Useful taxonomy:
- **Working memory** — what's in the current context window (ephemeral).
- **Episodic memory** — records of specific events/conversations ("on May 12 the user said…").
- **Semantic memory** — distilled facts/preferences ("user prefers metric units").
- **Procedural memory** — how-to knowledge (overlaps with Skills above).

The core engineering problem: **promote** salient items from working → long-term, **consolidate/dedupe** them, and **retrieve** the right subset back into context. Two dominant architectural styles: (a) **OS-style memory paging** (Letta/MemGPT) and (b) **extract-and-store memory layers** (Mem0, Cognee) optionally backed by **temporal knowledge graphs** (Zep/Graphiti).

### Leading frameworks
| Project | Architecture | Stores | License | Self-host | Maturity |
|---|---|---|---|---|---|
| **Letta** (ex-MemGPT) | OS-style: **core / archival / recall** memory; LLM-driven "paging" between in-context and external store; shareable **memory blocks** | Postgres+pgvector (prod), SQLite (dev) | Apache 2.0 | Yes (Docker/pip; REST API + ADE) | High — most established stateful-agent platform |
| **Mem0** | LLM extracts salient facts, then **ADD/UPDATE/DELETE** (consolidation); hybrid vector + KV + graph; simple `add`/`search`/`get_all` API | Qdrant (default), Chroma, pgvector, Weaviate, FAISS, Redis, Milvus | Apache 2.0 | Yes (`pip install mem0ai`; fully local with Ollama) | High — widely used drop-in memory layer |
| **Zep / Graphiti** | **Temporal knowledge graph** (Graphiti is the OSS engine); **bi-temporal** edges (event time + ingestion time), temporal edge invalidation; hybrid semantic+BM25+graph retrieval | Neo4j or FalkorDB + embeddings | Apache 2.0 (Graphiti) | Yes (Graphiti OSS; Zep cloud is commercial) | High for graph memory; Graphiti is the self-host path |
| **Cognee** | **ECL pipeline** (Extract → Cognify → Load): builds KG + embeddings from raw data | Graph: Neo4j/Kuzu/NetworkX; Vector: LanceDB (default)/Qdrant/pgvector/Chroma; Rel: SQLite/Postgres | Apache 2.0 (core) | Yes (local with Ollama + local stores) | Growing/popular, younger/less battle-tested than Letta |

Sources: [Letta](https://github.com/letta-ai/letta), [Mem0](https://github.com/mem0ai/mem0), [Graphiti](https://github.com/getzep/graphiti), [Cognee](https://github.com/topoteretes/cognee).

- **Letta** persists agent state (memory + history) in the DB so agents retain memory across restarts/sessions by default; provider-agnostic (OpenAI, Anthropic, Ollama, vLLM) ([Letta](https://github.com/letta-ai/letta)).
- **Mem0** reports (LOCOMO benchmark) ~26% higher accuracy than OpenAI memory, ~91% lower latency, ~90% token savings vs full-context — **vendor-reported, treat with caution** ([Mem0](https://github.com/mem0ai/mem0)).
- **Graphiti's** bi-temporal model and edge invalidation are the standout feature for an assistant whose facts change over time (e.g., "I now work at X") — it preserves history instead of overwriting ([Graphiti](https://github.com/getzep/graphiti)).

### Local-first vector / storage backends
| Store | Form factor | Index | License | Best for |
|---|---|---|---|---|
| **sqlite-vec** | SQLite extension, pure C, zero deps, runs anywhere (incl. Pi/WASM) | Brute-force KNN today (ANN on roadmap) | MIT/Apache 2.0 | Embedded local-first; small–moderate datasets (≲ low millions) ([sqlite-vec](https://github.com/asg017/sqlite-vec)) |
| **LanceDB** | Embedded, columnar (Lance format), multimodal | ANN (IVF/HNSW-style) | Apache 2.0 | Embedded but scales further than sqlite-vec; Cognee's default ([LanceDB](https://github.com/lancedb/lancedb)) |
| **Chroma** | Embedded or client/server | ANN (HNSW) | Apache 2.0 | Easy dev/prototyping; popular ([Chroma](https://www.trychroma.com/)) |
| **Qdrant** | Standalone server (Rust) | HNSW, filtering, quantization | Apache 2.0 | Production server; Mem0's default; high scale ([Qdrant](https://github.com/qdrant/qdrant)) |

**Recommendation:** For an always-on home-lab assistant, use **Mem0 as the memory layer** (simple API, consolidation logic, provider-agnostic, runs fully local with Ollama) backed initially by **sqlite-vec or Chroma** for simplicity, with a migration path to **Qdrant** if recall volume grows. If the assistant's facts evolve a lot and you want auditable history, add **Graphiti** (Neo4j/FalkorDB) for temporal-graph episodic memory. Consider **Letta** if you want the agent itself to own memory management end-to-end rather than bolting a layer onto Claude Code. Keep memory **local-first** (privacy principle) and expose it to the assistant via an MCP server.

**Confidence:** High on architectures/licenses (repos). Benchmark superiority claims are vendor-reported — flag as unverified.

---

## 3. MCP Ecosystem

### The pattern
MCP is the open, JSON-RPC-2.0-based protocol that standardizes how agents access external tools/data — the "USB-C for AI tools." For an assistant with **real account access**, MCP's value is interoperability *and* a defined security model.

### The spec (2025-06-18 — current revision)
Core primitives ([MCP spec 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18)):
- **Tools** (model-controlled functions; name + description + JSON-Schema input).
- **Resources** (application-controlled contextual data, URI-addressed).
- **Prompts** (user-controlled templates, e.g., slash commands).
- Server→client: **Sampling** (server requests an LLM completion), **Elicitation** (server requests user input — **new** in 2025-06-18), **Roots** (client exposes filesystem roots).

**Transports** ([spec](https://modelcontextprotocol.io/specification/2025-06-18)):
- **stdio** — local subprocess over stdin/stdout (recommended for local servers; ideal for OpenAClaw's home-lab tools).
- **Streamable HTTP** — single endpoint, POST + optional SSE; **replaces** the older HTTP+SSE transport (SSE-only is deprecated).

**What changed in 2025-06-18:** removed JSON-RPC batching; added **structured tool output**; added **elicitation**; added **Resource Indicators** requirement; classified servers as OAuth Resource Servers; added `MCP-Protocol-Version` header negotiation ([spec](https://modelcontextprotocol.io/specification/2025-06-18)).

### Security model — critical for an account-connected assistant
For HTTP transports, MCP defines an **OAuth 2.1**-based authorization framework ([MCP authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)):
- MCP servers are **OAuth 2.0 Resource Servers**.
- Clients must use **Resource Indicators (RFC 8707)** to bind tokens to a specific server — preventing token passthrough/confused-deputy attacks.
- Authorization Server discovery via **RFC 9728 (Protected Resource Metadata)**.
- Servers **MUST NOT** accept tokens not issued for them; **no token passthrough**; **PKCE required**.

For OpenClaw this maps directly to its least-privilege principle: **scope each MCP server's token to exactly its resource**, prefer **stdio for local/trusted tools** (no network exposure), and require OAuth 2.1 + Resource Indicators for any HTTP-exposed server.

### Registry, SDKs, and authoring
- **Official MCP Registry** — centralized catalog/API for discovering public MCP servers; launched in **preview Sept 2025** (Anthropic + GitHub + PulseMCP + community). Provides DNS-style reverse-domain **namespacing** (e.g., `io.github.user/server`), a discovery REST API meant for sub-registries/clients, canonical metadata, and a **self-hostable** open-source codebase for private sub-registries ([MCP Registry](https://modelcontextprotocol.io/registry)). Status: preview/maturing.
- **Reference servers & SDKs**: official servers at [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers); SDKs exist for TypeScript, Python, and more (per the MCP project).
- **Awesome-lists / discovery**: [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) and PulseMCP for surveying the ecosystem.

**Authoring an MCP adapter (pattern):** implement a small server in the Python/TS SDK exposing `tools` (with JSON-Schema inputs), optional `resources`/`prompts`; run over **stdio** for local use; for remote use add Streamable HTTP + OAuth 2.1 Resource-Server auth with Resource Indicators. Register in a private self-hosted sub-registry for reproducible discovery.

**Recommendation:** Standardize OpenClaw's integrations as **MCP servers**, default to **stdio for home-lab/local tools**, and enforce **OAuth 2.1 + Resource Indicators** for anything network-exposed. Run a **private self-hosted MCP sub-registry** for reproducible, auditable tool discovery. Treat the public registry as preview — pin/vendor servers you depend on rather than pulling untrusted ones at runtime.

**Confidence:** High (primary spec + official docs). Registry is explicitly preview — features may shift.

---

## 4. Self-Hosted Voice (STT / TTS)

### The pattern
A self-hosted voice loop = **wake word → STT → agent → TTS**, with each stage a swappable service. The **Wyoming protocol** (Home Assistant's open ecosystem) is the de-facto integration glue and makes each stage independently replaceable.

### STT (speech-to-text)
| Engine | Backend | Hardware | License | Notes |
|---|---|---|---|---|
| **faster-whisper** | CTranslate2 | GPU (CUDA) best; int8 on CPU viable for small/base | MIT | **~4x faster** than openai/whisper, less memory; int8 quantization; large-v3 ≫ real-time on a decent GPU ([faster-whisper](https://github.com/SYSTRAN/faster-whisper)) |
| **whisper.cpp** | GGML, pure C/C++ | Excellent CPU/edge portability | MIT | Preferred for pure-CPU/edge & broad portability; faster-whisper generally wins on GPU ([faster-whisper](https://github.com/SYSTRAN/faster-whisper)) |
| **openai/whisper** | PyTorch | GPU | MIT | Reference impl; slower than the above |

### TTS (text-to-speech)
| Engine | Size/arch | Hardware | License | Notes |
|---|---|---|---|---|
| **Piper** | VITS → ONNX | Real-time on **Raspberry Pi 4 (CPU)**, no GPU | MIT | 30+ languages, quality tiers; default local TTS for Home Assistant via `wyoming-piper` ([Piper](https://github.com/rhasspy/piper)) |
| **Kokoro** | 82M params | Fast on CPU; easily real-time on a small GPU | Apache 2.0 | Top-of-leaderboard naturalness for its size (TTS Arena); preset voices, not zero-shot cloning ([Kokoro](https://github.com/hexgrad/kokoro)) |
| **Coqui XTTS-v2** | Larger | Needs more compute (GPU preferred) | Coqui Public Model License (non-standard — check terms) | Zero-shot **voice cloning**, expressive; heavier than Piper/Kokoro |

### Wake word + full stacks
- **openWakeWord** — open wake-word detection, integrates via `wyoming-openwakeword` ([openWakeWord](https://github.com/dscripka/openWakeWord)).
- **Wyoming protocol** — peer-to-peer JSONL-over-TCP for streaming audio/events; connects swappable STT (`wyoming-faster-whisper`), TTS (`wyoming-piper`), and wake-word (`wyoming-openwakeword`) services to **Home Assistant Assist**. **Satellites** (Raspberry Pi, ESP32 Voice PE) capture audio + do wake-word locally, then stream to a central processor — enabling distributed mics with central inference. All open source under the Open Home Foundation ([Wyoming](https://www.home-assistant.io/integrations/wyoming/)).
- **OVOS (OpenVoiceOS)** — fully open, plugin-based voice assistant OS (Mycroft successor); heavier/more complete framework if you want a standalone assistant OS rather than HA-centric glue ([OVOS](https://www.openvoiceos.org/)).

### What's realistic on home-lab hardware in 2026
- **CPU-only / Raspberry Pi**: Piper TTS + small/base faster-whisper (int8) or whisper.cpp + openWakeWord — fully real-time, no GPU. Good for satellites.
- **One modest GPU** (e.g., 8–12 GB): faster-whisper large-v3 ≫ real-time + Kokoro TTS for higher quality — comfortable headroom, can also host the local fallback LLM.

**Recommendation:** Build the voice loop on **Wyoming** for swappability: **openWakeWord** → **faster-whisper** (GPU large-v3, or whisper.cpp on CPU satellites) → OpenClaw agent → **Piper** (lightweight/satellite) or **Kokoro** (higher quality, central GPU). Use **XTTS only if voice cloning is required** (and verify its license). Distribute mics as **Wyoming satellites** with central inference on the home-lab box.

**Confidence:** High on engines/licenses (repos) and Wyoming architecture (HA docs). XTTS license is non-standard — verify before any commercial/shared use. Kokoro's "top of TTS Arena" is community-leaderboard-based.

---

## 5. Local Models (Privacy Fallback)

### The pattern
The privacy fallback should be **OpenAI-API-compatible** so OpenClaw can route privacy-sensitive tasks to a local endpoint behind the same interface as Claude. Choose the serving stack by deployment mode (single-user/dev vs. concurrent serving) and pick open models with **strong tool-calling**.

### Serving stacks
| Stack | Strength | Hardware | API | License | Use here |
|---|---|---|---|---|---|
| **Ollama** | Easiest local serving; wraps llama.cpp (GGUF) | CPU + GPU (CUDA/ROCm/Metal); auto layer-offload | Native + **OpenAI-compatible** `/v1/chat/completions`; tool calling + structured output | MIT | **Dev / single-user default** ([Ollama](https://github.com/ollama/ollama)) |
| **vLLM** | High-throughput **production serving** (PagedAttention, continuous batching) | GPU-focused (CUDA/ROCm/etc.), needs VRAM for weights + KV cache | **OpenAI-compatible**; tool-calling parsers (Hermes/Mistral/Llama/Qwen) | Apache 2.0 | **Concurrent/always-on serving** ([vLLM](https://github.com/vllm-project/vllm)) |
| **llama.cpp** | Portable CPU/edge GGUF inference | CPU + GPU, very low-resource | OpenAI-compatible server | MIT | Edge/CPU-only fallback |
| **LM Studio** | Desktop GUI + local OpenAI-compatible server | CPU/GPU | OpenAI-compatible | Proprietary app (free) | Quick experimentation, not headless servers ([LM Studio](https://lmstudio.ai/)) |

vLLM is built for high-throughput multi-user GPU serving; Ollama/llama.cpp prioritize ease-of-use and single-user/CPU/edge inference ([vLLM](https://github.com/vllm-project/vllm); [Ollama](https://github.com/ollama/ollama)).

### Viable open models for agentic / tool-calling
| Model | Sizes | Tool-calling / agentic | License | VRAM (rough, Q4) |
|---|---|---|---|---|
| **Qwen3** | Dense 0.6–32B; MoE 30B-A3B, 235B-A22B; hybrid think/no-think; 128K ctx | Strong on BFCL function-calling; Qwen-Agent integration; MoE = low active params for efficient agentic use | Apache 2.0 | 8B ≈ 6–8 GB; 14B ≈ 10–12 GB; 32B ≈ 20–24 GB; **30B-A3B MoE** strong perf at low active cost ([Qwen3](https://qwenlm.github.io/blog/qwen3/)) |
| **gpt-oss** | 20B (~3.6B active), 120b (~5.1B active), MoE | Native tool use (browse/Python/function call), configurable reasoning effort; built for agentic workflows | Apache 2.0 | **20b ≈ 16 GB**; 120b ≈ single 80GB GPU (MXFP4) ([gpt-oss](https://openai.com/index/introducing-gpt-oss/)) |
| **Llama 4 / DeepSeek V3** | MoE families | Capable; large-scale | Llama Community License / MIT-ish | Higher; 100B+ class needs serious VRAM ([Llama 4](https://ai.meta.com/blog/llama-4-multimodal-intelligence/); [DeepSeek-V3](https://github.com/deepseek-ai/DeepSeek-V3)) |

Benchmark reference for tool-calling: the **Berkeley Function-Calling Leaderboard (BFCL)** ([gorilla.cs.berkeley.edu/leaderboard.html](https://gorilla.cs.berkeley.edu/leaderboard.html)).

### Using a local model as a privacy fallback behind Claude-primary
- Expose the local model via an **OpenAI-compatible endpoint** (Ollama for dev, vLLM for always-on).
- Add a **router** in OpenClaw: default to **Claude** (best agentic quality); for **privacy-tagged** tasks (or when offline), route to the local endpoint.
- Pick a model that fits the home-lab GPU **and** tool-calls well: **Qwen3-14B/32B** or **gpt-oss-20b** are the sweet spot — both Apache 2.0, both strong agentic, both fit a single consumer/prosumer GPU.
- Validate the chosen model's tool-calling on **your** MCP tools before trusting it with account actions (local models lag Claude on multi-step agentic reliability — treat as fallback, not peer).

**Recommendation:** Run **Ollama** for development/single-user and **vLLM** for the always-on serving path, both behind an OpenAI-compatible interface. Default model: **Qwen3-30B-A3B (MoE)** if you have ~24 GB VRAM (efficient agentic, only 3B active) or **gpt-oss-20b** for a ~16 GB box; both Apache 2.0. Gate the local path behind a **privacy router** with Claude as primary.

**Confidence:** High on serving-stack characteristics and model licenses/sizes (repos/official posts). VRAM figures are rough rules-of-thumb (depend on quantization/context). "Best agentic model" shifts fast — re-check BFCL and re-test before relying on any local model for account-touching actions.

---

## Concrete Recommendations per Workstream

| Workstream | Recommendation | Why |
|---|---|---|
| **Skills/Plugins** | Adopt the **SKILL.md folder convention** as OpenClaw's native skill format; git-versioned in-repo; require `allowed-tools` on account-touching skills; bundle deterministic scripts | Declarative, progressively disclosed, portable across Claude Code/SDK; least-privilege + reproducible by construction |
| **Memory** | **Mem0** memory layer (local, Apache 2.0) on **sqlite-vec/Chroma** → **Qdrant** at scale; add **Graphiti** for temporal/episodic history if facts evolve; expose memory via an MCP server | Durable cross-session memory, local-first/private, simple API, consolidation built in |
| **MCP** | Standardize integrations as **MCP servers**; **stdio** for local tools; **OAuth 2.1 + Resource Indicators** for any HTTP server; run a **private self-hosted sub-registry**; pin/vendor dependencies | Interoperable + the spec's security model directly enforces least-privilege for account access |
| **Voice** | **Wyoming**-based loop: **openWakeWord → faster-whisper → Piper/Kokoro**; distribute mics as **Wyoming satellites** with central GPU inference; XTTS only if cloning needed | Fully self-hosted, swappable, realistic on a Pi (satellites) + one modest GPU (central) |
| **Local models** | **Ollama** (dev) + **vLLM** (serving), OpenAI-compatible; **Qwen3-30B-A3B** or **gpt-oss-20b** (Apache 2.0); **privacy router** with Claude primary, local fallback; re-test tool-calling before trusting account actions | Provider-flexible privacy fallback that fits home-lab GPUs and tool-calls reliably enough as a backstop |

### Cross-cutting fit with OpenClaw principles
- **Own the stack / reproducible** → SKILL.md in git, self-hosted MCP sub-registry, local memory + voice + models.
- **Least privilege / auditable** → `allowed-tools` per skill, MCP OAuth 2.1 + Resource Indicators, scoped tokens, stdio for local tools.
- **Provider-flexible** → OpenAI-compatible local endpoints + a Claude-primary router.
- **Observable / incremental trust** → start with stdio MCP + read-only tools, expand scopes as trust grows; validate local-model tool-calling before granting account actions.

---

## Confidence & Gaps (overall)
- **Well-established (primary sources):** SKILL.md format & progressive disclosure; skills-vs-MCP distinction; MCP 2025-06-18 spec, transports, and OAuth 2.1/Resource-Indicators security; memory-framework architectures and licenses; voice-engine specs and Wyoming architecture; serving-stack characteristics and open-model sizes/licenses.
- **Single-sourced / vendor-reported (treat with caution):** Mem0's LOCOMO accuracy/latency/token claims; Kokoro's TTS-Arena ranking; specific throughput multipliers.
- **Fast-moving / re-verify before building:** the "best" local agentic model (Qwen3 vs gpt-oss vs newer) — re-check **BFCL**; the **MCP Registry** is in preview; Open WebUI/LibreChat plugin APIs were search-level (confirm exact interfaces); exact VRAM depends on quantization/context.
- **Not deeply tested here:** real-world multi-step agentic reliability of local models on OpenClaw's actual MCP toolset — must be empirically validated before granting account-level permissions.

## Key Sources
- Anthropic — Agent Skills engineering post: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- Claude Docs — Agent Skills overview: https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview
- Simon Willison — Claude Skills analysis: https://simonwillison.net/2025/Oct/16/claude-skills/
- anthropics/skills templates: https://github.com/anthropics/skills
- MCP spec 2025-06-18: https://modelcontextprotocol.io/specification/2025-06-18
- MCP authorization: https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
- MCP Registry: https://modelcontextprotocol.io/registry
- MCP reference servers: https://github.com/modelcontextprotocol/servers ; awesome list: https://github.com/punkpeye/awesome-mcp-servers
- Letta: https://github.com/letta-ai/letta · Mem0: https://github.com/mem0ai/mem0 · Graphiti: https://github.com/getzep/graphiti · Cognee: https://github.com/topoteretes/cognee
- sqlite-vec: https://github.com/asg017/sqlite-vec · LanceDB: https://github.com/lancedb/lancedb · Chroma: https://www.trychroma.com/ · Qdrant: https://github.com/qdrant/qdrant
- faster-whisper: https://github.com/SYSTRAN/faster-whisper · Piper: https://github.com/rhasspy/piper · Kokoro: https://github.com/hexgrad/kokoro · openWakeWord: https://github.com/dscripka/openWakeWord
- Wyoming/HA: https://www.home-assistant.io/integrations/wyoming/ · OVOS: https://www.openvoiceos.org/
- Ollama: https://github.com/ollama/ollama · vLLM: https://github.com/vllm-project/vllm · LM Studio: https://lmstudio.ai/
- Qwen3: https://qwenlm.github.io/blog/qwen3/ · gpt-oss: https://openai.com/index/introducing-gpt-oss/ · BFCL: https://gorilla.cs.berkeley.edu/leaderboard.html
