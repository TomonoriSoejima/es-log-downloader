# mcp-es-logs: Elasticsearch Log Downloader MCP Server

## Overview

`mcp-es-logs` is a Model Context Protocol (MCP) server that downloads Elasticsearch logs from Elastic Cloud via the Admin API (`admin.found.no`). It exposes four tools that can be invoked by any MCP-compatible client (e.g., GitHub Copilot, Claude Desktop).

## Prerequisites

| Requirement | Details |
|---|---|
| Node.js | ≥ 18 |
| Environment variable | `EC_API_KEY` — an Elastic Cloud API key with admin access |
| Network access | Must be able to reach `admin.found.no` |

Set the API key before starting the server:

```bash
export EC_API_KEY=<your-elastic-cloud-api-key>
```

## Installation & Build

```bash
npm install
npm run build        # compiles TypeScript → dist/
npm start            # runs dist/index.js via stdio transport
```

For development without a build step:

```bash
npm run dev          # runs src/index.ts directly via ts-node
```

## Tools

### 1. `get_es_ref_id`

Resolves the Elasticsearch `ref_id` for a deployment. The `ref_id` is required by the log-download API and is typically `main-elasticsearch`.

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `deployment_id` | string | yes | Elastic Cloud deployment ID (32-char hex) |

**Example output**

```
ref_id: main-elasticsearch
```

---

### 2. `download_es_logs`

Downloads the compressed log archive for a single day, saves the ZIP, and extracts the `.log` file inside it.

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `deployment_id` | string | yes | Elastic Cloud deployment ID |
| `date` | string | yes | Date in `yyyy-MM-dd` format |
| `output_dir` | string | yes | Directory where the ZIP and extracted log are saved |
| `ref_id` | string | no | Elasticsearch ref_id — fetched automatically if omitted |

**Output structure**

```
<output_dir>/
  es_logs_<date>.zip
  es_logs_<date>/
    <logfile>.log
```

**Example output**

```
✅ Downloaded ES logs for 2026-03-03
  Deployment: 76c18f094a70482781197bf80c6d8526
  ref_id:     main-elasticsearch
  ZIP:        /tmp/logs/es_logs_2026-03-03.zip
  Log:        /tmp/logs/es_logs_2026-03-03/elasticsearch.log
  Size:       12.45 MB
```

---

### 3. `download_es_logs_range`

Downloads logs for every day in an inclusive date range. Each day is downloaded sequentially; failures for individual days are reported inline without aborting the rest.

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `deployment_id` | string | yes | Elastic Cloud deployment ID |
| `start_date` | string | yes | Start date in `yyyy-MM-dd` format |
| `end_date` | string | yes | End date in `yyyy-MM-dd` format (inclusive) |
| `output_dir` | string | yes | Directory where files are saved |
| `ref_id` | string | no | Elasticsearch ref_id — fetched automatically if omitted |

**Example output**

```
Downloading ES logs for 3 day(s) — deployment: 76c18f094a70482781197bf80c6d8526

✅ 2026-03-01 — 11.20 MB → /tmp/logs/es_logs_2026-03-01/elasticsearch.log
✅ 2026-03-02 — 10.87 MB → /tmp/logs/es_logs_2026-03-02/elasticsearch.log
❌ 2026-03-03 — Log download API returned 404: ...
```

---

### 4. `get_plan_logs`

Retrieves **failed** plan history for a deployment — useful when investigating a configuration change or upgrade that went wrong. For each failed attempt the tool surfaces the failed step, failure type, message, and per-node details.

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `deployment_id` | string | yes | Elastic Cloud deployment ID |

**Example output**

```
Found 1 failed plan attempt(s) for deployment: f91cb61b087d475a917dcc8e1f5e3dee

❌ Attempt: abc123
   Started:      2026-02-28T10:00:00Z
   Ended:        2026-02-28T10:08:34Z
   Failed step:  rolling-grow-and-shrink
   Failure type: NodeShutdownFailure
   Message:      Node did not stop within the expected time
   Details:
     instance-0000000001: Timed out waiting for node to leave the cluster
```

## MCP Client Configuration

Add the server to your MCP client config (example for Claude Desktop `~/.claude/claude_desktop_config.json`):

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

## Admin API Endpoints Used

| Tool | Endpoint |
|---|---|
| `get_es_ref_id` | `GET /api/v1/deployments/{deployment_id}` |
| `download_es_logs` | `GET /api/v1/deployments/{id}/elasticsearch/{ref_id}/logs/_download?date={date}` |
| `download_es_logs_range` | Same as above, called once per day |
| `get_plan_logs` | `GET /api/v1/deployments/{id}?show_plan_logs=true&show_plans=true&show_plan_history=true` |

## Troubleshooting

| Error | Likely cause |
|---|---|
| `EC_API_KEY environment variable is not set` | Missing or unexported env var |
| `Admin API returned 401` | Invalid or expired API key |
| `Admin API returned 403` | API key lacks admin access |
| `Admin API returned 404` | Wrong deployment ID or no logs for that date |
| `Could not find elasticsearch ref_id` | Deployment has no Elasticsearch resource |
| `Unexpected content-type` | API returned an error body instead of a ZIP |
| `unzip: command not found` | `unzip` must be installed on the host running the server |
