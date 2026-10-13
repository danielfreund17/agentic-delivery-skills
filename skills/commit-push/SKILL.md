---
name: commit-push
description: Stage, commit, and push changes following conventional-commit conventions. Use when the user says "commit and push", "push changes", or when another skill needs to commit and push code changes.
---

# Commit and Push

Review the changes, stage only what belongs, write a descriptive conventional commit, push.

**Input:** none — works on the current branch.
**Output:** a pushed commit.

## Step 1: Review
`git status` and `git diff`. Understand what changed and why.

## Step 2: Stage
Stage the relevant files **by name**. Never stage secrets, credentials, or local env files.

## Step 3: Commit

Conventional type prefix: `feat` · `fix` · `docs` · `style` · `refactor` · `perf` · `test` · `build` · `ci` · `chore` · `revert`.

Write a **descriptive** message: the rationale, alternatives considered, technical decisions, next steps — enough that another developer could continue without asking you.

Example: `fix: guard null property in evaluation service to prevent runtime errors on incomplete user data`

> **Adapt:** We append an `[agent]` marker to agent-authored commit messages so we can measure how much code agents ship. Pick your own convention (marker, trailer, or label) — or drop it.

Don't add tool attribution lines (e.g. "Generated with …").

## Step 4: Push
`git push` — set upstream on first push (`git push -u origin <branch>`). Never push to the base branch, never skip hooks.
