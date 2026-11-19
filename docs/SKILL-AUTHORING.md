# Graph-to-skill authoring

1. Open **Design mode** and arrange the agents and links. Select a node to set its role, requested model/tools, instructions and required or recommended skills.
2. Under **Exportable orchestration skill**, set a lowercase skill name, trigger description, orchestration instructions, acceptance/stop criteria, retry limit and final output format.
3. Add reusable definitions in the skill library. Paste Markdown or SKILL.md with simple `name` and `description` frontmatter. Complex frontmatter is rejected with guidance; it is not silently rewritten. Assign bundled definitions or existing installed skills to each agent.
4. Preview the generated SKILL.md. Missing external skill definitions are listed as runtime dependencies.
5. Export a **skill folders ZIP** for your personal/project skills folder, or a **marketplace plugin ZIP** for your plugin source.

The skill export contains an orchestration SKILL.md, linked role briefs, a lightweight graph specification and linked definitions. Bundled definitions also have their own sibling skill folders. Copy the extracted folders into `~/.copilot/skills/` or `.github/skills/`. Ask Copilot to use the exported skill by name; the trigger description also supports automatic discovery.

The plugin export contains a standard Agent Plugins 1.0 `plugin.json` and immediate `skills/NAME/SKILL.md` subdirectories. Put its directory into your marketplace source and add it to your existing marketplace catalog. Exporting does not install or publish anything, and does not create MCP servers or grant tool permissions.

The generated skill tells the coordinator to use real delegation, load required definitions, verify external dependencies, resolve models/tools, follow the graph, bound feedback iterations and return evidence. Role briefs are instructions, not installed custom-agent profiles. A skill cannot guarantee model availability, independent hidden context or runtime scheduling. Real signed-in Copilot acceptance remains unverified here.

Official formats: [Copilot skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills) · [Plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference).

Workflow Studio 0.7 adds typed control blocks, IO/verification contracts, joins and conditional connection rules to version-1 design files. Exported role briefs cover agent blocks; start/decision/finish blocks appear as control instructions. See [Workflow Studio](WORKFLOW-STUDIO.md).
