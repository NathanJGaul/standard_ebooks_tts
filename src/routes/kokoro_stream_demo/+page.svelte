<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import type { WorkerOutMessage, WorkerInMessage } from "$lib/types/worker";
    import type { VoiceType } from "$lib/types/voices";
    import sampleTexts from "$lib/client/sampleTexts";
    
    // State variables
    let textToSpeak = $state('Life is like a box of chocolates. You never know what you\'re gonna get.');
    let worker = $state<Worker | null>(null);
    let isLoading = $state(true);
    let isGenerating = $state(false);
    let availableVoices = $state<VoiceType[]>([]);
    let selectedVoice = $state<VoiceType>("af_heart");
    let deviceType = $state<string>("");
    let audioQueue = $state<Blob[]>([]);
    let currentAudio = $state<HTMLAudioElement | null>(null);
    let speechProgress = $state<string>("");
    let streamedText = $state<string>("");
    let speedSetting = $state<number>(1.0);
    
    // Initialize worker on mount
    onMount(() => {
        initializeWorker();
    });
    
    // Clean up worker on component destroy
    onDestroy(() => {
        if (worker) {
            worker.terminate();
        }
    });
    
    // Initialize the TTS web worker
    function initializeWorker() {
        try {
            isLoading = true;
            
            // Create the worker
            worker = new Worker(new URL('$lib/client/worker.ts', import.meta.url), { type: 'module' });
            
            // Set up event handler for worker messages
            worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
                const data = event.data;
                
                switch (data.status) {
                    case "device":
                        deviceType = data.device;
                        console.log(`Using device: ${deviceType}`);
                        break;
                        
                    case "ready":
                        availableVoices = data.voices as VoiceType[];
                        deviceType = data.device;
                        isLoading = false;
                        console.log('Kokoro TTS model loaded and ready through worker');
                        break;
                        
                    case "stream":
                        // Handle streaming chunk
                        streamedText = data.chunk.text;
                        const audioBlob = data.chunk.audio;
                        
                        // Add to audio queue and play if not already playing
                        addToAudioQueue(audioBlob);
                        break;
                        
                    case "complete":
                        // TTS generation complete
                        isGenerating = false;
                        if (data.audio) {
                            console.log('TTS generation complete with full audio');
                        } else {
                            console.log('TTS generation complete, no audio generated');
                        }
                        break;
                        
                    case "error":
                        console.error(`Worker error: ${data.error}`);
                        isGenerating = false;
                        isLoading = false;
                        break;
                }
            };
            
            // Handle worker errors
            worker.onerror = (error) => {
                console.error('Worker error:', error);
                isLoading = false;
                isGenerating = false;
            };
            
        } catch (error) {
            console.error('Error initializing worker:', error);
            isLoading = false;
        }
    }
    
    // Function to set a random text from samples
    function setRandomText() {
        const randomIndex = Math.floor(Math.random() * sampleTexts.length);
        textToSpeak = sampleTexts[randomIndex];
    }
    
    // Format voice name for display
    function formatVoiceName(voice: VoiceType): string {
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
        
        // Get full voice type text (keep this for accessibility and clarity)
        let voiceType = '';
        if (typeCode === 'af') voiceType = 'American Female';
        else if (typeCode === 'am') voiceType = 'American Male';
        else if (typeCode === 'bf') voiceType = 'British Female';
        else if (typeCode === 'bm') voiceType = 'British Male';
        else voiceType = typeCode.toUpperCase(); // Fallback for unknown types
        
        // Capitalize the name
        const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
        
        // Format with emojis: [Flag][Gender] Name (Voice Type)
        // return `${countryEmoji}${genderEmoji} ${capitalizedName} (${voiceType})`;
        return `${countryEmoji}${genderEmoji} ${capitalizedName}`;
    }
    
    // Handle form submission to generate speech
    async function handleSubmit() {
        if (!worker || !textToSpeak.trim() || isGenerating) return;
        
        try {
            isGenerating = true;
            streamedText = "";
            
            // Clear existing audio queue
            audioQueue = [];
            if (currentAudio) {
                currentAudio.pause();
                currentAudio = null;
            }
            
            // Send message to worker to generate speech
            const message: WorkerInMessage = {
                text: textToSpeak,
                voice: selectedVoice,
                speed: speedSetting
            };
            
            worker.postMessage(message);
        } catch (error) {
            console.error('Error sending message to worker:', error);
            isGenerating = false;
        }
    }
    
    // Add audio blob to queue and play if not already playing
    function addToAudioQueue(audioBlob: Blob) {
        audioQueue = [...audioQueue, audioBlob];
        
        // If not currently playing audio, start playing
        if (!currentAudio) {
            playNextInQueue();
        }
    }
    
    // Play next audio in queue
    function playNextInQueue() {
        if (audioQueue.length === 0) {
            currentAudio = null;
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
            playNextInQueue();
        };
        
        currentAudio = audio;
        
        // Update progress indicator
        speechProgress = `Playing chunk ${streamedText.length > 30 ? streamedText.substring(0, 30) + '...' : streamedText}`;
        
        // Play the audio
        audio.play().catch(error => {
            console.error('Error playing audio:', error);
            URL.revokeObjectURL(audioUrl);
            playNextInQueue();
        });
    }
</script>

<div class="p-4">
    <h1 class="text-2xl font-bold mb-4">Kokoro Text to Speech (Worker + Stream)</h1>
    
    <div class="mb-4">
        <label for="text-input" class="block mb-2">Text to speak:</label>
        <textarea 
            id="text-input"
            name="text-input" 
            bind:value={textToSpeak}
            class="textarea w-full"
            rows="3"
        ></textarea>
        <div class="mt-2 flex gap-2">
            <button 
                onclick={setRandomText}
                class="btn btn-secondary"
                type="button"
            >
                Random Text
            </button>
            
            {#if deviceType}
                <span class="badge badge-outline my-auto">Device: {deviceType}</span>
            {/if}
        </div>
    </div>
    
    <div class="flex flex-wrap gap-4">
        {#if availableVoices.length > 0}
        <div class="mb-4">
            <label for="voice-select" class="block mb-2">Voice:</label>
            <select 
                id="voice-select"
                bind:value={selectedVoice}
                class="select select-bordered"
            >
                {#each availableVoices as voice}
                    <option value={voice}>{formatVoiceName(voice)}</option>
                {/each}
            </select>
        </div>
        {/if}
        
        <div class="mb-4">
            <label for="speed-select" class="block mb-2">Speed:</label>
            <input 
                id="speed-select"
                type="range" 
                min="0.5" 
                max="2" 
                step="0.1" 
                bind:value={speedSetting} 
                class="range range-sm"
            />
            <span class="ml-2">{speedSetting.toFixed(1)}x</span>
        </div>
    </div>
    
    <button 
        onclick={handleSubmit} 
        disabled={isLoading || isGenerating || !worker}
        class="btn btn-primary"
    >
        {isGenerating ? 'Generating...' : 'Speak Text'}
    </button>
    
    {#if isLoading}
        <div class="mt-4">
            <div class="alert">
                <span>Loading Kokoro TTS model...</span>
                <span class="loading loading-spinner"></span>
            </div>
        </div>
    {:else if isGenerating}
        <div class="mt-4">
            <div class="alert">
                <span>Generating speech...</span>
                <span class="loading loading-spinner"></span>
            </div>
        </div>
    {/if}
    
    {#if streamedText}
        <div class="mt-4 p-4 border rounded-md bg-base-200">
            <h3 class="text-lg font-semibold mb-2">Currently speaking:</h3>
            <p>{streamedText}</p>
        </div>
    {/if}
</div>