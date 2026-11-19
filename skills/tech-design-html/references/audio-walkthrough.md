# Optional audio walkthrough

A narrated tour of the page, about 10 minutes, one chapter per section or per small group of sections. It plays while the reader scrolls. It does not replace the page, and the page must read completely without it.

It is optional twice over:
- **For the author.** Build it only when the user said yes to it (see SKILL.md → _Workflow_, step 6). Never add it by default or as part of "polish".
- **For the reader.** Nothing loads or plays until they click "Audio walkthrough" at the top of the table of contents. A reader who never clicks downloads nothing extra to play, and the page looks as it did before.

Needs `OPENAI_API_KEY`, `ffmpeg` and `ffprobe`, Node 22+ and Chrome. Costs a few cents of OpenAI usage for 10 minutes of audio.

> **Adapt:** the scripts call the OpenAI API directly. To go through a proxy or gateway, change `api()` in `walkthrough_voice.py`.

## Files

| File | Use |
| --- | --- |
| `scripts/walkthrough_voice.py` | Voices each chapter and transcribes it back to check it. Re-voices only chapters whose text changed. |
| `scripts/walkthrough_build.py` | Joins the chapters, normalises loudness, and writes the m4a, the mp3, the small mp3 for the page, and the chapter list. |
| `scripts/walkthrough_embed.py` | Adds the player and the button to the page, updates them in place, or removes them (`--remove`). |
| `scripts/check_walkthrough.mjs` | Plays the walkthrough in headless Chrome and fails when the player misbehaves. |
| `template/walkthrough-player.html` | The player. The embed script fills it in, so you never edit the page's player by hand. |

Keep the working files (`en.json`, `en/`, the outputs) in a folder next to the page, for example `<page>-walkthrough/`, so a later update can re-voice only what changed.

## 1. Write the script (the part that matters most)

Write the script after the page has passed `check_page.mjs`, from the page as it is.

- **Explain how the design plays; don't read the page.** For each section, say what happens, in what order and why, and tell the listener where to look: "follow the diagram from the top", "look at the two examples side by side".
- **Say the section number at the start of every chapter** ("Section seven is …"), so the listener can find their place.
- **Use one or two running examples** across the whole walkthrough, for example a scheduled job and a live customer request, and keep coming back to them.
- **Say what matters most in each section, and which parts can be skipped** ("sixteen is reference material; you can skip it").
- **Short spoken sentences.** No code, no IDs, no paths, and no numbers that are only on the page.
- **Write for any listener.** Nothing addressed to one person: no "you asked" or "your point".
- **Spell out abbreviations** so the voice says them right: "A P I", "C X L L M", "run I D".
- **Keep it short:** about 60 to 150 words per chapter, 10 to 12 minutes in total. Group small sections into one chapter.
- **Add no fact that is not on the page.** If a chapter needs a fact the page lacks, fix the page first.

The format is `<workdir>/en.json`, a list of chapters. `section` is the `id` of the page section the chapter explains; choosing the chapter scrolls there.

```json
[
  {"title": "Summary", "section": "tldr", "text": "..."},
  {"title": "Section 7: The contract", "section": "contract", "text": "..."}
]
```

An example chapter:

> Section five is the heart of the document, and the one the Infra team needs to agree to. Follow the diagram from the top. The service hands a delivery to the worker pool, with a delivery I D that works as an idempotency key. So even if it hands the same delivery over twice, there is one delivery. Now the key rule. Every attempt is saved before it is sent. And a delivery succeeds only when the subscriber answers with a two hundred. Anything else is retried, and section six shows that a delivery ends delivered or failed. It never just disappears. The price is in section eight. A worker that crashes right after sending can send the same delivery again, so subscribers must ignore repeats by event I D.

## 2. Voice and check each chapter

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/walkthrough_voice.py <workdir>                 # English, voice "ash"
python3 ${CLAUDE_SKILL_DIR}/scripts/walkthrough_voice.py <workdir> --lang he       # Hebrew, voice "coral", 3 takes, keeps the best
python3 ${CLAUDE_SKILL_DIR}/scripts/walkthrough_voice.py <workdir> 4 7             # re-voice chapters 4 and 7 (0-based)
```

- It uses `gpt-4o-mini-tts`, one request per chapter in parallel, with calm "tech podcast host" voice instructions.
- It transcribes each chapter back with `gpt-4o-transcribe` and prints the match ratio against the script. English lands at about 0.93 to 0.99. Below 0.97 it prints the differing words.
- **Read the differences.** Most are the transcriber's own spelling: digits for numbers, product names. Re-voice a chapter when a real word is wrong or missing. If one word keeps coming out wrong, respell it in the script ("C X L L M").
- It voices only chapters whose text changed since the last run.

## 3. Assemble

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/walkthrough_build.py <workdir>          # --lang he for Hebrew
```

