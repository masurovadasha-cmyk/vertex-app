const RULES: Array<[RegExp, string]> = [
  [/sk-proj-[A-Za-z0-9_-]{12,}/g, "[REDACTED_OPENAI_KEY]"],
  [/\bBearer\s+[A-Za-z0-9._~-]{12,}/gi, "Bearer [REDACTED]"],
  [/\b(api[_ -]?key|token|password|passwd|secret|cvv|pin)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]"],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"]
];

export function redactSecrets(value: string): string {
  let out = value;
  for (const [pattern, replacement] of RULES) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function sanitizeForAudit<T>(value: T): T {
  try {
    const json = JSON.stringify(value, (_key, item) =>
      typeof item === "string" ? redactSecrets(item) : item
    );
    return JSON.parse(json) as T;
  } catch {
    return value;
  }
}
