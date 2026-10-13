---
name: investigate-bug-report
description: Use when the user asks to "investigate bug", "analyze bug report", "RCA bug", "debug this bug", "find root cause", or provides a bug ticket and/or chat thread about a customer-facing bug. Performs an evidence-based root cause analysis across every available data source and proposes a minimal fix.
---

# Investigate Bug Report

An evidence-based investigation: start from the bug ticket and/or chat thread, cross-reference every available data source, find the root cause in code, prove it with data, and propose a minimal fix.

**Input:** a bug ticket (URL/ID) and/or a team-chat thread where the bug is discussed.
**Output:** root cause with evidence, affected code paths, impact, and a suggested fix.

> **Adapt:** Phase 2 lists *categories* of data sources. Map each to your tool and its agent integration (MCP server, CLI, API). The more of them the agent can reach, the better the RCA. Delete categories you don't have.

---

## Phase 1: Gather context from every source (in parallel)

### 1a. Ticket
Pull the full report. Extract: expected vs actual, repro steps, impact scope, linked tickets/screenshots, and **engineers' comments** (often hold early hypotheses, trace IDs, entity IDs, error messages).

### 1b. Chat thread
Read the whole conversation. Extract: error messages, status codes, log snippets, links to observability tools, **entity IDs** (user/account/order/whatever your domain uses), hypotheses, and links to related threads.

### 1c. Related threads
Follow links to other threads; search for related discussions if useful.

---

## Phase 2: Deep dive into observability data

Use ALL available sources, in parallel where possible. Don't stop at the first signal.

### 2a. Logs (observability platform)
- Search several ways: exact error text, status code + endpoint path, entity IDs, flow names.
- Check **volume** — one occurrence or widespread?
- Read the surrounding context: what happened just before and after?
- Extract trace / span / request IDs for deeper digging.

### 2b. Error tracker
- Recent issues for the service, sorted by frequency and recency.
- For relevant issues: stack trace (exact code path), frequency/trend, first vs last seen, tags, affected users.

### 2c. APM / metrics
- Error rates and latency for the affected endpoints; spikes that correlate with the bug.

### 2d. Data warehouse (when entity state matters)
- Query affected entities, their states and transitions.
- Quantify: how many users/entities are affected?

### 2e. LLM tracing platform (for AI-powered flows)
If the bug involves an LLM/agent flow, find traces by user/entity ID or time window (see `llm-trace-investigation`). Look for: wrong tool calls, unexpected outputs, prompt/completion mismatches, timeouts.

### 2f. Agent/prompt configuration (for AI-powered flows)
If the flow is driven by a prompt, script, or tool configuration stored outside code, read the version that was live at the time.

### 2g. Service API contracts
For service-to-service calls: does the endpoint exist? What does it expect? What can it return? Did it change recently?

---

## Phase 3: Trace the code path

The critical phase.

### 3a. Find the failing code
From Phase 2, pin down the service, file, and function. **Read the code** — don't guess. Understand the full flow from entry point to failure.

### 3b. Understand the intended business logic
Map the decision tree. Find exactly where actual behavior diverges from expected.

### 3c. Check git history
`git log` / `git show` on the failing code. Look for renamed endpoints with subtle URL changes, removed validation, untested new paths, refactors that broke existing behavior.

### 3d. Verify against other services
If another service is involved, **read its source**, not just its API spec — controller/handler, serializer/presenter, service layer. This is critical for data-transformation mismatches. Check for a local clone before going remote.

### 3e. Call the staging APIs directly
When you need to know what an API *actually* returns for an entity, call the shared staging baseline (`<service>` on the main branch) directly. If the entity doesn't exist in staging, use the data warehouse to find a similar staging entity that matches the bug's criteria.

### 3f. Find test data in the data warehouse
- Production data: understand the real state of the affected entities.
- Staging data: find staging entities matching the same criteria to reproduce.
- Always compare DB state with the API response — serializers can make them diverge.

### 3g. Cross-reference all evidence
Does the code explain the logs/errors? Does git history explain when it started? One cause or several? **Confirm end-to-end with real data** that the code path produces the exact wrong output in the report.

---

## Phase 4: Quantify impact

How many users/entities? Since when? Is there a workaround? Which flows? Getting worse?

---

## Phase 5: Propose a fix

- **Minimal**: the smallest change that fixes the root cause. Handles edge cases? Backwards-compatible?
- **Verified**: trace the code with the fix applied; check response compatibility; check every caller; identify tests to update.
- **Presented**: the exact change, why it fixes the root cause, risks/side effects.

---

## Phase 6: Report

```markdown
### Root Cause
<2–3 sentences: what went wrong and why>

### Evidence
- Logs: <queries + key lines>
- Error tracker: <issues + counts>
- Git history: <commit that introduced it>
- Code: <snippet of the problematic code>

### Impact
<affected count, duration, flows>

### Suggested Fix
<exact change with file path + lines; why it works; risks>

### Verification Steps
<how to verify; what to monitor after deploy>
```

---

## Critical rules

1. **Use every available data source** and cross-reference them.
2. **Read the actual code** and its git history. Never guess.
3. **Read the other service's code** when the bug crosses a service boundary.
4. **Verify contracts with real data** — call staging, don't trust specs alone.
5. **The database is the source of truth** — use the warehouse to find test data and check real state.
6. **Quantify impact.** 1 user ≠ 300 users.
7. **Trace the regression** to the commit that introduced it.
8. **Minimal fixes.** Don't refactor while fixing a bug.
9. **Data over assumptions.** If logs say X and code suggests Y, investigate the discrepancy.
10. **Parallelize** independent queries.
11. **Admit uncertainty.** "I couldn't verify this" beats a wrong conclusion.
12. **Prove the hypothesis before presenting it.**
