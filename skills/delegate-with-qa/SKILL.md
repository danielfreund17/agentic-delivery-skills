---
name: delegate-with-qa
description: 'Fully autonomous "idea → merge-ready PR" pipeline: delegate a scoped task to a background coding agent, monitor the run, wait for the ephemeral staging environment, run thorough agentic E2E QA (feature scenarios + regression controls + environment health), post a QA verdict with a merge recommendation on the PR, and self-heal — fix, push, redeploy, re-QA — until QA passes or a genuine hard block needs the user. Use when the user says "delegate with QA", "delegate and QA it end to end", or wants overnight-style delegation that does not stop at the PR but proves the change works on staging.'
---

# Delegate to a Background Agent — with QA

One autonomous flow: **delegate → monitor → verify env → agentic QA → PR verdict → self-heal loop**. Default posture: keep going without asking, document everything, stop only for a genuine hard block (listed at the end).

> **Adapt:** This skill assumes a **background coding agent** — an agent that runs remotely (not in your session), reads a ticket, implements it, opens a PR, and triggers an ephemeral environment. Map the commands below to yours. If you don't have one, the same structure works with a second local agent session, or with a human implementer.

Two ideas make this different from plain delegation:

1. **The plan must be QA-aware.** The implementing agent must know that thorough post-deploy QA will run against the staging environment, because that changes what it should build. A feature that is hard to exercise from outside (internal job, async pipeline step, webhook consumer, model-behavior change) needs **testability affordances shipped in the same change**: a staging-only simulation endpoint, structured log lines with exact fields QA can grep for, a queryable side effect (DB column, trace metadata, metric), or a feature-flag hook. **If QA can't observe the behavior, the plan is incomplete.**
2. **QA is evidence-based and adversarial.** Not "the endpoint returned 200". QA proves the new behavior with *discriminating* scenarios (inputs that failed before), proves non-regression with *controls* (behavior that must NOT change), and checks environment health (CI, runtime logs, image identity).

## Preconditions

- The dev-workflow CLI and the background-agent trigger are installed and authenticated.
- You're in the target service repo (keep background runs single-repo).
- You can read the background agent's progress channel (chat DM, run dashboard, or API) and query the runtime platform for the staging environment.

## Step 1 — Scope like you already did the investigation

Understand the change well enough that the plan contains **no invented behavior**. If the conversation already produced a root-cause analysis or design, distill it. If not, investigate now: reproduce, measure, find the exact files. Evidence in the plan (measured values, trace IDs, incident links, exact failing inputs) is what makes the background run land first try — **and** it's the raw material for QA. Every measured failing input becomes a QA test case.

## Step 2 — Ticket + QA-aware plan

1. Resolve or create the ticket.
2. Write the full plan into the **ticket description** — it's the only thing the background agent reads. If your update command *replaces* the field, read the existing description first and merge; never blind-overwrite. Write long markdown to a temp file and pass it in, rather than inline heredocs.
3. The description must contain:
   - **Context / Ask** — the problem with evidence (measurements, trace/incident IDs, reproduced inputs and their wrong outputs).
   - **Implementation plan** — files/areas, ordered steps, edge cases, exact test expectations (discriminating inputs → expected outputs), what NOT to change (calibrated constants, unrelated thresholds), and the repo's quality gates in order.
   - **QA enablement (mandatory)** — state: *"After deploy, thorough agentic QA will run against the staging environment (`<staging-url>`). The change must be observable from outside."* Then require what QA needs:
     - Externally exercisable → name the endpoint/flow QA will drive and the exact expected outcome.
     - Hard to simulate → a staging-only simulation endpoint (hard-disabled outside staging), or a documented way to inject the trigger event.
     - Only visible internally → structured log lines (exact message + fields) and/or trace metadata / a queryable side effect.
     - The **controls**: existing behaviors that must remain unchanged, so the implementer writes tests pinning them too.

## Step 3 — Delegate and monitor

```sh
<background-agent> run <ticket-id> --services <svc> --auto-approve
```

Monitoring patterns that matter in practice:

