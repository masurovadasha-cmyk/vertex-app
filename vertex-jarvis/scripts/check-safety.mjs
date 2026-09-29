import fs from "node:fs";
import path from "node:path";

const root = path.resolve("vertex-jarvis");
const required = [
  "src/index.ts",
  "src/agents.ts",
  "src/policy.ts",
  "src/prompt.ts",
  "src/redact.ts",
  "wrangler.jsonc",
  "SECURITY.md",
  "policies/constitution.json",
  "policies/approvals.json"
];

const fail = (msg) => {
  console.error("JARVIS SAFETY CHECK FAILED:", msg);
  process.exitCode = 1;
};

for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) fail(`missing required file: ${rel}`);
}

const allFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else allFiles.push(p);
  }
};
walk(root);

const secretPatterns = [
  /sk-proj-[A-Za-z0-9_-]{20,}/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /JARVIS_(?:FIRDAUS|DARYA)_TOKEN\s*=\s*[^\s#]+/g
];

for (const file of allFiles) {
  if (file.endsWith(".png") || file.endsWith(".jpg") || file.endsWith(".zip")) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text) && !file.endsWith(".env.example")) {
      fail(`possible secret material in ${path.relative(process.cwd(), file)}`);
    }
  }
}

const index = fs.readFileSync(path.join(root, "src/index.ts"), "utf8");
for (const invariant of [
  "JARVIS_FIRDAUS_TOKEN",
  "JARVIS_DARYA_TOKEN",
  "/v1/kill-switch",
  "approval_required",
  "gpt-6-astra",
  "web_search",
  "/v1/outcomes",
  "redactSecrets"
]) {
  if (!index.includes(invariant)) fail(`runtime invariant missing: ${invariant}`);
}

const approvals = JSON.parse(
  fs.readFileSync(path.join(root, "policies/approvals.json"), "utf8")
);
if (!approvals.red || !approvals.twoKey) fail("approval matrix must define red and twoKey zones");

console.log("Vertex JARVIS safety checks passed.");
