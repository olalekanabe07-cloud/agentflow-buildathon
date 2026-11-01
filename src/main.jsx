import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const demoInput = JSON.stringify({
  items: [
    'Design review moved to Thursday at 2:00 PM',
    'Maya shipped the billing dashboard to staging',
    'Follow up with Northstar about their API limits',
  ],
}, null, 2);

const api = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const payload = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(payload?.error || 'Something went wrong.');
  return payload;
};

function Icon({ name, size = 18 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    bot: <><rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 3v4M8 13h.01M16 13h.01M8 17h8"/><path d="M2 12h2M20 12h2"/></>,
    workflow: <><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.5 8.5 15.5 15.5"/><path d="M18 6v5h-5"/></>,
    activity: <path d="M3 12h4l2.5-7 5 14 2.5-7H21"/>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    play: <path d="m8 5 11 7-11 7V5Z"/>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
    trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    chevron: <path d="m7 10 5 5 5-5"/>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
    spark: <><path d="m12 3-1.5 5.5L5 10l5.5 1.5L12 17l1.5-5.5L19 10l-5.5-1.5L12 3Z"/><path d="m19 16-.7 2.3L16 19l2.3.7L19 22l.7-2.3L22 19l-2.3-.7L19 16Z"/></>,
  };
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function App() {
  const [page, setPage] = useState('dashboard');
  const [mobileNav, setMobileNav] = useState(false);
  const [agents, setAgents] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [stats, setStats] = useState({ agents: 0, workflows: 0, executions: 0, successRate: 0 });
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const [agentData, workflowData, executionData, statData] = await Promise.all([
      api('/api/agents'), api('/api/workflows'), api('/api/executions'), api('/api/stats'),
    ]);
    setAgents(agentData); setWorkflows(workflowData); setExecutions(executionData); setStats(statData);
  };

  useEffect(() => { refresh().catch((error) => showToast(error.message, 'error')).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (!toast) return undefined; const timer = setTimeout(() => setToast(null), 4000); return () => clearTimeout(timer); }, [toast]);

  const showToast = (message, type = 'success') => setToast({ message, type });
  const navigate = (nextPage) => { setPage(nextPage); setMobileNav(false); };

  const saveAgent = async (data, id) => {
    try {
      await api(id ? `/api/agents/${id}` : '/api/agents', { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) });
      await refresh(); setModal(null); showToast(id ? 'Agent updated.' : 'Agent created.');
    } catch (error) { showToast(error.message, 'error'); }
  };
  const removeAgent = async (id) => {
    if (!window.confirm('Delete this agent? Workflows will keep working without an assigned agent.')) return;
    try { await api(`/api/agents/${id}`, { method: 'DELETE' }); await refresh(); showToast('Agent deleted.'); }
    catch (error) { showToast(error.message, 'error'); }
  };
  const saveWorkflow = async (data, id) => {
    try {
      await api(id ? `/api/workflows/${id}` : '/api/workflows', { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) });
      await refresh(); setModal(null); showToast(id ? 'Workflow updated.' : 'Workflow created.');
    } catch (error) { showToast(error.message, 'error'); }
  };
  const removeWorkflow = async (id) => {
    if (!window.confirm('Delete this workflow and its execution history?')) return;
    try { await api(`/api/workflows/${id}`, { method: 'DELETE' }); await refresh(); showToast('Workflow deleted.'); }
    catch (error) { showToast(error.message, 'error'); }
  };
  const executeWorkflow = async (workflow, rawInput) => {
    try {
      let input;
      try { input = JSON.parse(rawInput); } catch { input = { text: rawInput }; }
      const execution = await api(`/api/workflows/${workflow.id}/execute`, { method: 'POST', body: JSON.stringify({ input }) });
      await refresh(); setModal(null);
      if (execution.status === 'succeeded') { showToast('Workflow completed successfully.'); navigate('activity'); }
      else showToast(execution.error || 'Workflow failed.', 'error');
    } catch (error) { showToast(error.message, 'error'); }
  };
  const runDemo = async () => {
    const workflow = workflows[0];
    if (!workflow) return showToast('Create a workflow before running a demo.', 'error');
    await executeWorkflow(workflow, demoInput);
  };

  if (loading) return <div className="loading-screen"><div className="brand-mark large">A</div><span>Loading your workspace…</span></div>;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark">A</div><div><strong>agentflow</strong><span>WORKFLOW INTELLIGENCE</span></div></div>
      <div className="workspace-switcher"><div className="workspace-avatar">O</div><div><b>Orbit workspace</b><span>Personal workspace</span></div><Icon name="chevron" size={15}/></div>
      <nav>
        <p className="nav-label">Workspace</p>
        <NavItem icon="grid" label="Overview" active={page === 'dashboard'} onClick={() => navigate('dashboard')} />
        <NavItem icon="bot" label="AI agents" count={agents.length} active={page === 'agents'} onClick={() => navigate('agents')} />
        <NavItem icon="workflow" label="Workflows" count={workflows.length} active={page === 'workflows'} onClick={() => navigate('workflows')} />
        <NavItem icon="activity" label="Activity" active={page === 'activity'} onClick={() => navigate('activity')} />
      </nav>
      <div className="sidebar-footer"><div className="plan-card"><div className="plan-icon"><Icon name="spark" size={16}/></div><div><b>Local workspace</b><span>Runs stay on this machine</span></div></div><div className="profile"><div className="profile-avatar">O</div><div><b>Olale</b><span>Builder account</span></div><span className="status-dot"/></div></div>
    </aside>
    {mobileNav && <button className="scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
    <main className="main-content">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Icon name="menu"/></button><div className="breadcrumbs"><span>Orbit workspace</span><Icon name="arrow" size={13}/><b>{pageTitle(page)}</b></div><div id="autocomplete"></div><div className="topbar-actions"><span className="local-pill"><span className="status-dot"/> Local mode</span><button className="avatar-button">O</button></div></header>
      <div className="content-wrap">
        {page === 'dashboard' && <Dashboard stats={stats} agents={agents} workflows={workflows} executions={executions} onNavigate={navigate} onNewAgent={() => setModal({ type: 'agent' })} onNewWorkflow={() => setModal({ type: 'workflow' })} onRunDemo={runDemo} onRun={(workflow) => setModal({ type: 'run', workflow })} />}
        {page === 'agents' && <AgentsPage agents={agents} onNew={() => setModal({ type: 'agent' })} onEdit={(agent) => setModal({ type: 'agent', agent })} onDelete={removeAgent} />}
        {page === 'workflows' && <WorkflowsPage workflows={workflows} agents={agents} onNew={() => setModal({ type: 'workflow' })} onEdit={(workflow) => setModal({ type: 'workflow', workflow })} onDelete={removeWorkflow} onRun={(workflow) => setModal({ type: 'run', workflow })} />}
        {page === 'activity' && <ActivityPage executions={executions} />}
      </div>
    </main>
    {modal?.type === 'agent' && <AgentModal agent={modal.agent} onClose={() => setModal(null)} onSave={saveAgent} />}
    {modal?.type === 'workflow' && <WorkflowModal workflow={modal.workflow} agents={agents} onClose={() => setModal(null)} onSave={saveWorkflow} />}
    {modal?.type === 'run' && <RunModal workflow={modal.workflow} onClose={() => setModal(null)} onRun={executeWorkflow} />}
    {toast && <div className={`toast ${toast.type}`}><span className="toast-icon"><Icon name={toast.type === 'error' ? 'close' : 'check'} size={15}/></span>{toast.message}</div>}
  </div>;
}

