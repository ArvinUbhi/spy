# Design a workflow Copilot can follow

Spy 0.9 makes the intended usage explicit: watch and correct an existing run in Live sessions / Run Centre; author a future run in Design. A saved diagram does not execute or reconfigure the CLI.

## Team & models

Design opens on Team & models. Define the task and acceptance evidence first. Set an optional coordinator model (the main CLI session), a default worker model, and per-agent overrides. Required means stop if the assignment cannot be honored; Preferred permits a fallback only if the requested and actual model are reported. Blank worker assignments inherit the default worker model, or the runtime model if both are blank. Saved older designs keep their previous graph; new fields are backwards-compatible defaults.

Use exact model IDs from your own Copilot `/model` picker, not marketing names. Suggestions come from observed sessions/catalogs and your saved design, not a claim that your account can access them. The coordinator model is checked against its existing session, not switched silently. Some CLI modes (including Auto on hosts which force inherited subagent models) can override authored models: the preflight stops and asks for a compatible explicit session model if required assignments cannot be satisfied. Host policies and higher-priority personal agent profiles can also affect dispatch.

## Canvas

Use the canvas to edit detailed stage responsibilities, input/output contracts, skills, tools and connections. Double-click expands the inspector. Required model settings are also editable in a stage's Model tab. Cards show the effective model including a default-worker assignment. Live comparison checks that effective assignment against the reported runtime model; unreported stays unverified.

New Independent verification loop templates include both review-failure → implementer and test-failure → implementer returns. Existing designs are not silently rewritten: add a missing failure route on the canvas, or choose a new template. A failure with no route stops and reports unresolved work.

## One execution contract

The coordinator owns dispatch, joins, model preflight, retry counters and final acceptance. A worker executes one bounded assignment and returns PASS, FAIL or BLOCKED. Workers do not invoke themselves, other workflow stages or the entire workflow. A feedback arrow is an instruction for the coordinator, not a recursive agent call.

Maximum executions per stage includes its initial execution. With a cap of 3, any stage can run initially and at most twice more. Each feedback edge also has its own maximum return count. Both caps apply; multiple return paths share the target's execution cap. Counters persist across rework and cannot be reset to evade the budget.

On failure, the coordinator passes failed criteria, evidence and required changes to the rework target. Prior outcomes for that target and its forward descendants are invalidated; applicable downstream checks run again. Unrelated branch outcomes and all counters remain. Stops include missing failure routes, denied permissions, unavailable required capabilities, repeated identical failures without a changed approach, unsatisfied joins, BLOCKED/UNKNOWN results and exhausted budgets. A global success claim requires actual acceptance evidence.

Exports reject forward cycles, feedback to a non-ancestor, success/unconditional feedback, multiple feedback targets from the same source, or routes that would retry and continue simultaneously. Such designs need an explicit unambiguous route rather than a guess by the CLI. Parallel forward routes are allowed when independent and their joins are satisfied.

The same execution-plan renderer supplies the UI preview, Markdown export, SKILL.md and references/EXECUTION.md. The walkthrough uses matching per-stage/edge caps. Its success/failure choices are supplied by you; it does not execute agents or interpret natural-language checks.

## Review & export

The recommended **Download Copilot workflow** / **Export Copilot workflow ZIP** creates:

- `.github/agents/spy-….agent.md`: distinct named worker profiles with effective model assignments, required model-policy declarations when selected, repository-instruction opt-in and bounded role instructions.
- `.github/skills/<workflow>/SKILL.md`: coordinator orchestration instructions.
- Workflow JSON, a machine-readable routing/model plan, EXECUTION.md and role/skill references.
- `SPY-START-HERE.md`: setup steps and runtime caveats.
- `SPY-RUN-PROMPT.md`: a ready-to-paste coordinator prompt with a task placeholder.

Extract the .github folder into your working repository after reviewing existing matching paths. Restart Copilot to discover the profiles, verify their exact IDs and model availability, then provide your real task using SPY-RUN-PROMPT.md. Extraction does not install a script, execute a run or change your active session. The agent profiles request models; runtime support and reported selection determine whether that request took effect. Required models are never presented as verified merely because a profile was exported.

Skill-only and marketplace plugin exports remain available as advanced choices; they omit the native project profiles. Copilot may need supported per-call model selection in those workflows. Older CLI versions can differ in accepted policy fields; both documented required-policy spellings are included in the native profile and preflight requires the host to honor the assignment. Unsupported hosts must report the limitation instead of silently claiming enforcement.

GitHub references checked for this implementation:
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli
- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference

Live edits remain a separate action: Prepare updated brief targets an existing agent's instructions; Prepare workflow update targets the coordinator. A prompt cannot retroactively verify or silently change the model of a running invocation. For a different required model, create a supported new invocation or ask the user to change the session model.
