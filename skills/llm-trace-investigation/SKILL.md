---
name: llm-trace-investigation
description: Search, fetch, and analyze LLM/agent traces in your LLM tracing platform. Use when the user asks to "check a trace", "find the trace for user X", "investigate a trace", "debug this agent run", or when another skill (bug investigation, staging QA, post-merge monitoring) needs to verify an LLM-powered flow at the reasoning level.
---

# LLM Trace Investigation

For LLM/agent-powered services, a 200 response tells you little. The trace tells you **what the model saw, what it reasoned, which tools it called with which arguments, and what it decided**. This skill finds and reads those traces.

> **Adapt:** This is the most system-specific skill in the collection. Write your own version of the sections marked **[fill in]**: how to authenticate, the CLI/API calls for listing and fetching traces, and — most importantly — **your trace metadata schema** (which keys hold user ID, conversation ID, channel, final status, etc.). Getting the schema written down is most of the value: it's what stops the agent from searching the wrong field and concluding "no traces exist".

## Environment & credentials [fill in]

- Production and staging normally have **separate projects/hosts with separate keys**. Keys and hosts are paired; mixing them gives empty results or 401s, which look like "no data".
- **Default to production** unless the user asks for staging or the context is staging QA.
- If credentials live in a local env file that defines both environments, don't rely on sourcing it (the last block wins). Pass the right key/secret/host explicitly on every command.

## Step 1: Find traces

Decide which identifier you have and search the field that actually holds it. Typical lookups:

| You have | Search by |
|---|---|
| User / account ID | the metadata key that stores it — often **not** the platform's top-level `userId` field, which may be empty |
| Ticket / conversation number | the metadata key for it — some channels may not set it and need a lookup (e.g. in the data warehouse) to map to an interaction/session ID first |
| Agent / flow name | trace name |
| Channel (chat, email, voice, …) | channel metadata key |
| Outcome | final-status metadata key (e.g. `success`, `tool_failure`, `escalation`) |
| Time window | from/to timestamps |

Combine filters (AND) to narrow down. Request only the fields you need when listing (core metadata), then fetch full input/output/observations for the traces you'll inspect. Paginate large result sets.

## Step 2: Fetch a single trace

Fetch the full trace including child observations/spans. Extract:
- Who/what: user/entity, channel, agent/strategy name, model
- Outcome: final status, chosen action, reasoning text, cited sources
- Cost/latency: total duration, number of LLM calls, cost
- Tools: which tools were called, in what order, with which arguments, and what they returned

## Step 3: Analyze

Ask, in order:
1. **Input** — did the model get the right context? (Missing customer data, wrong retrieved docs, and truncated prompts cause most "the model is dumb" bugs.)
2. **Tool calls** — right tools, right arguments, tool errors swallowed?
3. **Reasoning** — does the stated reasoning follow from the input? Hallucinated facts?
4. **Action** — does the final output match the expected behavior?
5. **Comparison** — compare with a known-good trace for the same scenario, or with traces from before a change.

Remember non-determinism: one odd trace is an anecdote. Sample several before drawing a conclusion.

## Step 4: Present

```markdown
## Trace Analysis

**Trace ID**: `<id>`  ·  **Env**: prod / staging
**Entity**: `<id>`  ·  **Channel**: `<channel>`  ·  **Agent**: `<name>`
**Status**: `<final status>`  ·  **Duration**: `<ms>`  ·  **Tools**: <list>

### Observations
<key findings from input, tool calls, reasoning, action>

### Issue
<what's wrong, and at which step it went wrong>
```

## Troubleshooting checklist

| Symptom | Usual cause |
|---|---|
| 401 / invalid credentials | key and host from different environments |
| Empty results, no error | wrong environment's keys, or filtering on a field that isn't populated |
| Known user returns nothing | the user ID lives in metadata, not the top-level user field |
| A channel's conversations can't be found by ticket number | that channel doesn't store the ticket number; map it via another ID first |
| Staging test traces missing | staging services report to the staging project — use staging credentials |
| Page-size errors | respect the API's max page size and paginate |
