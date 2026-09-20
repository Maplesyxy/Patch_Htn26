# The agent runtime

Wires the six agents in `team/agents/*.md` to tools, models and the console. Stages S0
Intake, S1 Correlate and S2 Reproduce are implemented; S3-S5 are Task 6, and the S2->S3
gate is closed *explicitly* rather than missing, so the room shows the gate refusing
instead of the pipeline quietly stopping.

```
run_team.py          entry point
  registry.py        who the agents are, which model each runs on, what each may call
  schemas.py         OpenAI-dialect tool schemas (every provider we target speaks it)
  llm.py             one chat-completions client + a `mock` provider for keyless testing
  tools.py           the tools, and the permission table enforced in code
  experiments.py     named environments -> a real BrowserLab matrix run
  gates.py           the stage gates from TEAM.md, as functions
  orchestrator.py    the stage machine; intake runs genuinely concurrently
  mock_script.py     a scripted walk through S0-S2, for testing the wiring without keys
```

## Run it

```
export REPRO_CONSOLE_URL=http://localhost:3000   REPRO_INGEST_TOKEN=...
export TARGET=http://localhost:3100              SANDBOX_ADMIN=...
export REPRO_LLM_API_KEY=...                     # one router key drives all six models
python worker/run_team.py
```

No keys? This runs the whole pipeline — real bus, real console rules, real browsers, real
reservations — with the model calls scripted:

```
REPRO_LLM_PROVIDER=mock python worker/run_team.py
```

That is a wiring harness, not a demo. Never show it as an agent run.

## Models

Defaults are OpenRouter slugs so one key covers six different families and the
proposer/checker separation in `team/MODELS.md` survives. Override per agent:

```
REPRO_MODEL_QA_ENGINEER=google/gemini-2.5-pro
REPRO_BASE_URL_RELEASE_VERIFIER=https://api.openai.com/v1    # send one agent direct
REPRO_API_KEY_RELEASE_VERIFIER=sk-...
REPRO_TEMP_INCIDENT_LEAD=0.3
```

`run_team.py` prints the three required separations on startup and flags a violation.

## JiuwenSwarm: the per-agent model question, answered

`team/MODELS.md` left this open for the Huawei booth. Read from jiuwenswarm 0.2.3:

**One model per process.** `resolve_model_config(config)` in
`agents/harness/team/team_runtime_inheritance.py` takes the whole config and resolves a
single default (`models.defaults[is_default]` -> `models.default` -> `react.model_name`).
It takes no member argument. The team spec's `agents:` section has only `leader` and
`teammate` buckets holding workspace and iteration settings — there is no per-member model
field anywhere.

**The workaround is in the shipped templates.** `config.team.distributed.leader.yaml` and
`config.team.distributed.teammate.yaml` run members as separate processes over `pyzmq`
rather than `inprocess`. Each process reads its own config and its own `${MODEL_NAME}`, so
six processes give six models. Cost: six processes to supervise, and the Leader talks to
teammates over ZeroMQ.

This is why the runtime here is provider-agnostic and does not depend on JiuwenSwarm.
Mount it as JiuwenSwarm's tool layer (the agents keep talking through `ReproBus`, which is
what the console renders) without betting the core demo on the distributed transport.

## What the gates actually enforce

| Gate | Refuses unless |
|---|---|
| S0 -> S1 | Both `support-engineer` and `sre-analyst` have sent a HANDOFF, and claims exist |
| S1 -> S2 | Incidents exist, and every hypothesis has both `predicts` and `would_be_refuted_by` |
| S2 -> S3 | An experiment supports a hypothesis **and** a regression test fails on `main` (Task 6) |
| any backward move | always allowed; that is how counterexamples travel |

A refused move is posted into the room as a NOTE, so a judge sees the gate hold.

Two further rules live in code rather than in a prompt:

- `run_matrix` refuses to run without `expected_if_true`, so predictions cannot be
  written after the result is known.
- `run_matrix` writes the lab's matrix and attribution into the EXP record itself. The QA
  prompt says "do not soften or strengthen it"; persisting it in the tool is what makes
  that a rule rather than a hope.