function NavItem({ icon, label, count, active, onClick }) { return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><Icon name={icon}/><span>{label}</span>{count !== undefined && <em>{count}</em>}</button>; }
function pageTitle(page) { return ({ dashboard: 'Overview', agents: 'AI agents', workflows: 'Workflows', activity: 'Activity' })[page]; }
function formatDate(value) { if (!value) return 'Never'; return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
function formatDuration(ms) { return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`; }

function Dashboard({ stats, agents, workflows, executions, onNavigate, onNewAgent, onNewWorkflow, onRunDemo, onRun }) {
  const today = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());
  return <>
    <div className="page-heading"><div><div className="eyebrow">{today}</div><h1>Good morning, Olale <span>✦</span></h1><p>Build, run, and inspect your intelligent workflows.</p></div><div className="heading-actions"><button className="button secondary" onClick={onNewAgent}><Icon name="plus" size={16}/> New agent</button><button className="button primary" onClick={onNewWorkflow}><Icon name="plus" size={16}/> New workflow</button></div></div>
    <section className="hero-card"><div className="hero-glow"/><div className="hero-copy"><span className="hero-kicker"><Icon name="spark" size={14}/> Local automation studio</span><h2>Turn scattered inputs into <em>clear action.</em></h2><p>AgentFlow gives your team a calm, inspectable place to automate repetitive work — with every run saved.</p><button className="button light" onClick={onRunDemo}><Icon name="play" size={14}/> Run the demo workflow <Icon name="arrow" size={14}/></button></div><div className="hero-visual"><div className="flow-node node-one"><span className="node-icon purple"><Icon name="workflow" size={15}/></span><div><b>Team notes</b><span>input</span></div></div><div className="flow-line"/><div className="flow-node node-two"><span className="node-icon cyan"><Icon name="spark" size={15}/></span><div><b>Daily brief</b><span>deterministic</span></div></div><div className="flow-line short"/><div className="flow-check"><Icon name="check" size={13}/></div></div></section>
    <div className="section-row"><h2 className="section-title">Workspace pulse</h2><span className="muted">Updated just now</span></div>
    <div className="stats-grid"><StatCard label="Active agents" value={stats.agents} detail="Configured for your workspace" icon="bot" tone="purple"/><StatCard label="Live workflows" value={stats.workflows} detail="Ready for manual runs" icon="workflow" tone="cyan"/><StatCard label="Total executions" value={stats.executions} detail="Across all workflows" icon="activity" tone="orange"/><StatCard label="Success rate" value={`${stats.successRate}%`} detail={stats.executions ? 'Based on recorded runs' : 'Run the demo to get started'} icon="check" tone="green"/></div>
    <div className="dashboard-grid"><section className="panel activity-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>The latest workflow runs across your workspace.</p></div><button className="text-button" onClick={() => onNavigate('activity')}>View all <Icon name="arrow" size={14}/></button></div>{executions.length ? <div className="activity-list">{executions.slice(0, 5).map((execution) => <ActivityRow execution={execution} key={execution.id}/>)}</div> : <EmptyState icon="activity" title="No executions yet" copy="Run the demo workflow to see your first result here." action="Run demo" onClick={onRunDemo}/>}</section><section className="panel quick-panel"><div className="panel-heading"><div><h2>Quick start</h2><p>A complete path from idea to automation.</p></div><span className="progress-label">{Math.min(agents.length + workflows.length, 2)} / 2</span></div><div className="checklist"><ChecklistItem done={agents.length > 0} title="Create an AI agent" copy="Define the purpose and operating instructions." onClick={onNewAgent}/><ChecklistItem done={workflows.length > 0} title="Build a workflow" copy="Connect a trigger to a useful action." onClick={onNewWorkflow}/><ChecklistItem done={executions.length > 0} title="Inspect a real run" copy="Review the output and execution history." onClick={() => onNavigate('activity')}/></div></section></div>
    <div className="section-row lower"><h2 className="section-title">Your workflows</h2><button className="text-button" onClick={() => onNavigate('workflows')}>Manage workflows <Icon name="arrow" size={14}/></button></div>
    <div className="workflow-preview-grid">{workflows.slice(0, 3).map((workflow) => <WorkflowCard workflow={workflow} key={workflow.id} onRun={() => onRun(workflow)} onEdit={() => onNavigate('workflows')}/>)}{!workflows.length && <EmptyState icon="workflow" title="Create your first workflow" copy="Start with a deterministic local automation — no API keys needed." action="New workflow" onClick={onNewWorkflow}/>}</div>
  </>;
}

function StatCard({ label, value, detail, icon, tone }) { return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon name={icon} size={18}/></div><div className="stat-value">{value}</div><div className="stat-label">{label}</div><div className="stat-detail">{detail}</div></div>; }
function ChecklistItem({ done, title, copy, onClick }) { return <button className="checklist-item" onClick={onClick}><span className={`check-circle ${done ? 'done' : ''}`}>{done && <Icon name="check" size={13}/>}</span><span><b>{title}</b><small>{copy}</small></span><Icon name="arrow" size={15}/></button>; }
function ActivityRow({ execution }) { return <div className="activity-row"><div className={`activity-status ${execution.status}`}><Icon name={execution.status === 'succeeded' ? 'check' : 'close'} size={14}/></div><div className="activity-main"><b>{execution.workflowName}</b><span>{execution.status === 'succeeded' ? 'Completed successfully' : execution.error || 'Run failed'}</span></div><div className="activity-meta"><b>{formatDate(execution.createdAt)}</b><span>{formatDuration(execution.durationMs)}</span></div></div>; }
function WorkflowCard({ workflow, onRun, onEdit }) { return <div className="workflow-card"><div className="workflow-card-top"><span className="workflow-symbol"><Icon name="workflow" size={17}/></span><span className="trigger-tag"><span className="status-dot"/> Manual</span></div><h3>{workflow.name}</h3><p>{workflow.description}</p><div className="workflow-card-bottom"><span><Icon name="activity" size={13}/> {workflow.executionCount || 0} runs</span><button className="run-link" onClick={onRun}><Icon name="play" size={12}/> Run</button><button className="icon-button subtle" onClick={onEdit} aria-label={`Edit ${workflow.name}`}><Icon name="edit" size={14}/></button></div></div>; }

function AgentsPage({ agents, onNew, onEdit, onDelete }) { return <><PageHeader eyebrow="Workspace / AI agents" title="AI agents" copy="Give every automation a clear purpose and operating system." action="New agent" onAction={onNew}/><div className="info-banner"><span className="banner-icon"><Icon name="spark" size={16}/></span><div><b>Configuration is ready. Intelligence is opt-in.</b><p>Agent profiles are stored locally and can guide future provider integrations. The demo workflow below is deterministic and makes no external AI calls.</p></div></div><div className="agent-grid">{agents.map((agent) => <AgentCard agent={agent} key={agent.id} onEdit={() => onEdit(agent)} onDelete={() => onDelete(agent.id)}/>)}{!agents.length && <EmptyState icon="bot" title="No agents configured" copy="Create a profile to give your workflows a reusable purpose and set of instructions." action="Create agent" onClick={onNew}/>}</div></>; }
function AgentCard({ agent, onEdit, onDelete }) { return <div className="agent-card"><div className="agent-card-head"><div className="agent-avatar">{agent.name.slice(0, 1).toUpperCase()}</div><div className="card-actions"><button className="icon-button" onClick={onEdit} aria-label="Edit agent"><Icon name="edit" size={15}/></button><button className="icon-button danger" onClick={onDelete} aria-label="Delete agent"><Icon name="trash" size={15}/></button></div></div><h3>{agent.name}</h3><p className="agent-purpose">{agent.purpose}</p><div className="instruction-box"><span>Instructions</span><p>{agent.instructions}</p></div><div className="card-foot"><span><span className="status-dot"/> Ready</span><span>Updated {formatDate(agent.updated_at)}</span></div></div>; }

function WorkflowsPage({ workflows, agents, onNew, onEdit, onDelete, onRun }) { return <><PageHeader eyebrow="Workspace / Workflows" title="Workflows" copy="Compose repeatable automations and inspect exactly what they return." action="New workflow" onAction={onNew}/><div className="workflow-table panel"><div className="table-heading"><span>Workflow</span><span>Trigger</span><span>Agent</span><span>Runs</span><span>Last run</span><span/></div>{workflows.map((workflow) => <div className="table-row" key={workflow.id}><div className="table-workflow"><span className="workflow-symbol small"><Icon name="workflow" size={15}/></span><span><b>{workflow.name}</b><small>{workflow.description}</small></span></div><span><span className="trigger-tag"><span className="status-dot"/> Manual</span></span><span className="agent-cell">{workflow.agentName || 'No agent assigned'}</span><span className="run-count">{workflow.executionCount || 0}</span><span className="last-run">{formatDate(workflow.lastExecutedAt)}</span><div className="row-actions"><button className="run-link" onClick={() => onRun(workflow)}><Icon name="play" size={12}/> Run</button><button className="icon-button subtle" onClick={() => onEdit(workflow)} aria-label="Edit workflow"><Icon name="edit" size={14}/></button><button className="icon-button subtle danger" onClick={() => onDelete(workflow.id)} aria-label="Delete workflow"><Icon name="trash" size={14}/></button></div></div>)}{!workflows.length && <EmptyState icon="workflow" title="No workflows yet" copy="Create your first workflow to turn a repeatable task into a one-click run." action="Create workflow" onClick={onNew}/>}</div></>; }

function ActivityPage({ executions }) { return <><PageHeader eyebrow="Workspace / Activity" title="Execution activity" copy="A durable record of every workflow run, output, and error."/><div className="panel history-panel"><div className="panel-heading"><div><h2>Run history</h2><p>Local execution records are persisted in SQLite.</p></div><span className="history-count">{executions.length} total</span></div>{executions.length ? <div className="history-list">{executions.map((execution) => <ExecutionDetail execution={execution} key={execution.id}/>)}</div> : <EmptyState icon="activity" title="Nothing has run yet" copy="Execute a workflow and its result will appear here."/>}</div></>; }
function ExecutionDetail({ execution }) { const [open, setOpen] = useState(false); return <div className={`execution-detail ${open ? 'expanded' : ''}`}><button className="execution-summary" onClick={() => setOpen(!open)}><span className={`activity-status ${execution.status}`}><Icon name={execution.status === 'succeeded' ? 'check' : 'close'} size={14}/></span><span className="execution-title"><b>{execution.workflowName}</b><small>{execution.status === 'succeeded' ? 'Completed successfully' : execution.error}</small></span><span className="execution-time"><b>{formatDate(execution.createdAt)}</b><small>{formatDuration(execution.durationMs)}</small></span><Icon name="chevron" size={16}/></button>{open && <div className="execution-body"><div><span className="code-label">INPUT</span><pre>{JSON.stringify(execution.input, null, 2)}</pre></div><div><span className="code-label">OUTPUT</span><pre>{execution.output ? JSON.stringify(execution.output, null, 2) : execution.error}</pre></div></div>}</div>; }

function PageHeader({ eyebrow, title, copy, action, onAction }) { return <div className="page-heading compact"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{copy}</p></div>{action && <button className="button primary" onClick={onAction}><Icon name="plus" size={16}/> {action}</button>}</div>; }
function EmptyState({ icon, title, copy, action, onClick }) { return <div className="empty-state"><div className="empty-icon"><Icon name={icon} size={20}/></div><h3>{title}</h3><p>{copy}</p>{action && <button className="button secondary" onClick={onClick}>{action} <Icon name="arrow" size={14}/></button>}</div>; }

function AgentModal({ agent, onClose, onSave }) { const [form, setForm] = useState({ name: agent?.name || '', purpose: agent?.purpose || '', instructions: agent?.instructions || '' }); const [error, setError] = useState(''); const submit = (event) => { event.preventDefault(); if (!form.name.trim() || !form.purpose.trim() || !form.instructions.trim()) return setError('Complete all fields before saving.'); onSave(form, agent?.id); }; return <Modal title={agent ? 'Edit agent' : 'Create an agent'} copy="Define the profile that future runs can use as context." onClose={onClose}><form onSubmit={submit}><Field label="Agent name" value={form.name} placeholder="e.g. Customer support copilot" onChange={(value) => setForm({ ...form, name: value })}/><Field label="Purpose" value={form.purpose} placeholder="What outcome does this agent help with?" onChange={(value) => setForm({ ...form, purpose: value })}/><Field label="Instructions" value={form.instructions} placeholder="How should it approach its work?" multiline onChange={(value) => setForm({ ...form, instructions: value })}/>{error && <div className="form-error">{error}</div>}<ModalActions onClose={onClose} submitLabel={agent ? 'Save changes' : 'Create agent'}/></form></Modal>; }
function WorkflowModal({ workflow, agents, onClose, onSave }) { const existing = workflow?.actions?.[0] || {}; const [form, setForm] = useState({ name: workflow?.name || '', description: workflow?.description || '', agentId: workflow?.agentId || '', actionType: existing.type || 'summarize_text', actionTitle: existing.config?.title || 'Daily team brief' }); const [error, setError] = useState(''); const submit = (event) => { event.preventDefault(); if (!form.name.trim() || !form.description.trim()) return setError('Add a name and description.'); onSave({ name: form.name, description: form.description, agentId: form.agentId || null, triggerType: 'manual', actions: [{ type: form.actionType, label: form.actionType === 'summarize_text' ? 'Create deterministic summary' : form.actionType === 'extract_tasks' ? 'Extract task lines' : 'Format input as JSON', config: { title: form.actionTitle } }] }, workflow?.id); }; return <Modal title={workflow ? 'Edit workflow' : 'Create a workflow'} copy="Keep the first version simple, observable, and useful." onClose={onClose}><form onSubmit={submit}><Field label="Workflow name" value={form.name} placeholder="e.g. Weekly project digest" onChange={(value) => setForm({ ...form, name: value })}/><Field label="Description" value={form.description} placeholder="What does this workflow produce?" onChange={(value) => setForm({ ...form, description: value })}/><div className="form-row"><label className="field"><span>Trigger</span><select value="manual" disabled><option value="manual">Manual run</option></select><small>Scheduled and event triggers are planned, not enabled.</small></label><label className="field"><span>Agent profile <em>optional</em></span><select value={form.agentId} onChange={(event) => setForm({ ...form, agentId: event.target.value })}><option value="">No agent assigned</option>{agents.map((agent) => <option value={agent.id} key={agent.id}>{agent.name}</option>)}</select></label></div><div className="action-builder"><span className="builder-label">Action 01</span><div className="action-builder-main"><span className="node-icon cyan"><Icon name="spark" size={16}/></span><div><b>{form.actionType === 'summarize_text' ? 'Create deterministic summary' : form.actionType === 'extract_tasks' ? 'Extract task lines' : 'Format input as JSON'}</b><small>Runs locally without an external provider</small></div><select value={form.actionType} onChange={(event) => setForm({ ...form, actionType: event.target.value })}><option value="summarize_text">Summarize lines</option><option value="extract_tasks">Extract tasks</option><option value="format_json">Format JSON</option></select></div>{form.actionType === 'summarize_text' && <Field label="Summary title" value={form.actionTitle} placeholder="Daily team brief" onChange={(value) => setForm({ ...form, actionTitle: value })}/>}</div>{error && <div className="form-error">{error}</div>}<ModalActions onClose={onClose} submitLabel={workflow ? 'Save workflow' : 'Create workflow'}/></form></Modal>; }
function RunModal({ workflow, onClose, onRun }) { const [value, setValue] = useState(demoInput); return <Modal title={`Run ${workflow.name}`} copy="Provide JSON input or plain text. This run will be persisted to your local activity history." onClose={onClose}><div className="run-helper"><Icon name="spark" size={15}/><span>This workflow uses <b>{workflow.actions?.[0]?.type === 'summarize_text' ? 'deterministic line summarization' : 'local processing'}</b> — no AI API key or network call.</span></div><label className="field"><span>Run input</span><textarea className="code-input" value={value} onChange={(event) => setValue(event.target.value)} spellCheck="false"/><small>Tip: use JSON with an <code>items</code> array for the summary demo.</small></label><div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" onClick={() => onRun(workflow, value)}><Icon name="play" size={14}/> Execute workflow</button></div></Modal>; }
function Modal({ title, copy, onClose, children }) { return <div className="modal-layer"><button className="modal-scrim" onClick={onClose} aria-label="Close modal"/><section className="modal"><div className="modal-header"><div><h2>{title}</h2><p>{copy}</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><Icon name="close"/></button></div>{children}</section></div>; }
function Field({ label, value, placeholder, onChange, multiline = false }) { return <label className="field"><span>{label}</span>{multiline ? <textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} rows="4"/> : <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)}/>}</label>; }
function ModalActions({ onClose, submitLabel }) { return <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button type="submit" className="button primary">{submitLabel}</button></div>; }

createRoot(document.getElementById('root')).render(<App />);
