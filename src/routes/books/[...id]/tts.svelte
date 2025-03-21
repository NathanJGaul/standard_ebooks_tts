
<div class="border rounded-lg p-4 bg-base-200">
    <div class="flex justify-between mb-4">
        <h3 class="font-semibold">Text for TTS</h3>
        {#if deviceType}
            <span class="badge badge-outline my-auto">Device: {deviceType}</span>
        {/if}
    </div>
    
    <div class="max-h-96 overflow-y-auto mb-4 p-4 bg-base-100 rounded">
        <p style="white-space: pre-wrap;">{ttsText}</p>
    </div>
    
    <!-- TTS Controls -->
    <div class="flex flex-wrap gap-4 mb-4">
        {#if availableVoices.length > 0}
        <div class="mb-2">
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
        
        <div class="mb-2">
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
    
    <div class="flex justify-between">
        <button class="btn btn-sm btn-outline" disabled={currentChunk === 0} onclick={prevChunk}>
            Previous Chunk
        </button>
        
        <button 
            class="btn btn-sm btn-primary" 
            onclick={speakText}
            disabled={isGenerating || !worker}
        >
            {isGenerating ? 'Generating...' : 'Read Aloud'}
        </button>
        
        <button class="btn btn-sm btn-outline" disabled={currentChunk === totalChunks - 1} onclick={nextChunk}>
            Next Chunk
        </button>
    </div>
</div>
<div class="mt-4 p-4 border rounded-md bg-base-200">
    <h3 class="text-lg font-semibold mb-2">Currently speaking:</h3>
    <p>{streamedText}</p>
</div>
<div class="mt-4">
    <div class="alert">
        <span>Generating speech...</span>
        <span class="loading loading-spinner"></span>
    </div>
</div>