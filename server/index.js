import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.resolve(process.env.AGENTFLOW_DATA_DIR || path.join(rootDir, 'data'));
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'agentflow.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    purpose TEXT NOT NULL,
    instructions TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    agent_id TEXT,
    trigger_type TEXT NOT NULL,
    actions_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    status TEXT NOT NULL,
    input_json TEXT NOT NULL,
    output_json TEXT,
    error TEXT,
    duration_ms INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_executions_created_at ON executions(created_at DESC);
`);

const now = () => new Date().toISOString();
const parseJson = (value, fallback = null) => {
  try { return JSON.parse(value); } catch { return fallback; }
};
const asAgent = (row) => row ? ({ ...row }) : null;
const asWorkflow = (row) => row ? ({
  ...row,
  agentId: row.agent_id,
  triggerType: row.trigger_type,
  actions: parseJson(row.actions_json, []),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
}) : null;
const asExecution = (row) => row ? ({
  ...row,
  workflowId: row.workflow_id,
  input: parseJson(row.input_json, {}),
  output: parseJson(row.output_json, null),
  createdAt: row.created_at,
  durationMs: row.duration_ms,
}) : null;

const seed = () => {
  const count = db.prepare('SELECT COUNT(*) AS count FROM agents').get().count;
  if (count > 0) return;
  const createdAt = now();
  const agentId = randomUUID();
  db.prepare('INSERT INTO agents (id, name, purpose, instructions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(agentId, 'Briefing editor', 'Turns raw team notes into a clean daily brief.', 'Keep the output concise, preserve every important item, and call out anything that looks like a task.', createdAt, createdAt);
  db.prepare('INSERT INTO workflows (id, name, description, agent_id, trigger_type, actions_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), 'Daily brief generator', 'Convert a list of updates into a structured, shareable brief.', agentId, 'manual', JSON.stringify([
      { type: 'summarize_text', label: 'Create deterministic summary', config: { title: 'Daily team brief' } },
    ]), createdAt, createdAt);
};
seed();

const app = express();
app.use(express.json({ limit: '1mb' }));

const sendError = (res, status, message, details = null) => res.status(status).json({ error: message, details });
const requireText = (value, label, max = 5000) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`);
  if (value.trim().length > max) throw new Error(`${label} must be ${max} characters or fewer.`);
  return value.trim();
};
const normalizeActions = (actions) => {
  if (!Array.isArray(actions) || actions.length === 0) throw new Error('Add at least one workflow action.');
  return actions.map((action) => {
    const type = action?.type;
    if (!['summarize_text', 'extract_tasks', 'format_json'].includes(type)) throw new Error(`Unsupported action: ${type || 'unknown'}.`);
    return { type, label: typeof action.label === 'string' && action.label.trim() ? action.label.trim() : type, config: action.config || {} };
  });
};

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'agentflow' }));

app.get('/api/stats', (_req, res) => {
  const agents = db.prepare('SELECT COUNT(*) AS count FROM agents').get().count;
  const workflows = db.prepare('SELECT COUNT(*) AS count FROM workflows').get().count;
  const executions = db.prepare('SELECT COUNT(*) AS count FROM executions').get().count;
  const succeeded = db.prepare("SELECT COUNT(*) AS count FROM executions WHERE status = 'succeeded'").get().count;
  res.json({ agents, workflows, executions, succeeded, successRate: executions ? Math.round((succeeded / executions) * 100) : 0 });
});

app.get('/api/agents', (_req, res) => {
  const rows = db.prepare('SELECT * FROM agents ORDER BY updated_at DESC').all();
  res.json(rows.map(asAgent));
});

app.post('/api/agents', (req, res) => {
  try {
    const name = requireText(req.body?.name, 'Agent name', 80);
    const purpose = requireText(req.body?.purpose, 'Agent purpose', 240);
    const instructions = requireText(req.body?.instructions, 'Agent instructions', 5000);
    const timestamp = now();
    const id = randomUUID();
    db.prepare('INSERT INTO agents (id, name, purpose, instructions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, name, purpose, instructions, timestamp, timestamp);
    res.status(201).json(asAgent(db.prepare('SELECT * FROM agents WHERE id = ?').get(id)));
  } catch (error) { sendError(res, 400, error.message); }
});

app.put('/api/agents/:id', (req, res) => {
  try {
    const name = requireText(req.body?.name, 'Agent name', 80);
    const purpose = requireText(req.body?.purpose, 'Agent purpose', 240);
    const instructions = requireText(req.body?.instructions, 'Agent instructions', 5000);
    const result = db.prepare('UPDATE agents SET name = ?, purpose = ?, instructions = ?, updated_at = ? WHERE id = ?').run(name, purpose, instructions, now(), req.params.id);
    if (!result.changes) return sendError(res, 404, 'Agent not found.');
    res.json(asAgent(db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id)));
  } catch (error) { sendError(res, 400, error.message); }
});

app.delete('/api/agents/:id', (req, res) => {
  const result = db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id);
  if (!result.changes) return sendError(res, 404, 'Agent not found.');
  res.status(204).end();
});

app.get('/api/workflows', (_req, res) => {
  const rows = db.prepare(`SELECT w.*, a.name AS agent_name,
    (SELECT COUNT(*) FROM executions e WHERE e.workflow_id = w.id) AS execution_count,
    (SELECT MAX(created_at) FROM executions e WHERE e.workflow_id = w.id) AS last_executed_at
    FROM workflows w LEFT JOIN agents a ON a.id = w.agent_id ORDER BY w.updated_at DESC`).all();
  res.json(rows.map((row) => ({ ...asWorkflow(row), agentName: row.agent_name, executionCount: row.execution_count, lastExecutedAt: row.last_executed_at })));
});

