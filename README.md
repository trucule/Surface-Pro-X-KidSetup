# Kid tablet setup (Surface Pro X)

A Windows tablet set up as a locked-down learning device for a young child, with its own home screen, a curated set
of web and offline apps, and remote management from a PC or an RMM. This repo holds the PowerShell module that does
the setup, the scripts that run it, and the apps.

Built for a Surface Pro X. Any Windows 11 Pro device with a touch screen works the same way.

## What you get
- A child account with a random password and automatic sign-in.
- An Assigned Access kiosk: the child sees only the home screen and the apps on it.
- Edge locked to an allowlist of domains. Everything else is blocked.
- A touch-first home screen (`KidHome.exe`, built on the tablet from source in the module) with large tiles, a
  wallpaper, and a Home button that closes any app.
- Ten offline HTML apps: Level Up (reading, math, color science, patterns, time and money, shapes and fractions,
  each climbing from kindergarten to about 4th grade), Voice Band (her voice as an instrument: sing a melody, voice
  effects, a looper band), Draw With Me (step-by-step drawing lessons), Trace With Me
  (letters, numbers, shapes), Count With Me, Music Box, Story Maker (a read-aloud branching story app), Kitchen Lab,
  Chemistry Lab, and Playground Lab (3D physics). Each one is described below.
- Optional AI: with an Anthropic API key, Draw With Me learns new drawings on request and Story Maker writes each
  scene live, with a daily cap.
- Optional natural voices: pre-rendered neural voice clips for every spoken line, or live voices from Azure Speech,
  OpenAI, or a VoiceStudio server on your PC.
- Scripts for running all of it from an RMM. The author uses ET Ducky; any tool that runs PowerShell as SYSTEM
  works.

## Prerequisites
- Windows 11 Pro, Enterprise, or Education. Assigned Access multi-app kiosk is not available on Home, and the setup
  stops if it finds Home.
- An administrator account on the tablet for the setup, and PowerShell 5.1 (included with Windows).
- Microsoft Edge (included with Windows). Apps open in Edge app windows.
- Internet during setup, for the Tux Paint install through winget, Store apps, and tile icons. The offline apps run
  without internet afterwards.
- Optional, for the AI features: an Anthropic API key.
- Optional, for natural voices: a PC with Python 3.10 or later, and one of edge-tts, piper, or VoiceStudio. For live
  voices on the tablet, an Azure Speech or OpenAI key, or VoiceStudio reachable on your LAN.

## Set up a new tablet
1. Copy this folder to the tablet.
2. Open PowerShell as administrator in that folder and run the setup with the child's account name:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\Setup-KidTablet.ps1 -UserName Kid -FullName "Kid"
   ```
   Other options: `-TextScalePercent 150` for larger text (100 to 225), `-AllowAllWebsites` to skip the Edge
   allowlist, `-AutoLogon $false` to keep a sign-in screen. The setup creates the account, installs the module to
   `C:\Program Files\WindowsPowerShell\Modules\KidTablet`, writes `C:\ProgramData\KidTablet\config.json` with the
   default app list, builds the home screen, applies the Edge policies and the kiosk, and registers a logon task that
   applies the child's per-user settings at every sign-in.
3. Optional: copy `env.example` to `C:\ProgramData\KidTablet\.env` and fill in the keys you want to use. The file
   is readable by SYSTEM and administrators only. Without it the apps run offline with their built-in content.
4. Install the apps:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\Install-KidApps.ps1
   ```
   This checks the package, installs every app under `C:\KidTabletApps` (readable by the child, writable by admins),
   sets the tiles, and restarts the child's session.
5. Sign in as the child (automatic sign-in does this on reboot). The home screen appears with the tiles.

To take the setup off a device, run `Setup-KidTablet.ps1 -Remove`. It removes the kiosk, the logon task and auto
sign-in. The child account, its Edge policies and `config.json` stay, so the device can be set up again later;
remove the account yourself if you want it gone. Hold Shift while signing out to reach an admin account on a
kiosk tablet.

## Leaving an app
While an app is in front, the launcher pins a large **Home** pill over the top-right corner of the screen, on top
of the app window's own caption buttons. One tap closes every open app (politely first, then force after 1.5 seconds, Store apps included)
and brings the tiles back. Turning the screen off and on does the same thing.

## Make it yours
Everything personal lives in two places: `C:\ProgramData\KidTablet\config.json` (the child's name, apps, allowed
domains, wallpaper, text scale) and the apps' own content.

