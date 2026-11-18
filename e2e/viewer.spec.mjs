import { test, expect } from '@playwright/test';
test.beforeEach(async ({request})=>{await request.post('/api/demo/stop',{headers:{'X-Agent-Viewer':'1'}});});
test.afterEach(async ({request})=>{await request.post('/api/demo/stop',{headers:{'X-Agent-Viewer':'1'}});});
test('boots with no stored sessions and explains connection setup',async({page})=>{
  await page.goto('/');await expect(page).toHaveTitle('Spy — Copilot CLI');await expect(page.getByRole('heading',{name:'Your agents, connected.'})).toBeVisible();
  await page.getByRole('button',{name:'Connect session',exact:true}).click();await expect(page.getByText('npm run connect',{exact:true})).toBeVisible();await expect(page.getByText('copilot --experimental',{exact:true})).toBeVisible();
});
test('streams nodes and edges and opens the correct agent inspector',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Run demo',exact:true}).click();
  const planner=page.locator('.react-flow__node[data-id="planner"]');await expect(planner).toBeVisible();await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await planner.click();await expect(page.locator('.inspector h2')).toHaveText('Planner');await expect(page.locator('.model-box strong')).toHaveText('Demo · reasoning model');
  await expect(page.getByText('SIMULATED DEMO',{exact:true})).toBeVisible();
});
test('shows parallel verification and a live feedback loop',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Run demo',exact:true}).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(5,{timeout:20_000});
  await expect(page.locator('[data-testid="rf__edge-tester:builder:feedback"]')).toBeVisible({timeout:25_000});
  await expect(page.getByText('Feedback loop detected',{exact:true})).toBeVisible();
  await expect(page.locator('.structure-notice')).toContainText('Feedback loop');
});
test('focus mode works at mobile width and inspector stays accessible',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByRole('button',{name:'Run demo',exact:true}).click();
  await page.getByRole('button',{name:'Focus graph',exact:true}).click();await expect(page.locator('.app')).toHaveClass(/focused/);
  await page.locator('.react-flow__node[data-id="planner"]').click();await expect(page.locator('.inspector h2')).toHaveText('Planner');await page.getByRole('button',{name:'Close inspector',exact:true}).click();await expect(page.locator('.empty-inspector')).toBeHidden();
});
test('shows invoked skills and available definitions as separate observations',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Run demo',exact:true}).click();await page.locator('.react-flow__node[data-id="planner"]').click();
 await page.getByRole('button',{name:'Skills',exact:true}).click();await expect(page.locator('.observation-card').getByText('verification-loop',{exact:true})).toBeVisible();await page.locator('.observation-card summary').click();await expect(page.getByText('Runtime event · last invoked',{exact:false})).toBeVisible();
 await page.locator('.agent-catalog summary').click();await expect(page.getByText('Security auditor',{exact:true})).toBeVisible();await expect(page.getByText('Not invoked in this live view',{exact:true})).toBeVisible();
});
test('context edges open a payload inspector with explicit provenance',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Run demo',exact:true}).click();
 const edge=page.locator('[data-testid="rf__edge-context:planner:builder"]');await expect(edge).toBeVisible({timeout:10000});await edge.getByText('Context handoff',{exact:true}).click();
 await expect(page.getByRole('heading',{name:'Context handoffs',exact:true})).toBeVisible();await expect(page.getByText('Orchestrator-reported metadata',{exact:true})).toBeVisible();await expect(page.locator('.context-card pre')).toContainText('single-flight token refresh');
});
test('waiting filters show live requests without treating completed agents as running',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Run demo',exact:true}).click();await page.getByLabel('Filter agents by state').selectOption('waiting');
 await expect(page.locator('.agent-node.waiting')).toBeVisible({timeout:12000});await page.getByLabel('Filter agents by state').selectOption('all');await expect(page.locator('.react-flow__node[data-id="planner"] .agent-node')).toHaveClass(/completed/,{timeout:10000});
});
test('diagnostics expose timing, explicit loop outcomes, context checks, usage and reliability',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Run demo',exact:true}).click();await page.getByRole('button',{name:'Stats',exact:true}).click();const panel=page.locator('.diagnostics');await expect(panel.getByText('Peak parallel workers',{exact:true})).toBeVisible();await panel.getByLabel('Highlight critical path').check();await page.getByRole('button',{name:'Live sessions',exact:false}).first().click();await expect(page.locator('.critical-node')).not.toHaveCount(0);await page.getByRole('button',{name:'Stats',exact:true}).click();
 await panel.getByRole('button',{name:'Loops',exact:true}).click();await expect(panel.getByText('auth-verification',{exact:true})).toBeVisible();await panel.getByRole('button',{name:'Model usage',exact:true}).click();await expect(panel.getByRole('cell',{name:'Demo · coordinator',exact:true})).toBeVisible();await panel.getByRole('button',{name:'Reliability',exact:true}).click();await expect(panel.getByText(/Sequence gaps:/)).toBeVisible();
});
test('design editor exports, imports, edits and compares without mutating live execution',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Run demo',exact:true}).click();await page.getByRole('button',{name:'Design mode',exact:true}).click();const panel=page.locator('.design-panel');await expect(panel.locator('.react-flow__node')).toHaveCount(3);const canvasBox=await panel.locator('.design-canvas').boundingBox();const nodeBox=await panel.locator('.react-flow__node').first().boundingBox();expect(nodeBox.y).toBeGreaterThanOrEqual(canvasBox.y);expect(nodeBox.y+nodeBox.height).toBeLessThanOrEqual(canvasBox.y+canvasBox.height);await panel.getByLabel('Design name',{exact:true}).fill('My verification design');await panel.getByRole('button',{name:'Add agent',exact:true}).click();await panel.getByLabel('Agent name',{exact:true}).fill('Security auditor');await expect(panel.getByText('Security auditor: not yet observed.',{exact:true})).toBeVisible();
 const downloaded=page.waitForEvent('download');await panel.getByRole('button',{name:'Export JSON',exact:true}).click();const download=await downloaded;expect(download.suggestedFilename()).toBe('spy-design.json');
 await panel.locator('input[type="file"]').setInputFiles({name:'design.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,name:'Imported',nodes:[{id:'p',name:'Planner',role:'planner'}],edges:[]}))});await expect(panel.getByLabel('Design name',{exact:true})).toHaveValue('Imported');await expect(page.locator('.workbench')).toHaveCount(0);
 await panel.locator('input[type="file"]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});await expect(panel.getByRole('alert')).toContainText('Design needs version 1');
});
test('skill authoring assigns required definitions and exports skills and marketplace plugin folders',async({page})=>{
 const {unzipSync,strFromU8}=await import('fflate');const {readFile}=await import('node:fs/promises');await page.goto('/');await page.getByRole('button',{name:'Design mode',exact:true}).click();const panel=page.locator('.design-panel');
 await panel.getByLabel('Definition name',{exact:true}).fill('verify-tests');await panel.getByLabel('Definition description',{exact:true}).fill('Verify acceptance criteria. Use when testing changes.');await panel.getByLabel('Skill definition',{exact:true}).fill('Run the tests and return the actual command, result and acceptance evidence.');await panel.getByRole('button',{name:'Save definition',exact:true}).click();await expect(panel.locator('.design-canvas .react-flow__edge')).toHaveCount(3);
 await panel.getByLabel('Edit design agent',{exact:true}).selectOption('verify');await panel.getByLabel('Agent instructions',{exact:true}).fill('Verify independently and return evidence.');await panel.getByLabel('Choose agent skill',{exact:true}).selectOption('verify-tests');await panel.getByRole('button',{name:'Assign skill',exact:true}).click();await expect(panel.locator('.assigned-skills')).toContainText('verify-tests · required · bundled');await expect(panel.locator('.design-canvas .react-flow__edge')).toHaveCount(3);
 await panel.getByRole('button',{name:'Preview SKILL.md',exact:true}).click();await expect(panel.locator('.skill-preview pre')).toContainText('name: "independent-verification-loop"');
 let wait=page.waitForEvent('download');await panel.getByRole('button',{name:'Export skill folders ZIP',exact:true}).click();let file=await wait;let archive=unzipSync(await readFile(await file.path()));expect(strFromU8(archive['independent-verification-loop/references/agents/agent-3.md'])).toContain('required: [verify-tests]');expect(archive['verify-tests/SKILL.md']).toBeTruthy();
 wait=page.waitForEvent('download');await panel.getByRole('button',{name:'Export marketplace plugin ZIP',exact:true}).click();file=await wait;archive=unzipSync(await readFile(await file.path()));expect(JSON.parse(strFromU8(archive['independent-verification-loop/plugin.json'])).name).toBe('independent-verification-loop');expect(archive['independent-verification-loop/skills/verify-tests/SKILL.md']).toBeTruthy();
});
test('clearing live details preserves topology and visibly marks the retained data boundary',async({page})=>{await page.goto('/');await page.getByRole('button',{name:'Run demo',exact:true}).click();await expect(page.locator('.react-flow__node')).toHaveCount(2);await page.getByRole('button',{name:'Clear details',exact:true}).click();await expect(page.locator('.topology-banner').filter({hasText:'Older detail data cleared'})).toContainText('Cleared by viewer');await expect(page.locator('.react-flow__node')).toHaveCount(2);});
test('hidden tabs close streams while retaining history and reconnect when visible',async({page,request})=>{await page.goto('/');await page.getByRole('button',{name:'Run demo',exact:true}).click();const edge=page.locator('[data-testid="rf__edge-context:planner:builder"]');await expect(edge).toBeVisible({timeout:10000});await edge.getByText('Context handoff',{exact:true}).click();await expect(page.getByRole('heading',{name:'Context handoffs',exact:true})).toBeVisible();await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.locator('.react-flow__node')).not.toHaveCount(0);await expect.poll(async()=> (await(await request.get('/api/health')).json()).viewers).toBe(0);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.locator('.react-flow__node')).not.toHaveCount(0);});