app.post('/api/workflows', (req, res) => {
  try {
    const name = requireText(req.body?.name, 'Workflow name', 100);
    const description = requireText(req.body?.description, 'Workflow description', 300);
    const triggerType = req.body?.triggerType || 'manual';
    if (triggerType !== 'manual') throw new Error('Only manual triggers are available in this MVP.');
    const actions = normalizeActions(req.body?.actions);
    if (req.body?.agentId && !db.prepare('SELECT id FROM agents WHERE id = ?').get(req.body.agentId)) throw new Error('Selected agent does not exist.');
    const timestamp = now();
    const id = randomUUID();
    db.prepare('INSERT INTO workflows (id, name, description, agent_id, trigger_type, actions_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, name, description, req.body.agentId || null, triggerType, JSON.stringify(actions), timestamp, timestamp);
    res.status(201).json(asWorkflow(db.prepare('SELECT * FROM workflows WHERE id = ?').get(id)));
  } catch (error) { sendError(res, 400, error.message); }
});

app.put('/api/workflows/:id', (req, res) => {
  try {
    const name = requireText(req.body?.name, 'Workflow name', 100);
    const description = requireText(req.body?.description, 'Workflow description', 300);
    const actions = normalizeActions(req.body?.actions);
    if (req.body?.agentId && !db.prepare('SELECT id FROM agents WHERE id = ?').get(req.body.agentId)) throw new Error('Selected agent does not exist.');
    const result = db.prepare('UPDATE workflows SET name = ?, description = ?, agent_id = ?, actions_json = ?, updated_at = ? WHERE id = ?').run(name, description, req.body.agentId || null, JSON.stringify(actions), now(), req.params.id);
    if (!result.changes) return sendError(res, 404, 'Workflow not found.');
    res.json(asWorkflow(db.prepare('SELECT * FROM workflows WHERE id = ?').get(req.params.id)));
  } catch (error) { sendError(res, 400, error.message); }
});

app.delete('/api/workflows/:id', (req, res) => {
  const result = db.prepare('DELETE FROM workflows WHERE id = ?').run(req.params.id);
  if (!result.changes) return sendError(res, 404, 'Workflow not found.');
  res.status(204).end();
});

const cleanItems = (input) => {
  if (Array.isArray(input?.items)) return input.items.map((item) => String(item).trim()).filter(Boolean);
  if (typeof input?.text === 'string') return input.text.split(/\n+/).map((item) => item.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
  return [];
};
const executeActions = (actions, input) => {
  let value = { ...input };
  for (const action of actions) {
    if (action.type === 'summarize_text') {
      const items = cleanItems(value);
      if (!items.length) throw new Error('Provide at least one line of input in "items" or "text".');
      value = {
        title: action.config?.title || 'Workflow summary',
        summary: items.map((item) => `• ${item}`).join('\n'),
        itemCount: items.length,
        processedAt: now(),
        mode: 'deterministic-local',
      };
    } else if (action.type === 'extract_tasks') {
      const text = typeof value?.text === 'string' ? value.text : JSON.stringify(value);
      const tasks = text.split(/\n+/).map((line) => line.trim()).filter((line) => /^(todo|task|\[ \]|- \[ \])/i.test(line)).map((line) => line.replace(/^(todo|task|\[ \]|- \[ \])[:\s-]*/i, '').trim()).filter(Boolean);
      value = { tasks, count: tasks.length, mode: 'deterministic-local' };
    } else if (action.type === 'format_json') {
      value = { formatted: value, mode: 'deterministic-local' };
    }
  }
  return value;
};

app.post('/api/workflows/:id/execute', (req, res) => {
  const workflow = db.prepare('SELECT * FROM workflows WHERE id = ?').get(req.params.id);
  if (!workflow) return sendError(res, 404, 'Workflow not found.');
  const started = Date.now();
  const createdAt = now();
  const executionId = randomUUID();
  const input = req.body?.input && typeof req.body.input === 'object' ? req.body.input : {};
  try {
    const output = executeActions(parseJson(workflow.actions_json, []), input);
    db.prepare('INSERT INTO executions (id, workflow_id, status, input_json, output_json, error, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(executionId, workflow.id, 'succeeded', JSON.stringify(input), JSON.stringify(output), null, Date.now() - started, createdAt);
    res.status(201).json(asExecution(db.prepare('SELECT * FROM executions WHERE id = ?').get(executionId)));
  } catch (error) {
    db.prepare('INSERT INTO executions (id, workflow_id, status, input_json, output_json, error, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(executionId, workflow.id, 'failed', JSON.stringify(input), null, error.message, Date.now() - started, createdAt);
    res.status(422).json(asExecution(db.prepare('SELECT * FROM executions WHERE id = ?').get(executionId)));
  }
});

app.get('/api/executions', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const rows = db.prepare(`SELECT e.*, w.name AS workflow_name FROM executions e JOIN workflows w ON w.id = e.workflow_id ORDER BY e.created_at DESC LIMIT ?`).all(limit);
  res.json(rows.map((row) => ({ ...asExecution(row), workflowName: row.workflow_name })));
});

app.get('/api/executions/:id', (req, res) => {
  const row = db.prepare(`SELECT e.*, w.name AS workflow_name FROM executions e JOIN workflows w ON w.id = e.workflow_id WHERE e.id = ?`).get(req.params.id);
  if (!row) return sendError(res, 404, 'Execution not found.');
  res.json({ ...asExecution(row), workflowName: row.workflow_name });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(rootDir, 'dist')));
  app.use((_req, res) => res.sendFile(path.join(rootDir, 'dist', 'index.html')));
}

const port = Number(process.env.PORT || 3001);
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, '0.0.0.0', () => console.log(`AgentFlow API listening on http://localhost:${port}`));
}

export default app;
