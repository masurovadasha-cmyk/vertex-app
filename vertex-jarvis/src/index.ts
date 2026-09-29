import { DurableObject } from "cloudflare:workers";
import { AGENTS, chooseAgent, type AgentId } from "./agents";
import { classifyRisk, needsTwoKey, type RiskTier } from "./policy";
import { JARVIS_INSTRUCTIONS } from "./prompt";

type PrincipalId = "FIRDAUS" | "DARYA";

type Env = {
  OPENAI_API_KEY: string;
  JARVIS_FIRDAUS_TOKEN: string;
  JARVIS_DARYA_TOKEN: string;
  OPENAI_MODEL_ASTRA?: string;
  OPENAI_MODEL_SOL?: string;
  OPENAI_MODEL_LUNA?: string;
  JARVIS_ENV?: string;
  JARVIS_STATE: DurableObjectNamespace<JarvisState>;
};

type CommandBody = {
  command: string;
  context?: Record<string, unknown>;
  allowWebResearch?: boolean;
};

type Source = {
  url: string;
  title?: string;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });

function authenticate(request: Request, env: Env): PrincipalId | null {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  if (env.JARVIS_FIRDAUS_TOKEN && token === env.JARVIS_FIRDAUS_TOKEN) return "FIRDAUS";
  if (env.JARVIS_DARYA_TOKEN && token === env.JARVIS_DARYA_TOKEN) return "DARYA";
  return null;
}

