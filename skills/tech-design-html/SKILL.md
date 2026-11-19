---
name: tech-design-html
description: Write a technical design as one self-contained, light-mode HTML page in a fixed, proven format. The page has a summary first, numbered sections with a sticky table of contents, and clickable architecture lanes colored by owner. Sequence and state diagrams are drawn from data, and status, requirements, phases, alternatives and open questions go in tables. Headless Chrome checks layout and diagrams before it is shared. Use when asked to "write a tech design", "make the design doc as HTML", "turn this design into a page for review", "write the technical design for X", or to share a design with another team. Also use to add, update or remove the optional narrated audio walkthrough on such a page.
---

# Tech design as an HTML page

Build one self-contained HTML file: no external CSS, fonts or scripts. A reviewer reads it in one pass and gets the decisions from the summary. The technical detail they need to sign off sits below it: contracts, schemas, owners, phases and open questions.

The format is fixed. Copy the template, replace its content, and keep its styling and renderers. Most of the quality comes from following the rules below. Do not invent a new look.

## Files

| File | Use |
| --- | --- |
| `${CLAUDE_SKILL_DIR}/template/tech-design.html` | Copy this. It holds a short, fictional "webhook delivery" design that shows every component once. Replace all of it. |
| `${CLAUDE_SKILL_DIR}/references/components.md` | What each component is for, its markup, and the data format of the two diagram renderers. |
| `${CLAUDE_SKILL_DIR}/scripts/check_page.mjs` | Opens the page in headless Chrome at four widths and fails on any layout or diagram problem. |
| `${CLAUDE_SKILL_DIR}/references/audio-walkthrough.md` | Only when the user wants the optional audio walkthrough: how to write, voice, check and embed it. Its scripts and player template are listed there. |

## Workflow

1. **Gather and verify.**
   - Read the sources: notes, decks, decision records, channels and code.
   - Check every claim the page will state as a fact: repository and file names, numbers, flags, who said what. Use the code, data or message itself.
   - Keep a list of what you could not verify. It goes into the report, and on the page as "to confirm".
   - When a brief is the only source, say so in the header and the footer, and mark its content as proposed. Don't present it as agreed.
2. **Write the summary first.** Use 4–6 numbered points. Each one is a bold claim, followed by one or two sentences. Someone who stops reading there should know the design. If you cannot write it, the design is not settled yet: find out what is missing before building the page.
3. **Pick the sections.** Start from the standard order below, drop what the design does not need, and keep 8–16 sections.
4. **Fill in the template.**
   - `cp ${CLAUDE_SKILL_DIR}/template/tech-design.html <out>.html`
   - Replace the title, the header, the table of contents, the sections, and the last `<script>` block. That block holds only data: the `ARCH` map and the diagram calls.
   - Keep the `<style>` block, apart from `:root` if restyling is asked for. Keep the first `<script>` block as it is: it holds the renderers, the architecture click handler and the scrollspy.
   - The header needs an author and a date. If you don't know the author, write "Draft by <agent> for <requester>". For anything the author proposes themselves, write `proposed · author`.
5. **Check it.** Run `node ${CLAUDE_SKILL_DIR}/scripts/check_page.mjs <out>.html --shots <dir>`, and fix every failure. Then look at the screenshots:
   - `<name>-1440-top.jpg`, the first screen;
   - the numbered crops, one per diagram, architecture block and code pair;
   - `<name>-1000-top.jpg`, the narrow layout.

   A page can pass the script and still read badly.
6. **Offer the audio walkthrough. Don't build it unasked.** Once the page passes its checks, ask the user one question: do they want an optional narrated walkthrough added? Say what it is: about 10 minutes of audio, one chapter per section, and a player that loads nothing until a reader clicks "Audio walkthrough". Say that it needs `OPENAI_API_KEY` and `ffmpeg`. Skip the question when the user has already said yes or no.
   - **On a clear yes**, follow `references/audio-walkthrough.md`.
   - **On no or no answer**, ship the page without it. Never add it by default or as polish.
7. **Share it.** See _Publishing_.
8. **Report.** Give the link, the positions the page takes that nobody has agreed yet, and what you could not verify. If the page has a walkthrough, give its length and whether someone listened to it.

## Standard section order

| # | Section | What it holds | Components |
| --- | --- | --- | --- |
| – | Summary | 4–6 numbered claims | `.panel.tldr` |
| 1 | Context and goals | The problem in the reader's words. Who has it today: a table with the repository for each row, but only when the rows differ; otherwise a sentence. Goals and non-goals. | table, `.cols` of two panels |
| 2 | Agreed, proposed and open | Each item with a status tag (classes `agreed`, `dir` for direction, `proposed`, or none for open) and its source. If nothing is agreed yet, say so in one row; don't invent rows. | status table |
| 3 | Architecture | Lanes by owner, each component clickable, and a shared row for reused systems | `.arch` + `ARCH` |
| 4 | The core model | The definition, schema or configuration, as two contrasting examples side by side | `.cols.codepair`, `<details>` field reference |
| 5 | Contract or flow | The sequence diagram of the main flow; the interfaces each way; the API; the rules | `.seq`, code pair, panels |
| 6 | Lifecycle | The states that matter most to the design: an entity's, or a client's (for example connected → stale → live) | state diagram in a `div.seq` |
| 7 | Requirements | One row per requirement, with which layer enforces it and in which phase | table with owner tags |
| 8 | Security and reliability | The checks in order; what survives a failure, shown as a failure sequence | `ol`, `.seq` with a `warn` step, `.takeaway` |
| 9 | Data model and APIs | The stores by owner; the API surfaces | panels, surface table |
| 10 | Phases | Ordered by risk, each with a checkable "Done when" | table + `.takeaway` |
| 11 | Alternatives considered | What each option gets right, then why not | table |
| 12 | Open questions | Each with a proposed answer and who decides | table |
| – | Sources | Links, `repo` `path`, channels and dates | `footer` |

