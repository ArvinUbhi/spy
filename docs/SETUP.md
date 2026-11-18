# Connecting Spy

## What you need

| Component | Required? | Why |
|---|---|---|
| Node.js 22.12+ | Yes | Runs Spy's local collector and session bridge |
| GitHub Copilot CLI (`copilot`) | Yes, for live sessions | Its extension supplies agent events |
| Copilot sign-in and extension support | Yes | Spy uses the CLI's session extension API |
| GitHub CLI (`gh`) | **No** | Spy does not call it |
| Git | **No** | Downloading/extracting a release ZIP is enough |
| npm dependency install | **No for release ZIPs** | The compiled React app is included |

## First setup

1. Download the ZIP from [Releases](https://github.com/ArvinUbhi/spy/releases/latest), rather than the auto-generated source archive.
2. Extract it fully. Run `start.cmd` (Windows) or `sh start.sh` (macOS/Linux).
3. The launcher installs `~/.copilot/extensions/spy/`, including the built local runtime. A custom `COPILOT_HOME` is respected when set. It stops the previous verified Spy collector on the selected port, then runs the viewer in this command window and opens the browser. Keep the command window open.
4. Start a new terminal session in any repository with `copilot --experimental`. If your CLI asks to enable Spy or blocks experimental extensions, run `/experimental on`, then use `/extensions manage` to check that Spy is running. `/env` also lists loaded extensions.
5. Give Copilot a task. Its session appears in Spy. Delegated agents appear when the runtime emits their events.

There is no separate Spy GitHub login or token to configure. Spy uses the existing local Copilot session.

## Normal use with multiple sessions

Continue opening `copilot --experimental` sessions normally. To avoid the flag on future sessions, you can explicitly enable the documented persistent setting in Copilot with `/settings experimental true`, then run plain `copilot`. Spy does not change that setting automatically. Each loads the user-level bridge. All sessions connect to the viewer opened with start.cmd/start.sh. Updated bridges do not auto-start hidden collectors. Run one viewer for all sessions.

Open **http://127.0.0.1:4317** to inspect work. The sidebar lists connected sessions. Only the selected session's detailed graph is sent to the browser; others send summaries. Switch sessions to inspect their live graphs.

The bridge is loaded at session startup. For a session already open before installation, run `/experimental on` if needed, then ask Copilot **`Reload my extensions`**. This loads the bridge without requiring a new task/session. Check `/extensions manage` for Spy’s status. If your CLI does not support hot reload, open a new session. Spy does not read old journals or attach to arbitrary terminal processes. Start Spy before the work you want to see: a collector restart cannot reconstruct earlier events.

Closing the browser does not stop the collector. Press Ctrl+C or close its command window to stop it, or run stop.cmd / sh stop.sh. Starting Spy again stops the old verified collector on the selected port before opening a fresh one. Copilot sessions keep running and updated bridges reconnect when the viewer returns. A restart clears the in-memory graph. After upgrading, reload extensions in existing sessions so old bridges stop auto-starting collectors. Spy never sends agent instructions or changes execution permissions.

## Resource readouts

The footer shows collector CPU, RSS memory and event rate. It also shows the sum of reported active bridges' CPU/RSS. Shared resident pages may be counted more than once in summed RSS. Collector measurements refresh every second; bridge measurements every five seconds. CPU is percentage of one logical core; RSS is process resident memory. These values exclude Copilot itself and the browser; portable browser CPU measurement is unavailable to an ordinary React app.

The bridge uses a bounded queue and batch limits. Live projection is coalesced at up to ten updates per second. The UI has no external fonts, analytics or hosted backend. [Benchmarks](BENCHMARKS.md) include measured idle collector footprint and concurrent-session payload size.

## Troubleshooting

- **No sessions:** check that `copilot` is signed in, the CLI supports extensions, Spy is enabled and the session started after installation. Experimental extension availability may be controlled by enterprise policy.
- **Already-running sessions:** ask Copilot `Reload my extensions`, then check `/extensions manage`; alternatively open a fresh session. Do not restart work just to recover history; Spy only captures live events after attachment.
- **Wrong service on port 4317:** Spy refuses to send telemetry to a service that does not identify itself as Spy. Choose another port.
- **Custom port:** launch `node scripts/launch.mjs --port 4320`, and set `SPY_URL=http://127.0.0.1:4320` in the environment inherited by each Copilot CLI. In PowerShell: `$env:SPY_URL='http://127.0.0.1:4320'`.
- **Corporate proxy:** the built viewer needs no npm access. Copilot retains its normal network/authentication requirements. Source ZIPs need a first npm install/build and inherit your npm/proxy/CA configuration; Spy does not disable TLS verification.
- **Missing models or parents:** Spy labels unavailable data rather than guessing. Verify emitted events against your CLI version.
- **Missing earlier activity:** current-state memory is intentionally volatile. Queue overflow/rejected events are flagged; a new CLI session gives complete startup coverage.

## Update or remove

To update, extract a new release and run its startup script. The launcher always stops the previous verified Spy collector on its port before starting a fresh foreground viewer. Its volatile view resets; Copilot sessions and tasks continue. Ask `Reload my extensions` in existing sessions so their bridges forward the new events. To remove the bridge, run `node scripts/install-bridge.mjs --remove` from the extracted folder (or `npm run disconnect` in a checkout). Uninstall preserves unrelated files and the cached runtime so it does not delete files under a running collector. After closing Spy and its collector, the remaining `~/.copilot/extensions/spy/` cache can be removed.

## Source development

A GitHub **Code → Download ZIP** source archive also launches with the same scripts, but its first run needs npm access to install/build. For development: `npm ci`, then `npm start`. This development server does not install the bridge automatically. Run `npm run build` and `npm run connect` to install the current bridge/runtime.

See the [official extension guide](https://docs.github.com/en/copilot/tutorials/create-an-extension) for version-specific extension controls.

## Skills, context and state observations

Skill badges show invocations observed for each agent. The Skills tab separates invocation records from the available session catalog; it never assumes subagents inherit skills. Skill bodies are bounded excerpts and are not labelled as continuously active. Configured agents are listed separately from live invocations. Catalogs are requested once when the bridge joins, with unsupported APIs tolerated.

Permission and user-input events produce waiting states; denied permission produces blocked until new execution resumes. Completed/cancelled agents stay inactive. A lost connection marks state as stale. Use the State filter to focus on running, waiting, blocked or inactive agents.

Click a graph edge or an agent's Context tab to inspect recorded transfers. Native task-tool prompts and returned results are captured where available and labelled runtime-observed. Other relationships can be reported through the `spy_observe` extension tool or the local event endpoint. They are visibly labelled orchestrator-reported, including any shared/isolated claim. Missing context is shown as unknown, not inferred from tokens or delegation. Payloads stay local and bounded; avoid including credentials in custom metadata.

## Updating a locked folder

Extract the new release into a different folder and run its `stop.cmd` (or `sh stop.sh`). This reads the local health endpoint, stops only the identified Spy collector and waits for its PID to exit. Delete/replace the old folder, then run the new `start.cmd`. Startup also stops the previous collector automatically. For a custom port, use `stop.cmd --port 4320` / `sh stop.sh --port 4320` (or the same SPY_URL/PORT used to start it). A service that does not identify as Spy is left running. Reload Spy extensions in existing Copilot sessions after upgrading.
