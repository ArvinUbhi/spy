# Run Centre and MCP workspace (0.8)

## Follow and steer a run

Open **Run Centre** for the selected session. Overview cards show reported objectives, current actions, captured results, blockers and next steps. Unknown plans stay unreported. **Check progress / correct** opens a nonmodal correction drawer with the exact target and an editable prompt. Agents can explicitly report objective/result/nextStep through `spy_observe` with `type: viewer.progress`. This is an orchestrator report, not independently verified completion.

**Timeline** combines captured prompts, delegation, tools, requests and outcomes. Search by payload or filter by agent. Move the moment slider to reconstruct state from the loaded event sequence. Historical state does not reuse current agent state. A partial window can lack the event that began a tool or request. Pause updates while reviewing; no runtime pause is implied.

**Corrections** connects each retained prompt to its delivery record and subsequent target activity, stopping at the next correction for that target. Delivery means runtime acceptance. Subsequent events are temporal evidence, not proof of causation or compliance. Review them, add a note, and mark Evidence confirms correction or Needs more work. Reviews persist in the event archive. Follow up prepares a new editable prompt.

**Files** pairs captured edit/create/write/patch tool arguments with results, extracts paths and shows captured before/after or patch text. It does not read arbitrary local repositories. Failed calls are attempts, not confirmed modifications. Concurrent successful edits by different agents flag possible conflicts; Prepare conflict review targets the coordinator. Shell writes, custom tools without recognised paths and truncated payloads may be unavailable. Diff views describe captured tool input, not a fresh verification of disk contents.

**Needs input** collects unresolved captured permission/user-input/elicitation requests, blocked/failed/stale/offline agents and identical tool arguments returning identical outcomes at least three times. Intentional polling may repeat. Inspect the evidence or prepare an intervention. Native approvals still happen in Copilot. A finished target is unavailable for injection; send the coordinator a continuation request instead. Stop-after-this-step is an instruction, not guaranteed process cancellation. Pause/resume/cancel execution is not advertised without a supported runtime API.

**Compare runs** shows observed outcome/state, first-to-last observed duration, calls, failures, reported tokens and corrections in the loaded window. It does not claim a task succeeded merely because agents are idle. Live aggregate counters and archived metadata can have different coverage.

Run Centre loads 500 events per request, keeps up to 2,000 in the browser, and displays up to 250 matching timeline entries. Load older evidence pauses updates and moves through the archive. Analysis is explicitly scoped to loaded evidence; retained transcript exports are independent of the display window. History retention settings still bound what remains available.

The live graph keeps its agent inspector alongside the graph. Filter activity/tools, resize the desktop inspector, open the full searchable workspace, or send a correction. Ctrl/Cmd K opens quick navigation; arrow keys and Enter choose pages/agents. Reading preferences adjust text size (14–20 px base) and comfortable/compact spacing. Preferences and prompt drafts are browser-local.

## Recovery

Recovery shows collector/archive health, recovery repairs, expired-event counts, disconnected runs, exports and unsent browser prompt drafts. Open and edit a draft without dispatching it. Open its session/agent to review and send. Drafts can be copied or explicitly deleted. Only drafts from this browser/profile are visible. Uncaptured, expired or previously lost data cannot be reconstructed.

## MCP connections

**MCP servers & tools → Add / import servers** accepts a JSON object containing `mcpServers`. Import local Copilot MCPs reads only `~/.copilot/mcp-config.json`. Neither operation changes that Copilot file. Import saves configuration without connecting or installing packages. Clicking Connect explicitly starts the configured stdio process or contacts its HTTP endpoint. Treat imported commands as programs you choose to run. Disconnect stops the Spy-owned process/connection.

Examples:

```json
{"mcpServers":{"local-tools":{"command":"node","args":["/absolute/path/server.mjs"],"envRefs":{"API_TOKEN":"MY_MCP_TOKEN"}}}}
```

```json
{"mcpServers":{"remote-tools":{"url":"https://example.com/mcp","headerEnv":{"Authorization":"MY_MCP_AUTHORIZATION"}}}}
```

Environment references are names of variables in the collector process. For example MY_MCP_AUTHORIZATION contains the complete Authorization value, including a required Bearer prefix. Literal `env` and `headers` maps from existing configurations are accepted and stored locally, with values omitted from the browser catalog. Restart the collector after changing its inherited environment. Registry files use owner-only permissions where the OS supports them. Configure Windows ACLs through your normal local policy.

This initial client negotiates MCP **2025-11-25, 2025-06-18 or 2025-03-26**, using newline-delimited stdio or Streamable HTTP (JSON and POST response SSE, session/version headers). Servers must support one of these protocol revisions. Legacy HTTP+SSE, the newer 2026 transport, OAuth/browser login, sampling, roots, elicitation and task-required tool execution are not implemented. Server requests for unadvertised client capabilities are rejected. List-changed notifications observed on active responses mark catalogs stale; Refresh tools re-discovers them. There is no background GET subscription or automatic resumption/retry of tool calls. Authentication and enterprise proxy/TLS policy must already work from the collector's Node process.

Choose a tool to inspect its description, input schema and server-supplied annotations. Enter a JSON argument object, then **Run selected tool**. This is an explicit invocation as you from the MCP console, separate from an agent execution. Results, durations and errors appear in the console and the retained **MCP console** session. Annotations are untrusted metadata, not proof of safety. The server validates its tool's arguments. Calls require request IDs, deduplicate retries during the current process, and are never automatically retried after an uncertain result. Timeouts/disconnects show unconfirmed execution; inspect the server before another attempt. The live console dedupe cache does not survive collector restarts.

**Request tool for stage** adds a qualified server/tool name to the saved design. Prepare an updated brief in Design to send it to an instance. **Prepare agent tool request** opens the coordinator with a proposed tool request. These are instructions. Spy's MCP clients and Copilot's MCP clients are separate: a new Spy connection does not expose a tool inside a running Copilot host. Configure the same MCP in Copilot and reload it there, then let the agent verify the exposed tool name/schema and permissions.

Agent MCP activity uses explicit `mcpServerName`/`mcpToolName` attribution when the host supplies it; name-prefix matches against imported server names are labelled inferred. All ordinary tool events remain visible even when MCP provenance is absent. No model request is fabricated from a manual console call.

## Bounds and persistence

Up to 30 saved server configurations, 500 discovered tools per server, 20 catalog pages, 2 MiB per catalog/response, 64 KB arguments, eight concurrent tool calls and 60-second request timeouts. Live call receipts retain 100 recent entries (30 exposed in polling snapshots). Result capture is excerpted at 128 KB and polling results at 16 KB, with truncation labels. Credentials persist beside history at `SPY_HISTORY_PATH + .mcp.json`; registry/design/history files are excluded from release packages. Connections do not automatically restart after collector restart.

Protocol references: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports and https://modelcontextprotocol.io/specification/2025-11-25/server/tools .
