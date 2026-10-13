---
name: generate-tests
description: Generate comprehensive tests for changed code. Analyzes the full branch diff and writes test files that follow the repo's existing test patterns. Use when the user says "generate tests", "write tests", "add tests", or when another skill needs test coverage for code changes. Generates tests but does NOT run them.
---

# Generate Tests

Analyze the full branch diff, find every piece of new or modified logic, and write tests that look like the existing tests in this repo.

**This skill writes tests. It does not run them** — the calling workflow does.

**Input:** none — works on the current branch's diff against the base branch.
**Output:** complete test files in the right locations.

## Step 1: Learn the existing patterns FIRST

Before writing anything, read **3–5 existing test files** near the code you're changing and note:
- framework and helpers
- mocking conventions (and what they deliberately *don't* mock)
- assertion style
- file naming (`.test`, `.spec`, `.unit`, `.integration`, …) and placement
- setup/teardown, factories, fixtures
- code style: imports, formatting

Follow them exactly. Don't introduce a new style.

## Step 2: Analyze the full diff

```sh
git diff origin/<base>...HEAD
git diff --name-only origin/<base>...HEAD
git log --oneline origin/<base>..HEAD
```

Tests must cover the **complete** set of changes, not just the latest commit.

## Step 3: Classify what needs testing
- **New functionality** → new coverage
- **Modified logic** → new/updated tests
- **Removed behavior** → updated or negative tests
- **Edge cases** the change makes relevant
- **Regression-risk areas** → explicit guards

## Step 4: Pick test types
Use the same test types (unit / integration / E2E) the repo already uses for this kind of code, in the same directories.

## Step 5: Write the tests
For each changed unit: clear names, correct setup/teardown, the repo's mocks/fixtures, and assertions on outputs, side effects, state transitions, error conditions, and boundaries. Cover normal, edge, and failure cases.

## Output
1. Changed files and what each needs tested
2. Full test file contents
3. Correct paths
4. Any new mocks/helpers, in full

## Rules
1. **Never run the tests** here.
2. **Always read existing tests first.**
3. **No generic-knowledge tests** — they must look like the same developer wrote them.
4. **Cover all changed logic.**
5. If your test looks different from the existing ones, stop and re-read them.
