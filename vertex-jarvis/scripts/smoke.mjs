const base = (process.env.JARVIS_URL || "").replace(/\/$/, "");
const token = process.env.JARVIS_OWNER_TOKEN || "";
const testAI = process.env.JARVIS_SMOKE_AI === "1";

if (!base) {
  console.error("Set JARVIS_URL, e.g. https://vertex-jarvis.<subdomain>.workers.dev");
  process.exit(2);
}

async function request(path, options = {}) {
  const res = await fetch(base + path, options);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}: ${text.slice(0, 800)}`);
  return data;
}

const health = await request("/health");
if (!health?.ok || health?.service !== "vertex-jarvis") {
  throw new Error("health response is not Vertex JARVIS");
}
console.log("health: OK", health.environment, health.models);

if (!token) {
  console.log("Authenticated tests skipped: JARVIS_OWNER_TOKEN is not set.");
  process.exit(0);
}

const auth = { authorization: `Bearer ${token}` };
const status = await request("/v1/status", { headers: auth });
console.log("status: OK", { mode: status.mode, killSwitch: status.killSwitch });

if (testAI) {
  const decision = await request("/v1/commands", {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({
      command: "Perform a readiness self-check. Do not use web research and do not take external action.",
      allowWebResearch: false
    })
  });
  console.log("AI command: OK", {
    agentId: decision.agentId,
    risk: decision.risk,
    model: decision.model,
    execution: decision.execution
  });
}
