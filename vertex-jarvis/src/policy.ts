export type RiskTier = "green" | "yellow" | "red";

const RED = [
  /bank transfer/i, /loan/i, /guarantee/i, /equity/i, /share sale/i,
  /terminate|fire employee/i, /tax filing/i, /lawsuit|settlement/i,
  /digital signature|eds|эцп/i, /credit/i, /увол/i, /кредит/i,
  /дол[яи]/i, /подпис/i
];

const YELLOW = [
  /refund/i, /compensation/i, /discount/i, /purchase/i,
  /возврат/i, /компенсац/i, /скидк/i, /закуп/i
];

export function classifyRisk(command: string): RiskTier {
  if (RED.some((x) => x.test(command))) return "red";
  if (YELLOW.some((x) => x.test(command))) return "yellow";
  return "green";
}

export function needsTwoKey(command: string): boolean {
  return /loan|guarantee|equity|share sale|кредит|гарант|дол[яи]/i.test(command);
}
