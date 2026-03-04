# mcp-es-logs: Elasticsearch Log Downloader MCP Server

**Repository:** https://github.com/TomonoriSoejima/es-log-downloader

## Overview

`mcp-es-logs` is a Model Context Protocol (MCP) server that downloads Elasticsearch logs from Elastic Cloud. It uses the Admin API endpoint:

```
GET /api/v1/deployments/<deployment_id>/elasticsearch/<ref_id>/logs/_download?date=yyyy-MM-dd
```

The server exposes four tools callable from any MCP-compatible client (e.g., GitHub Copilot, Claude Desktop).

## Prerequisites

- Node.js ≥ 18
- `EC_API_KEY` environment variable set to an Elastic Cloud API key with admin access

```bash
export EC_API_KEY=<your-elastic-cloud-api-key>
```

## Installation

```bash
npm install
npm run build   # compile TypeScript → dist/
npm start       # start the server
```

## Tools

### `get_es_ref_id`
Resolves the Elasticsearch `ref_id` for a deployment (e.g. `main-elasticsearch`). Required by the download endpoint.

| Parameter | Type | Required |
|---|---|---|
| `deployment_id` | string | yes |

---

### `download_es_logs`
Downloads logs for a single day using:
```
GET /api/v1/deployments/<deployment_id>/elasticsearch/<ref_id>/logs/_download?date=yyyy-MM-dd
```
Saves the ZIP and extracts the `.log` file to `output_dir`.

| Parameter | Type | Required |
|---|---|---|
| `deployment_id` | string | yes |
| `date` | string (yyyy-MM-dd) | yes |
| `output_dir` | string | yes |
| `ref_id` | string | no — auto-resolved |

---

### `download_es_logs_range`
Calls the same download endpoint once per day for an inclusive date range. Per-day failures are reported inline without stopping the rest.

| Parameter | Type | Required |
|---|---|---|
| `deployment_id` | string | yes |
| `start_date` | string (yyyy-MM-dd) | yes |
| `end_date` | string (yyyy-MM-dd) | yes |
| `output_dir` | string | yes |
| `ref_id` | string | no — auto-resolved |

---

### `get_plan_logs`
Returns failed plan history for a deployment, including the failed step, failure type, message, and per-node details.

| Parameter | Type | Required |
|---|---|---|
| `deployment_id` | string | yes |

## MCP Client Configuration

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