- **Apps and domains.** The defaults are a starter list (Teach Your Monster to Read, Starfall, PBS KIDS, PhET,
  Chrome Music Lab, Kid Pix, Kleki, Tux Paint, Paint). Change them with the module commands after
  `Import-Module KidTablet`: `Add-KidWebApp -Name 'Name' -Url https://...` (its domain is allowed automatically),
  `Add-KidAllowedDomain`, `Add-KidStoreApp -StoreId ...`, `Add-KidDesktopApp`, `Remove-KidApp`, `Set-KidApp` (tile
  image and colour). `Sync-KidTablet -RestartSession` applies the change.
- **Look.** `Set-KidTabletSetting -DisplayName 'Name' -TextScalePercent 150 -Background C:\path\to\picture-or-folder`.
  `Find-KidWallpaper pony` searches free wallpapers.
- **Story Maker's cast.** The twelve friends, their personalities, and the narrator are defined at the top of
  `apps/story-maker/index.html` (`CAST`). Rename them, change their traits, or add your child as a character. The
  voice settings in `apps/story-maker/voices.js` are keyed by the same names.
- **Draw With Me lessons.** `apps/draw-with-me/library.js` holds the lessons. See "Draw With Me library" below.
- **Voices.** The Windows voices work out of the box. See "Natural voices" below for the better ones.

## Updating an existing tablet
Copy the new package to the tablet and run `Install-KidApps.ps1` as administrator. It runs the package self-check
(the module copies embedded in Deploy and Reset match `KidTablet.psm1`, the Draw With Me library parses), installs
the module, rebuilds the home screen if its source changed, reinstalls every app, reapplies the tiles, and restarts
the child's session. Add `-SkipRestart` while the tablet is in use; the new versions load the next time each app is
opened. Settings in `config.json` and `.env` are kept.

## Managing it remotely
The `etducky/` folder holds scripts written to run as SYSTEM from an RMM, each with a settings block at the top and
plain-text output. The author runs them from ET Ducky; any RMM that runs PowerShell as SYSTEM can run them.

