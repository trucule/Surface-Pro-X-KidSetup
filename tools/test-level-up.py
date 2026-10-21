import json, sys
from playwright.sync_api import sync_playwright

import pathlib
APP = (pathlib.Path(__file__).resolve().parent.parent / 'apps' / 'level-up.html').as_uri()
N = 300  # questions per level

CHECK = r"""
(N) => {
  const out = { problems: [], counts: {} };
  const bad = s => /NaN|undefined|null|\[object/.test(String(s));
  for (const s of LEVELUP.SUBJECTS) {
    s.levels.forEach((lv, li) => {
      const tag = `${s.id} L${li + 1} ${lv.name}`;
      out.counts[tag] = 0;
      for (let i = 0; i < N; i++) {
        let q;
        try { q = lv.gen(); } catch (e) { out.problems.push(`${tag}: threw ${e.message}`); break; }
        out.counts[tag]++;
        const where = `${tag}: ${q.prompt}`;
        if (!q.prompt || bad(q.prompt)) out.problems.push(`${where}: bad prompt`);
        if (q.visual && bad(q.visual)) out.problems.push(`${where}: bad visual`);
        if (q.passage && bad(q.passage)) out.problems.push(`${where}: bad passage`);
        if (!q.explain || bad(q.explain)) out.problems.push(`${where}: bad explain "${q.explain}"`);
        if (q.speak && bad(q.speak)) out.problems.push(`${where}: bad speak`);
        if (q.type === 'choice') {
          if (!(q.answer >= 0 && q.answer < q.choices.length)) out.problems.push(`${where}: answer index ${q.answer}`);
          if (q.choices.length < 2) out.problems.push(`${where}: only ${q.choices.length} choices`);
          const keys = q.choices.map(c => c.label !== undefined ? 'L:' + c.label : 'H:' + c.html);
          if (new Set(keys).size !== keys.length) out.problems.push(`${where}: duplicate choices ${keys.join(' | ').slice(0, 200)}`);
          q.choices.forEach(c => { if (bad(c.label) && c.label !== undefined) out.problems.push(`${where}: bad choice ${c.label}`); if (c.html && bad(c.html)) out.problems.push(`${where}: bad choice html`); });
          if (q.choices.filter(c => c.ok).length !== 1) out.problems.push(`${where}: ${q.choices.filter(c => c.ok).length} right choices`);
        } else if (q.type === 'number') {
          if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 99999) out.problems.push(`${where}: number answer ${q.answer}`);
        } else if (q.type === 'mix') {
          if (!q.target || !q.paints.length) out.problems.push(`${where}: bad mix`);
          if (!LEVELUP.sameRecipe(q.target, q.target)) out.problems.push(`${where}: target not equal to itself`);
          const doubled = Object.fromEntries(Object.entries(q.target).map(([k, v]) => [k, v * 2]));
          if (!LEVELUP.sameRecipe(q.target, doubled)) out.problems.push(`${where}: doubled recipe not equal`);
        } else out.problems.push(`${where}: unknown type ${q.type}`);
      }
    });
  }
  return out;
}
"""

