---
name: typecheck-lint
description: Run the project's typecheck and lint, fix every error, and re-run until clean. Use when the user says "typecheck", "lint", "check types", or when another skill needs code quality verified before proceeding.
---

# Typecheck and Lint

Run the project's static checks, fix what fails, repeat until clean.

**Input:** none — runs on the current project.
**Output:** clean typecheck and lint, with fixes applied.

> **Adapt:** Put your exact commands here (or in the repo's agent-instructions file) — e.g. the task-runner target for the affected project, so the agent doesn't type-check the entire monorepo.

## Step 1: Find the commands
Look at the repo's build config, scripts, task runner, and agent-instructions file. Prefer **project-scoped** targets over whole-repo runs.

## Step 2: Typecheck
Run the type checker / compiler for the affected project.

## Step 3: Lint
Run the linter with autofix once.

## Step 4: Fix what remains
Read each error, fix the **underlying** issue (don't suppress rules or add ignore comments unless the repo already does that for this case), and re-run both checks. Repeat until clean.

## Step 5: Report
Confirm typecheck and lint pass, and list any non-trivial fixes you made.
