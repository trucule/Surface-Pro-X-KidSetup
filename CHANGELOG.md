# Changes

## 2026-10-21
- Home pill: every tap counts. Touch and pen are read as pointer input in the pill itself; before, Windows turned a
  tap into mouse events and a mouse-leave arriving mid-tap cancelled the press, so taps were lost at random.
- Home pill: shows over every app. It is pushed back on top on each check (an app that puts itself on top used to
  bury it until it closed) and placed on the screen of the app in front each time, so rotation and resolution
  changes no longer leave it off the edge.
- Home pill: one tap always leaves the app. Apps that ignore the close request are ended after 1.5 seconds, Store
  apps included (their process sits behind the ApplicationFrameHost window, and the sweep only ended Edge and
  desktop apps). The pill stays hidden for 2 seconds after a tap so a second tap cannot land on the closing app.

## 2026-10-12
- The repo is public under the MIT license (`LICENSE`, `THIRD-PARTY-NOTICES.md`). The README is written for
  someone setting up their own tablet: what you get, prerequisites, setup steps, making it yours, updating,
  remote management, voices, the apps, repo layout. The author's LAN address in examples is now a placeholder.
- The Kitchen Lab and Chemistry Lab source is in `src/lab-games/` (simulation, renderer, tests, Kenney CC0 models,
  esbuild bundler), so every app in `apps/` can be rebuilt from this repo.

## 2026-10-11
- Installing apps from ET Ducky works. `Add-KidLocalApp` (and the data folder setup) used `Set-Acl` with a freshly
  built ACL, which also writes the audit section and so needs SeSecurityPrivilege; the ET Ducky agent's SYSTEM
  token does not hold it, so every remote install stopped at the first app with "The process does not possess
  the 'SeSecurityPrivilege' privilege" while an interactive admin run succeeded. The module now writes only the
  Access and Owner sections through .NET (`Set-LockedDirAcl`), and takes just the DACL when ownership is refused.
- A Home button for leaving apps. Edge's own close button is a small target at tablet DPI and often ignores
  the first taps after standby, so the launcher now pins a large "Home" pill over the top-right corner
  whenever an app is in front (covering the caption buttons, so a stray tap cannot minimize either). One tap
  asks every app to close, sweeps anything stuck after 3 seconds and brings the tiles back, the same path the
  screen-off handler uses. The pill never takes focus, so the app keeps the keyboard until it closes.
- VoiceStudio on the LAN without a secret on the tablet: the PC trusts the home subnet (`OMNIVOICE_TRUSTED_NETWORKS`),
  so `Set-KidTabletVoices.ps1` now defaults to `$TtsSecret = 'none'`, removes any `TTS_PIN` from .env, and the script
  text carries no credential (no re-approval in ET Ducky when the PC's key rotates). `env.example` and the README
  describe the PC setup: the desktop app pins its backend to localhost, so `OMNIVOICE_BACKEND_CMD` overrides the
  backend command with `--host 0.0.0.0`; `OMNIVOICE_BIND_HOST` is not read by the desktop launcher.
- `Set-KidTabletVoices.ps1` no longer sets the execution policy (not needed under the ET Ducky agent).

## 2026-10-10
- ET Ducky scripts for the voices: `Update-KidTabletApps.ps1` installs a package zip from a URL (GitHub zipball with an
  optional token, optional SHA256), carrying each app's voice pack over from the copy already on the tablet, and runs
  the package's Install-KidApps.ps1; `Set-KidTabletVoices.ps1` writes the TTS_* settings into .env, checks that
  VoiceStudio answers from the tablet and lists any missing cast profile, then rewrites config.js and syncs.
- Turning the screen off now closes whatever app she has open, so she is back on the home screen when it comes on
  (an app left open used to stop responding to touch after the screen went off and on). The launcher listens for
  display off/on, asks every app window to close, force-closes stragglers after 3 seconds, and brings itself to the
  front.
- Draw With Me: the second drawing in a row showed no instructions, because the canvas was still parked on the
  coloring screen after saving. Starting any drawing now moves it back first.
- ET Ducky scripts: `etducky/` holds Sync-KidTablet.ps1, Get-KidTabletStatus.ps1 and the Update-KidTablet template;
  `tools/Export-EtDuckyScripts.ps1 -Destination <scripts-me>` writes them, with the current module embedded, into the
  scripts repo ET Ducky imports from. It refuses to export a package whose embedded module copies are stale.

## 2026-10-07
- **Story Maker voices from VoiceStudio**: `TTS_PROVIDER=voicestudio` with `TTS_URL` and `TTS_PIN` points the app at
  the VoiceStudio app shared on the LAN from the PC. The cast is thirteen designed voice profiles (Narrator plus the
  twelve friends), matched by name at startup; `apps/story-maker/voices.js` holds each one's tuned sampler settings
  and Beep gets a robot effect in Web Audio. A scene's lines are all requested up front and rendered in reading
  order, two at a time. When the PC is off, the Azure or OpenAI key (if set) is used, then the Windows voices.
- Bun is now an elderly British gentleman rabbit and Twinkle the confident leader; the story writer is told so.
- `make-voices.py --engine voicestudio --voice Narrator` renders the fixed prompts of every app with a VoiceStudio
  profile.

## 2026-10-06
- **Music Box v2**: Voice Lab page with six recording pads (raw audio kept in IndexedDB), effects (chipmunk, giant,
  backwards, robot, echo), "sing my notes" (her voice becomes a pitched instrument on the grid and the keyboard) and
  "in my song" (a voice gets its own grid row). Song page gains clap and shaker rows, marimba and organ, three scales,
  swing, three song slots, bouncing row animals and a tune-shaped surprise dice. Six spoken prompts (`music-box` voice
  pack; the Windows voice is the fallback).
- Fix: `Install-KidApps.ps1` threw "Embedded module copies are out of date" even when the self-check passed, because
  `tools/Test-KidTabletPackage.ps1` set no exit code on success (`$LASTEXITCODE` stayed `$null`). The test script now
  exits 0 on success and the installer resets and checks the code properly.

## 2026-10-05 (later)
- **Story Maker v2**: a cast of twelve friends with personalities (pick up to three), ten places, five story kinds, a
  drama dial and two lengths; stories told scene by scene with a choice at each break; Claude (Haiku by default)
  writes each scene live when `ANTHROPIC_API_KEY` is set, with a built-in branching story otherwise; every line is
  read in its speaker's voice (Azure Speech or OpenAI live TTS when `TTS_KEY` is set, else Windows voices varied per
  character; warm adult narrator). Now a folder app so the module can write its config.js.
