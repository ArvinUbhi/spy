# Workflow Studio

Spy 0.7 separates creating a specification from sending instructions into a running session. Editing or dragging blocks autosaves the design. A runtime correction is sent only after you review its target/text and click Send prompt.

## Design a workflow

Open Design builder. The left palette offers Implementer, Reviewer, Test runner, Researcher, Start, Decision gate and Finish blocks, plus verification, gated, research and blank templates. Select a block for Task, Inputs & outputs, Model, Skills, Tools, Verification and Live settings. Control blocks omit runtime-only settings. Double-click expands the complete editor. Undo/redo works on edits, connections, positions and bindings; text edits coalesce into short undo groups. Ctrl/Cmd Z, Shift Z and S provide undo, redo and save; Escape closes the expanded editor or focus view. Text inputs keep their native undo behaviour.

Connect bottom to top handles or use Connect blocks. Click an arrow to edit its relationship, outcome, condition, requested payload/context mode and feedback limit. A join can wait for all required incoming sources or accept the first available source. Start/end/decision blocks describe control flow; they are not delegated agents. Requested models, tools and context modes must be resolved by the runtime. Changing an expected model does not switch a running instance.

Validation identifies incomplete instructions/outputs/criteria, external skills that have not been verified, disconnected blocks, missing gate routes and forward cycles. Click issues to select the relevant block or connection. Exported orchestration skills reject unbounded forward cycles. JSON imports remain version 1 and accept older designs; the optional IO/control/branch fields are preserved by newer exports.

## Follow and correct live work

Choose a session in the studio header and enable Live overlay. Cards display the uniquely matched runtime instance's current activity/state. Find running focuses a linked active stage. The Live inspector shows active tools, latest output and recent events, with a link to the full searchable agent workspace.

Automatic links use role/name. If several invocations match, select the exact runtime instance before sending. Links are saved per design and session. They do not alter the actual parent/child hierarchy. Compare live distinguishes not started, unavailable, ambiguous, unreported and actual model mismatches. Unexpected runtime agents can be inspected directly. Capture live topology creates a new editable design from observed agents/models and non-context edges.

Prepare updated brief turns the selected stage's instructions, IO and criteria into an editable correction. Prepare workflow update opens the coordinator's workspace with an editable excerpt of the workflow. Both require a separate Send prompt action. Long sections are visibly excerpted; use the complete export when required. The coordinator uses session.send with immediate steering; identified subagent tasks use tasks.sendMessage. Older hosts, offline sessions and finished tasks remain unavailable targets. A stop-after-this-step preset is an instruction, not a guaranteed process cancellation.

Quick templates cover changing approach, checking progress, stopping after a safe boundary and returning evidence. Drafts are local to each browser/session/agent. Recent corrections show queued, dispatching, delivered, failed or cancelled state. A queued prompt can be cancelled before dispatch; dispatched instructions cannot be unsent. Runtime acceptance is not proof that a model followed the instruction: inspect subsequent activity/output. Client correction IDs prevent duplicate dispatch after a lost HTTP response.

## Save, restore and export

Designs and per-session links save next to the live snapshot in `SPY_HISTORY_PATH + .designs.json` (normally `~/.copilot/spy/history.json.designs.json`). Writes are atomic. Revisions detect another window's edits and offer reloading the saved copy or keeping your draft as a new design. Save version makes a named checkpoint. Autosave also makes a checkpoint at most once every five minutes. Restore a checkpoint into the editor; undo can recover the draft it replaced. Up to 20 checkpoints per design are retained, subject to a 32 MiB library budget. Undo holds up to 60 recent groups, bounded by an approximate 8 MB serialized budget.

The library supports 30 active / 50 total stored designs. Archive/restore is reversible. Permanent deletion is available only for archived designs, with explicit confirmation and a current revision check. Export anything you need before deleting it. Older checkpoints may be reclaimed to fit the library budget; the current design is never silently replaced.

Export & skills provides bundled skill authoring, file preview, JSON/instruction exports, skill-folder ZIPs and marketplace plugin ZIPs. Role briefs include task, IO, verification, requested model/tools and skill assignments. Graph instructions include conditions, payloads, context requests, joins and bounded feedback. Exports are specifications/skills, not an autonomous runtime scheduler or a way to bypass Copilot permissions.

## Walkthrough

Choose sample success/failure outcomes. The preview highlights the next block, displays requested inputs/outputs, follows conditional links, applies join rules and stops on missing failure paths or retry limits. Feedback invalidates downstream preview outcomes for the next attempt. It does not execute agents or evaluate natural-language conditions; you supply the outcomes yourself.
