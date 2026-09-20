# Model assignment

Checked against public rankings on 2026-09-19. Model line-ups move monthly: confirm exact API model ids and prices
on each provider's docs before you wire them in, and run the bake-off at the bottom.

| Agent | Model | Why this model for this job | Cheaper / fallback |
|---|---|---|---|
| incident-lead | Claude Opus 5 | Fewest tokens of any agent, highest leverage per token: clustering, competing hypotheses with refutation conditions, replanning when its own favourite is refuted. Low volume makes a top reasoning model affordable here. | Gemini 3.1 Pro |
| support-engineer | Gemini 3.8 Flash | Natively multimodal (tickets + screenshots in one pass), cheap, long context for the whole inbox. The job is faithful extraction, not deep reasoning. | Claude Haiku 4.5 |
| sre-analyst | DeepSeek V4.1 Flash | Text-only, highest raw token volume (logs), structured querying. Cheapest capable option; also the family JiuwenSwarm's own docs configure by default. Off-peak pricing matters: check the schedule. | Gemini 3.8 Flash |
| qa-engineer | Gemini 3.1 Pro | Strong scientific / abstract reasoning for experiment design (one variable at a time, negative controls), multimodal for reading traces and screenshots, priced for long tool loops. | GPT-5.6 Sol |
| software-engineer | Claude Sonnet 5 | Consistently ranked at or near the top for agentic coding with fewer broken multi-file edits, at mid-tier price. | GLM-5.2 (open weight) |
| release-verifier | GPT-5.6 Sol | Strong terminal / agentic execution results, good at following a verification protocol to the letter. Crucially a DIFFERENT family from the fix author. | Gemini 3.1 Pro |

## The rule that matters more than any single pick

Proposers and checkers must not share a model family.

- Proposers: incident-lead (hypotheses) and software-engineer (patches) -> Claude.
- Checkers: qa-engineer (experiments) -> Gemini, release-verifier (verdicts) -> OpenAI.
- Independent witnesses: support-engineer (what people said) -> Gemini Flash, sre-analyst (what the system did) -> DeepSeek.

Models from one family share blind spots. If the same model writes the patch and judges it, a wrong assumption
passes twice. With different families, an error has to fool two differently trained systems AND an executed test.
If you change any pick, keep these three separations: dev != verifier, qa != verifier, support != sre.

## Settings

| Agent | Temperature | Reasoning effort | Notes |
|---|---|---|---|
| incident-lead | 0.3 | high | Needs some diversity when generating rival hypotheses |
| support-engineer | 0 | low | Extraction. Determinism over creativity |
| sre-analyst | 0 | low-medium | Same |
| qa-engineer | 0.2 | medium | |
| software-engineer | 0 | medium-high | |
| release-verifier | 0.4 | high | Adversarial case generation benefits from variety; execution decides anyway |

Require structured (JSON / tool-call) output from every agent for bus messages and ledger writes. Tool-call dialects
differ between providers; the bus validates on the server, so a malformed call surfaces as a refused write instead of silent drift.

## Budget

Token volume, highest first: sre-analyst, support-engineer, qa-engineer, release-verifier, software-engineer, incident-lead.
The two cheapest models sit on the two highest-volume roles on purpose. Use prompt caching for the agent prompts and the
ledger snapshot. If money runs out, downgrade incident-lead to its fallback before touching the dev / verifier split.

## 30-minute bake-off (do this before trusting the table)

Seeded bug, same prompts, swap one role at a time, 3 runs each. Record:
1. support: claims extracted vs your hand count; any invented specifics ("my phone" -> "iOS Safari" is a fail).
2. qa: did it reproduce; did it run the negative control unprompted.
3. dev: did PATCH-1 fix at the server layer without being told.
4. verifier: did it reject a client-only patch.
Put the numbers on a slide. "We chose models by measurement" beats "we chose by reputation".
