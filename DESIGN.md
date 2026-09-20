# Patch product direction

Patch turns a customer report into a reproducible failure, then hands that evidence to an implementation agent. The reproduction step is the product's center of gravity.

## The three handoffs

1. **Customer intake.** A fast Gemini Flash agent asks focused questions and captures expected behavior, actual behavior, environment, steps, and unknowns in an incident brief.
2. **Reproduction swarm.** The execution agent operates a browser harness. The supervisor reasons about experiments and can redirect work. The incidents agent preserves suspicious actions, warnings, errors, and supporting observations. The output is a reproduction packet with controlled experiments, traces, and a failing regression test.
3. **Implementation and review.** An implementation agent uses that packet to fix the bug. Independent verification checks the regression against base and branch. A human reviews actions before release.

Execution uses Claude Code with Opus and a bounded Playwright harness, with Browserbase and explicit local Chromium providers. The supervisor reviews each action, and the incidents agent analyzes browser telemetry. The included booking implementation adapter uses Opus with allowlisted source replacements in an isolated Git worktree. Existing runtime identifiers and evidence permissions remain stable. Browserbase cloud validation requires teammate credentials.

## Interface

Use warm white surfaces, deep teal text, sky accents, rust, and soft yellow, drawing from Hack the North's 2026 palette. The previous charcoal/olive/lime treatment is retired. Use a light navigation shell and a prominent animated introduction that explains the report → reproduction → fix journey. Keep technical architecture and detailed explanatory copy in About. Primary product copy is 16px, controls 14–15px, and secondary labels at least 13px. Use a consistent 8/16/24/32/48px spacing scale.

Keep the full evidence ledger, audit export, event stream, rollback history, browser sessions, and human decisions in each investigation. Conversation history belongs to the selected phase; phase navigation moves the conversation and its associated observation together. Preserve access to every visited phase, including verification before a rollback. Forward and backward transitions should be visibly different. Following live can be paused to inspect history and restored explicitly.

Sample playback is explicitly simulated, with a slower, varied rhythm and pause/speed controls. Browser-like illustrations explain the fixture's events and never masquerade as real screenshots or live sessions. Real worker events retain their actual timing. Motion should clarify state changes: short panel transitions, gentle hero motion, and loading indicators tied to real pending states. Respect reduced-motion preferences and provide a pause control for continuous decorative animation.

Customer intake produces a downloadable brief and offers an explicit live launch using a website URL and report. Saving a brief in the browser does not launch the runtime. During a live round, browser frames sit beside agent observations; advancing stages slide the selected phase to the right. Historical phases remain inspectable, and Follow live restores automatic navigation. Infrastructure failures are never represented as evidence that the product is broken.

## Model configuration

The requested Gemini 2.5 Flash was rejected by Google's API for this account on 2026-09-19 as unavailable to new users. The suggested replacement, `gemini-3.6-flash`, returned a successful live response. The customer model remains configurable through `PATCH_CUSTOMER_MODEL` and its key stays in the ignored server environment.

## Repository

Both applications are tracked in the root Git repository. Their original nested Git directories were preserved locally at `.git/patch-nested-history/`. Commits use the configured user identity without co-author trailers.
