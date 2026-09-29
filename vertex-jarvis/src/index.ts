import { DurableObject } from "cloudflare:workers";
import { AGENTS, chooseAgent } from "./agents";
import { classifyRisk, needsTwoKey } from "./policy";
import { JARVIS_INSTRUCTIONS } from "./prompt";

type PrincipalId = "FIRDAUS" | "DARYA";

type Env = {
  OPENAI_API_KEY: string;
  JARVIS_FIRDAUS_TOKEN: string;
  JARVIS_DARYA_TOKEN: string;
  JARVIS_OWNER_TOKEN?: string;
  OPENAI_MODEL?: string;
  JARVIS_ENV?: string;
  JARVIS_STATE: DurableObjectNamespace<JarvisState>;
};

type CommandBody = {
  principalId?: PrincipalId;
  command: string;
  context?: Record<string, unknown>;
  allowWebResearch?: boolean;
};

type ApprovalBody = {
  principalId?: PrincipalId;
  decisionId: string;
  approved: boolean;
  note?: string;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });

function bearer(request: Request) {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
}

function authenticate(request: Request, env: Env): PrincipalId | null {
  const token = bearer(request);
  if (!token) return null;
  if (env.JARVIS_FIRDAUS_TOKEN && token === env.JARVIS_FIRDAUS_TOKEN) return "FIRDAUS";
  if (env.JARVIS_DARYA_TOKEN && token === env.JARVIS_DARYA_TOKEN) return "DARYA";

  // Transitional compatibility is allowed only outside production.
  if ((env.JARVIS_ENV || "development") !== "production" &&
      env.JARVIS_OWNER_TOKEN &&
      token === env.JARVIS_OWNER_TOKEN) {
    const asserted = request.headers.get("x-jarvis-principal");
    return asserted === "FIRDAUS" || asserted === "DARYA" ? asserted : null;
  }
  return null;
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

async function readJson<T>(request: Request): Promise<T | null> {
  try { return await request.json<T>(); } catch { return null; }
}

async function callOpenAI(env: Env, body: CommandBody, principalId: PrincipalId, agentId: keyof typeof AGENTS, risk: string) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  const legalMode = agentId === "legal";
  const tools = body.allowWebResearch === false ? [] : [
    legalMode
      ? { type: "web_search", filters: { allowed_domains: ["lex.uz", "gov.uz", "soliq.uz", "my.gov.uz"] } }
      : { type: "web_search" }
  ];

  const input = [
    `Authenticated principal: ${principalId}`,
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

  const payload = await response.json<any>().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI error ${response.status}`);
  return { text: extractText(payload), rawId: payload?.id, usage: payload?.usage };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "vertex-jarvis",
        environment: env.JARVIS_ENV || "unknown",
        model: env.OPENAI_MODEL || "gpt-6-astra",
        timestamp: new Date().toISOString()
      });
    }

    const principalId = authenticate(request, env);
    if (!principalId) return json({ error: "unauthorized" }, 401);

    const state = env.JARVIS_STATE.getByName("vertex-group");

    if (url.pathname === "/v1/status" && request.method === "GET") {
      return state.fetch(new Request("https://state/status"));
    }

    if (url.pathname === "/v1/commands" && request.method === "POST") {
      const body = await readJson<CommandBody>(request);
      if (!body?.command || typeof body.command !== "string" || body.command.trim().length < 1 || body.command.length > 20000) {
        return json({ error: "invalid command payload" }, 400);
      }
      if (body.principalId && body.principalId !== principalId) {
        return json({ error: "principal mismatch" }, 403);
      }

      const normalizedBody = { ...body, principalId };
      const risk = classifyRisk(body.command);
      const agentId = chooseAgent(body.command);
      const twoKey = needsTwoKey(body.command);

      try {
        const started = Date.now();
        const ai = await callOpenAI(env, normalizedBody, principalId, agentId, risk);
        const execution =
          risk === "red" ? "approval_required" :
          risk === "yellow" ? "policy_review_required" :
          "recommendation_ready";

        const decision = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          principalId,
          agentId,
          risk,
          twoKey,
          command: body.command,
          recommendation: ai.text,
          modelResponseId: ai.rawId,
          latencyMs: Date.now() - started,
          execution,
          note: "No third-party mutation connector is enabled in this foundation build."
        };

        await state.fetch(new Request("https://state/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "decision", data: decision })
        }));

        return json(decision, risk === "red" ? 202 : 200);
      } catch (error) {
        const event = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          principalId,
          command: body.command,
          error: error instanceof Error ? error.message : "unknown error"
        };
        await state.fetch(new Request("https://state/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "error", data: event })
        }));
        return json({ error: "upstream_error", requestId: event.id }, 502);
      }
    }

    if (url.pathname === "/v1/approvals" && request.method === "POST") {
      const approval = await readJson<ApprovalBody>(request);
      if (!approval?.decisionId || typeof approval.approved !== "boolean") {
        return json({ error: "invalid approval payload" }, 400);
      }
      if (approval.principalId && approval.principalId !== principalId) {
        return json({ error: "principal mismatch" }, 403);
      }
      const event = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        principalId,
        decisionId: approval.decisionId,
        approved: approval.approved,
        note: typeof approval.note === "string" ? approval.note.slice(0, 2000) : undefined
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

    if (url.pathname === "/status" && request.method === "GET") {
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
        externalMutationConnectorsEnabled: false,
        recentEvents: rows
      });
    }

    return json({ error: "not_found" }, 404);
  }
}
