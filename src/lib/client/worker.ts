import { KokoroTTS, TextSplitterStream } from "kokoro-js";
import { detectWebGPU } from "$lib/client/utils";
import type {
  AudioChunk,
  DeviceType,
  ModelDtype,
  WorkerInMessage,
  WorkerOutMessage,
} from "$lib/types/worker";
import type { VoiceType } from "$lib/types/voices";

/**
 * Web worker for text-to-speech processing using Kokoro TTS.
 * Handles model loading, streaming audio generation, and communication with the main thread.
 */

// Device detection
const device: DeviceType = (await detectWebGPU()) ? "webgpu" : "wasm";
self.postMessage({ status: "device", device } as WorkerOutMessage);

// Configuration
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const DTYPE: ModelDtype = device === "wasm" ? "q8" : "fp32";

// Load the model
try {
  const tts = await KokoroTTS.from_pretrained(MODEL_ID, {
    dtype: DTYPE,
    device,
  });

  self.postMessage({
    status: "ready",
    voices: Object.keys(tts.voices) as VoiceType[],
    device,
  } as WorkerOutMessage);

  // Set up message handler for TTS requests
  self.addEventListener("message", async (e: MessageEvent) => {
    const { text, voice, speed } = e.data as WorkerInMessage;

    try {
      await processTextToSpeech(text, voice, speed, tts);
    } catch (error) {
      self.postMessage({
        status: "error",
        error: error instanceof Error
          ? error.message
          : "Unknown error processing speech",
      } as WorkerOutMessage);
    }
  });
} catch (e) {
  const errorMessage = e instanceof Error
    ? e.message
    : "Failed to load TTS model";
  self.postMessage({
    status: "error",
    error: errorMessage,
  } as WorkerOutMessage);
}

/**
 * Processes text to speech, streams chunks back to main thread,
 * and sends the complete audio when finished.
 *
 * @param text - The text to convert to speech
 * @param voice - The voice to use
 * @param speed - The speech speed
 * @param tts - The KokoroTTS instance
 */
async function processTextToSpeech(
  text: string,
  voice: VoiceType,
  speed: number,
  tts: KokoroTTS,
): Promise<void> {
  // Set up text streaming
  const streamer = new TextSplitterStream();
  streamer.push(text);
  streamer.close(); // Indicate we won't add more text

  const stream = tts.stream(streamer, { voice, speed });
  const chunks: AudioChunk[] = [];

  // Process and stream each chunk
  for await (const { text, audio } of stream) {
    self.postMessage({
      status: "stream",
      chunk: {
        audio: audio.toBlob(),
        text,
      },
    } as WorkerOutMessage);
    chunks.push(audio as AudioChunk);
  }

  // Merge audio chunks
  if (chunks.length > 0) {
    const mergedAudio = mergeAudioChunks(chunks);
    self.postMessage({
      status: "complete",
      audio: mergedAudio.toBlob(),
    } as WorkerOutMessage);
  } else {
    self.postMessage({
      status: "complete",
      audio: null,
    } as WorkerOutMessage);
  }
}

/**
 * Merge multiple audio chunks into a single audio object
 *
 * @param chunks - Array of audio chunks
 * @returns - Merged audio object
 */
function mergeAudioChunks(chunks: AudioChunk[]): AudioChunk {
  const sampling_rate = chunks[0].sampling_rate;
  const length = chunks.reduce((sum, chunk) => sum + chunk.audio.length, 0);
  const waveform = new Float32Array(length);

  let offset = 0;
  for (const { audio } of chunks) {
    waveform.set(audio, offset);
    offset += audio.length;
  }

  // Create a new merged RawAudio
  // @ts-expect-error - So that we don't need to import RawAudio
  return new chunks[0].constructor(waveform, sampling_rate);
}
