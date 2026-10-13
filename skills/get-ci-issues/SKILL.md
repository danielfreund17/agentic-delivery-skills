---
name: get-ci-issues
description: Fetch and summarize CI failures for the current branch's pull request — test failures, typecheck/build errors, lint errors, and anything else that failed. Use when the user asks to "check CI", "get CI issues", "what's failing in CI", "check pipeline", "get build errors", or when another skill needs structured CI failure data.
---

# Get CI Issues

Find the PR for the current branch, check its CI status, pull the failure logs, and present every failure in a structured form.

**Purpose:** a clean failure report that a planner/implementer (human or agent) can act on. It **reports** — it doesn't fix.

> **Adapt:** Tell the skill how to find *your* CI check among the PR's status checks (its name or URL pattern) and how to read its logs (code-host CLI, CI system CLI/API, or an agent tool). Adjust the grep patterns in Step 4 to your toolchain's error formats.

## Step 1: Current branch
`git branch --show-current`.
- On the base branch → stop: "You're on the base branch — switch to a feature branch."
- Detached HEAD → stop: "Detached HEAD — check out a branch."

## Step 2: Find the PR
List PRs for this head branch with their status checks via the code host CLI/API.
- CLI missing → "Code-host CLI not installed."
- Not authenticated → "Code-host CLI not authenticated."
- No PR → "No PR for this branch. Create one first."

## Step 3: CI status
Find your CI check among the PR's status checks.
- Not found → "No CI check found — it may not have started yet."
- Passing → "CI is passing."
- Running/queued → "CI is still running."
- Failed → continue.

## Step 4: Pull the failure logs
Get the failed job/step logs. Filter for failure signals with context (≈2 lines before, 5 after), e.g.:

```
FAIL |● |Expected|Received|error:|Error:|ERROR|Cannot find|TypeError|ReferenceError|SyntaxError|lint|warning:|failed
```

plus your compiler's error-code pattern.

## Step 5: Categorize
- **Test failures** — file, suite › test name, expected vs received
- **Typecheck / build errors** — file:line:col, error code, message
- **Lint errors** — file, line, rule, message
- **Runtime errors** — exception type and the relevant stack frames
- **Other** — spellcheck, packaging, deploy steps, infra

## Step 6: Present

```markdown
## CI status for `<branch>`

**PR**: #<n> (<url>)  ·  **Status**: FAILING  ·  **Run**: <url>

### Test failures
#### 1. `<file>`
**Test**: `<suite> › <name>`
**Error**: <message + diff>

### Typecheck errors
#### `<file>:<line>:<col>`
<code>: <message>

### Lint errors
#### `<file>`
- Line <n>: <rule> — <message>

### Summary
- Failed jobs: <list>
- Tests: N · Typecheck: N · Lint: N · Other: N
```

## Notes
- Large logs get truncated — the grep step keeps the key signal.
- If the logs can't be fetched, say so and link the CI run.
