"""실험실 학습 가이드 슬라이드(slides/lab-guide.html)를 조립합니다.

1차 슬라이드(slides/index.html)의 머리(내장 폰트·reveal.js CSS·공용 스타일)와
스크립트(reveal.js·초기화)를 그대로 가져오고, 본문과 전용 CSS는 src/에서 읽습니다.
실행: python3 slides/lab-guide/build.py  (저장소 루트에서)
"""
from pathlib import Path

here = Path(__file__).resolve().parent
base = (here.parent / 'index.html').read_text(encoding='utf-8')
css = (here / 'src' / 'guide.css').read_text(encoding='utf-8')
body = (here / 'src' / 'body.html').read_text(encoding='utf-8')

head_end = base.index('</head>')
head = base[:head_end]
old_title = head[head.index('<title>'):head.index('</title>') + len('</title>')]
head = head.replace(old_title, '<title>Hook·Harness 실험실 학습 가이드</title>')

slides_start = base.index('<div class="slides">')
slides_end = base.index('<script>', slides_start)
prefix = base[head_end:slides_start + len('<div class="slides">')]
scripts = base[slides_end:]

links = ('<a id="lg-home" href="../docs/index.html" title="문서 허브 (H)">← 문서 허브</a>\n'
         '<a id="lg-lab" href="../lab/index.html">실험실 열기 →</a>\n')
prefix = prefix.replace('<div id="secfoot"></div>', '<div id="secfoot"></div>\n' + links)

hub_key = """
<script>
  // H 키: 문서 허브로 돌아갑니다
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey && !e.altKey) location.href = '../docs/index.html';
  });
</script>
"""
scripts = scripts.replace('</body>', hub_key + '</body>')

out = head + '<style>\n' + css + '</style>\n' + prefix + '\n' + body + '  </div>\n</div>\n\n' + scripts
(here.parent / 'lab-guide.html').write_text(out, encoding='utf-8')
print('wrote', here.parent / 'lab-guide.html', len(out))
