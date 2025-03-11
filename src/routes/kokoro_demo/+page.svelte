<script lang="ts">
    import { KokoroTTS } from "kokoro-js";
    import { onMount } from "svelte";
    
    let textToSpeak = $state('Life is like a box of chocolates. You never know what you\'re gonna get.');
    let tts = $state<KokoroTTS>();
    let isLoading = $state(true);
    let isGenerating = $state(false);
    let availableVoices = $state<string[]>([]);
    let selectedVoice = $state("af_heart");
    
    onMount(() => {
        loadModel();
    });
    
    async function loadModel() {
        try {
            isLoading = true;
            const model_id = "onnx-community/Kokoro-82M-v1.0-ONNX";
            tts = await KokoroTTS.from_pretrained(model_id, {
                dtype: "fp32", // Options: "fp32", "fp16", "q8", "q4", "q4f16"
                device: "webgpu", // Options: "wasm", "webgpu" (web) or "cpu" (node)
            });
            
            // Get available voices
            availableVoices = Object.keys(tts.voices);
            isLoading = false;
            console.log('Kokoro TTS model loaded and ready');
        } catch (error) {
            console.error('Error loading Kokoro TTS model:', error);
            isLoading = false;
        }
    }
    
    async function handleSubmit() {
        if (!tts || !textToSpeak.trim()) return;
        
        try {
            isGenerating = true;
            
            // Generate speech
            const audioData = await tts.generate(textToSpeak, {
                voice: selectedVoice as keyof typeof tts.voices,
            });

            // Get the audio as a Blob
            const audioBlob = audioData.toBlob()

            // Create a URL for the Blob
            const audioUrl = URL.createObjectURL(audioBlob);

            // Create an audio element
            const audio = new Audio(audioUrl);
            
            // Play the audio
            await audio.play();
            
            isGenerating = false;
        } catch (error) {
            console.error('Error generating speech:', error);
            isGenerating = false;
        }
    }
</script>

<div class="p-4">
    <h1 class="text-2xl font-bold mb-4">Kokoro Text to Speech</h1>
    
    <div class="mb-4">
        <label for="text-input" class="block mb-2">Text to speak:</label>
        <textarea 
            id="text-input"
            name="text-input" 
            bind:value={textToSpeak}
            class="textarea w-full"
            rows="3"
        ></textarea>
    </div>
    
    {#if availableVoices.length > 0}
    <div class="mb-4">
        <label for="voice-select" class="block mb-2">Select voice:</label>
        <select 
            id="voice-select"
            bind:value={selectedVoice}
            class="select"
        >
            {#each availableVoices as voice}
                <option value={voice}>{voice}</option>
            {/each}
        </select>
    </div>
    {/if}
    
    <button 
        onclick={handleSubmit} 
        disabled={isLoading || isGenerating || !tts}
        class="btn btn-primary"
    >
        {isGenerating ? 'Generating...' : 'Speak Text'}
    </button>
    
    {#if isLoading}
        <p class="mt-2 text-gray-600">Loading Kokoro TTS model...</p>
    {:else if isGenerating}
        <p class="mt-2 text-gray-600">Generating speech...</p>
    {/if}
</div>