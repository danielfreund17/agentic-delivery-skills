#!/usr/bin/env python3
"""Assemble the voiced walkthrough chapters into the files a player and the page need.

Usage: python3 walkthrough_build.py <workdir> [--lang en|he] [--gap 1.2]

Reads <workdir>/<lang>.json and the chapter audio <workdir>/<lang>/segNN.wav made by walkthrough_voice.py.
Joins the chapters with --gap seconds of silence, loudness-normalises (loudnorm I=-16, TP=-1.5) at mono 24 kHz, and
writes into <workdir>:
  walkthrough-<lang>.m4a            AAC 96 kbps with embedded chapters, for listening in a player
  walkthrough-<lang>.mp3            96 kbps
  walkthrough-<lang>-embed.mp3      32 kbps mono, for the page (about 2.5 MB for 11 minutes)
  walkthrough-<lang>-chapters.json  [[startSeconds, title, sectionId], ...], read by walkthrough_embed.py
  walkthrough-<lang>-chapters.txt   m:ss  title, one per line
Needs ffmpeg and ffprobe.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile


def die(msg):
    print(msg, file=sys.stderr)
    sys.exit(2)


def ff(*args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=True)


def duration(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                         capture_output=True, text=True, check=True).stdout
    return float(out)


def main():
    args = sys.argv[1:]
    if not args or args[0] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0 if args else 2)
    workdir, lang, gap = args[0], 'en', 1.2
    rest = args[1:]
    for flag, value in zip(rest[::2], rest[1::2]):
        if flag == '--lang':
            lang = value
        elif flag == '--gap':
            gap = float(value)
        else:
            die(f'unknown argument {flag}')
    if len(rest) % 2:
        die(f'{rest[-1]} needs a value')
    for tool in ('ffmpeg', 'ffprobe'):
        shutil.which(tool) or die(f'{tool} not found (brew install ffmpeg)')

    chapters = json.load(open(os.path.join(workdir, f'{lang}.json'), encoding='utf-8'))
    files = [os.path.join(workdir, lang, f'seg{n:02d}.wav') for n in range(len(chapters))]
    missing = [f for f in files if not os.path.exists(f)]
    if missing:
        die(f'missing chapter audio: {", ".join(missing)}; run walkthrough_voice.py {workdir} --lang {lang}')

    base = os.path.join(workdir, f'walkthrough-{lang}')
    with tempfile.TemporaryDirectory() as tmp:
        silence = os.path.join(tmp, 'gap.wav')
        ff('-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', str(gap), silence)
        listing, marks, t = [], [], 0.0
        for n, src in enumerate(files):
            norm = os.path.join(tmp, f'{n:02d}.wav')
            ff('-i', src, '-ar', '24000', '-ac', '1', norm)
            marks.append((t, chapters[n]['title'], chapters[n]['section']))
            t += duration(norm) + gap
            listing += [f"file '{norm}'", f"file '{silence}'"]
        lst = os.path.join(tmp, 'list.txt')
        open(lst, 'w').write('\n'.join(listing))
        meta = os.path.join(tmp, 'meta.txt')
        esc = lambda s: s.replace('\\', '\\\\').replace('=', '\\=').replace(';', '\\;').replace('#', '\\#').replace('\n', ' ')
        open(meta, 'w', encoding='utf-8').write(';FFMETADATA1\n' + ''.join(
            f'[CHAPTER]\nTIMEBASE=1/1000\nSTART={int(s * 1000)}\n'
            f'END={int((marks[k + 1][0] if k + 1 < len(marks) else t) * 1000)}\ntitle={esc(title)}\n'
            for k, (s, title, _) in enumerate(marks)))
        wav = os.path.join(tmp, 'all.wav')
        ff('-f', 'concat', '-safe', '0', '-i', lst, '-af', 'loudnorm=I=-16:TP=-1.5', '-ar', '24000', '-ac', '1', wav)
        ff('-i', wav, '-i', meta, '-map_metadata', '1', '-c:a', 'aac', '-b:a', '96k', base + '.m4a')
        ff('-i', wav, '-b:a', '96k', base + '.mp3')
        ff('-i', wav, '-ac', '1', '-ar', '24000', '-b:a', '32k', base + '-embed.mp3')

    json.dump([[round(s, 2), title, section] for s, title, section in marks],
              open(base + '-chapters.json', 'w', encoding='utf-8'), ensure_ascii=False)
    open(base + '-chapters.txt', 'w', encoding='utf-8').write(
        '\n'.join(f'{int(s // 60)}:{int(s % 60):02d}  {title}' for s, title, _ in marks) + '\n')
    size = os.path.getsize(base + '-embed.mp3')
    print(f'{lang}: {len(marks)} chapters, {duration(base + "-embed.mp3") / 60:.1f} min, '
          f'embed mp3 {size / 1e6:.2f} MB (about {size * 4 / 3 / 1e6:.2f} MB in the page)')


if __name__ == '__main__':
    main()