| Script | What it does |
| --- | --- |
| `Deploy-KidTablet.ps1` | First-time setup in one file, module embedded, non-interactive. Safe to rerun. |
| `Update-KidTabletApps.ps1` | Downloads a package zip from a URL (this repo's GitHub zipball by default), keeps the voice packs already on the tablet, backs up the previous package, and runs its `Install-KidApps.ps1`. One run is a full update. |
| `Set-KidTabletVoices.ps1` | Writes the voice settings into `.env`, checks that the voice server answers from the tablet, rewrites each app's `config.js`. |
| `Sync-KidTablet.ps1` | Reapplies the configuration from `config.json`. |
| `Get-KidTabletStatus.ps1` | Read-only status: module hash, home screen build, whether the child is signed in, installed apps, log tails. |
| `Update-KidTablet.ps1` | Replaces the module only (generated from `Update-KidTablet.template.ps1`). |
| `Reset-KidTablet.ps1` | Clean-slate reset, module embedded. |

`tools/Export-EtDuckyScripts.ps1 -Destination <folder>` writes the finished scripts, with the current module embedded
where needed, into the folder your RMM imports from. It refuses to run if the embedded copies are stale.

Two things to know when scripts run as SYSTEM from an agent: the agent's SYSTEM token may lack privileges an
interactive administrator has (the module writes folder ACLs without the audit section for this reason), and a
script's text should carry no secrets. Keys go into `.env` on the tablet once; the scripts read nothing back.

## Natural voices
All speaking apps can play pre-rendered neural voice clips instead of the Windows voice. See `voices/README.md`:
run `voices\make-voices.py` on your PC with edge-tts, piper, or VoiceStudio, then `Install-KidApps.ps1`. Without
packs, everything works with the Windows voice.

Story Maker reads whole stories, so it uses a live voice service instead of clips. The options, from `env.example`:
`TTS_PROVIDER=azure` or `openai` with the key, or `TTS_PROVIDER=voicestudio` with `TTS_URL` pointing at a
VoiceStudio server on your LAN, with Azure or OpenAI as the fallback when that PC is off. Details are in the Story
Maker section below.

## The apps
These notes were written for one child, so they say "she". Everything applies to any child.

### Level Up
`apps/level-up.html` has six subjects, each a ladder of levels from kindergarten to about 4th grade:
- **Reading**: picture words, tricky spellings, finishing sentences, opposites and synonyms, short and longer stories
  with comprehension questions, prefixes and suffixes, meaning from context.
- **Math**: adding and subtracting, regrouping, place value, three-digit math, times tables, division facts, word
  problems, two-digit by one-digit multiplying. Number answers are typed on a big keypad.
- **Color Lab**: paint mixing (red, yellow, blue), tints and shades, rainbow order, mixing light (red, green, blue),
  the color wheel, a mixing lab where she adds drops to match a color in the right proportion, and why things look
  the color they do.
- **Patterns**: repeating patterns, skip counting, number rules, missing numbers, growing and two-step patterns,
  turning shapes.
- **Time & Money**: analog clocks from o'clock to five-minute times, elapsed time, coin values, counting coins, making
  change.
- **Shapes & Fractions**: shape names, sides and corners, fractions of shapes and groups, comparing fractions,
  perimeter, area, equivalent fractions.

Each subject keeps its own level. Four right in a row moves up; two misses in the last four moves down one. A new
subject starts near 2nd grade and moves up after two in a row for its first eight questions, so it finds her level
quickly. A wrong answer shows the right one and why. **Daily Quest** mixes ten questions across subjects. Questions
are generated, so they do not come in a fixed order, and they are read aloud with the Windows voice (the 🔈 button
repeats). Progress is in `localStorage` under `levelup-v1`.

### Voice Band
`apps/voice-band.html` has three rooms, all built on her microphone:
- **Sing a Melody**: while she sings, a ball climbs a ladder of note names. Her tune is turned into notes (pitch
  tracking, then each steady stretch snapped to the nearest semitone) and shown with their letters. She can play it
  back on piano, flute, robot, bells or guitar, add a harmony, hear her own voice, or hear her voice auto-tuned to
  C major. **Copy me** plays a short tune for her to sing back; it compares the shape of the tune, so she can sing
  in her own key, and each match makes the next tune one note longer (level kept under `voiceband-copy`).
- **Voice Effects**: robot, monster, chipmunk, echo, choir, alien, auto-tune, backwards, underwater and radio. She
  records once and can tap through every effect on the same recording. **Live** mode runs six of them in real time
  and needs headphones (live sound through the tablet's own speakers feeds back).
- **Looper Band**: four tracks over a two-bar loop at slow, medium or fast. Recording starts on the beat after a
  count-in, is shifted for the tablet's audio delay, and loops in time with the other tracks. Each track has its own
  effect, mute and clear. The band is kept in IndexedDB (database `voiceband`).

Audio uses ScriptProcessor nodes because file:// pages cannot load AudioWorklet modules here.
`tools/test-voice-band.py` checks pitch detection, note finding, every effect and all three rooms with a fake
microphone.

### Trace With Me
`apps/trace-with-me.html` is a finger-tracing app: capital letters, small letters, numbers 0-9 and six shapes. A big
faint glyph appears, she colours it in with one finger, and when most of it is covered (with the ink mostly on the
glyph, so a scribble over the whole box does not count) it cheers, says the letter and a word, and gives her a
sticker. Earned stickers show on the star button and are kept in Edge local storage under the key `tracer-stickers`.
Nothing is sent anywhere and no API key is needed. To reset her sticker board, clear site data for the local apps
folder in her Edge profile, or open the app, press F12 and run `localStorage.removeItem('tracer-stickers')`.

### Kitchen Lab and Chemistry Lab
Built from `src/lab-games/` (`npm ci && npm test && npm run build`, then copy `dist/*.html` here).
Steps are read aloud as she reaches them, tapping the step line repeats it, and the book shows a Today card plus
stars on recipes she has finished before (stored under `lab-done-kitchen` / `lab-done-chem`).

### Draw With Me home screen
The picks grid starts with a **Today** tile (the drawing of the day, chosen from the current category and style) and a
**Surprise me!** dice (a random drawing she has not saved a picture of yet). Tiles she has already saved a picture
of carry a star, read from her gallery. Clearing the gallery clears the stars.
Her saved pictures live behind the slim **My pictures** bar at the bottom; tapping it opens them full screen.

### Playground Lab
`apps/playground-lab.html` is a 3D physics playground (three.js r149 and cannon-es, both MIT, bundled; same look as
the labs). A slingshot in the front lane (pull the ball back and let go; it fires toward the dominoes), a catapult
with a falling counterweight (the Fire button; it lobs onto the trampoline), a seesaw, a trampoline, a slide down
into a triangle of bowling pins, and a row of dominoes. The toolbox drops in beach balls, bowling balls, bouncy
balls, crates, pins, balloons (they float) and feathers (they drift). Knobs: moon gravity, slow motion, a gust of
wind, look from the other side, sound, reset. Everything with mass is draggable with a finger. No voice, no storage.

### Count With Me, Music Box, Story Maker
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
  also caps stories per day). Without a key, a built-in branching story is used. Every line is read by its speaker.
  Voices, best first: `TTS_PROVIDER=voicestudio` with `TTS_URL` uses the VoiceStudio app on your PC and the thirteen
  designed profiles named in `apps/story-maker/voices.js` (Narrator plus the cast; the file also holds each one's
  tuned sampler settings, and Beep's robot effect). The PC side is in `env.example`: the desktop app only listens on
  localhost, so its backend command is overridden with the `OMNIVOICE_BACKEND_CMD` user variable (the app's own
  `python.exe -m uvicorn main:app --app-dir <runtime>\backend --host 0.0.0.0 --port 3900`), and
  `%USERPROFILE%\.config\omnivoice\env` holds `OMNIVOICE_API_KEY` plus `OMNIVOICE_TRUSTED_NETWORKS=<your LAN subnet>`, so
  the tablet needs no credential (`TTS_PIN` stays unset; `Set-KidTabletVoices.ps1` removes it). The app's own
  "Share on your network" (port 3901 + PIN in `TTS_PIN`) works too but the PIN changes each time it is enabled.
  That works at home while the PC is on; add `TTS_KEY` (Azure Speech with `TTS_REGION`, or
  OpenAI with `TTS_FALLBACK=openai`) and it takes over when the PC is unreachable. With `TTS_PROVIDER=azure|openai`
  the key is the primary voice. Without any of these, the Windows voices are used, varied per character.

### Draw With Me library
`apps/draw-with-me/library.js` holds the pre-made lessons (152 as of this package: 70 simple, 82 detailed). To add more, edit
`library.js` (each lesson is a JSON object with its steps and the spoken lines) and run `Install-KidApps.ps1`; with an
Anthropic key, the app also learns new drawings on request and keeps them in the tablet's local storage.
Always install Draw With Me from the folder (it keeps `library.js` next to the app).

## Useful commands (after `Import-Module 'C:\Program Files\WindowsPowerShell\Modules\KidTablet' -Force`)
`Get-KidApp`, `Add-KidWebApp`, `Add-KidStoreApp`, `Set-KidApp`, `Remove-KidApp`, `Set-KidTabletSetting`,
`Sync-KidTablet -RestartSession`, `Update-KidAppConfig -Verbose` (after editing `.env`), `Get-KidTabletConfig`.

## Repo layout
| Path | What it is |
|---|---|
| `KidTablet.psm1` | The management module (account, kiosk, Edge policies, home screen, apps, sync). |
| `Setup-KidTablet.ps1` | Interactive first-time setup on the tablet (keep next to `KidTablet.psm1`). |
| `Install-KidApps.ps1` | Checks the package, installs or updates all apps, sets the tiles, restarts the session (`-SkipRestart` to leave it running). |
| `Deploy-KidTablet.ps1`, `Reset-KidTablet.ps1` | Single-file deploy and reset with the module embedded, for an RMM. |
| `apps/` | The eight apps and their tile images. Draw With Me and Story Maker are folders; the rest are single HTML files. |
| `env.example` | Template for `C:\ProgramData\KidTablet\.env` (API keys and voice settings; all optional). |
| `voices/` | `make-voices.py` builds voice clip packs into the apps. |
| `etducky/` | Scripts for running the setup from an RMM, and the template the exporter fills. |
| `tools/` | `Test-KidTabletPackage.ps1` (package self-check) and `Export-EtDuckyScripts.ps1`. |
| `src/` | Sources for the apps that are built before they land in `apps/`: `lab-games/` (Kitchen Lab and Chemistry Lab), the Playground Lab source, and the first Story Maker for reference. |

Kitchen Lab and Chemistry Lab are built from `src/lab-games/` (`npm ci && npm test && npm run build`, then copy
`dist/*.html` into `apps/`; its README explains the layout). Playground Lab is built from
`src/playground-lab-3d.src.html` as `src/README.md` describes. The other apps are single files edited in place.

## License
MIT. See `LICENSE`. Bundled libraries are listed in `THIRD-PARTY-NOTICES.md`.
