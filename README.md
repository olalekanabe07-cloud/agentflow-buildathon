# AgentFlow

AgentFlow is a local-first workflow automation workspace for the OmniRush Frontier Buildathon 2026. It combines a polished SaaS-style dashboard with a real Express API, React interface, and SQLite persistence.

## What works

- Responsive dashboard with workspace pulse, recent activity, and quick-start guidance.
- Agent management: create, edit, and delete agent profiles with a purpose and instructions.
- Workflow management: create, edit, and delete workflows with a manual trigger, optional agent profile, and one local action.
- Real synchronous workflow execution with persisted input, output, status, duration, and errors.
- Execution history with expandable JSON input/output details.
- Deterministic demo automation that requires no API keys or network calls:
  - `summarize_text`: turns an `items` array or newline-separated `text` into a titled brief.
  - `extract_tasks`: extracts lines beginning with `TODO`, `Task`, or unchecked checkbox markers.
  - `format_json`: wraps the provided input in a normalized result.
- Input validation and failure records. A failed run is never presented as a successful or fabricated result.

## Honest limitation

The product currently stores agent configurations but does not call an LLM provider. The included demo is deterministic local automation, clearly labeled in the UI as such. Provider-backed AI execution, scheduled triggers, and event triggers are intentionally outside this MVP so the application remains reproducible offline and does not require secrets.

## Architecture

```text
React + Vite (src/)
        │ /api proxy in development
Express API (server/index.js)
        │ built-in node:sqlite (Node 22)
SQLite database (data/agentflow.db)
```

The server owns validation, workflow execution, and persistence. The UI uses the API rather than mock data. On first start, the server seeds one `Briefing editor` agent and one `Daily brief generator` workflow so the primary path is immediately demonstrable.

## Requirements

- Node.js 22.23.3 (see `.nvmrc`)
- npm 10+

## Setup and run

```bash
npm ci
npm run dev
```

Open <http://localhost:5173>. The Vite development server proxies `/api` requests to the Express server on port 3001.

For a production-like run:

```bash
npm ci
npm run build
npm start
```

Then open <http://localhost:3001>.

Configuration is optional. Copy `.env.example` to `.env` and change `PORT` or `AGENTFLOW_DATA_DIR` if needed. The app does not read API keys.

## Demonstration

1. Open the dashboard.
2. Click **Run the demo workflow**. The seeded workflow is `Daily brief generator`.
3. The run uses three local notes and executes `summarize_text`.
4. Open **Activity** to inspect the saved execution, including the exact input and output JSON.
5. Create a new agent under **AI agents**.
6. Create a workflow under **Workflows**, choose `Summarize lines`, then use **Run** with JSON such as:

```json
{
  "items": [
    "Launch checklist is ready",
    "Review the onboarding copy tomorrow"
  ]
}
```

To intentionally inspect error handling, run a summary workflow with `{}`. The API creates a failed history record and returns the validation error instead of inventing an output.

## Checks

The single offline test command is:

```bash
npm test
```

It boots the real Express app against a temporary SQLite database and verifies health, seeded data, agent/workflow creation, successful execution, persisted history, and failed execution behavior. The full local check is:

```bash
npm run check
```

## Docker

Docker is supported through the included `Dockerfile`:

```bash
docker build -t agentflow .
docker run --rm -p 3001:3001 agentflow
```

The container keeps SQLite in `/app/data`. Mount a volume there if you want the database to survive container replacement.
