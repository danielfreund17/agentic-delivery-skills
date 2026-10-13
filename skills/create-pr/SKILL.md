---
name: create-pr
description: Create a pull request with a comprehensive description based on the full branch diff. Use when the user says "create PR", "open PR", "submit PR", or when another skill needs to create a pull request.
---

# Create Pull Request

Analyze the **whole** branch diff against the base branch, push, and open a PR with a description that fits the change type.

**Input:** none — works on the current branch.
**Output:** the PR URL.

## Step 1: Uncommitted changes
`git status`. If there are uncommitted changes, commit them (conventional format).

## Step 2: Push
`git push` (with `-u origin <branch>` if there's no upstream).

## Step 3: Analyze the full branch
Resolve the base branch (`git symbolic-ref refs/remotes/origin/HEAD`), then:

```sh
git diff origin/<base>...HEAD
git diff --name-only origin/<base>...HEAD
git log --oneline origin/<base>..HEAD
```

Describe **all** the changes, not just the last commit.

## Step 4: Classify
- **Enhancement / feature** — new files, classes, capabilities.
- **Bug fix** — fixes existing behavior ("fix", "resolve", "bug").

## Step 5: Write the description

**Enhancement:**
```markdown
## Overview
<what this adds>

**Key capabilities:**
- …

## Changes
**<Category>:**
- <file> — <what changed>

## Testing
- <coverage, how to run>
```

**Bug fix:**
```markdown
## Problem
<the issue>

## Solution
<what changed to fix it>

## Changes
**<Category>:**
- <file> — <what changed>

## Testing
- <coverage, verification steps>

## Impact
<who/what is affected>
```

If a ticket exists, link it.

## Step 6: Open the PR
Write the body to a temp file and create the PR with your code host's CLI/API, passing the title and the body file. The title should state the branch's overall purpose (conventional-commit style).

## Rules
1. Always analyze the **full** branch diff.
2. Match the template to the change type.
3. Concise but complete.
4. Conventional commits for anything committed along the way.
