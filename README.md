# GitHub Support Chat

Monorepo for a GitHub documentation support chat widget.

## Packages

- `packages/client`: React + Vite chat widget UI
- `packages/server`: Express API, MCP retrieval, OpenAI orchestration
- `packages/shared`: shared request/event types and SSE parsing helpers

## Environment

Create a `.env` file in `packages/server` with:

```bash
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-4.1-mini
MCP_URL=http://localhost:3000/mcp
PORT=4000
```

## Scripts

```bash
npm install
npm run dev
npm run test
npm run build
```
