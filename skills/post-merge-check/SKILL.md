---
name: post-merge-check
description: Post-merge production validation and regression analysis. Use when the user says "post merge check", "monitor production after merge", "check if my PR is safe in prod", or wants continuous production validation after a merge. Waits for the production deployment, then runs repeated monitoring cycles across the error tracker, logs/APM, data warehouse, and LLM traces — verifying the new behavior works in production AND that nothing regressed.
---

# Post-Merge Production Validation

You're a principal engineer validating a PR that's already merged. The job has **two equally important parts**:

1. **Feature verification** — the new behavior actually works in production.
2. **Regression detection** — nothing else broke: no new errors, no metric degradation, no behavior shifts.

**Regression checks alone are not enough.** A deploy can have zero regressions while the feature itself doesn't work (the new field is always empty, the new tag is never applied). You must actively observe the intended behavior in production.

Quality over speed. Reason carefully throughout.

> **Adapt:** Write down, per service, the **business/behavioral metrics** that tell you it's healthy (conversion, handle rate, escalation rate, success rate — whatever applies) and the data-warehouse table/view where they live. That's the part that turns generic monitoring into real regression detection.

## Input

A PR number or URL.

---

## Phase 0: Configuration

Ask first, and don't proceed until answered:

1. **Monitoring duration** (e.g. 2h, 1h, 30m)
2. **Check interval** (e.g. 5, 10, 15 min)
3. **Team-chat notifications?** If yes, which channel or thread.

Cycles = `ceil(duration / interval)`.

---

## Phase 1: Understand the change and build a monitoring plan

1. Fetch PR metadata (title, body, merge time, merge commit, files, size), commit list, and the full diff.
2. The **merge timestamp** is the before/after boundary for every comparison.
3. For each changed file: what changed, what could break, which endpoints/flows are touched, what error messages / status codes / exceptions would signal a regression, which metrics would move, whether there are DB migrations and how they could fail.

**Output a monitoring plan before proceeding:**

**Feature verification plan (primary):**
- The intended behavior, in one sentence.
- How it's observable in production (logs with the new field, traces with the new data, rows in the warehouse).
- Evidence that confirms it works / evidence that it doesn't.
- Concrete queries to run each cycle.

**Regression detection plan:**
- Specific log queries, error-tracker filters, warehouse queries, trace searches.
- Migration checks, if applicable.
- Expected healthy baselines vs. regression signals.

---

## Phase 2: Wait for the production deployment

**Deployment wait is a prerequisite, not part of the monitoring duration.** Cycles start only once the code is live.

- Find the production deploy pipeline for the merge commit and poll it every ~5 minutes.
- **Passed** → note the time, wait a few minutes for the rollout, go to Phase 3.
- **Failed** → tell the user and ask how to proceed.
- If chat is configured, send **one top-level message** when the deploy completes or fails. Record its message ID — **every later message is a thread reply** to it. No per-poll chat updates while waiting.
- **Can't see the pipeline?** Wait at least ~30 minutes after merge and say in the first cycle: "Deployment status unknown — assuming deployed based on elapsed time."

---

## Phase 3: Monitoring cycles

Run the checks below each cycle, in parallel where possible.

### Check 0: Feature verification (MOST IMPORTANT)
Run the feature queries from the plan: logs showing the new behavior, LLM traces with the new data, API/log evidence that real users get it. Track adoption across cycles.

Status per cycle:
- **VERIFIED** — clear evidence it works (e.g. 15 traces with the new field populated correctly in the last 10 min)
- **PARTIAL** — some evidence, not conclusive
- **NOT YET OBSERVABLE** — no traffic has hit the new path (normal early on)
- **NOT WORKING** — deployed but not producing the expected results

### Check 1: Error tracker
- Issues **first seen after the merge**.
- Pre-existing issues that are **spiking**.
- Cross-reference suspicious ones against the PR's changed files. Track counts across cycles.

### Check 2: Logs & APM
- The plan's specific error queries for the affected service.
- Error rate and latency: pre-merge (7-day average) vs post-merge. Look for spikes at deploy time.

### Check 3: Data warehouse — behavioral metrics
Run the plan's behavioral queries, comparing the days before the merge with today. Example shape:

```sql
SELECT event_date,
       COUNT(*)                                         AS total,
       AVG(CASE WHEN outcome = 'success'  THEN 1 ELSE 0 END) AS success_rate,
       AVG(CASE WHEN outcome = 'escalated' THEN 1 ELSE 0 END) AS escalation_rate
FROM <warehouse>.<schema>.<service_funnel_view>
WHERE event_date BETWEEN DATEADD(day, -7, '<merge_date>') AND CURRENT_DATE
GROUP BY event_date
ORDER BY event_date;
```

