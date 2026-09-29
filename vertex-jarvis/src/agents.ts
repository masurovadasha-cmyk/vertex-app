export type AgentId =
  | "strategy" | "finance" | "accounting" | "legal" | "revenue"
  | "guest" | "owners" | "sales" | "operations" | "cleaning"
  | "mobility" | "travel" | "maintenance" | "hr" | "technology";

export const AGENTS: Record<AgentId, string> = {
  strategy: "Strategy and investment: objectives, trade-offs, capital allocation, scenario planning.",
  finance: "Treasury and finance: cash flow, liquidity, obligations, budgets, forecasts, unit economics.",
  accounting: "Accounting control: reconciliation, classification, supporting documents, completeness and exceptions.",
  legal: "Uzbekistan legal/compliance analyst. Verify current law from authoritative sources; cite source and effective date.",
  revenue: "Hospitality revenue management: ADR, occupancy, RevPAR, lead time, demand, pricing and inventory.",
  guest: "Guest experience and concierge: fast, accurate, hospitable, policy-compliant service.",
  owners: "Property owner relations: statements, occupancy, payments, contracts, trust and issue resolution.",
  sales: "Sales and partnerships: owner acquisition, B2B, corporate accounts, cross-sell and pipeline.",
  operations: "Daily hospitality operations: arrivals, departures, staffing, SLAs, incidents and coordination.",
  cleaning: "Housekeeping/laundry scheduling, readiness, linen and quality control.",
  mobility: "Transfers, drivers, fleet dispatch, rent-car utilization, safety and maintenance.",
  travel: "Tours, tickets, guides, routes, supplier coordination and guest travel services.",
  maintenance: "Engineering, maintenance tickets, preventive maintenance, repairs and asset condition.",
  hr: "Workforce planning, schedules, performance evidence and HR drafts. Legally significant actions require approval.",
  technology: "Systems, integrations, security, reliability, incidents, data governance and product roadmap."
};

export function chooseAgent(command: string): AgentId {
  const q = command.toLowerCase();
  if (/law|legal|contract|tax|налог|закон|договор|юрист/.test(q)) return "legal";
  if (/cash|debt|owner payment|долг|деньг|касс|платеж/.test(q)) return "finance";
  if (/account|reconcile|бух|сверк/.test(q)) return "accounting";
  if (/price|rate|adr|revpar|occup|цен|загруз/.test(q)) return "revenue";
  if (/guest|гост|check-in|заезд|concierge/.test(q)) return "guest";
  if (/clean|laundry|уборк|прач/.test(q)) return "cleaning";
  if (/car|driver|transfer|машин|водител|трансфер/.test(q)) return "mobility";
  if (/tour|travel|экскурс|авиа|билет/.test(q)) return "travel";
  if (/repair|engineer|maintenance|ремонт|электрик|сантех/.test(q)) return "maintenance";
  if (/staff|employee|salary|сотруд|зарплат|уволь/.test(q)) return "hr";
  if (/owner|собственник/.test(q)) return "owners";
  if (/sale|client|pipeline|продаж/.test(q)) return "sales";
  if (/system|security|api|it|технолог|интеграц/.test(q)) return "technology";
  if (/arrival|departure|task|операц|смена/.test(q)) return "operations";
  return "strategy";
}
