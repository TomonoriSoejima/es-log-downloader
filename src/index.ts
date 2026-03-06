import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import { IncomingHttpHeaders } from "http";
import { execSync } from "child_process";

const ADMIN_BASE = "https://admin.found.no/api/v1";

interface HttpResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

interface PlanInfoLog {
  failure_type?: string;
  message?: string;
  details?: Record<string, string>;
}

interface PlanAttemptLog {
  step_id: string;
  status: string;
  info_log?: PlanInfoLog[];
}

interface PlanHistory {
  plan_attempt_id: string;
  attempt_start_time: string;
  attempt_end_time: string;
  plan_attempt_log?: PlanAttemptLog[];
}

interface FailedPlan {
  attempt: string;
  started: string;
  ended: string;
  failed_step: string | null;
  failure_type: string | null;
  message: string | null;
  details: Record<string, string> | null;
}

function getApiKey(): string {
  const key = process.env.EC_API_KEY;
  if (!key) throw new Error("EC_API_KEY environment variable is not set");
  return key;
}

function httpsGet(url: string, apiKey: string): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Authorization: `ApiKey ${apiKey}` } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
  });
}

async function getRefId(deploymentId: string, apiKey: string): Promise<string> {
  const url = `${ADMIN_BASE}/deployments/${deploymentId}`;
  const { status, body } = await httpsGet(url, apiKey);
  if (status !== 200) throw new Error(`Admin API returned ${status}: ${body.toString()}`);
  const data = JSON.parse(body.toString());
  const refId = data?.resources?.elasticsearch?.[0]?.ref_id;
  if (!refId) throw new Error("Could not find elasticsearch ref_id in deployment response");
  return refId;
}

async function downloadLogs(deploymentId: string, refId: string, date: string, apiKey: string, outputDir: string): Promise<{ savedZip: string; savedLog: string; sizeBytes: number }> {
  const url = `${ADMIN_BASE}/deployments/${deploymentId}/elasticsearch/${refId}/logs/_download?date=${date}`;
  const { status, headers, body } = await httpsGet(url, apiKey);

  if (status !== 200) throw new Error(`Log download API returned ${status}: ${body.toString()}`);
  if (!headers["content-type"]?.includes("zip")) throw new Error(`Unexpected content-type: ${headers["content-type"]}`);

  fs.mkdirSync(outputDir, { recursive: true });

  const zipPath = path.join(outputDir, `es_logs_${date}.zip`);
  fs.writeFileSync(zipPath, body);

  // Extract the zip
  const extractDir = path.join(outputDir, `es_logs_${date}`);
  fs.mkdirSync(extractDir, { recursive: true });
  execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: "pipe" });

  // Find the extracted log file
  const files = fs.readdirSync(extractDir);
  const logFile = files.find((f) => f.endsWith(".log"));
  const logPath = logFile ? path.join(extractDir, logFile) : "";

  return { savedZip: zipPath, savedLog: logPath, sizeBytes: body.length };
}

// ----- MCP Server -----

const server = new McpServer({
  name: "mcp-es-logs",
  version: "1.0.0",
});

// Tool 1: get_es_ref_id
server.tool(
  "get_es_ref_id",
  "Get the Elasticsearch resource ref_id for a given Elastic Cloud deployment ID",
  {
    deployment_id: z.string().describe("The Elastic Cloud deployment ID (e.g. 76c18f094a70482781197bf80c6d8526)"),
  },
  async ({ deployment_id }) => {
    const apiKey = getApiKey();
    const refId = await getRefId(deployment_id, apiKey);
    return {
      content: [{ type: "text", text: `ref_id: ${refId}` }],
    };
  }
);

// Tool 2: download_es_logs
server.tool(
  "download_es_logs",
  "Download Elasticsearch logs for a specific date from an Elastic Cloud deployment",
  {
    deployment_id: z.string().describe("The Elastic Cloud deployment ID"),
    date: z.string().describe("Date in yyyy-MM-dd format (e.g. 2026-03-03)"),
    output_dir: z.string().describe("Directory path where the zip and extracted log will be saved"),
    ref_id: z.string().optional().describe("Elasticsearch ref_id (e.g. main-elasticsearch). If omitted, it will be fetched automatically."),
  },
  async ({ deployment_id, date, output_dir, ref_id }) => {
    const apiKey = getApiKey();
    const resolvedRefId = ref_id ?? (await getRefId(deployment_id, apiKey));
    const result = await downloadLogs(deployment_id, resolvedRefId, date, apiKey, output_dir);

    const sizeMB = (result.sizeBytes / 1024 / 1024).toFixed(2);
    const text = [
      `✅ Downloaded ES logs for ${date}`,
      `  Deployment: ${deployment_id}`,
      `  ref_id:     ${resolvedRefId}`,
      `  ZIP:        ${result.savedZip}`,
      `  Log:        ${result.savedLog}`,
      `  Size:       ${sizeMB} MB`,
    ].join("\n");

    return { content: [{ type: "text", text }] };
  }
);

