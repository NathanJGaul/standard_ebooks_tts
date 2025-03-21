<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import type { VoiceType } from "$lib/types/voices";
    import sampleTexts from "$lib/client/sampleTexts";
    import { TTSWorkerService, createAudioQueue, formatVoiceName } from "$lib/client/ttsWorkerService";
    
    // State variables
    let textToSpeak = $state('Life is like a box of chocolates. You never know what you\'re gonna get.');
    let ttsService = $state<TTSWorkerService | null>(null);
    let isLoading = $state(true);
    let isGenerating = $state(false);
    let availableVoices = $state<VoiceType[]>([]);
    let selectedVoice = $state<VoiceType>("af_heart");
    let deviceType = $state<string>("");
    let streamedText = $state<string>("");
    let speedSetting = $state<number>(1.0);
    let error = $state<string>("");
    
    // Initialize audio queue
    const audioQueue = createAudioQueue();
    
    // Initialize worker on mount
    onMount(() => {
        initializeTTSService();
    });
    
    // Clean up worker on component destroy
    onDestroy(() => {
        if (ttsService) {
            ttsService.terminate();
        }
    });
    
    // Initialize the TTS service
    async function initializeTTSService() {
        try {
            isLoading = true;
            
            // Create the TTS service with callbacks
            ttsService = new TTSWorkerService({
                onDeviceDetected: (device) => {
                    deviceType = device;
                    console.log(`Using device: ${deviceType}`);
                },
                onReady: (voices, device) => {
                    availableVoices = voices;
                    deviceType = device;
                    isLoading = false;
                    console.log('Kokoro TTS model loaded and ready through worker');
                },
                onStream: (text, audio) => {
                    streamedText = text;
                    audioQueue.addToQueue(audio);
                },
                onComplete: (audio) => {
                    isGenerating = false;
                    if (audio) {
                        console.log('TTS generation complete with full audio');
                    } else {
                        console.log('TTS generation complete, no audio generated');
                    }
                },
                onError: (errorMsg) => {
                    console.error(`Worker error: ${errorMsg}`);
                    isGenerating = false;
                    isLoading = false;
                    error = errorMsg;
                }
            });
            
            // Initialize the worker
            await ttsService.initialize();
            
        } catch (err) {
            console.error('Error initializing TTS service:', err);
            isLoading = false;
            error = err instanceof Error ? err.message : 'Unknown error initializing TTS service';
        }
    }
    
    // Function to set a random text from samples
    function setRandomText() {
        const randomIndex = Math.floor(Math.random() * sampleTexts.length);
        textToSpeak = sampleTexts[randomIndex];
    }
    
    // Handle form submission to generate speech
    async function handleSubmit() {
        if (!ttsService || !textToSpeak.trim() || isGenerating) return;
        
        try {
            isGenerating = true;
            streamedText = "";
            error = "";
            
            // Clear existing audio queue
            audioQueue.clearQueue();
            
            // Generate speech using our service
            await ttsService.generateSpeech(textToSpeak, selectedVoice, speedSetting);
        } catch (err) {
            console.error('Error generating speech:', err);
            error = err instanceof Error ? err.message : 'Unknown error generating speech';
            isGenerating = false;
        }
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
        disabled={isLoading || isGenerating || !ttsService}
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
    
    {#if error}
        <div class="mt-4">
            <div class="alert alert-error">
                <span>{error}</span>
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