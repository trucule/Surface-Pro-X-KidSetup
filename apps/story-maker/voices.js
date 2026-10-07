// Story Maker cast voices for the VoiceStudio provider (TTS_PROVIDER=voicestudio in .env).
// Each entry names a VoiceStudio voice profile (matched by name at startup, so no IDs to copy) and the
// sampler settings that were tuned for it in VoiceStudio's Production overrides panel. The profile
// itself carries the designed voice (gender, age, pitch, accent) and its seed. "fx" is an effect that
// Story Maker applies to the audio itself: "robot" is a ring modulator plus a touch of bit crushing.
// Edit a character here after re-tuning it in VoiceStudio; nothing else needs to change.
window.VS_VOICES = {
  narrator: { profile: 'Narrator',     num_step: 40, guidance_scale: 2.4, speed: 1.0, t_shift: 0.35, position_temperature: 3.0, class_temperature: 0.6 },
  scarlett: { profile: 'Scarlett',     num_step: 40, guidance_scale: 1.4, speed: 1.0, t_shift: 0.10, position_temperature: 0.5, class_temperature: 0.0 },
  spark:    { profile: 'Spark',        num_step: 32, guidance_scale: 2.7, speed: 1.0, t_shift: 0.20, position_temperature: 8.0, class_temperature: 0.0 },
  bun:      { profile: 'Bun',          num_step: 44, guidance_scale: 2.3, speed: 1.0, t_shift: 0.25, position_temperature: 3.5, class_temperature: 0.1 },
  beep:     { profile: 'Beep',         num_step: 44, guidance_scale: 2.3, speed: 0.9, t_shift: 0.25, position_temperature: 0.5, class_temperature: 0.0, fx: 'robot' },
  twinkle:  { profile: 'Twinkle',      num_step: 57, guidance_scale: 1.2, speed: 0.9, t_shift: 0.40, position_temperature: 9.0, class_temperature: 1.1 },
  pip:      { profile: 'Pip',          num_step: 54, guidance_scale: 3.3, speed: 0.9, t_shift: 0.30, position_temperature: 8.0, class_temperature: 1.1 },
  hop:      { profile: 'Hop',          num_step: 44, guidance_scale: 4.0, speed: 0.7, t_shift: 0.30, position_temperature: 1.5, class_temperature: 1.5 },
  rusty:    { profile: 'Rusty',        num_step: 50, guidance_scale: 3.4, speed: 1.0, t_shift: 0.30, position_temperature: 3.5, class_temperature: 1.5 },
  luna:     { profile: 'Luna',         num_step: 50, guidance_scale: 3.4, speed: 1.0, t_shift: 0.30, position_temperature: 3.5, class_temperature: 1.5 },
  mo:       { profile: 'Mo',           num_step: 50, guidance_scale: 3.3, speed: 1.0, t_shift: 0.25, position_temperature: 4.5, class_temperature: 1.5 },
  zip:      { profile: 'Zip',          num_step: 10, guidance_scale: 1.0, speed: 0.9, t_shift: 0.10, position_temperature: 8.5, class_temperature: 0.7 },
  captain:  { profile: 'Captain Clam', num_step: 57, guidance_scale: 2.0, speed: 1.0, t_shift: 0.10, position_temperature: 5.0, class_temperature: 1.1 }
};
