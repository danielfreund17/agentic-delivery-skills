#!/usr/bin/env python3
"""Add the optional audio walkthrough to a tech-design page, refresh it, or remove it.

Usage: python3 walkthrough_embed.py <page.html> <workdir> [--lang en] [--label English] [--max-mib 5]
       python3 walkthrough_embed.py <page.html> --remove

Reads <workdir>/walkthrough-<lang>-embed.mp3 and walkthrough-<lang>-chapters.json from walkthrough_build.py.

- First run: fills ../template/walkthrough-player.html (audio as base64, chapters, duration), puts it before
  </body>, and adds the "Audio walkthrough" button at the top of the table of contents.
- Later runs: replace the audio, the chapters, the duration and the minutes on the button in place.
- --remove: takes the player and the button out again.

Fails when a chapter points at a section id that is not on the page, or when the page would exceed --max-mib
(default 5 MiB, a common limit for static-HTML hosts; shorten the script or lower the embed bitrate).
"""
import base64
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, '..', 'template', 'walkthrough-player.html')
BLOCK = re.compile(r'<!-- walkthrough:start.*?<!-- walkthrough:end -->\n?', re.S)
BUTTON = re.compile(r'[ \t]*<button class="walk-btn" id="walkOpen".*?</button>\n?', re.S)


def die(msg):
    print(msg, file=sys.stderr)
    sys.exit(2)


def duration(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                         capture_output=True, text=True, check=True).stdout
    return float(out)


def main():
    args = sys.argv[1:]
    if not args or args[0] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0 if args else 2)
    page = args[0]
    html = open(page, encoding='utf-8').read()

    if '--remove' in args:
        out, n1 = BLOCK.subn('', html)
        out, n2 = BUTTON.subn('', out)
        if not (n1 or n2):
            print(f'{page}: no walkthrough to remove')
            return
        open(page, 'w', encoding='utf-8').write(out)
        print(f'{page}: walkthrough removed')
        return

    if len(args) < 2 or args[1].startswith('--'):
        die('usage: walkthrough_embed.py <page.html> <workdir> [--lang en] [--label English] [--max-mib 5]')
    workdir, rest = args[1], args[2:]
    lang, label, max_mib = 'en', None, 5.0
    if len(rest) % 2:
        die(f'{rest[-1]} needs a value')
    for flag, value in zip(rest[::2], rest[1::2]):
        if flag == '--lang':
            lang = value
        elif flag == '--label':
            label = value
        elif flag == '--max-mib':
            max_mib = float(value)
        else:
            die(f'unknown argument {flag}')
    label = label or {'en': 'English', 'he': 'Hebrew'}.get(lang, lang)

    mp3 = os.path.join(workdir, f'walkthrough-{lang}-embed.mp3')
    chap_file = os.path.join(workdir, f'walkthrough-{lang}-chapters.json')
    for f in (mp3, chap_file):
        os.path.exists(f) or die(f'missing {f}; run walkthrough_build.py {workdir} --lang {lang}')
    chapters = json.load(open(chap_file, encoding='utf-8'))
    ids = set(re.findall(r'\sid="([^"]+)"', html))
    unknown = [c[2] for c in chapters if c[2] not in ids]
    if unknown:
        die(f'chapters point at section ids that are not on the page: {", ".join(unknown)}')
    if 'nav class="toc"' not in html and 'id="walkOpen"' not in html:
        die('the page has no <nav class="toc"> to hold the "Audio walkthrough" button')

    secs = duration(mp3)
    b64 = base64.b64encode(open(mp3, 'rb').read()).decode()
    # one line, and no "</" so a title can never close the script element
    chapters_js = json.dumps(chapters, ensure_ascii=False).replace('</', '<\\/')
    dur_js = f'{secs:.2f}'
    minutes = max(1, round(secs / 60))
    button = (f'<button class="walk-btn" id="walkOpen" type="button"><span class="wb-ico"></span>'
              f'<span>Audio walkthrough<small>Optional · {minutes} min · {label}</small></span></button>')

    if 'id="walkAudio"' in html:
        html, a = re.subn(r'(<script type="application/octet-stream" id="walkAudio">)[^<]*(</script>)',
                          lambda m: m.group(1) + b64 + m.group(2), html)
        html, c = re.subn(r'^(\s*const CHAPTERS = ).*;$', lambda m: m.group(1) + chapters_js + ';', html, flags=re.M)
        html, d = re.subn(r'^(\s*const DURATION = ).*;$', lambda m: m.group(1) + dur_js + ';', html, flags=re.M)
        if (a, c, d) != (1, 1, 1):
            die('found a walkthrough but could not update it (audio, chapters, duration matched '
                f'{a}, {c}, {d} times); run with --remove, then embed again')
        html, b = BUTTON.subn(lambda m: '  ' + button + '\n', html)
        if not b:
            die('found the player but not its "Audio walkthrough" button; run with --remove, then embed again')
        action = 'updated'
    else:
        block = open(TEMPLATE, encoding='utf-8').read()
        block = (block.replace('__AUDIO_B64__', b64).replace('__CHAPTERS__', chapters_js)
                 .replace('__DURATION__', dur_js))
        if '</body>' not in html:
            die('the page has no </body>')
        i = html.rindex('</body>')
        html = html[:i] + block + html[i:]
        # the button goes right under the brand block at the top of the table of contents
        nav = re.search(r'<nav class="toc"[^>]*>', html)
        brand = re.compile(r'<div class="brand">.*?</div>\n?', re.S).search(html, nav.end())
        at = brand.end() if brand and html.find('</nav>', nav.end()) > brand.start() else nav.end()
        if html[at - 1] != '\n':
            button_line = '\n  ' + button + '\n'
        else:
            button_line = '  ' + button + '\n'
        html = html[:at] + button_line + html[at:]
        action = 'added'

    size = len(html.encode('utf-8'))
    if size > max_mib * 1024 * 1024:
        die(f'the page would be {size / 1048576:.2f} MiB, over the {max_mib:g} MiB limit: '
            'shorten the script or lower the embed bitrate in walkthrough_build.py')
    open(page, 'w', encoding='utf-8').write(html)
    print(f'{page}: walkthrough {action}: {len(chapters)} chapters, {secs / 60:.1f} min ({label}), '
          f'page {size / 1048576:.2f} MiB')


if __name__ == '__main__':
    main()