test('navigation separates design and stats and keeps readable mobile session names',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByRole('button',{name:'Run demo',exact:true}).click();
 await expect(page.locator('.session-card strong').first()).toBeVisible();expect(await page.locator('.session-card strong').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
 await page.getByRole('button',{name:'Design builder',exact:true}).click();await expect(page.locator('.design-panel')).toBeVisible();await expect(page.locator('.workbench')).toHaveCount(0);
 await page.getByRole('button',{name:'Stats',exact:true}).click();await expect(page.locator('.session-stats')).toBeVisible();await expect(page.locator('.design-panel')).toHaveCount(0);await expect(page.locator('.stats-grid')).toContainText('Tool calls');
});

test('inspector sends a prompt and distinguishes runtime delivery from queuing',async({page,request})=>{
 const headers={'X-Agent-Viewer':'1'};const sessionId='prompt-ui';const bridgeId='prompt-ui-bridge';
 await request.post('/api/events',{headers,data:[{sessionId,bridgeId,sequence:1,event:{type:'viewer.metadata',data:{title:'Prompt delivery test',capabilities:{prompt:true}}}},{sessionId,bridgeId,sequence:2,event:{type:'assistant.turn_start',data:{}}}]});
 await page.goto('/');await page.locator('.session-card').filter({hasText:'Prompt delivery test'}).click();await page.locator('.react-flow__node[data-id="root"]').click();
 await page.getByLabel('Send a prompt to Orchestrator',{exact:true}).fill('Check the missing completion event');await page.getByRole('button',{name:'Send prompt',exact:true}).click();await expect(page.getByRole('status')).toContainText('Queued for bridge');
 const response=await request.post('/api/commands/pull',{headers,data:{sessionId,bridgeId}});const {commands}=await response.json();expect(commands).toHaveLength(1);expect(commands[0].prompt).toBe('Check the missing completion event');
 await request.post('/api/commands/ack',{headers,data:{sessionId,bridgeId,id:commands[0].id,status:'sent'}});await expect(page.getByRole('status')).toContainText('Delivered to runtime');
});
