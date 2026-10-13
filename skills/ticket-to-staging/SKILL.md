---
name: ticket-to-staging
description: End-to-end "discussion → staging" workflow. After you and the user have already discussed a fix or small feature in the conversation, run this skill to (1) file the ticket, (2) provision an isolated worktree + branch, (3) implement the agreed change, (4) write tests, (5) run quality gates, (6) commit + push, (7) spin up an ephemeral staging environment. Hard-stop if worktree provisioning fails. Use phrases "ticket to staging", "kick off the work", "go ship it", "do the whole flow".
---

# ticket-to-staging — Discussion → Ticket → Implementation → Staging

Turns a conversation that already converged on a fix into a ticket, a branch, tested code, and a running staging environment — in one go.

> **Adapt:** This skill assumes three capabilities. Wire each one to whatever your company uses:
> - A **ticketing system** with an API or agent tool (create / read / update tickets).
> - A **dev-workflow CLI** (`<dev-cli>` below) that, given a ticket, provisions a git worktree + auto-named branch and can later spin up an ephemeral environment for that branch. If you don't have one, replace it with your own script — but keep the rule that *the tool*, not the agent, creates branches and environments.
> - An **ephemeral environment** per branch/ticket (namespace, preview env, review app — whatever your platform calls it).

## When to use

You and the user have **already discussed** a fix or small feature in the current conversation. The discussion converged on:

- A clear problem statement
- A specific, scoped fix (file paths, function names, behaviors)
- Test scenarios that prove the fix works

When the user says "go do it" / "ticket to staging" / "kick off the work" — run this skill. **Do not** infer scope from a vague request. If the discussion isn't concrete enough, push back and ask for the specifics first.

## Inputs you must resolve at runtime

Never hard-code these. Resolve them per session:

| Input | How to resolve |
|---|---|
| **Assignee** | Default to the user. Resolve from the conversation context or `git config user.email`. Confirm only if ambiguous. |
| **Team / owning group** | If the user belongs to exactly one team in the ticketing system, use it. Otherwise ask. |
| **Ticket classification** | Many ticketing setups require a type (e.g. "Technical" vs "Feature") and, for features, a parent (epic / initiative / project). **Ask** which one applies — never silently default. |
| **Service / repo** | Derive from the discussion (file paths the user named) or ask. |
| **Base branch** | Inspect the repo's default branch (`git symbolic-ref refs/remotes/origin/HEAD`) — don't assume `main` vs `master`. |
| **Quality-gate commands** | Inspect the repo's build config / task runner / scripts / agent instructions file. Don't assume a toolchain. |
| **Staging URL pattern** | Read from the service's deploy config or ask. |

If anything can't be resolved confidently, **ask once, then save it as project memory** so future runs don't re-prompt.

## Required hard stops

1. **No concrete scope** → ask the user. Don't guess.
2. **The dev-workflow CLI doesn't produce a worktree** → STOP, surface the error, don't implement. **Never hand-roll the worktree/branch** (`git worktree add` / `git checkout -b`) as a workaround: a checkout the tooling doesn't know about usually can't be deployed to an environment later. Fix the root cause, then let the tool create it.
3. **Tests or any quality gate fail** → STOP, surface the failure, don't push. Fix it or escalate.
4. **Ticket isn't "workable"** → many dev-workflow tools refuse to provision for a ticket that is missing required fields (team, type, parent). Verify those fields *before* calling the CLI (step 2.5). This is the #1 cause of "the tool didn't create a worktree".

## The 8 steps

Track each step as a task item; set it `in_progress` before starting and `completed` after.

### 1. Inspect the ticket schema

Before creating anything, read the ticket schema through your ticketing tool and confirm the field names: title, description, type, team, assignees, parent (epic/initiative). Schemas drift — don't trust names from memory.

### 2. Create the ticket

Title in conventional-commit form: `type(scope): description`.

