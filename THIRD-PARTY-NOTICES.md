# Third-party notices

The apps bundle these libraries inside their HTML files. Both are under the MIT License, and each one's license
text travels with the bundled code.

| Library | Version | Used by |
| --- | --- | --- |
| [three.js](https://github.com/mrdoob/three.js) | r149 | Kitchen Lab, Chemistry Lab, Playground Lab |
| [cannon-es](https://github.com/pmndrs/cannon-es) | bundled | Playground Lab |

The Kitchen Lab and Chemistry Lab source (`src/lab-games/`) also uses:

| Item | Where | License |
| --- | --- | --- |
| [Kenney](https://kenney.nl) food and furniture kits | `src/lab-games/models/` (GLB models, bundled into the built apps) | CC0 1.0 |
| [esbuild](https://github.com/evanw/esbuild) | build tool, not bundled | MIT |
| [@webxr-input-profiles/assets](https://github.com/immersive-web/webxr-input-profiles) | generic hand model, bundled | MIT |

Optional tools the voice pipeline calls and that you install yourself, each under its own license:
[edge-tts](https://github.com/rany2/edge-tts), [piper](https://github.com/rhasspy/piper),
[VoiceStudio](https://github.com/debpalash/voicestudio), [ffmpeg](https://ffmpeg.org).

Cloud services the apps can call with your own keys: Anthropic (Story Maker, Draw With Me), Azure Speech and
OpenAI (voices).