The template follows this order, numbered 1–12. Number the sections in sequence after dropping any.

## Writing rules

- **Conclusion first, at every level:** the summary, each section's `.lead` line, and a `.takeaway` where a section has one point to remember.
- **Declarative sentences.** Write "The platform publishes events from its outbox", not "Event publishing: platform". Labels are only for card headers.
- **Be honest about status.** Mark anything nobody has agreed as a proposal, and name who proposes it. Label examples as illustrative and made-up numbers as made up. Never present a guess as a fact.
- **No bare open questions.** Each one gets a proposed answer and a decider.
- **Every phase has a "Done when"** that someone can check: "A run survives `kubectl delete pod`", not "stable".
- **Be fair to alternatives.** Say what each one gets right before saying why not.
- **Explain internal names at first use**, in a few words.
- **Cite sources** in the footer, and in-line when a reader would ask "says who?".
- **Leave out effort estimates and dates** unless the audience asked for them.
- **Let the content set the length.** A full design usually comes out at 6,000–15,000 px at 1440 px wide. Being shorter is fine. Above 15,000 px, cut, or move reference material such as field lists into `<details>`.

## Format rules

- **Light mode.** Flat white cards on a light grey background. No emojis, gradients or shadows.
- **One accent color.** Color appears only where it means something: the owner of a lane or tag, a status, a warning step. Change colors only in `:root`. The diagrams read the same variables.
- **Interactive only where it pays off:** the architecture detail panel, `<details>` for reference material, and the scrollspy table of contents. Nothing else. Never use tabs or toggles to hide two things the reader should compare; put them side by side.
- **Code pairs:** keep lines to about 50 characters and comments to a few words, so two columns fit at 1440 px.
- **Diagrams:**
  - An arrow label must fit its arrow: about `gap ÷ 6.3` characters for each lane the arrow spans, so about 27 at the default gap of 175. Notes fit about `gap × 0.3` characters. Split a long step in two rather than raising `gap` past what fits the page.
  - One idea per step. Mark the failure step `warn`.
  - At most 5 lanes in a sequence diagram, with `gap` between 150 and 180. The checker fails a gap below 150, where lane headers overlap, and a diagram scaled below 75%. Six lanes cannot meet both at 1000 px.
  - A person, such as an engineer or a customer, can be a lane (`x`), or a note on the lane they call.
  - Lane colors: `a`, `b`, `c` for owners, `s` for a reused system, `x` for an external one (dashed).
  - Two-way state edges use the same `shift`.
  - Every diagram goes in a `div.seq`.
- **Tables** for any three or more parallel items with the same fields.

## Checks

```bash
node ${CLAUDE_SKILL_DIR}/scripts/check_page.mjs page.html --shots /tmp/td-shots   # widths 1920, 1440, 1280, 1000; files are named after the page
```

The script fails on any of these:
- a JS error;
- a sequence label longer than its arrow, or a note longer than its box;
- a diagram that is scaled below 75%, or not inside `div.seq`;
- an unknown tag class;
- a missing `ARCH` entry, or a missing scrollspy;
- horizontal scrolling of the page;
- a code block, table or diagram wider than its box;
- a diagram that did not render;
- overlapping or clipped diagram labels;
- a state-diagram label crossing an arrow or a box;
- a table-of-contents link to a missing id;
- a `{{PLACEHOLDER}}` left in the page.

It needs Node 22+ and Chrome; set `CHROME_PATH` for another browser. Read `references/components.md` → _Fixing check failures_ for the usual fixes. A page that passes the script can still read badly, so look at the screenshots too.

## Optional audio walkthrough

This is a narrated tour of the page that plays while the reader scrolls, Build it only after the user says yes (_Workflow_, step 6). The page must still read completely without it.

- `references/audio-walkthrough.md` covers the writing rules, voicing, assembly, embedding and checks. The writing rules matter most: explain how the design plays, don't read the page.
- `walkthrough_embed.py <page> --remove` takes it out again.
- When the page changes later, update the chapters that describe the changed sections and re-embed. Otherwise the narration describes an old page.

## Publishing

- If your team has an internal static-HTML host, publish the file there under a short kebab-case key, and replace it in place on updates. Then fetch the hosted URL and compare its bytes with the local file. Run `check_page.mjs` on the URL too: the host's content security policy can block what works locally.
  > **Adapt:** name your HTML host and its upload command here.
- Otherwise, share the file itself. It is self-contained.
- Link the page from the design's tracking doc or ticket.

## Gotchas

- **Two `<script>` blocks, in order.** The first holds the renderers and the wiring: do not edit it. The last holds only data and diagram calls: replace it. Merging the blocks, or putting content first, throws `Cannot access ... before initialization`.
- **`ARCH` keys must match `data-c`** on every `.comp`. The first component in lane `a` opens selected.
- **Lane count.** To change the number of architecture lanes, set `style="--arch-cols: 170px 1fr 1fr 1fr 190px"` on `#archGrid`. Don't edit the CSS rule: it collapses to two columns on narrow screens. A third owner gets `lane c` and `tag c`.
- **Wide sequence diagrams scale down to fit**, and their text shrinks with them. Keep to 5 lanes.
- **One owner per lane.** When one team's code runs inside another team's process, such as a client library, put it in the owner's lane. Say where it runs in its `small` line.
- **State diagram coordinates are the top-left corner of a 120×34 box.** Leave at least 60 px between boxes for labels. Nudge a label with `{ dx, dy }`.