// Tool 3: download_es_logs_range
server.tool(
  "download_es_logs_range",
  "Download Elasticsearch logs for a range of dates (start_date to end_date inclusive)",
  {
    deployment_id: z.string().describe("The Elastic Cloud deployment ID"),
    start_date: z.string().describe("Start date in yyyy-MM-dd format"),
    end_date: z.string().describe("End date in yyyy-MM-dd format"),
    output_dir: z.string().describe("Directory path where the zip files and logs will be saved"),
    ref_id: z.string().optional().describe("Elasticsearch ref_id. If omitted, it will be fetched automatically."),
  },
  async ({ deployment_id, start_date, end_date, output_dir, ref_id }) => {
    const apiKey = getApiKey();
    const resolvedRefId = ref_id ?? (await getRefId(deployment_id, apiKey));

    // Generate date range
    const dates: string[] = [];
    const cursor = new Date(start_date + "T00:00:00Z");
    const end = new Date(end_date + "T00:00:00Z");
    while (cursor <= end) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const results: string[] = [`Downloading ES logs for ${dates.length} day(s) — deployment: ${deployment_id}`, ""];
    for (const date of dates) {
      try {
        const result = await downloadLogs(deployment_id, resolvedRefId, date, apiKey, output_dir);
        const sizeMB = (result.sizeBytes / 1024 / 1024).toFixed(2);
        results.push(`✅ ${date} — ${sizeMB} MB → ${result.savedLog}`);
      } catch (err) {
        results.push(`❌ ${date} — ${(err as Error).message}`);
      }
    }

    return { content: [{ type: "text", text: results.join("\n") }] };
  }
);

// Tool 4: get_plan_logs
server.tool(
  "get_plan_logs",
  "Get failed plan history for an Elastic Cloud deployment, showing failure details for each failed plan attempt",
  {
    deployment_id: z.string().describe("The Elastic Cloud deployment ID (e.g. f91cb61b087d475a917dcc8e1f5e3dee)"),
  },
  async ({ deployment_id }) => {
    const apiKey = getApiKey();
    const url = `${ADMIN_BASE}/deployments/${deployment_id}?show_plan_logs=true&show_plans=true&show_plan_history=true`;
    const { status, body } = await httpsGet(url, apiKey);
    if (status !== 200) throw new Error(`Admin API returned ${status}: ${body.toString()}`);

    const data = JSON.parse(body.toString());
    const history: PlanHistory[] = data?.resources?.elasticsearch?.[0]?.info?.plan_info?.history ?? [];

    const seen = new Set<string>();
    const unique: FailedPlan[] = history
      .filter((h) => h?.plan_attempt_log?.at(-1)?.status === "error")
      .filter((h) => {
        if (seen.has(h.plan_attempt_id)) return false;
        seen.add(h.plan_attempt_id);
        return true;
      })
      .map((h) => {
        const logs: PlanAttemptLog[] = h.plan_attempt_log ?? [];
        const failedLog = logs.find((l) => l.info_log?.at(-1)?.failure_type);
        const lastInfoLog = failedLog?.info_log?.at(-1);
        return {
          attempt: h.plan_attempt_id,
          started: h.attempt_start_time,
          ended: h.attempt_end_time,
          failed_step: failedLog?.step_id ?? null,
          failure_type: lastInfoLog?.failure_type ?? null,
          message: lastInfoLog?.message ?? null,
          details: lastInfoLog?.details ?? null,
        };
      });

    if (unique.length === 0) {
      return { content: [{ type: "text", text: `No failed plans found for deployment ${deployment_id}` }] };
    }

    const lines: string[] = [`Found ${unique.length} failed plan attempt(s) for deployment: ${deployment_id}`, ""];
    for (const p of unique) {
      lines.push(`❌ Attempt: ${p.attempt}`);
      lines.push(`   Started:      ${p.started}`);
      lines.push(`   Ended:        ${p.ended}`);
      lines.push(`   Failed step:  ${p.failed_step}`);
      lines.push(`   Failure type: ${p.failure_type}`);
      lines.push(`   Message:      ${p.message}`);
      if (p.details) {
        lines.push(`   Details:`);
        for (const [node, msg] of Object.entries(p.details)) {
          lines.push(`     ${node}: ${msg}`);
        }
      }
      lines.push("");
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// Start server
const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});