It joins the chapters with 1.2 s of silence, normalises loudness (`loudnorm=I=-16:TP=-1.5`) at mono 24 kHz, and writes:
- `walkthrough-en.m4a`, with embedded chapters, for listening in a player;
- `walkthrough-en.mp3` at 96 kbps;
- `walkthrough-en-embed.mp3` at 32 kbps mono, for the page: about 2.5 MB for 11 minutes;
- `walkthrough-en-chapters.json` (`[[startSeconds, title, sectionId], …]`) and `walkthrough-en-chapters.txt`.

## 4. Embed

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/walkthrough_embed.py <page>.html <workdir>     # --lang he --label Hebrew for Hebrew
```

- The first run puts the player before `</body>`, and adds the button under the brand at the top of the table of contents: "Audio walkthrough · Optional · N min · English".
- Later runs replace the audio, the chapters, the duration and the minutes in place. Run it again after every change to the audio.
- `--remove` takes the player and the button out again, and leaves the page as it was before.
- It fails when a chapter's `section` is not an `id` on the page, or when the page would pass 5 MiB. Set `--max-mib` to your host's limit.

Why the player looks the way it does:
- **Many HTML hosts block `data:` and `blob:` audio** (a content security policy without `media-src`), and many cap the file size. The page must stay one file, under 5 MiB by default. So the MP3 sits as base64 in a `<script type="application/octet-stream">`. That is never executed, and costs about 1.33 times the MP3's size. On first play, Web Audio decodes it and plays it through an `AudioBufferSourceNode`.
- **Speeds keep the pitch.** Changing `playbackRate` on a buffer source raises the pitch, so speeds other than 1× play a time-stretched copy made with WSOLA (waveform-similarity overlap-add). It is computed in chunks that yield to the page. A new speed takes a few seconds to prepare the first time; playback continues at the old speed meanwhile, with a "Preparing …" note.

The player is a bar at the bottom right, hidden until opened. It has:
- play and pause, back 15 s and forward 15 s;
- the current chapter, which opens the chapter list when clicked;
- elapsed and total time;
- a seek bar with a tick at each chapter;
- speed from 0.75× to 2×, with the pitch kept;
- "Follow", which scrolls the page to the section being explained;
- close, which also pauses.

Choosing a chapter seeks to it and scrolls to its section. The player is hidden when printing, and uses the page's own colour variables.

## 5. Check

```bash
node ${CLAUDE_SKILL_DIR}/scripts/check_page.mjs <page>.html --shots <dir>      # the page itself still passes
node ${CLAUDE_SKILL_DIR}/scripts/check_walkthrough.mjs <page>.html             # the walkthrough
```

`check_walkthrough.mjs` fails unless all of these hold:
- At load the bar is hidden and nothing is decoded.
- After opening and pressing play, the clock advances about 1 s per second.
- +15 s seeks forward.
- At 1.5× the clock advances about 3 s in 2 s, and the stretched copy is about the duration ÷ 1.5.
- Choosing a chapter seeks to it and scrolls its section to the top.
- Pause stops the clock, and close hides the bar.
- There are no page errors, and nothing overflows with the bar open at 1000 to 1920 px.

After publishing, run both checks on the hosted URL as well, and compare the hosted bytes with the local file.

Listen to at least the first chapter and one from the middle yourself, or ask the user to. The checks prove the player works, not that the narration is good.

## Updating

When the page changes:
1. Update the chapters that describe the changed sections, and keep the section numbers and `section` ids in step with the page.
2. Run `walkthrough_voice.py`. It re-voices only the changed chapters.
3. Run `walkthrough_build.py`, then `walkthrough_embed.py`, then both checks.

## Limits

- The button sits in the table of contents, which the page hides below 1100 px. On narrow screens the walkthrough cannot be opened.
- Checked in Chrome only.
- At 32 kbps a minute of narration adds about 0.33 MB to the page, so a typical design stays under 5 MiB up to about 15 minutes. For longer audio, cut the script.
