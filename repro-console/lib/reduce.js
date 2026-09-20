import { AGENTS, STAGES, PUSHBACK_TYPES } from "./agents.js";

const stageIndex = (id) => STAGES.findIndex((s) => s.id === id);

/** Folds the event log into everything the room needs to draw. Pure. */
export function reduceEvents(events) {
  const ledger = { claim: {}, incident: {}, hypothesis: {}, experiment: {}, patch: {}, verdict: {} };
  const agents = {};
  for (const name of Object.keys(AGENTS)) agents[name] = { messages: 0, lastSeq: 0, lastTool: null, busy: false };
  const approvals = {};
  const browsers = {};
  let stage = "S0";
  let sentBack = 0;
  let pushbacks = 0;
  let rejected = 0;
  let finished = false;
  const directions = {};

  for (const e of events) {
    const a = agents[e.from];
    if (a) a.lastSeq = e.seq;

    if (e.kind === "message") {
      if (a) { a.messages += 1; a.busy = false; } // reporting back means the tool work is done
      if (PUSHBACK_TYPES.includes(e.type)) pushbacks += 1;
    } else if (e.kind === "ledger") {
      const { record, id, value } = e.data;
      const prev = ledger[record][id] || {};
      ledger[record][id] = { ...prev, ...value, id, _seq: e.seq, _by: e.from, _firstSeq: prev._firstSeq || e.seq };
    } else if (e.kind === "stage") {
      const dir = stageIndex(e.data.stage) < stageIndex(stage) ? "backward" : "forward";
      directions[e.seq] = dir;
      if (dir === "backward") sentBack += 1;
      stage = e.data.stage;
    } else if (e.kind === "tool") {
      if (a) {
        a.lastTool = e.data;
        a.busy = e.data.status === "start";
      }
    } else if (e.kind === "browser") {
      const prev = browsers[e.data.session_id] || { firstSeq: e.seq, from: e.from };
      const next = { ...prev };
      for (const [k, v] of Object.entries(e.data)) if (v !== undefined && v !== "") next[k] = v;
      if (next.status !== "open") next.live_url = undefined; // a closed session has nothing to watch
      browsers[e.data.session_id] = next;
      if (a) a.busy = e.data.status === "open";
    } else if (e.kind === "approval") {
      approvals[e.data.id] = { ...e.data, seq: e.seq, from: e.from, decision: null };
    } else if (e.kind === "decision") {
      const ap = approvals[e.data.approval];
      if (ap) ap.decision = { ...e.data, seq: e.seq };
    } else if (e.kind === "system") {
      if (e.type === "REJECTED") rejected += 1;
      if (e.type === "RUN_FINISHED") finished = true;
    }
  }

  return {
    ledger,
    agents,
    approvals: Object.values(approvals),
    browsers: Object.values(browsers).sort((x, y) => y.firstSeq - x.firstSeq),
    stage,
    finished,
    directions,
    counts: { sentBack, pushbacks, rejected, events: events.length },
  };
}