**Description template** (markdown, lifted from the discussion — quote, don't paraphrase):

```markdown
## Problem

<What's broken / missing — concrete. Reference the evidence from the discussion:
conversation/request IDs, log lines, screenshots, etc.>

## Fix

<The exact change. Include the file path and before/after snippet if discussed.
Mirror how the user framed it — don't invent a different design.>

File: `<repo-relative path>`

## Tests

<Bulleted test scenarios from the discussion. Each one unambiguous about input → expected state.>

## Originating evidence

<Links to the conversation, chat thread, incident, or ticket that sourced this.>

## Out of scope

<Anything the user explicitly said belongs in a separate ticket.>
```

Record the ticket ID — everything after this step keys off it.

### 2.5 Verify the ticket is workable (gate)

Re-read the ticket and confirm every field your dev-workflow tool requires actually stuck (team, type, parent for features). If something is missing, set it to the value **you already resolved with the user** — never silently downgrade a feature to "technical" just to pass the gate — then re-check. Only proceed when it passes; otherwise this is hard stop #4.

### 3. Provision the worktree + branch

```sh
<dev-cli> start <ticket-id> --services <service> --base-branch <base-branch>
<dev-cli> info <ticket-id>        # prints the worktree path(s)
git -C <worktree-path> branch --show-current
```

- If the command errors, prints no worktree, or the service is missing from the output → **STOP** and surface the error verbatim. Don't guess a path.
- The branch must follow the tool's naming convention (typically embeds the ticket ID). If it doesn't → STOP.
- If the service choice was wrong, confirm the right one with the user before re-running. Don't silently retry with another service.

From here on, **every edit, commit, and push happens inside the worktree**, not the main clone.

### 4. Install dependencies in the worktree

A fresh worktree usually needs dependencies installed before anything builds. Use the repo's package manager / build tool. Allow several minutes for large monorepos.

### 5. Implement + write tests

Apply the change exactly as discussed:
- Edit the file paths the user named; use the names the user named.
- Add the tests the user asked for. Give them descriptive names that reference the originating ticket/evidence so a future reader knows which regression they guard.
- Comments explain WHY, only when the WHY isn't obvious.

### 6. Quality gates

Run the repo's gates **in the order the repo configures them** — typically typecheck → targeted tests → full project tests → lint (with autofix once) → spellcheck if configured. Inspect first; don't assume. Fix every failure before moving on.

Run spellcheck explicitly if the repo has one — CI is usually strict about it and it's the most common "surprise" failure.

### 7. Commit + push

Conventional commit. Put the originating evidence in the body so `git log` is useful.

```sh
git add <only the files you changed>
git commit -m "<type>(<scope>): <summary>

<what was wrong, what changed, why>

Ref: <ticket / evidence>"
git push -u origin HEAD
```

Do **not**: `git add -A`, skip hooks (`--no-verify`), or push to the base branch.

### 8. Spin up the staging environment

```sh
<dev-cli> setup-env <ticket-id>
```

This deploys the just-pushed branch into an ephemeral environment. Environments usually take a while to come up (tens of minutes). Don't poll immediately — tell the user the expected URL and move on.

## Final summary to the user

```
Shipped <ticket-id>:
• Ticket:  <ticket-url>
• Branch:  <branch> (pushed as <sha>)
• Tests:   <N> new, full suite green
• Staging: <env-id> ramping up (~<minutes> min) at <staging-url>
```

If you stopped at a step, report which step + the error verbatim. Don't paper over.

## What this skill is NOT

- Not a substitute for scoping when the problem is unclear — that's a different conversation.
- Not for multi-day features with cross-team coordination. If the discussion exposed dependencies or needs design review, file the ticket but stop before step 3 and tell the user.
- Not a code-review replacement. Gates here are typecheck/test/lint — not architecture review.

## Adoption checklist (first run per user / repo)

Save these as project memory so future runs don't re-prompt: assignee ID, team ID, default base branch, quality-gate commands, staging URL pattern.
