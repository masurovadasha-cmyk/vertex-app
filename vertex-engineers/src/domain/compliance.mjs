const DAY_MS = 86_400_000;

export function complianceState(document, now = new Date(), warningDays = 30) {
  if (document.status === "not_applicable") return "not_applicable";
  if (!document.expires_at) return "unknown";

  const expiry = new Date(document.expires_at);
  if (Number.isNaN(expiry.getTime())) throw new Error("Invalid expires_at");
  const current = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(current.getTime())) throw new Error("Invalid current date");

  const deltaDays = Math.ceil((expiry.getTime() - current.getTime()) / DAY_MS);
  if (deltaDays < 0) return "expired";
  if (deltaDays <= warningDays) return "expiring";
  return "valid";
}

export function complianceSummary(documents, now = new Date(), warningDays = 30) {
  const summary = { valid: 0, expiring: 0, expired: 0, unknown: 0, not_applicable: 0 };
  for (const document of documents) {
    summary[complianceState(document, now, warningDays)] += 1;
  }
  return summary;
}
