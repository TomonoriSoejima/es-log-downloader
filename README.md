# mcp-es-logs

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that downloads Elasticsearch logs from Elastic Cloud via the Admin API.

## Prerequisites

- Node.js ≥ 18
- `unzip` available on the host
- An Elastic Cloud API key with admin access

```bash
export EC_API_KEY=<your-elastic-cloud-api-key>
```

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
npm start        # production (requires build)
npm run dev      # development via ts-node
```

## Tools

| Tool | Description |
|---|---|
| `get_es_ref_id` | Resolve the Elasticsearch `ref_id` for a deployment |
| `download_es_logs` | Download logs for a single date |
| `download_es_logs_range` | Download logs for an inclusive date range |
| `get_plan_logs` | Show failed plan history for a deployment |

See [KB.md](KB.md) for full parameter reference and examples.

## MCP Client Setup

Add to your MCP client config (e.g. Claude Desktop `~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "mcp-es-logs": {
      "command": "node",
      "args": ["/path/to/es-log-downloader/dist/index.js"],
      "env": {
        "EC_API_KEY": "<your-api-key>"
      }
    }
  }
}
```
