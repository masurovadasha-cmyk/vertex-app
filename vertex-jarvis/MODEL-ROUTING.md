# Vertex JARVIS model routing

Current defaults are based on the OpenAI API model family available in September 2026.

## Strategic cortex — GPT-6 Astra

Used for:
- red-zone decisions
- group strategy and capital allocation
- legal/compliance analysis
- difficult finance decisions
- high-impact trade-offs

Default model ID: `gpt-6-astra`.

## Operating brain — GPT-6 Sol

Used for normal management work that needs strong reasoning without Astra-level cost:
- sales
- owners
- accounting review
- technology planning
- revenue work that is not red-zone
- cross-department operational questions

Default model ID: `gpt-6-sol`.

## High-volume workforce — GPT-6 Luna

Used for short, green-zone, repeatable operational tasks:
- routine guest service
- cleaning routing
- mobility dispatch
- simple operations

Default model ID: `gpt-6-luna`.

## Research policy

Legal questions always enable live web search and restrict it to approved official Uzbekistan domains. Other agents enable research when it is intrinsically useful or the caller requests `allowWebResearch=true`.

Web sources are returned and stored with the decision record so later audits can inspect what JARVIS relied on.

## Cost control

Model routing is policy, not identity. JARVIS remains one management system while delegating work to the right model tier. The defaults can be changed with Cloudflare variables without changing source code.