Plus breakdowns of failure/escalation reasons since the merge. Narrow by channel/segment if the PR only affects some.

### Check 4: LLM traces (for AI-powered services)
Using `llm-trace-investigation` with **production** credentials: failure/escalation traces in the post-merge window, traces of the flows the PR touched, unexpected tool-calling patterns, failure rate vs pre-merge.

### Check 5: Migrations (if any)
Slow-query or DB errors in logs; data integrity in the warehouse (new columns populated, no unexpected nulls); latency on queries touching migrated tables.

### Per-cycle summary

```markdown
## Monitoring Cycle {N}/{total} — {timestamp}

**Time since merge**: {duration}  ·  **Deployment**: {Deployed / Deploying / Unknown}

### Health: {GREEN / YELLOW / RED}

| Source | Status | Key finding |
|---|---|---|
| Feature verification | VERIFIED / PARTIAL / NOT YET / NOT WORKING | … |
| Error tracker | … | … |
| Logs & APM | … | … |
| Data warehouse | … | … |
| LLM traces | … | … |

### Changes since last cycle
- …

### Assessment
<1–2 sentences>
```

If chat is configured, post a condensed version **as a thread reply** to the Phase 2 message. If Phase 2 sent nothing, the first cycle summary becomes the top-level message and the rest thread under it.

### Between cycles
Sleep for the interval.

### Critical regression
If you see a critical signal (e.g. error rate >5×, a new error-tracker issue with >100 events, a key business metric dropping >10%):
1. Post an urgent chat alert with a channel-wide mention, as a thread reply **also broadcast to the channel** (or top-level if no thread exists yet).
2. Alert the user in-session.
3. **Keep monitoring** — whether it recovers or worsens is valuable data.

---

## Phase 4: Final report

```markdown
## Post-Merge Analysis: PR #{number}

**PR**: "{title}"  ·  **Merged**: {ts}  ·  **Scope**: {files} files, +{add}/-{del}
**Monitoring**: {duration}, {interval} intervals, {cycles} cycles  ·  **Deployed**: {ts or unknown}

### Executive summary
<2–3 sentences: does the feature work, and is there a regression?>

### Feature verification — {VERIFIED | PARTIALLY VERIFIED | NOT VERIFIED | NOT WORKING}
- Intended behavior: …
- Evidence observed: <specific log lines, trace IDs, metric values>
- Coverage: <how many production requests hit the new path>
- Gaps: <scenarios with no traffic during the window>

### Service health trend
| Metric | Pre-merge (7d) | Cycle 1 | Mid | Final | Trend | Status |
|---|---|---|---|---|---|---|
| Error rate | | | | | | |
| p50 latency | | | | | | |
| p90 latency | | | | | | |

### Behavioral metrics trend
| Metric | Pre-merge (7d) | Post-merge | Δ | Trend | Status |
|---|---|---|---|---|---|

### Error-tracker issues
| Issue | Severity | PR-related? | First seen | Events | Trend | Status |
|---|---|---|---|---|---|---|

### LLM traces
<patterns and anomalies across cycles>

### Migrations
<if applicable>

### Timeline
| Time | Event |
|---|---|

### Verdict
**Feature**: WORKING / PARTIALLY WORKING / NOT WORKING / UNVERIFIED
**Regression**: NONE DETECTED / POSSIBLE / CONFIRMED
**Confidence**: HIGH / MEDIUM / LOW — <why>
**Evidence**: <bullets>
**Recommended actions**: <if any>

### Sources consulted
- [ ] Diff analysis  - [ ] PR discussion  - [ ] Feature verification
- [ ] Error tracker  - [ ] Logs & APM  - [ ] Data warehouse
- [ ] LLM traces     - [ ] Migration checks
```

If chat is configured, always post the final report as a thread reply (top-level only if no thread exists).

---

## Critical rules

1. **Ask the configuration questions first.**
2. **Feature verification is not optional.** If you can't verify it, say so — don't report "no regressions" and call it done.
3. **Targeted plan, not generic checks.** Specific queries for this PR.
4. **Trends over snapshots.** One odd cycle is noise; three degrading cycles is a signal.
5. **Read the old code** (`git show <merge-commit>^:<path>`) instead of guessing.
6. **Correlate across sources.** An error-tracker issue + a metric dip + a log spike = high confidence.
7. **Check file overlap** before blaming the PR.
8. **Account for deployment timing** and **temporal patterns** (weekday vs weekend; compare same weekday when possible).
9. **Pre-existing issues are not regressions.**
10. **Be honest about data gaps.**
11. **Don't stop on critical findings** — alert and keep watching.
