# Components

Every component is in `template/tech-design.html`. Copy the markup from there. This file says what each one is for, and how the two diagram renderers read their data.

## Page frame

- **Table of contents:** `nav.toc#toc` holds one `<a href="#id">` per section: the summary (`#tldr`) and every `<h2 id>`. A scrollspy highlights the current section. It is hidden below 1100 px.
- **Header:** an `h1`, then `.meta`: status, audience, author, date, what it follows, and the line "Names, schemas and endpoints are proposals unless §2 marks them agreed."
- **Section heading:** `<h2 id="x"><span class="n">3</span>Title</h2>`, then `<p class="lead">`, which holds the section's conclusion in one or two sentences.
- **Footer:** sources, written as links, `repo` `path`, channels and dates.

## Text blocks

| Component | Markup | Use for |
| --- | --- | --- |
| Summary | `section.panel.tldr` + `.label` + `ol` | The 4–6 numbered claims at the top |
| Panel | `.panel` + `span.label` + content | One idea with a short header |
| Two or three columns | `.cols` or `.cols3` wrapping panels | Goals and non-goals; options shown side by side |
| Takeaway | `.takeaway` | The one point to remember from a section |
| Note | `p.note` | A caption under a diagram or table |
| Reference | `details > summary + div` | Field lists and long reference material that most readers skip |
| Tight lists | `ul.tight` / `ol.tight` | Lists inside panels |

## Tags

`<span class="tag ...">`:
- **Status:**
  - `agreed` (green);
  - `dir` (blue): a direction, meaning a steer from a lead, with the text `direction`;
  - `proposed` (amber), with the proposer in the text: `proposed · Platform`, or `proposed · author`;
  - no class for open.
- **Owner:** `a`, `b` and `c` (the colors of the owning layers), `x` (dashed, external).

The checker rejects any other class, so `class="tag direction"` fails.

Use them in the status table, the Owner column of the requirements table, and in lane and panel headers.

## Tables

All of them use plain `<table>`, with `<th style="width:…">` on the narrow columns.

- **Status:** State · Item · Source.
- **Who today:** Who · What · How it runs today · Repository.
- **Requirements:** Requirement · What it means · Owner (tags) · Phase.
- **Data surfaces:** Surface · Called by · Endpoints.
- **Phases:** Phase (`<b>1 · Name</b>`) · Scope · Built · Done when.
- **Alternatives:** Option · What it gets right · Why not.
- **Open questions:** Question · Proposed answer · Decides.

## Code pair

```html
<div class="cols codepair">
  <div><span class="label">Kind A · context</span><pre><code>…</code></pre></div>
  <div><span class="label">Kind B · context</span><pre><code>…</code></pre></div>
</div>
```

Highlight by hand with `<span class="com|key|str|kw">`, and escape `<` as `&lt;`. Keep lines to about 50 characters. The pair stacks below 1180 px.

## Architecture

```html
<div class="arch" id="archGrid">     <!-- other lane counts: style="--arch-cols: 170px 1fr 1fr 1fr 190px" -->
  <div class="lane"><h4>Inputs</h4> <div class="comp" data-c="key">Name<small>one line</small></div> </div>
  <div class="lane a"><h4>Layer A <span class="tag a">Owner</span></h4> … </div>
  <div class="lane b"><h4>Layer B <span class="tag b">Owner</span></h4> … </div>
  <div class="lane x"><h4>External</h4> … </div>
  <div class="shared"><span class="label">Reused</span> <div class="comp" data-c="…">…</div> </div>
</div>
<div class="panel detail" id="archDetail"></div>
```

A third owner is `<div class="lane c">` with `<span class="tag c">`. Add one entry per `data-c` in the last script block:

```js
const ARCH = { key: ['Title', 'Owner', 'What it does (HTML allowed)', 'Interface', 'Phase'] };
```

Use at most 5 lanes plus the shared row. When one team's code runs in another team's process, put it in the owner's lane and say where it runs in `small`. The click handler lives in the first script block, so the content block only needs `ARCH`.

## Sequence diagram

```js
seq('elementId',
  [{ n: 'Lane name', s: 'subtitle', o: 'a' | 'b' | 'c' | 's' | 'x' }, …],   // owners a/b/c, 's' reused, 'x' external (dashed)
  [[from, to, 'label'],            // a call: solid arrow
   [from, to, 'label', 'ret'],     // a return: dashed arrow
   [i, i, 'note text'],            // a note box on lane i
   [i, i, 'what went wrong', 'warn'],  // a highlighted failure step
   …],
  { gap: 175, row: 34 });          // optional: pixels between lanes, pixels per step
```

The steps are numbered automatically. Use one `<div class="seq" id="elementId"></div>` per diagram, followed by a `p.note` that says what the diagram proves.

**Lanes and gap.** Use at most 5 lanes, with `gap` between 150 and 180. Below 150 the 144 px lane headers overlap.

**Label budget.** An arrow label starts just right of the left lane and must end before the arrowhead: about `gap ÷ 6.3` characters for each lane the arrow spans (27 at gap 175, 31 at gap 200). A note fits about `gap × 0.3` characters. The checker flags any label that is longer than its arrow or its box.

## State diagram

```js
stateDiagram('elementId', {
  nodes: { queued: [20, 80], running: [190, 80], waiting: [190, 180], done: [420, 20] },  // top-left of a 120×34 box
  edges: [['queued', 'running'],
          ['running', 'done', 'label'],
          ['running', 'waiting', 'needs input', { shift: -12 }],   // a two-way pair: the same shift on both edges
          ['waiting', 'running', 'resumed', { shift: -12 }],
          ['running', 'done', 'label', { dx: 8, dy: -4 }]],        // nudge a label
  terminal: ['done'], accent: 'running', warn: 'waiting'
});
```

Render it into a `<div class="seq" id="elementId"></div>`, like a sequence diagram, so the overflow checks cover it. Edges are straight lines between box edges. A label sits beside its line, on the outer side of a shifted line.

## Fixing check failures

| Failure | Fix |
| --- | --- |
| code block overflows | Shorten the comment, or break the line. Do not shrink the font further. |
| diagram overflows | Lower `gap`, use fewer lanes, or shorten the label of the right-most lane. |
| sequence label longer than its arrow, or note outgrows its box | Shorten it, or split the step in two (a call, then a note). Raise `gap` only if the diagram still fits. |
| diagram scaled below 75% | Use fewer lanes, or a smaller `gap`. Merge two lanes that never talk to each other. |
| unknown tag class | Use `agreed`, `proposed` or `dir`, or `a`, `b`, `c` or `x`. |
| svg labels overlap | Sequence: shorten the label, or split the step in two. State: `shift` a two-way pair, or move a node. |
| label crosses an arrow or runs into a box | Move the nodes further apart, or nudge with `dx` / `dy`. |
| `ARCH` has no entry, or clicking shows no detail | Add the missing key. If every component fails, the first script block was edited: restore it from the template. |
| no active link in the table of contents | The first script block was edited; restore it. |
| JS error `Cannot access … before initialization` | The content script runs before the renderers. Keep the two `<script>` blocks in order. |
| page scrolls horizontally | A wide inline `code` or a long URL: wrap it in a `pre`, or shorten it. |
