#!/usr/bin/env python3
"""Voice the audio-walkthrough chapters, and check each one by transcribing it back.

Usage: python3 walkthrough_voice.py <workdir> [--lang en|he] [--takes N] [--force] [chapter numbers ...]

Reads <workdir>/<lang>.json, a list of chapters: [{"title": ..., "section": <page section id>, "text": ...}, ...].
Writes <workdir>/<lang>/segNN.wav (the kept take) and segNN.txt (its transcript).

- Only chapters whose text (or voice settings) changed since the last run are voiced. Pass chapter numbers (0-based)
  or --force to re-voice others.
- --takes N voices each chapter N times and keeps the take whose transcript matches the script best. The default is
  1 for English and 3 for Hebrew, which the TTS handles less well.
- Prints one line per chapter: match ratio (difflib, script vs transcript), seconds, words, words per second, and the
  differing words when the ratio is below 0.97. English usually lands at 0.93-0.99; most differences are the
  transcriber's spelling (digits, product names). Re-voice a chapter when a real word is wrong or missing.

Needs OPENAI_API_KEY, ffmpeg and ffprobe. Uses gpt-4o-mini-tts to speak and gpt-4o-transcribe to check.
"""
import concurrent.futures as cf
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
import uuid

VOICES = {
    'en': ('ash', "Calm, clear, engaging guide voice, like a good tech podcast host walking a colleague through a "
                  "document. Moderate pace, natural pauses between ideas, warm but professional. Not salesy."),
    'he': ('coral', "דבר בעברית ישראלית טבעית וברורה, כמו מנחה פודקאסט טכני שמסביר מסמך לעמית: רגוע, ענייני, בקצב נינוח, "
                    "עם הפסקות קצרות בין רעיונות. מונחים טכניים בהגייה ישראלית מקובלת."),
}
TTS_MODEL, STT_MODEL = 'gpt-4o-mini-tts', 'gpt-4o-transcribe'


def die(msg):
    print(msg, file=sys.stderr)
    sys.exit(2)


def api(path, body, content_type, key, timeout=240):
    req = urllib.request.Request('https://api.openai.com/v1/' + path, data=body,
                                 headers={'Authorization': 'Bearer ' + key, 'Content-Type': content_type})
    last = None
    for _ in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # network blips and 5xx: retry; a bad key fails all three and is reported
            last = e
    raise RuntimeError(f'{path}: {last}')


def speak(text, voice, instructions, key):
    body = json.dumps({'model': TTS_MODEL, 'voice': voice, 'input': text, 'instructions': instructions,
                       'response_format': 'wav'}).encode()
    return api('audio/speech', body, 'application/json', key)


def transcribe(mp3_path, lang, key):
    boundary = uuid.uuid4().hex
    parts = []
    for name, value in (('model', STT_MODEL), ('language', lang), ('response_format', 'text')):
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    with open(mp3_path, 'rb') as f:
        audio = f.read()
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="seg.mp3"\r\n'
                 f'Content-Type: audio/mpeg\r\n\r\n'.encode() + audio + b'\r\n')
    parts.append(f'--{boundary}--\r\n'.encode())
    return api('audio/transcriptions', b''.join(parts), 'multipart/form-data; boundary=' + boundary, key).decode()


def words(text):
    return re.findall(r"[\u0590-\u05FFa-z0-9']+", re.sub(r'[\u0591-\u05C7]', '', text.lower()))


def duration(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                         capture_output=True, text=True, check=True).stdout
    return float(out)


def differences(a, b):
    out = []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if op != 'equal':
            out.append(f"{' '.join(a[i1:i2]) or '∅'} → {' '.join(b[j1:j2]) or '∅'}")
    return out


