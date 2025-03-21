import type { WorkerOutMessage, WorkerInMessage } from "$lib/types/worker";
import type { VoiceType } from "$lib/types/voices";

/**
 * Configuration for the TTS Worker Service
 */
export interface TTSWorkerConfig {
  /** Callback when device type is detected */
  onDeviceDetected?: (device: string) => void;
  /** Callback when worker is ready with available voices */
  onReady?: (voices: VoiceType[], device: string) => void;
  /** Callback when a speech chunk is streamed */
  onStream?: (text: string, audioBlob: Blob) => void;
  /** Callback when speech generation is complete */
  onComplete?: (fullAudio: Blob | null) => void;
  /** Callback when an error occurs */
  onError?: (error: string) => void;
}

/**
 * A service to manage TTS web worker initialization and communication
 */
export class TTSWorkerService {
  private worker: Worker | null = null;
  private config: TTSWorkerConfig;
  private isBusy: boolean = false;
  private requestQueue: Array<{
    text: string;
    voice: VoiceType;
    speed: number;
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];
  
  /**
   * Creates a new TTS Worker Service
   * @param config Configuration for callbacks
   */
  constructor(config: TTSWorkerConfig = {}) {
    this.config = config;
  }
  
  /**
   * Initialize the TTS web worker
   * @returns Promise that resolves when the worker is initialized
   */
  public initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create the worker
        this.worker = new Worker(new URL('$lib/client/worker.ts', import.meta.url), { type: 'module' });
        
        // Set up event handler for worker messages
        this.worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
          const data = event.data;
          
          switch (data.status) {
            case "device":
              if (this.config.onDeviceDetected) {
                this.config.onDeviceDetected(data.device);
              }
              break;
              
            case "ready":
              if (this.config.onReady) {
                this.config.onReady(data.voices as VoiceType[], data.device);
              }
              resolve(); // Worker is initialized
              break;
              
            case "stream":
              if (this.config.onStream) {
                this.config.onStream(data.chunk.text, data.chunk.audio);
              }
              break;
              
            case "complete":
              if (this.config.onComplete) {
                this.config.onComplete(data.audio);
              }
              // Process is complete, mark as not busy
              this.isBusy = false;
              
              // Process next request in queue if any
              this.processNextInQueue();
              break;
              
            case "error":
              if (this.config.onError) {
                this.config.onError(data.error);
              }
              
              // On error, also free up the worker
              this.isBusy = false;
              
              // If the error is about session already started, 
              // retry after a short delay
              if (data.error === "TTS: The session has already started") {
                setTimeout(() => {
                  this.processNextInQueue();
                }, 100);
              } else {
                // For other errors, try the next request
                this.processNextInQueue();
              }
              break;
          }
        };
        
        // Handle worker errors
        this.worker.onerror = (error) => {
          console.error('Worker error:', error);
          
          if (this.config.onError) {
            this.config.onError(error.message || 'Unknown worker error');
          }
          
          // Free the worker on error
          this.isBusy = false;
          
          reject(error);
        };
        
      } catch (error) {
        console.error('Error initializing worker:', error);
        
        if (error instanceof Error && this.config.onError) {
          this.config.onError(error.message);
        }
        
        reject(error);
      }
    });
  }
  
  /**
   * Process the next request in the queue
   */
  private processNextInQueue(): void {
    if (this.requestQueue.length === 0 || this.isBusy) {
      return; // Nothing to process or already processing
    }
    
    const nextRequest = this.requestQueue.shift();
    if (!nextRequest) return;
    
    const { text, voice, speed, resolve, reject } = nextRequest;
    
    try {
      // Mark as busy before sending the message
      this.isBusy = true;
      
      if (!this.worker) {
        throw new Error('Worker not initialized. Call initialize() first.');
      }
      
      // Send message to worker to generate speech
      const message: WorkerInMessage = {
        text,
        voice,
        speed
      };
      
      this.worker.postMessage(message);
      resolve();
    } catch (error) {
      console.error('Error sending message to worker:', error);
      
      if (error instanceof Error && this.config.onError) {
        this.config.onError(error.message);
      }
      
      // Free the worker
      this.isBusy = false;
      
      reject(error instanceof Error ? error : new Error('Unknown error'));
      
      // Try the next request
      this.processNextInQueue();
    }
  }
  
  /**
   * Generate speech from text using the worker
   * @param text The text to convert to speech
   * @param voice The voice to use
   * @param speed The speed factor (1.0 = normal)
   * @returns Promise that resolves when the request is sent
   */
  public generateSpeech(text: string, voice: VoiceType, speed: number = 1.0): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        const error = new Error('Worker not initialized. Call initialize() first.');
        
        if (this.config.onError) {
          this.config.onError(error.message);
        }
        
        reject(error);
        return;
      }
      
      // Add request to queue
      this.requestQueue.push({ text, voice, speed, resolve, reject });
      
      // Process if not already busy
      if (!this.isBusy) {
        this.processNextInQueue();
      }
    });
  }
  
  /**
   * Terminates the worker to clean up resources
   */
  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    
    // Clear the queue
    this.requestQueue = [];
    this.isBusy = false;
  }
}

