<!--
Devpost submission copy for Patch. Paste the content below the horizontal rule.

BEFORE POSTING, check these three claims. A judge asking about one you cannot back
is worse than leaving it out:

  1. "2.5x faster" and "10 sessions, 0 infrastructure failures" are measured numbers,
     but from the Python orchestrator with mocked model calls. Re-measure on the live
     Claude Code path, or soften to "in our harness".
  2. Browserbase has not run against a live account. If that does not change before
     judging, drop the cloud claim and say "Playwright across three engines".
  3. "A human approves the PR" is true of the UI. Whether a real GitHub pull request
     opens depends on the source-fix adapter being enabled.
-->

# Patch — Devpost submission

---

## Inspiration

Every bug tracker sells the same lie: that a report becomes a fix.

Between them sits the part nobody automates — **reproduction**. An engineer reads *"I pressed Book once and got two reservations,"* can't make it happen, and closes it. The customer was right. So was the engineer. The bug needed a dropped network response, and nobody thought to drop one.

AI made the *fix* cheap. It did nothing for the week you lose before it. <u>Give an agent a vague report and it confidently patches the wrong thing. Give it a failing test and it does real work.</u>

We built the missing middle.

## What it does

**Patch turns a customer complaint into a verified fix, with the evidence attached.**

A fast Gemini agent interviews the customer and writes a brief that separates what they *saw* from what they *assumed* — and lists what's still unknown.

Then the **reproduction swarm** runs. A supervisor holds competing theories. An execution agent drives real browsers. An incidents agent reads the telemetry nobody reported. And when it doesn't know *what kind* of experiment will surface the bug, <u>it forks itself</u> — 2–3 clones racing different strategies on isolated state:

```
[start] swarm                    forking 3 probes
[ok   ] probe:repeat_action      Two identical bookings produced 2 reservations
[ok   ] probe:state_after_action Cancelled R-105; still listed afterwards
[ok   ] probe:capacity           4 tables; 6 bookings accepted; availability 4 to 4 left
[ok   ] swarm                    3 of 3 reproduced; fastest was repeat_action
```

**A probe that fails is still a result** — it kills a theory for the whole team, not privately.

Only then does the implementation agent get the packet: a failing test, traces, a root cause. It patches in an isolated worktree. An independent verifier runs the regression against base *and* branch. A human approves the PR, reading the diff in the console.

## How we built it

The swarm is the product, so the architecture defends it.

**Different model families by construction.** Proposers and checkers never share one. Put Claude on both the supervisor and the fixer and *one set of blind spots decides both what's broken and how to repair it* — so the console shows a red warning naming the check you just deleted.

**Rules live in code, not prompts.** Messages citing no evidence are refused. Only the verifier writes verdicts. Stage gates are functions: our run *held* at S1→S2 because a hypothesis had no refutation condition. <u>The gate holding is the demo.</u>

**Real browsers.** Playwright across Chromium, WebKit and Firefox plus Browserbase cloud, with network fault injection. **10 sessions, 0 infrastructure failures**, every one recorded.

**Append-only evidence.** Nothing overwritten. One exportable audit trail.

We also built the patient: **Tablewise**, a booking site with 8 seeded defects and 1 deliberate look-alike.

## Challenges we ran into

**Our attribution logic lied — twice.** It claimed *"a clean cloud browser did not fail"* when none had run. If Browserbase died mid-demo, it would have told judges something confidently false. Now it says `inconclusive` and explains what's missing.

**The swarm corrupted its own evidence.** Each probe got its own account — not enough. Availability is counted per *sitting*, not per account, so probes read each other's bookings. **Isolation has to match how the data is keyed, not how you imagine it.**

**Our headline bug was invisible.** The double-booking only fires on a dropped response, so no human could ever hit it. *The site looked fine.* We rebuilt the fault set around bugs you trip over in the first minute.

## Accomplishments that we're proud of

<u>`not_reproduced` never becomes `not a bug`.</u> It returns a named list of missing fields, back to support.

**The QA agent physically cannot fake a prediction.** The tool refuses to run without `expected_if_true`, and writes the lab's verdict to the ledger itself — no model gets to soften it.

**Faults that punish shallow work.** Our cancel bug returns 200, sets the field, and the reservation *reappears on refresh* — the endpoint is right, the query is wrong. Our party-size bug confirms 12 and stores 8. *Every surface agrees except the system of record.*

And the swarm races **2.5× faster** than the same strategies in sequence.

## What we learned

- **Reproduction is the moat.** Writing the patch was never the hard part.
- **A rule in a prompt is a suggestion.** Every constraint that mattered had to move into code.
- **Never trust the interface.** Two confirmation emails are not two reservations. Our design principle, then a bug we seeded, then a mistake we made.
- <u>**Being wrong loudly beats being right quietly.**</u> The best thing we built says *"inconclusive"* and tells you why.

## What's next for Patch

**Any repo, not just ours** — the file allowlist follows the project.

**A bigger probe library** — auth, concurrency, timezones, pagination — with the supervisor learning which strategy fits which report.

**Memory across incidents**, so *"retry bugs present as mobile-only reports"* is learned once.

**Intake straight to swarm**, so a report starts an investigation with nobody pressing a button.