def main():
    args = sys.argv[1:]
    if not args or args[0] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0 if args else 2)
    workdir, rest = args[0], args[1:]
    lang, takes, force, only = 'en', None, False, []
    i = 0
    while i < len(rest):
        a = rest[i]
        if a == '--lang':
            lang = rest[i + 1]; i += 2
        elif a == '--takes':
            takes = int(rest[i + 1]); i += 2
        elif a == '--force':
            force = True; i += 1
        elif a.isdigit():
            only.append(int(a)); i += 1
        else:
            die(f'unknown argument {a}')
    if lang not in VOICES:
        die(f'--lang must be one of {", ".join(VOICES)}')
    takes = takes or (3 if lang == 'he' else 1)
    key = os.environ.get('OPENAI_API_KEY') or die('OPENAI_API_KEY is not set')
    for tool in ('ffmpeg', 'ffprobe'):
        shutil.which(tool) or die(f'{tool} not found (brew install ffmpeg)')

    script = os.path.join(workdir, f'{lang}.json')
    chapters = json.load(open(script, encoding='utf-8'))
    for n, c in enumerate(chapters):
        missing = [k for k in ('title', 'section', 'text') if not c.get(k)]
        if missing:
            die(f'{script}: chapter {n} has no {", ".join(missing)}')
    voice, instructions = VOICES[lang]
    out_dir = os.path.join(workdir, lang)
    os.makedirs(os.path.join(out_dir, 'takes'), exist_ok=True)

    def fingerprint(c):
        return hashlib.sha256(json.dumps([c['text'], voice, instructions, TTS_MODEL]).encode()).hexdigest()

    def stale(n):
        f = os.path.join(out_dir, f'seg{n:02d}')
        try:
            return open(f + '.sha').read().strip() != fingerprint(chapters[n]) or not os.path.exists(f + '.wav')
        except FileNotFoundError:
            return True

    todo = [n for n in range(len(chapters)) if n in only] if only else \
        [n for n in range(len(chapters)) if force or stale(n)]
    bad = [n for n in todo if n >= len(chapters)]
    if bad:
        die(f'no chapter {bad[0]} (there are {len(chapters)})')
    if not todo:
        print(f'{lang}: all {len(chapters)} chapters are up to date (pass chapter numbers or --force to re-voice)')
        return

    def take(job):
        n, t = job
        base = os.path.join(out_dir, 'takes', f'seg{n:02d}_{t}')
        with open(base + '.wav', 'wb') as f:
            f.write(speak(chapters[n]['text'], voice, instructions, key))
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', base + '.wav', '-b:a', '64k', base + '.mp3'], check=True)
        heard = transcribe(base + '.mp3', lang, key)
        a, b = words(chapters[n]['text']), words(heard)
        return n, t, difflib.SequenceMatcher(None, a, b, autojunk=False).ratio(), heard

    jobs = [(n, t) for n in todo for t in range(takes)]
    results, failed = {}, []
    with cf.ThreadPoolExecutor(5) as ex:
        futures = {ex.submit(take, j): j for j in jobs}
        for fut in cf.as_completed(futures):
            try:
                n, t, ratio, heard = fut.result()
                results.setdefault(n, []).append((ratio, t, heard))
            except Exception as e:
                failed.append((futures[fut], str(e)[:200]))

    worst = 1.0
    for n in sorted(results):
        ratio, t, heard = max(results[n])
        src = os.path.join(out_dir, 'takes', f'seg{n:02d}_{t}.wav')
        dst = os.path.join(out_dir, f'seg{n:02d}')
        shutil.copyfile(src, dst + '.wav')
        open(dst + '.txt', 'w', encoding='utf-8').write(heard)
        open(dst + '.sha', 'w').write(fingerprint(chapters[n]))
        secs, w = duration(dst + '.wav'), words(chapters[n]['text'])
        worst = min(worst, ratio)
        pick = f' take {t + 1}/{takes}' if takes > 1 else ''
        print(f'{lang} {n:02d} match {ratio:.3f}  {secs:5.1f}s  {len(w):3d} words  {len(w) / secs:.2f} w/s{pick}  '
              f'{chapters[n]["title"]}')
        if ratio < 0.97:
            for d in differences(w, words(heard))[:12]:
                print('       ' + d)
    for (n, t), err in failed:
        print(f'{lang} {n:02d} take {t + 1} FAILED: {err}', file=sys.stderr)
    missing = [n for n in todo if n not in results]
    if missing:
        die(f'no take succeeded for chapter(s) {missing}')
    print(f'{lang}: voiced {len(results)} chapter(s); lowest match {worst:.3f}')


if __name__ == '__main__':
    main()
