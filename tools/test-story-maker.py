"""Checks Story Maker: every built-in story (each kind, level, branch and cast size) reads cleanly, the read-along
highlight and tap-to-hear work, the questions each have exactly one right answer, and the Claude path keeps only
sound questions. The Windows voice is replaced by a fast fake so stories play through in seconds.
Run: python3 tools/test-story-maker.py"""
import itertools, json, pathlib, sys
from playwright.sync_api import sync_playwright

APP = (pathlib.Path(__file__).resolve().parent.parent / 'apps' / 'story-maker' / 'index.html').as_uri()
SHOTS = pathlib.Path('/tmp/claude-0/tests'); SHOTS.mkdir(parents=True, exist_ok=True)

FAKE_SPEECH = r"""
window.__spoken = []; window.__hl = 0;
const fake = { getVoices: () => [], onvoiceschanged: null,
  cancel() { if (this.cur) { const u = this.cur; this.cur = null; clearTimeout(this.t); u.onerror && u.onerror({}); } },
  speak(u) { window.__spoken.push(u.text); this.cur = u; const words = u.text.split(' '); let i = 0, pos = 0; u.onstart && u.onstart();
    const step = () => { if (this.cur !== u) return; if (i < words.length) { u.onboundary && u.onboundary({ name: 'word', charIndex: pos }); pos += words[i].length + 1; i++; this.t = setTimeout(step, 4); } else { this.cur = null; u.onend && u.onend({}); } };
    this.t = setTimeout(step, 3); } };
Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
window.SpeechSynthesisUtterance = function (t) { this.text = t; };
document.addEventListener('DOMContentLoaded', () => new MutationObserver(m => { for (const r of m) if (r.target.classList && r.target.classList.contains('hl')) window.__hl++; })
  .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] }));
"""

BAD = r"""(s) => /NaN|undefined|null|\[object|\{[A-Za-z]+\}|—/.test(String(s))"""

def check_story(pg, label, problems, answer_quiz=True):
    """Plays the story to its end choosing the given branches, then answers the questions (wrong first, then right)."""
    for scene_no in range(8):
        pg.wait_for_function("() => document.getElementById('choices').classList.contains('on') || document.getElementById('end').classList.contains('on')", timeout=20000)
        sc = pg.evaluate("() => STORY.story.scenes[STORY.story.scenes.length - 1]")
        for l in sc['lines']:
            if pg.evaluate(BAD, l['text']) or not l['text'].strip(): problems.append(f"{label}: bad line {l['text']}")
        if not sc.get('title') or pg.evaluate(BAD, sc['title']): problems.append(f"{label}: bad title {sc.get('title')}")
        if pg.evaluate("() => document.getElementById('end').classList.contains('on')"): break
        pg.evaluate(f"() => document.getElementById('choices').children[{pg.evaluate('() => window.__branch.shift() || 0')}].click()")
    else:
        problems.append(f'{label}: never ended')
    level = pg.evaluate("() => STORY.story.level")
    if level == 'little':
        if pg.evaluate("() => document.getElementById('quiz').classList.contains('on')"): problems.append(f'{label}: quiz on Little')
        return
    pg.wait_for_function("() => document.getElementById('quiz').classList.contains('on')", timeout=5000)
    qs = pg.evaluate("() => STORY.quiz.qs")
    if len(qs) < 4: problems.append(f'{label}: only {len(qs)} questions')
    for q in qs:
        ch = q['choices']
        if len(ch) != 3 or len(set(c.lower() for c in ch)) != 3 or not (0 <= q['answer'] < len(ch)): problems.append(f'{label}: question {q}')
        if pg.evaluate(BAD, json.dumps(q)): problems.append(f'{label}: bad question text {q}')
    if not answer_quiz: return
    for k, q in enumerate(qs):
        pg.wait_for_function(f"() => STORY.quiz.i === {k} && document.getElementById('qChoices').children.length", timeout=5000)
        if k % 2:   # a wrong answer first on every other question
            pg.evaluate(f"() => document.getElementById('qChoices').children[{(q['answer'] + 1) % 3}].click()")
        pg.evaluate(f"() => document.getElementById('qChoices').children[{q['answer']}].click()")
    pg.wait_for_function("() => STORY.quiz.done", timeout=10000)
    end = pg.inner_text('#qText'); want = f"You got {(len(qs) + 1) // 2} of {len(qs)}"
    if want not in end: problems.append(f'{label}: quiz end "{end}", wanted "{want}"')