def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1440, 'height': 960})
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(APP)
        res = pg.evaluate(CHECK, N)
        probs = res['problems']
        print('levels checked:', len(res['counts']), 'questions:', sum(res['counts'].values()))
        uniq = []
        for x in probs:
            k = x.split(':')[0] + x.split(':')[-1]
            if k not in uniq: uniq.append(k); print('PROBLEM', x[:300])
        # Progression: 8 warm-up questions climb fast, then 4 in a row; 2 misses in 4 drop.
        prog = pg.evaluate("""() => { localStorage.clear(); const r = []; const P = LEVELUP.P, rec = LEVELUP.record;
            const start = P('math').level; rec('math', true); rec('math', true); r.push(['after 2 right (warm-up)', P('math').level - start]);
            for (let i = 0; i < 6; i++) rec('math', false); r.push(['after misses', P('math').level]);
            const lv = P('math').level; for (let i = 0; i < 3; i++) rec('math', true); r.push(['3 right after warm-up', P('math').level - lv]);
            rec('math', true); r.push(['4th right', P('math').level - lv]);
            const lv2 = P('math').level; rec('math', false); r.push(['1 miss', P('math').level - lv2]); rec('math', true); rec('math', false); r.push(['2 misses in 4', P('math').level - lv2]);
            return r; }""")
        for row in prog: print('progression', row)
        # UI walk: every subject, answer 6 questions (right, then wrong), check the screens react.
        ui = pg.evaluate("""async () => {
            const sleep = ms => new Promise(r => setTimeout(r, ms)); const log = [];
            for (const card of [...document.querySelectorAll('#grid .card')]) {
              document.getElementById('back').click(); await sleep(50);
              const cards = [...document.querySelectorAll('#grid .card')]; const name = card.querySelector('.name').textContent;
              cards.find(c => c.querySelector('.name').textContent === name).click(); await sleep(50);
              for (let i = 0; i < 6; i++) {
                const q = window.LEVELUP && document.getElementById('prompt').textContent; const right = i % 3 !== 2;
                const ans = document.getElementById('answers').children;
                const cur = LEVELUP.current();
                if (cur.type === 'choice') { const idx = right ? cur.answer : (cur.answer + 1) % ans.length; ans[idx].click(); }
                else if (cur.type === 'number') { for (const d of String(right ? cur.answer : cur.answer + 1)) [...document.querySelectorAll('#pad button')].find(b => b.textContent === d).click(); [...document.querySelectorAll('#pad button')].find(b => b.textContent === '✔').click(); }
                else if (cur.type === 'mix') { for (const [k, v] of Object.entries(cur.target)) for (let j = 0; j < v * (right ? 1 : 2) + (right ? 0 : 1); j++) document.querySelector(`#drops button[data-paint="${k}"]`).click(); document.getElementById('mixCheck').click(); }
                const fb = document.getElementById('feedback'); log.push(`${name} ${cur.type} ${right ? 'right' : 'wrong'} -> ${fb.classList.contains('good') ? 'good' : 'bad'}`);
                if (document.getElementById('pop').classList.contains('on')) document.getElementById('popOk').click(); else document.getElementById('fbNext').click();
                await sleep(20);
              }
            }
            return log; }""")
        mism = [l for l in ui if ('right' in l.split('->')[0]) != (l.endswith('good'))]
        print('ui answers:', len(ui), 'mismatched feedback:', mism)
        # Daily quest runs to its end card.
        q = pg.evaluate("""async () => { document.getElementById('back').click(); document.querySelector('.card.quest').click(); const sleep = ms => new Promise(r => setTimeout(r, ms));
            for (let i = 0; i < 12; i++) { const c = LEVELUP.current(); if (document.getElementById('pop').classList.contains('on')) { if (/Quest done/.test(document.getElementById('popTitle').textContent)) return document.getElementById('popTitle').textContent; document.getElementById('popOk').click(); await sleep(10); }
              const cc = LEVELUP.current(); if (cc.type === 'choice') document.getElementById('answers').children[cc.answer].click(); else if (cc.type === 'number') { for (const d of String(cc.answer)) [...document.querySelectorAll('#pad button')].find(b => b.textContent === d).click(); [...document.querySelectorAll('#pad button')].find(b => b.textContent === '✔').click(); } else { for (const [k, v] of Object.entries(cc.target)) for (let j = 0; j < v; j++) document.querySelector(`#drops button[data-paint="${k}"]`).click(); document.getElementById('mixCheck').click(); }
              await sleep(10); if (document.getElementById('pop').classList.contains('on')) { if (/Quest done/.test(document.getElementById('popTitle').textContent)) return document.getElementById('popTitle').textContent; document.getElementById('popOk').click(); } else document.getElementById('fbNext').click(); await sleep(10); }
            return document.getElementById('pop').classList.contains('on') ? document.getElementById('popTitle').textContent : 'no end card'; }""")
        print('quest:', q)
        
        print('page errors:', errors)
        b.close()
        sys.exit(1 if (uniq or errors or mism) else 0)

main()
