/**
 * Types for TTS worker communication and audio processing
 */

import type { VoiceType } from "./voices";

// Device and model configuration types
export type DeviceType = "webgpu" | "wasm";
export type ModelDtype = "q8" | "fp32";

// Worker message types
export type WorkerOutMessage =
  | { status: "device"; device: DeviceType }
  | { status: "ready"; voices: string[]; device: DeviceType }
  | { status: "stream"; chunk: { audio: Blob; text: string } }
  | { status: "complete"; audio: Blob | null }
  | { status: "error"; error: string };

export type WorkerInMessage = {
  text: string;
  voice: VoiceType;
  speed: number;
};

// Audio data types
export interface AudioChunk {
  audio: Float32Array;
  sampling_rate: number;
  toBlob: () => Blob;
}