- **Find the canonical progress feed** (chat thread, run page, API). A good run posts: plan → "PR created: <url>" → "environment setup started". Poll every ~5–10 minutes; a healthy run takes tens of minutes to reach a PR.
- **Sanity-check the agent's posted plan against yours.** If it diverges materially, that's a steer/retry moment, not a wait moment.
- **Have a fallback view** (e.g. the run's web page) for when the primary feed can't be read.
- **Infra failure + retry lock:** runs can die on transient errors, and the dead run may hold a lock so a fresh trigger is rejected ("run already active"). If only a human can click "retry", tell the user, then resume monitoring. Soft block — not a stop.
- **Verify independently, in parallel:** check the branch appeared on the remote, find the PR, and **read the pushed diff yourself**. Catching a wrong implementation before deploy is far cheaper than after.

## Step 4 — Environment readiness (runtime platform, not /health)

Gate on all three:

1. The environment exists (namespace / preview env).
2. All app instances are running and ready; pre-deploy jobs (migrations etc.) completed.
3. **The running image/commit matches the PR HEAD SHA.** This is the load-bearing check — it proves the env runs the code under review, and it's how you detect that a later fix push was picked up (Step 7).

Don't gate on a health URL: a wildcard staging domain can return 200 from a shared baseline even when your environment has nothing running.

## Step 5 — Thorough agentic QA

Use everything available: the staging URL, observability tools (logs, errors, traces, LLM traces, data warehouse), repo-specific QA skills or E2E endpoints, runtime logs, and the code host. Four layers; skipping one needs a stated reason:

1. **Feature scenarios (discriminating):** drive the real, production-shaped flow with the exact inputs that failed before (from Step 1) and assert the new behavior. If the plan added simulation endpoints or log markers, use them exactly as specified.
2. **Controls / non-regression:** inputs whose behavior must NOT change — the mirror cases of the fix. (Example: for "stop misdetecting English as French", genuine French must still be detected as French — including sentences containing the very tokens the fix strips.) Plus one or two plain sanity flows of the touched surface.
3. **Environment & code health:** all PR checks green; runtime logs during the QA window contain no new errors attributable to the change (check worker processes too); separate pre-existing staging flakes (note them, don't block) from change-related errors.
4. **Data verification:** if the change writes or derives persisted data, verify the record itself — not just the API response.

**Non-deterministic surfaces (LLM-backed flows):** one unexpected-but-plausible outcome is not a failure. Re-run, judge the distribution, and check that the required observable markers are present.

## Step 6 — Post the verdict on the PR

An audit-friendly comment:

- Environment identity: staging URL, image/commit, confirmation it equals PR HEAD.
- Scenario table: scenario | input | expected | observed | ✅/❌ — feature scenarios and controls labeled separately.
- Code-review notes (you read the diff in Step 3 — say what you verified structurally).
- CI + log health, with unrelated flakes explicitly called unrelated.
- **Explicit recommendation: merge / do not merge — and why.**

## Step 7 — Self-heal loop (on QA failure)

1. **Diagnose** first: implementation, plan, fixture/environment, or the QA scenario itself? Fixture drift and env flakes are re-run cases, not fix-commit cases.
2. **Real implementation gap:** check out the branch (via the dev-workflow CLI), make the minimal fix, run the repo's gates, commit, push. Pushing should redeploy the env; otherwise trigger the deploy.
3. **Wait** for the env to pick up the new commit — same three gates as Step 4; the image must now carry the fix SHA.
4. **Re-run the full QA**, not just the failed scenario — a fix can regress a control.
5. **Append** a new QA-round section to the PR comment (keep earlier rounds for the audit trail). Loop until pass.

## Hard blocks — the only reasons to stop and ask

- A retry lock only the user can clear.
- Missing access/credentials the agent can't self-provision.
- QA shows the requested behavior itself is wrong or unsafe — a spec problem, not an implementation problem. Don't "fix" the spec unilaterally.
- Anything production-impacting or externally visible beyond the staging environment and the PR.

Everything else: proceed and document your assumptions.
