import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

process.env.NODE_ENV = 'test';
const dataDir = mkdtempSync(`${tmpdir()}/agentflow-test-`);
process.env.AGENTFLOW_DATA_DIR = dataDir;
const { default: app } = await import('../server/index.js');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(dataDir, { recursive: true, force: true });
});

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
};

test('health endpoint and seeded demo are available', async () => {
  const health = await request('/api/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.body.status, 'ok');

  const workflows = await request('/api/workflows');
  assert.equal(workflows.response.status, 200);
  assert.equal(workflows.body.length, 1);
  assert.equal(workflows.body[0].actions[0].type, 'summarize_text');
});

test('agent and workflow CRUD persists a successful deterministic run', async () => {
  const agent = await request('/api/agents', {
    method: 'POST',
    body: JSON.stringify({ name: 'Test agent', purpose: 'Test purpose', instructions: 'Be concise.' }),
  });
  assert.equal(agent.response.status, 201);

  const workflow = await request('/api/workflows', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Test summary',
      description: 'Summarize test inputs.',
      agentId: agent.body.id,
      triggerType: 'manual',
      actions: [{ type: 'summarize_text', config: { title: 'Test brief' } }],
    }),
  });
  assert.equal(workflow.response.status, 201);

  const run = await request(`/api/workflows/${workflow.body.id}/execute`, {
    method: 'POST',
    body: JSON.stringify({ input: { items: ['First item', 'Second item'] } }),
  });
  assert.equal(run.response.status, 201);
  assert.equal(run.body.status, 'succeeded');
  assert.equal(run.body.output.itemCount, 2);
  assert.match(run.body.output.summary, /First item/);

  const history = await request('/api/executions');
  assert.equal(history.response.status, 200);
  assert.ok(history.body.some((item) => item.id === run.body.id));
});

test('invalid input records a failed execution instead of fabricating output', async () => {
  const workflows = await request('/api/workflows');
  const run = await request(`/api/workflows/${workflows.body[0].id}/execute`, {
    method: 'POST',
    body: JSON.stringify({ input: {} }),
  });
  assert.equal(run.response.status, 422);
  assert.equal(run.body.status, 'failed');
  assert.match(run.body.error, /at least one line/i);
  assert.equal(run.body.output, null);
});
