<script lang="ts">
    import { onMount } from 'svelte';
    import { pipeline, TextToAudioPipeline } from '@huggingface/transformers';
    
    let textToSpeak = 'Hello, my dog is cute';
    let audioContext: AudioContext;
    let synthesizer: TextToAudioPipeline;
    let isLoading = true;
    
    onMount(() => {
        // Initialize the Web Audio Context
        audioContext = new AudioContext();
        
        // Load the TTS model
        pipeline('text-to-speech', 'Xenova/speecht5_tts').then(tts => {
            synthesizer = tts;
            isLoading = false;
            console.log('TTS model loaded and ready');
        }).catch(error => {
            console.error('Error loading TTS model:', error);
        });
    });
    
    async function handleSubmit() {
        if (!synthesizer || !textToSpeak.trim()) return;
        
        try {
            const speaker_embeddings = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin';
            
            // Show loading state
            isLoading = true;
            
            // Generate speech
            const result = await synthesizer(textToSpeak, { speaker_embeddings });
            console.log('TTS result:', result);
            
            // The result contains audio data
            const audioArrayBuffer = result.audio;
            
            // Create an audio buffer directly from the Float32Array
            // We need to know the sample rate and number of channels from the model output
            const sampleRate = result.sampling_rate || 16000; // Default to 16kHz if not provided
            const audioBuffer = audioContext.createBuffer(1, audioArrayBuffer.length, sampleRate);
            
            // Copy the audio data to the buffer
            const channelData = audioBuffer.getChannelData(0);
            for (let i = 0; i < audioArrayBuffer.length; i++) {
                channelData[i] = audioArrayBuffer[i];
            }
            
            // Create and play the audio source
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start();
            isLoading = false;
            
        } catch (error) {
            console.error('Error generating speech:', error);
            isLoading = false;
        }
    }
</script>

<div class="p-4">
    <h1 class="text-2xl font-bold mb-4">Text to Speech</h1>
    
    <div class="mb-4">
        <label for="text-input" class="block mb-2">Text to speak:</label>
        <textarea 
            id="text-input"
            name="text-input" 
            bind:value={textToSpeak}
            class="w-full p-2 border border-gray-300 rounded"
            rows="3"
        ></textarea>
    </div>
    
    <button 
        on:click={handleSubmit} 
        disabled={isLoading || !synthesizer}
        class="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
    >
        {isLoading ? 'Processing...' : 'Speak Text'}
    </button>
    
    {#if isLoading}
        <p class="mt-2 text-gray-600">Loading model or generating speech...</p>
    {:else if !synthesizer}
        <p class="mt-2 text-gray-600">Loading TTS model...</p>
    {/if}
</div>