- Module: `Update-KidAppConfig` passes `STORY_MODEL`, `TTS_PROVIDER`, `TTS_KEY`, `TTS_REGION` into config.js;
  embedded copies in Deploy/Reset updated; `env.example` documents them.

## 2026-10-05
- New app: **Playground Lab**, a 3D physics playground to match the labs (three.js + cannon-es, bundled, offline):
  slingshot, counterweight catapult, seesaw, trampoline, slide into bowling pins, dominoes, balls, crates, balloons,
  feathers; moon gravity, slow motion, wind, a second camera. Finger drag on anything. Eight apps total.
- Natural voices: every speaking app (Draw With Me, Trace, Count, Story, both labs) can play pre-rendered neural
  voice clips from a voice pack, falling back to the Windows voice per phrase. `voices/make-voices.py` collects all
  ~4,150 phrases, synthesizes them with edge-tts or Piper, and bakes the packs in. `Install-KidApps.ps1` reports
  which apps carry a pack.
- Three new apps: **Count With Me** (counting games, levels 1-5 / 1-10 / 5-20), **Music Box** (pentatonic tone matrix
  with synthesized bell, flute and pluck plus drums), **Story Maker** (pick hero, place and thing; story read aloud,
  tap any word to hear it). Each is one offline HTML file with a tile; `Install-KidApps.ps1` installs all seven apps.

## 2026-10-04
- New app: **Trace With Me** (`apps/trace-with-me.html`, tile `apps/trace-with-me-tile.png`). Letter, number and
  shape tracing with voice prompts, a coverage meter, a stay-inside rule, and a persistent sticker board.
- Draw With Me library grown from 50 to 152 lessons (batches 3-7: pets, farm, wild animals). Batch files, contact
  sheets and validator output are in `draw-with-me-kit.zip`.
- `Install-KidApps.ps1`: runs `tools\Test-KidTabletPackage.ps1` first and refuses to install if the embedded module
  copies in Deploy/Reset are stale; verifies `library.js` parses to lessons and prints the count; apps are a table
  (add a row to add an app); `-SkipRestart` switch.
- Draw With Me gallery no longer takes a strip of the home screen: it is a slim "My pictures · N" bar with four tiny
  thumbnails; tapping it opens her pictures as a full-screen sheet of big tiles (tap one to view or delete, as before).
- Draw With Me home screen: a **Today** tile (one drawing of the day, same all day, different tomorrow), a
  **Surprise me!** dice that picks a random drawing she has not saved yet, and a star on every tile she has already
  saved a picture of. All computed from her existing gallery; nothing new is stored.
- Kitchen Lab and Chemistry Lab (rebuilt from `lab-games` source, all 252 tests pass, 12 new):
  each recipe/experiment step is read aloud when it becomes the current one, tapping the step line repeats it,
  finishing says "You did it! You made X!"; the book opens with a Today's recipe / experiment card and puts a star on
  everything she has finished before (remembered on the tablet under `lab-done-kitchen` / `lab-done-chem`).
  All of it obeys the existing sound button.
- README: Trace With Me section, sticker reset, updated install notes.
