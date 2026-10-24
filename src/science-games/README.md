# Science games

Sources for Circuit Lab, Ecosystem Aquarium and Planet Explorer. Each file is the whole app except three.js r149
(MIT), which `tools/build-science-games.py` fetches with `npm pack three@0.149.0` and inlines at the
`/*@@THREE@@*/` marker. The build writes `apps/<slug>.html`. Edit the source here, rebuild, then run
`tools/test-<slug>.py`.
