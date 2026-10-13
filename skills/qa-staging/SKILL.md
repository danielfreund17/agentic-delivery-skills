---
name: qa-staging
description: Performs end-to-end QA verification of a code change deployed to an ephemeral staging environment. Use when the user asks to "QA on staging", "test on staging", "verify on staging", or needs to validate a fix deployed to a staging environment.
---

# QA on a Staging Environment

Understand the change, find affected endpoints, pull realistic test data, call the environment, verify results against independent ground truth, compare with the baseline, check logs/traces, and report a verdict.

**Input:** an environment ID and optionally a PR number, service name, or description of what to test. If missing, infer from the current branch and recent commits.
**Output:** a structured QA report with a pass/fail verdict and evidence; optionally a PR comment.

> **Adapt:** Fill in your environment URL scheme once, here, and the skill uses it throughout:
> - Ephemeral environment: `<staging-url>` (e.g. `https://<service>-<env-id>.<staging-domain>`)
> - Shared baseline (main branch on staging): `<baseline-url>`
> - Staging dataset in the data warehouse: `<staging-dataset>` (never production for test data)

---

## Phase 1: Understand the implementation

### 1a. The change
Read the PR diff (or `git diff <base>...HEAD`). Answer: what behavior changed, which services/endpoints are affected, what data flows through the changed code, what the edge cases are.

### 1b. The service
Identify the service and its environment URL. Confirm the environment is up — and actually running your commit (ask the runtime platform, don't trust a health URL alone).

### 1c. Testable endpoints
Trace from the diff to the HTTP (or message/queue) entry points: modified handlers, services they call, data that ends up in responses. List each with method, path, required params.

---

## Phase 2: Find test data

### 2a. Query the data warehouse (staging dataset)
- Find entities that exercise the changed behavior.
- Get the **external/public identifier** your APIs accept.
- Find **at least 2–3 cases** covering different scenarios.

### 2b. Build ground truth first
Before calling the API, independently compute what the **correct** result should be from raw data. That's what you'll compare the response against.

---

## Phase 3: Execute tests

### 3a. Call the environment
Use `curl` (or your API client). For each case capture the full request, status code, and the relevant response fields.

### 3b. Compare with the baseline (bug fixes)
Call the same request against `<baseline-url>` and `<staging-url>`. The baseline should show the bug; the branch should show the fix.

### 3c. Verify against ground truth
Does the response match the expected values from Phase 2? Are adjacent fields unaffected?

### 3d. Edge cases
Happy path · upstream failure handling · boundaries (empty, null, missing entity) · backwards compatibility.

### 3e. UI / conversational flows
If the change is in a user-facing UI or conversational flow the agent can't drive itself:
1. Generate test URLs for the user, one per scenario.
2. Warn about user scoping (they must be logged in as the right test user).
3. After they test, verify via logs.
4. Capture before/after using production vs staging logs.

---

## Phase 4: Check observability

### 4a. Logs
Errors on the environment during the test window; expected warning/fallback logs firing; reasonable latency.

### 4b. Error tracker
New issues on the staging service during the test window.

### 4c. LLM traces (for agentic / LLM-powered services)
1. **Trigger realistic interactions** against the environment (chat, voice, email, or whatever channels the service handles), using the Phase 2 test entities so they're relevant to the scenario.
2. **Find the traces** with `llm-trace-investigation`, using **staging** credentials, filtered by environment, time window, and entity IDs.
3. **Analyze the reasoning:** correct path, no hallucination, right tools with right parameters, correct final action. Compare to production traces to confirm before/after.
4. **Report** trace IDs and a summary of the reasoning path.

LLM flows are non-deterministic: re-run a surprising case before calling it a failure, and judge the distribution.

---

## Phase 5: Report

```markdown
## QA Results — [Passed/Failed]

Tested on `<staging-url>` (commit `<sha>`) against N cases.

### Methodology
1. How test data was found
2. Which endpoints were tested
3. How results were verified

### Test Cases
| Entity | Scenario | Expected | Actual | Status |
|---|---|---|---|---|

### Verification
- Data-warehouse cross-reference: …
- Logs: clean / errors found
- Baseline vs branch: …
- Edge cases: …

### Conclusion
<verdict + confidence; untested scenarios listed explicitly>
```

If asked, post it as a PR comment and state clearly whether it's safe to merge.

---

## Critical rules

1. **Understand the code before testing.**
2. **Independent verification is mandatory.** A 200 proves nothing; check the data is right.
3. **Use staging data, never production,** for test entities.
4. **At least 2–3 cases.** One pass isn't QA.
5. **Check logs after testing,** even if responses look right.
6. **Make it reproducible.** Someone should be able to re-run your report.
7. **Be honest about coverage.** Say what you couldn't test.
8. **Do the math** for calculated values.
9. **Verify the environment runs your commit** before trusting any result.
10. **If staging is unreachable or data is insufficient, say so** — never fake a pass.