def main():
    problems = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1440, 'height': 960}); ctx.add_init_script(FAKE_SPEECH)
        pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(APP)
        pg.screenshot(path=str(SHOTS / 'sm-setup.png'))
        casts = [['scarlett'], ['bun', 'beep', 'luna']]
        n = 0
        for kind, lv, cast, br in itertools.product(range(5), (1, 2), casts, itertools.product((0, 1), repeat=2)):
            pg.evaluate(f"() => {{ window.__branch = {list(br)}; STORY.pick({json.dumps(cast)}, {n % 10}, {kind}, 1, 0, {lv}); STORY.setSelfRead(false); STORY.start(); }}")
            label = f"kind {kind} level {lv} cast {len(cast)} branches {br}"
            check_story(pg, label, problems, answer_quiz=(br == (0, 1)))
            if n == 7: pg.screenshot(path=str(SHOTS / 'sm-quiz.png'))
            n += 1
        print('built-in stories played:', n)
        # Little keeps the original story and ends without a quiz.
        for k in range(2):
            pg.evaluate(f"() => {{ window.__branch = [{k}, {k}]; STORY.pick(['hop', 'pip'], 3, 0, 0, 0, 0); STORY.start(); }}")
            check_story(pg, f'little {k}', problems)
        # Read-along: words light up while a line is read, and a tapped story word is said with its meaning.
        pg.evaluate("() => { window.__hl = 0; window.__branch = []; STORY.pick(['twinkle', 'zip'], 0, 4, 1, 0, 2); STORY.start(); }")
        pg.wait_for_timeout(150)
        pg.screenshot(path=str(SHOTS / 'sm-reading.png'))
        pg.wait_for_function("() => document.getElementById('choices').classList.contains('on')", timeout=20000)
        hl = pg.evaluate("() => window.__hl")
        print('highlight changes during the first scene:', hl)
        if hl < 20: problems.append(f'read-along highlight only changed {hl} times')
        gw = pg.evaluate("() => [...document.querySelectorAll('#text .w.gw')].map(x => x.textContent.trim())")
        print('story words in scene 1:', gw)
        if not gw: problems.append('no tappable story words in a 3rd grade scene')
        else:
            pg.locator('#text .w.gw').first.click(); pg.wait_for_timeout(60)
            said = pg.evaluate("() => window.__spoken[window.__spoken.length - 1]")
            print('tapped word said:', said)
            if 'means' not in said or not pg.evaluate("() => document.getElementById('pop').classList.contains('on')"): problems.append(f'tap a story word: {said}')
            pg.screenshot(path=str(SHOTS / 'sm-word.png'))
        # Tapping a plain word mid-line says it and then reading carries on.
        pg.evaluate("() => { window.__branch = []; STORY.pick(['mo'], 2, 1, 1, 0, 1); STORY.start(); }")
        pg.wait_for_timeout(20)
        pg.locator('#text p').nth(1).locator('.w').nth(2).click()
        pg.wait_for_function("() => document.getElementById('choices').classList.contains('on')", timeout=20000)
        print('reading resumed after a tapped word')
        # I read it myself: nothing is read automatically, the choices are there at once, a tapped line is read once.
        pg.evaluate("() => { STORY.setSelfRead(true); window.__spoken.length = 0; STORY.pick(['rusty'], 5, 2, 1, 0, 2); STORY.start(); }")
        pg.wait_for_timeout(200)
        if pg.evaluate("() => window.__spoken.length") or not pg.evaluate("() => document.getElementById('choices').classList.contains('on')"): problems.append('self read: something was read, or no choices')
        pg.locator('#text p').nth(0).click(); pg.wait_for_timeout(400)
        if pg.evaluate("() => window.__spoken.length") != 1: problems.append(f"self read: a tapped line gave {pg.evaluate('() => window.__spoken')}")
        pg.evaluate("() => STORY.setSelfRead(false)")
        # Questions from Claude: bad ones are dropped, the rest are shuffled with the right answer tracked.
        cq = pg.evaluate("""() => STORY.cleanQuestions([{ q: 'Who sang?', choices: ['Pip', 'Mo', 'Zip'], answer: 1 }, { q: 'Bad index', choices: ['a', 'b', 'c'], answer: 5 },
            { q: 'Same', choices: ['x', 'X', 'y'], answer: 0 }, { q: 'No choices' }, null, { q: 'Why?', choices: ['Because it rained', 'Because it was dark', 'Because of cake'], answer: 2 }])""")
        print('kept from Claude:', [(q['q'], q['choices'][q['answer']]) for q in cq])
        if [(q['q'], q['choices'][q['answer']]) for q in cq] != [('Who sang?', 'Mo'), ('Why?', 'Because of cake')]: problems.append(f'cleanQuestions {cq}')
        # The Claude path end to end, with the API answered here.
        def scene(last, n):
            s = {'title': f'Part {n}', 'emoji': ['🌙', '⭐', '🐉'], 'lines': [{'who': 'narrator', 'text': f'The friends found a curious glowing door in part {n}.', 'mood': 'neutral'}, {'who': 'spark', 'text': 'Achoo! Let us open it.', 'mood': 'excited'}],
                 'summary': f'Part {n} happened.', 'choices': [] if last else [{'label': 'Open the door', 'emoji': '🚪'}, {'label': 'Knock first', 'emoji': '✊'}], 'words': [{'word': 'curious', 'meaning': 'wanting to know more'}]}
            if last:
                s['end'] = True
                s['questions'] = [{'q': 'What did the friends find?', 'choices': ['A glowing door', 'A cake', 'A boat'], 'answer': 0}, {'q': 'Who sneezed?', 'choices': ['Spark', 'Luna', 'Mo'], 'answer': 0},
                                  {'q': 'What does curious mean?', 'choices': ['Sleepy', 'Wanting to know more', 'Wet'], 'answer': 1}, {'q': 'Broken', 'choices': ['a'], 'answer': 0}]
            return s
        calls = []
        def api(route):
            body = route.request.post_data or ''; calls.append(json.loads(body))
            last = 'the LAST scene' in body
            route.fulfill(status=200, content_type='application/json', body=json.dumps({'content': [{'type': 'text', 'text': json.dumps(scene(last, len(calls)))}]}))
        pg.route('https://api.anthropic.com/**', api)
        pg.evaluate("() => { window.__branch = [0, 1]; }")
        pg.evaluate("() => { STORY.pick(['spark'], 1, 1, 1, 0, 2); }")
        # canUseAI reads CFG.apiKey (from config.js on the tablet); set it through the hook's config object.
        pg.evaluate("() => { localStorage.removeItem('story-count'); STORY.cfg && (STORY.cfg.apiKey = 'test'); }")
        if pg.evaluate("() => !!STORY.cfg"):
            pg.evaluate("() => STORY.start()")
            check_story(pg, 'claude path', problems)
            print('Claude calls:', len(calls), '| level in prompt:', '3rd grader' in calls[0]['system'], '| questions asked:', 'questions' in calls[-1]['messages'][0]['content'])
            if len(calls) != 3 or '3rd grader' not in calls[0]['system'] or 'questions' not in calls[-1]['messages'][0]['content']: problems.append('claude path prompts')
            qs = pg.evaluate("() => STORY.quiz.qs.map(q => q.q)")
            if qs[:3] != ['What did the friends find?', 'Who sneezed?', 'What does curious mean?'] or len(qs) != 4: problems.append(f'claude questions {qs}')
        else:
            problems.append('STORY.cfg hook missing')
        pg.screenshot(path=str(SHOTS / 'sm-end.png'))
        print('page errors:', errs); problems += errs
        b.close()
    seen = []
    for x in problems:
        if x not in seen: seen.append(x)
    print('PROBLEMS:' if seen else 'ALL OK', '\n'.join(seen[:30]))
    sys.exit(1 if seen else 0)

main()
