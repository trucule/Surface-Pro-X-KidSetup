# Changes

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
