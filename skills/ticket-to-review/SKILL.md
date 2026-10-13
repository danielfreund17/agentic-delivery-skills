---
name: ticket-to-review
description: End-to-end "discussion → ready-for-review" workflow. The longer sibling of ticket-to-staging — continues past the staging trigger into CI watching, verifying the right commit is live, agentic QA on staging, posting QA evidence on the PR, a self-healing review-bot loop, and a final team-chat handoff to a review channel with reviewers assigned. Hard-stop if provisioning fails or QA shows the change is broken. Use phrases "ticket to review", "take it all the way to review", "ship and post for review", "do the whole thing".
---

# ticket-to-review — Discussion → ready-for-review, end-to-end

The long-running sibling of `ticket-to-staging`. Instead of stopping at "staging env is coming up", it carries the change all the way to a PR that is **QA'd on staging, review-bot clean, has reviewers assigned, and has been announced in the team's review channel**.

> **Adapt:** On top of what `ticket-to-staging` needs, this skill uses:
> - A **code host** with PRs, review threads, and a CLI/API (open PR, comment, reply to and resolve threads, request reviewers).
> - A **CI system** whose status is readable per PR.
> - A **runtime platform** you can query to see which commit is actually running in the ephemeral environment.
> - An **automated review bot** that comments on PRs (optional — skip phase 14 if you don't have one).
> - A **team chat** tool the agent can post to.

## When to use

Same prerequisites as `ticket-to-staging`: a discussion has converged on a clear problem, a scoped fix, and test scenarios — and the change is small enough that one prompt → ready-for-review is realistic.

**Once invoked, run all phases end-to-end without pausing between them** — unless a hard stop fires or the user intervenes. The point is autonomous delivery from discussion to ready-for-review. Don't infer scope from a vague request.

## Required tooling discipline

Use the **dev-workflow CLI** for everything it owns:

- **Worktree + branch** — never `git checkout -b` by hand; hand-rolled branches fall outside the tool's view and usually can't be deployed.
- **Ephemeral environment** — always through the CLI, never by poking the underlying deploy bot directly (that tends to produce environments that don't actually deploy your service).
- **Working directory** — every edit, commit, and push happens inside the per-ticket worktree.

If the CLI is missing or unauthenticated, STOP at Phase 0 and tell the user. Don't substitute manual commands.

## Composed skills

This skill orchestrates other skills from this collection. If one is missing when its phase runs, STOP and say which.

| Skill | Used in phase |
|---|---|
| `ticket-to-staging` | 1–7 (canonical reference) |
| `typecheck-lint`, `generate-tests` | 5–6 |
| `commit-push` | 7 |
| `create-pr` | 8 |
| `get-ci-issues` | 10 |
| `qa-staging` | 12 |

## Phase 0 — Clarifications (before anything else)

Make sure every input is known. If any are missing, ask **once**, batched into a single message.

| Input | How to resolve | If missing |
|---|---|---|
| Assignee, team, ticket classification, service, base branch, quality gates, staging URL pattern | Same as `ticket-to-staging`. | Same as `ticket-to-staging`. |
| **Runtime context + namespace** for the environment | Inspect your runtime CLI's contexts, or project memory. | Ask on first run. |
| **Review channel** ⚡ | Where the handoff is posted (URL / ID / name). | **Always ask. Never guess or default.** |
| **Reviewers — code-host handles** ⚡ | For requesting reviewers on the PR. | **Always ask.** |
| **Reviewers — chat identities** ⚡ | For mentions in the handoff message. Most chat tools only notify on a real user ID mention; a code-host handle renders as plain text and pings nobody. | Try a runtime lookup (Phase 15); ask if it fails. |

⚡ = unique to this skill.

**Question batch template** — include only what you couldn't resolve:

```
Before I kick off, I need a few things:
1. Ticket classification — technical, or a feature under which epic/initiative?
2. Review channel — where should the PR be posted?
3. Reviewers — code-host handles (e.g. alice,bob)
4. Same reviewers' chat identities (IDs/handles/emails), or say "look them up"
5. Service / repo — I think <inferred>, ok?
6. Base branch — <inferred>, ok?
7. Runtime context / namespace — <inferred>, ok?
Reply with answers, or "ok" if the inferred values look right.
```

Save the answers to project memory.

## Required hard stops

1. **No concrete scope** → ask.
2. **Worktree not provisioned** → STOP. Most common cause: ticket missing required fields (see `ticket-to-staging` step 2.5). Never hand-roll the branch.
3. **Quality gates fail** and you can't fix from the current diff → STOP.
4. **CI fails** → read the real failure, minimal fix, re-push, re-watch. Escalate after 2 consecutive retries with the same root cause.
5. **The environment runs the wrong commit** → STOP QA, surface the mismatch, retry the env trigger once. Never QA the wrong code.
6. **QA shows the change doesn't work** → STOP, report. Don't paper over.
7. **A review-bot comment needs human judgment** (design call, business rule, scope) → reply with the question, park that thread, continue with others.

## The 15 phases

Track each as a task item.

### 1–7. Same as `ticket-to-staging`

Run steps 1–7 of `ticket-to-staging` exactly (schema → create ticket → workability gate → provision worktree → install deps → implement + tests → quality gates → commit + push). Don't open the PR yet (phase 8) and don't trigger the env yet (phase 9).

After phase 7 you have: **ticket ID**, **branch**, **HEAD SHA**. If this summary ever drifts from `ticket-to-staging`, that skill wins.

### 8. Open the PR

Invoke `create-pr`. Record the **PR number and URL** — everything from phase 10 references them.

### 9. Trigger the staging environment

```sh
<dev-cli> setup-env <ticket-id>
```

A "not found" error here usually means provisioning in phase 3 didn't really register — go back and re-verify.

### 10. Watch CI to green

Watch the PR's checks (your code host's "watch checks" command or `get-ci-issues`). On failure:
- Read the **actual** error from the logs (the compiler / test / lint / spellcheck output — not "build failed").
- Minimal fix in the worktree, push, watch again.
- Two consecutive failures with the same root cause → STOP.

### 11. Verify the right commit is live

CI green ≠ new code running. Ask the runtime platform which commit the environment's workload is running — a commit annotation/label, or the image tag (which typically embeds the SHA) — and compare to `git rev-parse HEAD`.

- **Match**, and instances are running + ready → proceed.
- **Mismatch** → don't QA. Surface it, retry the env trigger once, then STOP and ask.

> **Gotcha worth checking on your platform:** a wildcard staging domain may answer `/health` with 200 from a *shared* baseline deployment even when your environment has zero instances. Gate on the runtime platform, not on a health URL.

### 12. Agent QA on staging

Invoke `qa-staging`. It identifies affected endpoints, pulls realistic test data, calls the staging environment, compares against the baseline, cross-checks ground truth, and returns **pass** (with evidence) or **fail** (with diagnosis).

On failure:
- **Code bug** → fix, push, go back to phase 10 (CI → commit verify → re-QA).
- **Test data / environment issue** → surface and ask before retrying.

Never move on past a failed QA.

### 13. Post QA evidence to the PR

```markdown
## QA on staging — ✅ pass

**Env**: <staging-url>
**Commit on env**: `<sha>` (matches HEAD)
**Tested**: <count> cases

| Case | Input | Expected | Actual | Verdict |
|---|---|---|---|---|
| <name> | `<input>` | `<expected>` | `<actual>` | ✅ |

### Evidence
- `<request one-liner>` → `<response snippet>`
- Baseline: <one line showing the baseline exhibits the bug and this branch doesn't> (bug fixes only)
- Trace / log links: <whatever observability applies>

### Notes for review
<anything subtle but non-blocking — don't hide problems>
```

### 14. Review-bot loop (self-healing)

Wait for the automated reviewer, then list unresolved review threads via your code host's API. For each thread:

1. **Read the whole comment**, not just the title.
2. **Decide**: legitimate → fix · false positive → reply explaining why · needs human judgment → reply with a question and park it.
3. **For fixes**: touch only the affected files; re-run local gates if logic changed; push. If logic changed materially, go back to phase 10 (CI → verify → re-QA). Trivial fixes (typos, comments, lint) skip straight back here.
4. **Reply** on the thread ("Fixed in `<sha>` — <one line>") and **resolve** it.

Loop until every bot thread is resolved or parked.

### 15. Reviewers + team-chat handoff

**15a.** Request the reviewers on the PR using their **code-host handles**.

**15b.** Resolve **chat identities** for mentions. If the user gave IDs, use them. If they gave handles/emails or said "look them up", search the chat directory (by name, commit email, or `<handle>@<company-domain>`). One confident match → use it. Zero or several → ask before posting. If lookup is impossible, fall back to plain-text names and tell the user the ping won't notify. Save the handle→identity map to memory.

**15c.** Post the handoff to the review channel (in-thread if a thread link was given):

```
*Ready for review:* <PR link> — <ticket-id>

*What changed:* <one line from the ticket>
*QA on staging:* ✅ <staging-url> — <count> cases passed
*Review bot:* clean (<n> threads addressed)
*Files:* <count> changed (+<add>/-<del>)

cc <mention> <mention>
```

## Final summary to the user

```
Done — <ticket-id> ready for review:
• PR:        <pr-url>
• Staging:   <staging-url>
• Review bot: <n> comments resolved
• Reviewers: <handles>
• Chat:      posted in <channel>
• Time:      ~<elapsed> from prompt
```

If a hard stop fired: report the phase, the error verbatim, and what you tried.

## What this skill is NOT

- Not a replacement for `ticket-to-staging` when you don't need QA + review handoff.
- Not for multi-day features — if the discussion surfaced cross-team dependencies, design ambiguity, or a security/migration angle, stop after the PR and hand back.
- Not a replacement for human review. The bot is a static reviewer; the humans you tagged are the real review.
- Not autonomous on judgment calls. If QA shows the spec itself was wrong, ask.

## Adoption checklist

After the first successful run, save to project memory: the review channel per repo, the usual reviewer set, the runtime context/namespace pattern, plus everything from the `ticket-to-staging` checklist.
