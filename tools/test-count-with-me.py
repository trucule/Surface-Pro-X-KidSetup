"""Checks Count With Me: every level makes sound tasks, the level rule works, and every kind of task can be
answered right and wrong through the page. Run: python3 tools/test-count-with-me.py"""
import pathlib, sys
from playwright.sync_api import sync_playwright

APP = (pathlib.Path(__file__).resolve().parent.parent / 'apps' / 'count-with-me.html').as_uri()
SHOTS = pathlib.Path('/tmp/claude-0/tests'); SHOTS.mkdir(parents=True, exist_ok=True)

GEN = r"""
(N) => {
  const out = { problems: [], counts: {} }, bad = s => /NaN|undefined|null|\[object/.test(String(s));
  for (const [m, levels] of Object.entries(CWM.LEVELS)) levels.forEach((lv, i) => {
    const tag = `${m} L${i + 1} ${lv.name}`; out.counts[tag] = 0;
    for (let k = 0; k < N; k++) {
      let t; try { t = lv.gen(); } catch (e) { out.problems.push(`${tag}: threw ${e.message}`); break; }
      out.counts[tag]++;
      const where = `${tag}: ${JSON.stringify(t).slice(0, 160)}`;
      if (!Number.isInteger(t.answer) || t.answer < 0 || t.answer > 999) out.problems.push(`${where}: answer ${t.answer}`);
      for (const f of ['text', 'prompt', 'speak', 'eq', 'pic']) if (t[f] !== undefined && bad(t[f])) out.problems.push(`${where}: bad ${f}`);
      if (t.kind === 'tap' && !t.choices.includes(t.answer)) out.problems.push(`${where}: answer not a choice`);
      if (t.kind === 'array' && t.r * t.c !== t.answer) out.problems.push(`${where}: array`);
      if (t.kind === 'groups' && (t.total < t.R * t.N || t.answer !== t.R * t.N)) out.problems.push(`${where}: groups`);
      if (t.kind === 'share' && (t.total !== t.R * t.each + t.left || t.left >= t.R || t.each < 1)) out.problems.push(`${where}: share`);
      if (t.kind === 'build') {
        if (t.start.some(d => d < 0 || d > 9)) out.problems.push(`${where}: start`);
        if (t.eq) { const v = Function('return ' + t.eq)(); if (v !== t.answer) out.problems.push(`${where}: eq ${v}`); }
        if (/Build \d+$/.test(t.prompt) && +t.prompt.slice(6) !== t.answer) out.problems.push(`${where}: prompt`);
      }
      if (t.kind === 'story') {
        const e = t.eq.replace(/×/g, '*').replace(/÷/g, '/');
        if (/^\d+ \+ \? = \d+$/.test(e)) { const [a, b] = e.match(/\d+/g).map(Number); if (a + t.answer !== b) out.problems.push(`${where}: missing addend`); }
        else { const v = Function('return ' + e.replace(' = ?', ''))(); if (v !== t.answer) out.problems.push(`${where}: eq gives ${v}`); }
        if (t.coins) { const c = t.coins.q * 25 + t.coins.d * 10 + t.coins.n * 5 + t.coins.p; if (!/change/.test(t.text) && c !== t.answer) out.problems.push(`${where}: coins ${c}`); }
        if (!/\?$/.test(t.text)) out.problems.push(`${where}: text does not ask`);
      }
    }
  });
  return out;
}
"""