function extractText(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const out = Array.isArray(payload?.output) ? payload.output : [];
  const parts: string[] = [];
  for (const item of out) {
    if (item?.type !== "message" || !Array.isArray(item?.content)) continue;
    for (const c of item.content) {
      if (typeof c?.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n");
}

function extractSources(payload: any): Source[] {
  const found: Source[] = [];
  const add = (url?: string, title?: string) => {
    if (!url || found.some((x) => x.url === url)) return;
    found.push({ url, title });
  };

  const output = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of output) {
    if (item?.type === "web_search_call") {
      const sources = item?.action?.sources;
      if (Array.isArray(sources)) {
        for (const s of sources) add(s?.url, s?.title);
      }
    }

    if (item?.type === "message" && Array.isArray(item?.content)) {
      for (const c of item.content) {
        if (!Array.isArray(c?.annotations)) continue;
        for (const a of c.annotations) {
          const citation = a?.url_citation ?? a;
          add(citation?.url, citation?.title);
        }
      }
    }
  }

  return found.slice(0, 50);
}

function selectModel(env: Env, agentId: AgentId, risk: RiskTier, command: string) {
  const astra = env.OPENAI_MODEL_ASTRA || "gpt-6-astra";
  const sol = env.OPENAI_MODEL_SOL || "gpt-6-sol";
  const luna = env.OPENAI_MODEL_LUNA || "gpt-6-luna";

  if (
    risk === "red" ||
    agentId === "strategy" ||
    agentId === "legal" ||
    (agentId === "finance" && risk !== "green")
  ) return astra;

  if (
    risk === "green" &&
    command.length < 1200 &&
    ["guest", "cleaning", "mobility", "operations"].includes(agentId)
  ) return luna;

  return sol;
}

function shouldResearch(agentId: AgentId, body: CommandBody) {
  if (agentId === "legal") return true;
  if (body.allowWebResearch === true) return true;
  return ["strategy", "revenue", "technology", "travel"].includes(agentId);
}

async function callOpenAI(
  env: Env,
  principalId: PrincipalId,
  body: CommandBody,
  agentId: AgentId,
  risk: RiskTier
) {
  const legalMode = agentId === "legal";
  const research = shouldResearch(agentId, body);

  const tools: any[] = research
    ? [
        legalMode
          ? {
              type: "web_search",
              external_web_access: true,
              filters: {
                allowed_domains: [
                  "lex.uz",
                  "gov.uz",
                  "soliq.uz",
                  "my.gov.uz"
                ]
              }
            }
          : { type: "web_search", external_web_access: true }
      ]
    : [];

  const input = [
    `Authenticated principal: ${principalId}`,
    `Selected specialist: ${agentId} — ${AGENTS[agentId]}`,
    `Policy risk tier: ${risk}`,
    `Live research enabled: ${research}`,
    body.context ? `Context: ${JSON.stringify(body.context)}` : "",
    `Command: ${body.command}`
  ].filter(Boolean).join("\n\n");

  const model = selectModel(env, agentId, risk, body.command);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: risk === "red" ? "high" : "medium" },
      instructions: JARVIS_INSTRUCTIONS,
      tools,
      tool_choice: tools.length ? (legalMode ? "required" : "auto") : undefined,
      include: tools.length ? ["web_search_call.action.sources"] : undefined,
      input
    })
  });

  const payload = await response.json<any>();
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI error ${response.status}`);
  }

  return {
    text: extractText(payload),
    sources: extractSources(payload),
    rawId: payload?.id,
    usage: payload?.usage,
    model
  };
}

async function getKillSwitch(state: DurableObjectStub<JarvisState>) {
  const response = await state.fetch(new Request("https://state/kill-switch"));
  return response.json<any>();
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const state = env.JARVIS_STATE.getByName("vertex-group");
    const now = new Date();

    const kind = controller.cron === "0 3 * * *" ? "daily_review_due" : "heartbeat";
    const event = {
      kind,
      cron: controller.cron,
      scheduledTime: new Date(controller.scheduledTime).toISOString(),
      observedAt: now.toISOString(),
      environment: env.JARVIS_ENV || "unknown"
    };

    ctx.waitUntil(state.fetch(new Request("https://state/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: kind, data: event })
    })).then(() => undefined));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "vertex-jarvis",
        environment: env.JARVIS_ENV || "unknown",
        models: {
          strategic: env.OPENAI_MODEL_ASTRA || "gpt-6-astra",
          operational: env.OPENAI_MODEL_SOL || "gpt-6-sol",
          highVolume: env.OPENAI_MODEL_LUNA || "gpt-6-luna"
        },
        timestamp: new Date().toISOString()
      });
    }

    const principalId = authenticate(request, env);
    if (!principalId) return json({ error: "unauthorized" }, 401);

    const state = env.JARVIS_STATE.getByName("vertex-group");

    if (url.pathname === "/v1/status" && request.method === "GET") {
      return state.fetch(new Request("https://state/status"));
    }

    if (url.pathname === "/v1/kill-switch" && request.method === "GET") {
      return state.fetch(new Request("https://state/kill-switch"));
    }

    if (url.pathname === "/v1/kill-switch" && request.method === "POST") {
      const body = await request.json<any>();
      if (typeof body?.stopped !== "boolean") {
        return json({ error: "stopped must be boolean" }, 400);
      }

      const event = {
        principalId,
        stopped: body.stopped,
        reason: typeof body.reason === "string" ? body.reason.slice(0, 1000) : "",
        at: new Date().toISOString()
      };

      await state.fetch(new Request("https://state/kill-switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event)
      }));

      return json({ ok: true, killSwitch: event });
    }

    if (url.pathname === "/v1/commands" && request.method === "POST") {
      const body = await request.json<CommandBody>();
      if (!body?.command || typeof body.command !== "string" || body.command.length > 50_000) {
        return json({ error: "invalid command payload" }, 400);
      }

      const risk = classifyRisk(body.command);
      const agentId = chooseAgent(body.command);
      const twoKey = needsTwoKey(body.command);
      const switchState = await getKillSwitch(state);

      const started = Date.now();
      const ai = await callOpenAI(env, principalId, body, agentId, risk);

      const execution =
        switchState?.stopped
          ? "kill_switch_active"
          : risk === "red"
            ? "approval_required"
            : risk === "yellow"
              ? "policy_review"
              : "recommendation_ready";

      const decision = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        principalId,
        agentId,
        risk,
        twoKey,
        command: body.command,
        recommendation: ai.text,
        sources: ai.sources,
        model: ai.model,
        modelResponseId: ai.rawId,
        usage: ai.usage,
        latencyMs: Date.now() - started,
        execution,
        killSwitch: Boolean(switchState?.stopped)
      };

      await state.fetch(new Request("https://state/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "decision", data: decision })
      }));

      return json(decision, execution === "approval_required" ? 202 : 200);
    }

    if (url.pathname === "/v1/approvals" && request.method === "POST") {
      const approval = await request.json<any>();
      if (!approval?.decisionId || typeof approval?.approved !== "boolean") {
        return json({ error: "invalid approval payload" }, 400);
      }

      const event = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        decisionId: String(approval.decisionId),
        principalId,
        approved: approval.approved,
        note: typeof approval.note === "string" ? approval.note.slice(0, 2000) : ""
      };

      const response = await state.fetch(new Request("https://state/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event)
      }));

      return new Response(response.body, {
        status: response.status,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
      });
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

    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }

  private insertEvent(type: string, data: unknown) {
    this.ctx.storage.sql.exec(
      "INSERT INTO events (created_at, type, payload) VALUES (?, ?, ?)",
      new Date().toISOString(),
      type,
      JSON.stringify(data ?? null)
    );
  }

  private readKillSwitch() {
    const rows = [...this.ctx.storage.sql.exec(
      "SELECT value, updated_at FROM settings WHERE key = ? LIMIT 1",
      "kill_switch"
    )] as any[];

    if (!rows.length) return { stopped: false, updatedAt: null };

    try {
      const parsed = JSON.parse(rows[0].value);
      return { ...parsed, updatedAt: rows[0].updated_at };
    } catch {
      return { stopped: true, updatedAt: rows[0].updated_at, reason: "invalid kill-switch state" };
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/events" && request.method === "POST") {
      const event = await request.json<any>();
      this.insertEvent(String(event.type || "unknown"), event.data ?? null);
      return json({ ok: true });
    }

    if (url.pathname === "/kill-switch" && request.method === "GET") {
      return json(this.readKillSwitch());
    }

    if (url.pathname === "/kill-switch" && request.method === "POST") {
      const body = await request.json<any>();
      const value = JSON.stringify(body);
      const now = new Date().toISOString();

      this.ctx.storage.sql.exec(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        "kill_switch",
        value,
        now
      );

      this.insertEvent("kill_switch", body);
      return json({ ok: true, state: this.readKillSwitch() });
    }

    if (url.pathname === "/approvals" && request.method === "POST") {
      const approval = await request.json<any>();
      this.insertEvent("approval", approval);

      const all = [...this.ctx.storage.sql.exec(
        "SELECT payload FROM events WHERE type = ? ORDER BY seq DESC LIMIT 500",
        "approval"
      )] as any[];

      const approvals = all
        .map((r) => {
          try { return JSON.parse(r.payload); } catch { return null; }
        })
        .filter((x) => x && x.decisionId === approval.decisionId);

      const latestByPrincipal = new Map<string, any>();
      for (const item of approvals) {
        if (!latestByPrincipal.has(item.principalId)) {
          latestByPrincipal.set(item.principalId, item);
        }
      }

      return json({
        ok: true,
        approval,
        summary: {
          decisionId: approval.decisionId,
          firdaus: latestByPrincipal.get("FIRDAUS") ?? null,
          darya: latestByPrincipal.get("DARYA") ?? null,
          approvedByBoth:
            latestByPrincipal.get("FIRDAUS")?.approved === true &&
            latestByPrincipal.get("DARYA")?.approved === true
        }
      });
    }

    if (url.pathname === "/status") {
      const rows = [...this.ctx.storage.sql.exec(
        "SELECT seq, created_at, type, payload FROM events ORDER BY seq DESC LIMIT 50"
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
        killSwitch: this.readKillSwitch(),
        recentEvents: rows
      });
    }

    return json({ error: "not_found" }, 404);
  }
}
