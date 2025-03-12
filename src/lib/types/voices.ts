import { KokoroTTS } from "kokoro-js";

export type VoiceType = keyof typeof KokoroTTS.prototype.voices;