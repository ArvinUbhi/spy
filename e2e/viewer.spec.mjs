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
