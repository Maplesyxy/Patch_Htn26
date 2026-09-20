"""Stage gates from team/TEAM.md, checked in code.

A gate returns (ok, reason). The Leader is the only agent that can move the stage, but it
cannot move it through a closed gate: the orchestrator asks here first, and a refused move
is reported into the room so a judge can see the gate holding.
"""

def _hyps(ledger):
    return ledger.get("hypothesis", {})


def s0_to_s1(state):
    """Do not cluster on tickets alone: both independent witnesses must have reported."""
    handed_off = state["handoffs"]
    missing = [a for a in ("support-engineer", "sre-analyst") if a not in handed_off]
    if missing:
        return False, f"No HANDOFF yet from {', '.join(missing)}. The lead does not cluster on one source."
    if not state["ledger"].get("claim"):
        return False, "No claims in the ledger. There is nothing to cluster."
    return True, "Both witnesses have reported."


def s1_to_s2(state):
    """Every hypothesis must be falsifiable before anyone spends a browser on it."""
    hyps = _hyps(state["ledger"])
    if not hyps:
        return False, "No hypotheses written. S2 has nothing to test."
    if not state["ledger"].get("incident"):
        return False, "No incidents written. Cluster the claims first."
    bad = [h for h, v in hyps.items()
           if not str(v.get("predicts", "")).strip() or not str(v.get("would_be_refuted_by", "")).strip()]
    if bad:
        return False, (f"These hypotheses are not falsifiable: {', '.join(sorted(bad))}. "
                       "Each needs both 'predicts' and 'would_be_refuted_by'.")
    return True, f"{len(hyps)} falsifiable hypotheses."


def s2_to_s3(state):
    """No failing regression test, no fix stage. Wired in Task 6."""
    exps = state["ledger"].get("experiment", {})
    if not exps:
        return False, "No experiments run. Nothing has been observed yet."
    supported = [e for e, v in exps.items() if v.get("outcome") == "supports"]
    if not supported:
        return False, "No experiment supports a hypothesis. Reproduce before fixing."
    if not state.get("regression_test"):
        return False, ("S2->S3 needs a regression test that FAILS on main. The test tool is not "
                       "wired yet (Task 6: Fix and Verify), so this gate is closed by design.")
    return True, "A supported hypothesis and a failing regression test exist."


GATES = {("S0", "S1"): s0_to_s1, ("S1", "S2"): s1_to_s2, ("S2", "S3"): s2_to_s3}
ORDER = ["S0", "S1", "S2", "S3", "S4", "S5"]


def check(state, frm, to):
    if ORDER.index(to) < ORDER.index(frm):
        return True, "Moving backward is always allowed; it is how counterexamples and missing information travel."
    if ORDER.index(to) > ORDER.index(frm) + 1:
        return False, f"Cannot skip from {frm} to {to}. Move one stage at a time."
    gate = GATES.get((frm, to))
    if gate is None:
        return False, f"{frm}->{to} is not wired in this runtime yet (Task 6: Fix and Verify)."
    return gate(state)