# Answers the current task right (or wrong) through the page, then reports what the page said.
SOLVE = r"""
async (right) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)), t = CWM.current(), $ = id => document.getElementById(id);
  const typeNum = n => { for (const d of String(n)) [...document.querySelectorAll('#padKeys button')].find(b => b.textContent === d).click(); [...document.querySelectorAll('#padKeys button')].find(b => b.textContent === '✔').click(); };
  if (t.kind === 'tap') { const idx = t.choices.indexOf(t.answer); $('answers').children[right ? idx : (idx + 1) % t.choices.length].click(); }
  else if (['frames', 'array', 'story'].includes(t.kind)) typeNum(right ? t.answer : t.answer + 1);
  else if (t.kind === 'basket' || t.kind === 'groups' || t.kind === 'share') {
    const things = [...document.querySelectorAll('.thing')]; things.forEach(x => delete x.dataset.in);
    if (t.kind === 'basket') things.slice(0, right ? t.answer : t.answer + 1).forEach(x => x.dataset.in = 'basket');
    else { const per = t.kind === 'groups' ? t.N : t.each; let k = 0; for (let p = 0; p < t.R; p++) for (let j = 0; j < per + (!right && p === 0 ? -1 : 0); j++) things[k++].dataset.in = 'p' + p; }
    $('check').click();
  } else if (t.kind === 'build') {
    const want = [Math.floor(t.answer / 100), Math.floor(t.answer / 10) % 10, t.answer % 10];
    const cols = [...document.querySelectorAll('.col')];
    // Work like a child would: ones, trading when needed, then tens and hundreds.
    for (let i = 2; i >= 0; i--) {
      let guard = 0;
      while (CWM.blocks()[i] !== want[i] && guard++ < 40) {
        const b = CWM.blocks();
        if (b[i] < want[i]) { cols[i].querySelector('[data-d="1"]').click(); continue; }
        cols[i].querySelector('[data-d="-1"]').click();
      }
    }
    if (!right) cols[2].querySelector(CWM.blocks()[2] > 0 ? '[data-d="-1"]' : '[data-d="1"]').click();
    $('check').click();
  }
  await sleep(30);
  return { win: $('win').classList.contains('on'), text: $('winText').textContent };
}
"""

def main():
    problems = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1440, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(APP)
        res = pg.evaluate(GEN, 300)
        print('levels:', len(res['counts']), 'tasks:', sum(res['counts'].values()))
        seen = set()
        for x in res['problems']:
            k = x.split(':')[0]
            if k not in seen: seen.add(k); print('PROBLEM', x[:300])
        problems += res['problems']
        # Level rule: 4 first-try right moves up, 2 misses in a row moves down, 1 miss does not.
        rule = pg.evaluate("""() => { localStorage.clear(); const P = CWM.P(), r = CWM.record, out = []; P.lv.story = 2; P.st = {};
            r('story', true); r('story', true); r('story', true); out.push(P.lv.story); r('story', true); out.push(P.lv.story);
            r('story', false); out.push(P.lv.story); r('story', true); r('story', false); out.push(P.lv.story); r('story', false); out.push(P.lv.story);
            P.lv.story = 0; r('story', false); r('story', false); out.push(P.lv.story); return out; }""")
        print('level rule:', rule)
        if rule != [2, 3, 3, 3, 2, 0]: problems.append(f'level rule {rule}')
        # Every level, through the page: right answers win, wrong answers do not.
        for m, n in pg.evaluate("() => Object.entries(CWM.LEVELS).map(([m, l]) => [m, l.length])"):
            for lv in range(n):
                for attempt in range(3):
                    pg.evaluate(f"() => {{ const P = CWM.P(); P.lv['{m}'] = {lv}; P.st = {{}}; CWM.setMode('{m}'); }}")
                    pg.wait_for_timeout(20)
                    kind = pg.evaluate("() => CWM.current().kind")
                    wrong = pg.evaluate(SOLVE, False)
                    if wrong['win']: problems.append(f'{m} L{lv + 1} {kind}: wrong answer won')
                    right = pg.evaluate(SOLVE, True)
                    if not right['win'] or not right['text'] or 'undefined' in right['text'] or 'NaN' in right['text']: problems.append(f'{m} L{lv + 1} {kind}: right answer {right}')
                if lv in (0, 3, n - 1) or m == 'build':
                    pg.evaluate(f"() => {{ const P = CWM.P(); P.lv['{m}'] = {lv}; CWM.setMode('{m}'); }}"); pg.wait_for_timeout(60)
                    if m == 'story': pg.click('#hint'); pg.wait_for_timeout(30)
                    pg.screenshot(path=str(SHOTS / f'cwm-{m}-{lv + 1}.png'))
                print(m, 'L%d' % (lv + 1), kind, 'last win:', right['text'][:70])
        # Leftover sharing: equal plates with too many left over is not done yet.
        pg.evaluate("() => { const P = CWM.P(); P.lv.giveme = 5; CWM.setMode('giveme'); }")
        msg = pg.evaluate("""() => { const t = CWM.current(), th = [...document.querySelectorAll('.thing')]; th.forEach(x => delete x.dataset.in);
            for (let p = 0; p < t.R; p++) th[p].dataset.in = 'p' + p; document.getElementById('check').click(); return document.getElementById('win').classList.contains('on'); }""")
        if msg: problems.append('leftovers: one each accepted')
        print('page errors:', errs); problems += errs
        b.close()
    print('PROBLEMS:' if problems else 'ALL OK', problems[:20])
    sys.exit(1 if problems else 0)

main()
