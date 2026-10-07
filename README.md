# Kid tablet setup (Surface Pro X)

Everything for the kid tablet: the KidTablet management module, setup/deploy/reset scripts, and the apps.

## Contents
| File | What it is |
|---|---|
| `KidTablet.psm1` | The management module (all commands: apps, settings, kiosk, sync). |
| `Setup-KidTablet.ps1` | Interactive first-time setup on the tablet (keep next to `KidTablet.psm1`). |
| `Deploy-KidTablet.ps1` | Single-file, non-interactive deploy (module embedded), e.g. through ET Ducky. |
| `Reset-KidTablet.ps1` | Full clean-slate reset (module embedded). |
| `Install-KidApps.ps1` | Checks the package, then adds or updates all four apps, sets the tiles, restarts her session (`-SkipRestart` to leave her session running). |
| `apps/` | `kitchen-lab.html`, `chemistry-lab.html`, `playground-lab.html`, `draw-with-me/` (`index.html` + `library.js`), `trace-with-me.html`, `count-with-me.html`, `music-box.html`, `story-maker/` (`index.html`, config.js written on the tablet), tile images. |
| `env.example` | Template for `C:\ProgramData\KidTablet\.env` (Draw With Me learning; optional). |
| `voices/` | `make-voices.py` builds natural-voice clip packs into the apps (see `voices/README.md`). |
| `tools/Test-KidTabletPackage.ps1` | Confirms the module copies inside Deploy/Reset match `KidTablet.psm1`. |

## New tablet
1. Copy this folder to the tablet. As admin:
   `powershell -ExecutionPolicy Bypass -File .\Setup-KidTablet.ps1 -UserName Scarlett`
   (or run `Deploy-KidTablet.ps1` remotely).
2. Optional: copy `env.example` to `C:\ProgramData\KidTablet\.env` and put in your Anthropic API key.
3. `powershell -ExecutionPolicy Bypass -File .\Install-KidApps.ps1`

## Updating an existing tablet
Run `Install-KidApps.ps1` as admin. It first runs the package self-check (embedded module copies match
`KidTablet.psm1`, `library.js` parses to lessons) and stops if anything is wrong. Then it installs this package's
module, updates all four apps (Draw With Me including its library), reapplies the tiles and restarts her session.
Add `-SkipRestart` while she is using the tablet; the new versions load the next time each app is opened.

## Natural voices
All speaking apps can play pre-made neural-voice clips instead of the Windows voice. See `voices/README.md`:
run `voices\make-voices.py` on your PC, then `Install-KidApps.ps1`. Without packs, everything still works with
the Windows voice.

## Trace With Me
`apps/trace-with-me.html` is a finger-tracing app: capital letters, small letters, numbers 0-9 and six shapes. A big
faint glyph appears, she colours it in with one finger, and when most of it is covered (with the ink mostly on the
glyph, so a scribble over the whole box does not count) it cheers, says the letter and a word, and gives her a
sticker. Earned stickers show on the star button and are kept in Edge local storage under the key `tracer-stickers`.
Nothing is sent anywhere and no API key is needed. To reset her sticker board, clear site data for the local apps
folder in her Edge profile, or open the app, press F12 and run `localStorage.removeItem('tracer-stickers')`.

## Kitchen Lab and Chemistry Lab
Built from `lab-games` (separate source zip; `npm ci && npm test && npm run build`, then copy `dist/*.html` here).
Steps are read aloud as she reaches them, tapping the step line repeats it, and the book shows a Today card plus
stars on recipes she has finished before (stored under `lab-done-kitchen` / `lab-done-chem`).

## Draw With Me home screen
The picks grid starts with a **Today** tile (the drawing of the day, chosen from the current category and style) and a
**Surprise me!** dice (a random drawing she has not saved a picture of yet). Tiles she has already saved a picture
of carry a star, read from her gallery. Clearing the gallery clears the stars.
Her saved pictures live behind the slim **My pictures** bar at the bottom; tapping it opens them full screen.

## Playground Lab
`apps/playground-lab.html` is a 3D physics playground (three.js r149 and cannon-es, both MIT, bundled; same look as
the labs). A slingshot in the front lane (pull the ball back and let go; it fires toward the dominoes), a catapult
with a falling counterweight (the Fire button; it lobs onto the trampoline), a seesaw, a trampoline, a slide down
into a triangle of bowling pins, and a row of dominoes. The toolbox drops in beach balls, bowling balls, bouncy
balls, crates, pins, balloons (they float) and feathers (they drift). Knobs: moon gravity, slow motion, a gust of
wind, look from the other side, sound, reset. Everything with mass is draggable with a finger. No voice, no storage.

## Count With Me, Music Box, Story Maker
Three more apps (`apps/count-with-me.html`, `apps/music-box.html`, `apps/story-maker/`).
- **Count With Me**: "How many?" (tap each thing to count it aloud, then pick the number) and "Give me" (drag that many
  into the basket). Starts at 1-5 and moves up to 10, then 20, after streaks of five; level and stars are kept in
  `localStorage` under `count-level`.
- **Music Box**: two pages. Song: a 16-step tone matrix with eight scale notes (three scales: happy, spooky, dreamy,
  all consonant), drum, clap and shaker rows, five synthesized instruments plus "Me" (her recorded voice pitched up
  and down the scale), speed, swing, a surprise dice and three song slots (kept under `musicbox-v2`; an old
  `musicbox-song` is migrated into slot 1). Voice Lab: six pads; tap the mic, say something, and it is kept in
  IndexedDB (database `musicbox`). Each pad has an emoji name, effects (chipmunk, giant, backwards, robot, echo), a
  star ("sing my notes", makes it the Me instrument) and "in my song" (adds its own row to the grid). An eight-key
  animal keyboard plays the selected voice or instrument up the scale. The microphone is pre-approved for local apps.
- **Story Maker** (`apps/story-maker/`, a folder app): pick one to three friends from a cast of twelve (each with a
  personality), a place, a story kind (adventure, mystery, friendship, silly, bedtime), a drama dial (cozy, a little
  trouble, big trouble) and a length (3 or 6 parts). The story is told scene by scene; each scene ends in a choice.
  With `ANTHROPIC_API_KEY` in `.env`, Claude writes each scene live (`STORY_MODEL`, Haiku by default; `DRAW_DAILY_LIMIT`
  also caps stories per day). Without a key, a built-in branching story is used. Every line is read by its speaker:
  with `TTS_PROVIDER` / `TTS_KEY` (Azure Speech, with `TTS_REGION`, or OpenAI) each character has its own natural
  voice and the narrator a warm adult one; otherwise the Windows voices are used, varied per character.

## Draw With Me library
`apps/draw-with-me/library.js` holds the pre-made lessons (152 as of this package: 70 simple, 82 detailed). To add more, use the separate
`draw-with-me-kit.zip`, then copy its updated `library.js` into `apps/draw-with-me/` and run `Install-KidApps.ps1`.
Always install Draw With Me from the folder (it keeps `library.js` next to the app).

## Useful commands (after `Import-Module 'C:\Program Files\WindowsPowerShell\Modules\KidTablet' -Force`)
`Get-KidApp`, `Add-KidWebApp`, `Add-KidStoreApp`, `Set-KidApp`, `Remove-KidApp`, `Set-KidTabletSetting`,
`Sync-KidTablet -RestartSession`, `Update-KidAppConfig -Verbose` (after editing `.env`).