/**
 * Create an audio playback queue for streaming TTS
 * @param options Optional configuration options
 * @returns Object with methods to manage audio queue
 */
export function createAudioQueue(options: { 
  onQueueEmpty?: () => void,
  onPlaybackStarted?: () => void
} = {}) {
  let audioQueue: Blob[] = [];
  let currentAudio: HTMLAudioElement | null = null;
  const { onQueueEmpty, onPlaybackStarted } = options;
  
  /**
   * Add audio blob to queue and play if not already playing
   * @param audioBlob Audio blob to add to the queue
   */
  function addToQueue(audioBlob: Blob) {
    audioQueue = [...audioQueue, audioBlob];
    
    // If not currently playing audio, start playing
    if (!currentAudio) {
      playNext();
    }
  }
  
  /**
   * Play next audio in queue
   */
  function playNext() {
    if (audioQueue.length === 0) {
      currentAudio = null;
      // Call onQueueEmpty callback if provided
      if (onQueueEmpty) {
        onQueueEmpty();
      }
      return;
    }
    
    // Get next blob from queue
    const nextBlob = audioQueue[0];
    audioQueue = audioQueue.slice(1);
    
    // Create audio element and play
    const audioUrl = URL.createObjectURL(nextBlob);
    const audio = new Audio(audioUrl);
    
    audio.onended = () => {
      // Clean up URL object
      URL.revokeObjectURL(audioUrl);
      // Play next in queue when done
      playNext();
    };
    
    audio.onplay = () => {
      // Call onPlaybackStarted callback when audio starts playing
      if (onPlaybackStarted) {
        onPlaybackStarted();
      }
    };
    
    currentAudio = audio;
    
    // Play the audio
    audio.play().catch(error => {
      console.error('Error playing audio:', error);
      URL.revokeObjectURL(audioUrl);
      playNext();
    });
  }
  
  /**
   * Clear the audio queue and stop current playback
   */
  function clearQueue() {
    audioQueue = [];
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
  }
  
  return {
    addToQueue,
    playNext,
    clearQueue
  };
}

/**
 * Format voice name for display
 * @param voice Voice ID to format
 * @returns Formatted voice name with emojis
 */
export function formatVoiceName(voice: VoiceType): string {
  // Parse voice ID format (e.g., "af_heart", "bm_daniel")
  const parts = voice.split('_');
  if (parts.length !== 2) return voice;
  
  const [typeCode, name] = parts;
  
  // Map country codes to flag emojis
  let countryEmoji = '';
  if (typeCode.startsWith('a')) countryEmoji = '🇺🇸'; // American
  else if (typeCode.startsWith('b')) countryEmoji = '🇬🇧'; // British
  else countryEmoji = '🌐'; // Unknown country
  
  // Map gender codes to gender emojis
  let genderEmoji = '';
  if (typeCode.endsWith('f')) genderEmoji = '👩'; // Female
  else if (typeCode.endsWith('m')) genderEmoji = '👨'; // Male
  else genderEmoji = '🧑'; // Unknown gender
  
  // Capitalize the name
  const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
  
  // Format with emojis: [Flag][Gender] Name
  return `${countryEmoji}${genderEmoji} ${capitalizedName}`;
}