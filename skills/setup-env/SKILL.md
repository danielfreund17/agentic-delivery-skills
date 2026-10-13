---
name: setup-env
description: Provision an ephemeral staging (or dev/sandbox) environment for a ticket/branch and confirm the request succeeded. Use when the user says "setup env", "create env", "spin up env", gives a ticket and needs an environment, or when another skill needs an environment provisioned.
---

# Set Up an Ephemeral Environment

Ask your platform for an environment for this ticket/branch, **verify the response**, and report back with a link to follow the deployment.

**Input:** a ticket URL/ID, or an environment ID, or nothing (infer from the branch). Optionally a stage (`staging` default, `dev`, `sandbox`).
**Output:** confirmation the setup was triggered, plus a link to the deployment workflow.

> **Adapt:** Point this at whatever creates environments for you — ideally the same **dev-workflow CLI** that created the worktree (`<dev-cli> setup-env <id>`). If your environments are created by messaging a deploy bot or calling an API, document here: where to send the request, the exact command format, how to recognize the bot's reply, and its success / auth-failure / error messages. The rule that matters: **never assume success — read the response.**

## Phase 1: Resolve the environment ID

1. **Ticket URL** → extract the ticket number per your ticketing system's URL format; derive the environment ID per your naming convention (e.g. a prefix + ticket number).
2. **Ticket number** → derive the environment ID.
3. **Environment ID** → use as-is.
4. **Nothing** → infer from `git branch --show-current` (branches created by the dev-workflow CLI usually embed the ticket ID). If no ID can be extracted, ask.
5. **Stage** → default `staging`; accept `dev` / `sandbox`.

## Phase 2: Request the environment

Run the CLI command (or send the request to your deploy bot/API) for `<env-id>` and `<stage>`.

## Phase 3: Verify the response

Wait a few seconds, then read the response.

- **Success** — the tool confirms and returns a link to the deployment workflow. Capture it.
- **Auth failure** (e.g. "please sign in / re-authenticate") → **STOP.** Tell the user exactly what to click/run, and to ask you to retry afterwards. Don't loop.
- **Other error** → report the details and stop.

## Phase 4: Report

- **Success:** environment is being set up, link to the workflow, and a realistic ETA (environments usually take tens of minutes). If called from a larger workflow, continue to the next step.
- **Failure:** the exact error and a suggested remedy (re-auth, check ticket ID, …).

## Rules
1. **Always verify the response.** Never assume success.
2. **Stop on auth errors** — the user must re-authenticate.
3. **Push before setting up** — the environment deploys from the remote branch.
4. **Use the tooling's path, not a side door.** Environments created outside the dev-workflow tooling often don't deploy your branch.
