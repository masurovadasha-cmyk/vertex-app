import { DurableObject } from "cloudflare:workers";
import { AGENTS, chooseAgent } from "./agents";
import { classifyRisk, needsTwoKey } from "./policy";
import { JARVIS_INSTRUCTIONS } from "./prompt";

type Env = {
  OPENAI_API_KEY: string;
  JARVIS_OWNER_TOKEN: string;
  OPENAI_MODEL?: string;
  JARVIS_ENV?: string;
  JARVIS_STATE: DurableObjectNamespace<JarvisState>;
};

type CommandBody = {
  principalId: "FIRDAUS" | "DARYA";
  command: string;
  context?: Record<string, unknown>;
  allowWebResearch?: boolean;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });

function authorized(request: Request, env: Env) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(token && env.JARVIS_OWNER_TOKEN && token === env.JARVIS_OWNER_TOKEN);
}

function extractText(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const out = Array.isArray(payload?.output) ? payload.output : [];
  const parts: string[] = [];
  for (const item of out) {
    if (item?.type !== "message" || !Array.isArray(item?.content)) continue;
    for (const c of item.content) if (typeof c?.text === "string") parts.push(c.text);
  }
  return parts.join("\n");
}

async function callOpenAI(env: Env, body: CommandBody, agentId: keyof typeof AGENTS, risk: string) {
  const legalMode = agentId === "legal";
  const tools = body.allowWebResearch === false ? [] : [
    legalMode
      ? { type: "web_search", filters: { allowed_domains: ["lex.uz", "gov.uz", "soliq.uz"] } }
      : { type: "web_search" }
  ];

  const input = [
    `Authenticated principal: ${body.principalId}`,
    `Selected specialist: ${agentId} — ${AGENTS[agentId]}`,
    `Policy risk tier: ${risk}`,
    body.context ? `Context: ${JSON.stringify(body.context)}` : "",
    `Command: ${body.command}`
  ].filter(Boolean).join("\n\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-6-astra",
      reasoning: { effort: "medium" },
      instructions: JARVIS_INSTRUCTIONS,
      tools,
      tool_choice: tools.length ? "auto" : undefined,
      input
    })
  });

  const payload = await response.json<any>();
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI error ${response.status}`);
  return { text: extractText(payload), rawId: payload?.id, usage: payload?.usage };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "vertex-jarvis",
        environment: env.JARVIS_ENV || "unknown",
        model: env.OPENAI_MODEL || "gpt-6-astra",
        timestamp: new Date().toISOString()
      });
    }

    if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);

    const state = env.JARVIS_STATE.getByName("vertex-group");

    if (url.pathname === "/v1/status" && request.method === "GET") {
      return state.fetch(new Request("https://state/status"));
    }

    if (url.pathname === "/v1/commands" && request.method === "POST") {
      const body = await request.json<CommandBody>();
      if (!body?.command || !["FIRDAUS", "DARYA"].includes(body.principalId)) {
        return json({ error: "invalid command payload" }, 400);
      }

      const risk = classifyRisk(body.command);
      const agentId = chooseAgent(body.command);
      const twoKey = needsTwoKey(body.command);

      const started = Date.now();
      const ai = await callOpenAI(env, body, agentId, risk);
      const decision = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        principalId: body.principalId,
        agentId,
        risk,
        twoKey,
        command: body.command,
        recommendation: ai.text,
        modelResponseId: ai.rawId,
        latencyMs: Date.now() - started,
        execution: risk === "red" ? "approval_required" : "recommendation_ready"
      };

      await state.fetch(new Request("https://state/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "decision", data: decision })
      }));

      return json(decision, risk === "red" ? 202 : 200);
    }

    if (url.pathname === "/v1/approvals" && request.method === "POST") {
      const approval = await request.json<any>();
      if (!approval?.decisionId || !["FIRDAUS", "DARYA"].includes(approval?.principalId)) {
        return json({ error: "invalid approval payload" }, 400);
      }
      const event = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...approval
      };
      await state.fetch(new Request("https://state/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "approval", data: event })
      }));
      return json({ ok: true, approval: event });
    }

    return json({ error: "not_found" }, 404);
  }
};

export class JarvisState extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL
      )
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/events" && request.method === "POST") {
      const event = await request.json<any>();
      this.ctx.storage.sql.exec(
        "INSERT INTO events (created_at, type, payload) VALUES (?, ?, ?)",
        new Date().toISOString(),
        String(event.type || "unknown"),
        JSON.stringify(event.data ?? null)
      );
      return json({ ok: true });
    }

    if (url.pathname === "/status") {
      const rows = [...this.ctx.storage.sql.exec(
        "SELECT seq, created_at, type, payload FROM events ORDER BY seq DESC LIMIT 25"
      )].map((r: any) => ({
        seq: r.seq,
        createdAt: r.created_at,
        type: r.type,
        data: JSON.parse(r.payload)
      }));

      return json({
        service: "vertex-jarvis",
        mode: "bounded-autonomy",
        principals: ["FIRDAUS", "DARYA"],
        recentEvents: rows
      });
    }

    return json({ error: "not_found" }, 404);
  }
}
