---
name: solve-bug-e2e
description: End-to-end bug resolution workflow. Use when the user says "solve bug e2e", "fix and test bug", "investigate and QA bug", or wants the full cycle of investigation, fix, tests, PR, ephemeral environment, waiting for CI + deployment, and QA on staging. Chains investigate-bug-report, generate-tests, typecheck-lint, create-pr, setup-env, get-ci-issues and qa-staging into one autonomous flow.
---

# Solve Bug End-to-End

Investigate → fix → test → PR → environment → wait for CI + deployment → QA → post results. Autonomous, unless auth or a judgment call is needed.

**Input:** a bug ticket and/or chat thread. Optionally a target stage (default: staging).
**Output:** a fix with a PR, QA'd on staging, results posted to the PR.
**Prerequisite:** you're on a feature branch (or the dev-workflow CLI provisioned one). If you're on the base branch, **STOP** and ask.

---

## Phase 1: Investigate and fix

Invoke `investigate-bug-report`. Then implement the minimal fix it proposes and commit it.

**At the end of this phase you have:** the ticket ID, the service(s) involved, a committed fix.

If the investigation leaves real ambiguity about *which* fix to apply, ask the user here — it's the one judgment call worth pausing for.

---

## Phase 2: Tests, typecheck, lint

1. **`generate-tests`** — tests for the fix (the bug no longer reproduces), edge cases, and regression guards, in the repo's existing style.
2. **Run them** with the repo's test runner, targeted to the new/affected files. Fix test or code until green.
3. **`typecheck-lint`** — loop until clean.

Don't proceed until tests pass and typecheck/lint are clean. Commit tests and fixes.

---

## Phase 3: Create the PR

Re-check you're not on the base branch. Invoke `create-pr` (bug-fix template). **Record the PR number and URL.**

---

## Phase 4: Set up the environment

Invoke `setup-env` with the ticket ID. If it reports an auth problem, **STOP** and ask the user to re-authenticate. **Record the environment ID.**

---

## Phase 5: Watch CI and deployment

Two things happen in parallel after setup: **CI** runs, and the **runtime platform** provisions the environment. Watch both — the environment usually only gets your code once CI passes.

### 5a. Initial wait
Nothing is ready immediately. Wait a couple of minutes before the first check.

### 5b. CI status
Use `get-ci-issues` (or the CI tool directly) for the branch.

### 5c. CI failures — common ones
1. **Spellcheck** (most common): add legitimate flagged words to the repo's spell dictionary.
2. **Lint / typecheck**: run `typecheck-lint`.
3. **Tests**: decide whether it's related to your change; fix test or code.

After each fix: commit, push, keep monitoring. **Max 3 fix-and-retry cycles**, then STOP and report with full details.

### 5d. Instance status
Query the runtime platform for the environment's instances. Ready means: running, all containers ready, nothing pending / crash-looping / failing to pull its image. Only the **service(s) you changed** need to be ready — not everything in the environment. Also confirm the running commit matches your HEAD.

### 5e. Polling loop
Every ~2 minutes check CI + instances:
- CI failed → fix (5c), push, keep polling.
- Not ready yet, CI running/passed → wait.
- CI passed **and** instances ready on your commit → Phase 6.
- **Cap:** ~15 polls (~30 min). On timeout: report which instances aren't ready, CI state, any error states, and the last log lines of failing instances. Then STOP.

---

## Phase 6: QA on staging

Invoke `qa-staging` with the environment ID, the service(s), and context on the root cause and fix.

---

## Phase 7: Report

### QA passed
Post a PR comment:

```markdown
## QA Results — Passed

Tested on `<staging-url>`.

### Root Cause
<one or two lines>

### Fix Applied
<summary of the change>

### QA Methodology
1. How test data was found
2. Endpoints tested
3. How results were verified (baseline comparison, ground truth)

### Test Cases
| # | Scenario | Expected | Actual | Status |
|---|---|---|---|---|

### Verification
- Data-warehouse cross-reference: …
- Logs: clean / …
- Baseline vs fix: …

### Conclusion
QA passed. The fix resolves the reported issue without regressions. Ready for review.

_Automated QA by an AI agent_
```

Then tell the user: "QA passed. Results posted to PR #<n>. Ready for review."

### QA failed
**Don't post to the PR.** Give the user the full details in-session — failing cases, logs, expected vs actual, hypotheses — and **wait for their call.**

---

## Critical rules

1. **Autonomous** between phases, except: auth needed, an unresolvable critical error, ambiguity about which fix to apply, or QA failure.
2. **Never on the base branch.**
3. **Carry context** (ticket, services, fix, PR, env) from phase to phase.
4. **Respect polling caps.** Never loop forever.
5. **Only wait for relevant instances.**
6. **If a phase fails, say so clearly.** Never silently skip.
7. **Push before setting up the environment** — it deploys from the branch.
8. **Only post QA to the PR on success.**
