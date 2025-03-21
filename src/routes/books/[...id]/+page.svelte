<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import type { PageProps } from './$types';
    import { Play } from 'lucide-svelte';
    import { TTSWorkerService, createAudioQueue, formatVoiceName } from "$lib/client/ttsWorkerService";
    import type { VoiceType } from "$lib/types/voices";
    import type { BookContent } from "$lib/types/books";

    let { data }: PageProps = $props();

    const { id, bookDetails } = data;

    // State variables
    let ttsService = $state<TTSWorkerService | null>(null);
    let bookContent = $state<BookContent | null>(null);
    let deviceType = $state<string>("");
    let availableVoices = $state<VoiceType[]>([]);
    let selectedVoice = $state<VoiceType>("af_heart");
    let isGenerating = $state(false);
    let streamedText = $state<string>("");
    let speedSetting = $state<number>(1.0);
    let error = $state<string>("");

    // Paragraph queue management
    interface TTSChunk {
        text: string;
        chapterNumber?: number;
        isChapterTitle?: boolean;
    }

    let paragraphQueue = $state<TTSChunk[]>([]);
    let currentParagraphIndex = $state(0);
    let isPlaying = $state(false);
    let isPaused = $state(false);
    
    // Initialize audio queue with preloading support
    const audioQueue = createAudioQueue({
        onQueueEmpty: () => {
            // When the audio queue is empty, we've fully played everything
            if (isPlaying && !isPaused && currentParagraphIndex >= paragraphQueue.length) {
                // We've reached the end of the book
                isPlaying = false;
                isGenerating = false;
            }
        },
        onPlaybackStarted: () => {
            // When audio playback starts, preload the next paragraph if possible
            if (isPlaying && !isPaused && currentParagraphIndex < paragraphQueue.length - 1) {
                // Preload next paragraph
                preloadNextParagraph();
            }
        }
    });

    // Fetch books on component load
    onMount(async () => {
        initializeTTSService();
    });
    
    // Clean up worker on component destroy
    onDestroy(() => {
        if (ttsService) {
            ttsService.terminate();
        }
    });

    async function fetchBookContent(bookId: string): Promise<BookContent | null> {
    try {
        const response = await fetch(`/api/books/${bookId}/content`);
        if (!response.ok) {
            throw new Error(`Error fetching book content: ${response.status}`);
        }
        return await response.json();
    } catch (err) {
        console.error('Error loading book content:', err);
        return null;
    }
}

    // Initialize the TTS service
    async function initializeTTSService() {
        try {
            // Create the TTS service with callbacks
            ttsService = new TTSWorkerService({
                onDeviceDetected: (device) => {
                    deviceType = device;
                    console.log(`Using device: ${deviceType}`);
                },
                onReady: (voices, device) => {
                    availableVoices = voices;
                    deviceType = device;
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
                    error = `TTS Error: ${errorMsg}`;
                }
            });
            
            // Initialize the worker
            await ttsService.initialize();
            
        } catch (err) {
            console.error('Error initializing TTS service:', err);
            error = err instanceof Error ? err.message : 'Unknown error initializing TTS service';
        }
    }
    
    // Handle Play button click - generate speech
    async function handlePlay() {
        if (!ttsService || !bookDetails || isGenerating) return;
        
        try {
            // Clear previous state
            streamedText = "";
            error = "";
            isGenerating = true;
            isPlaying = true;
            isPaused = false;
            
            // Clear existing audio queue
            audioQueue.clearQueue();
            
            // Get book content
            bookContent = await fetchBookContent(id);
            
            if (!bookContent || !bookContent.chapters || bookContent.chapters.length === 0) {
                throw new Error('Failed to fetch book content');
            }
            
            // Prepare paragraphs for sequential processing
            paragraphQueue = prepareTTSChunks(bookContent);
            currentParagraphIndex = 0;
            
            // Begin processing the first paragraph
            processNextParagraph();
            
        } catch (err) {
            console.error('Error generating speech:', err);
            error = err instanceof Error ? err.message : 'Unknown error generating speech';
            isGenerating = false;
            isPlaying = false;
        }
    }
    
    // Format the book content into a readable format for TTS
    function formatBookContentForReading(content: BookContent): string {
        if (!content.chapters || content.chapters.length === 0) {
            return `${bookDetails?.title || 'Book'} by ${bookDetails?.author || 'Unknown author'}. No content available.`;
        }
        
        let formattedText = `${bookDetails?.title || 'Book'} by ${bookDetails?.author || 'Unknown author'}.\n\n`;
        
        // Process each chapter
        content.chapters.forEach(chapter => {
            // Add chapter title if it exists
            if (chapter.chapterTitle) {
                formattedText += `Chapter ${chapter.chapterNumber}: ${chapter.chapterTitle}\n\n`;
            } else {
                formattedText += `Chapter ${chapter.chapterNumber}\n\n`;
            }
            
            // Add chapter paragraphs
            if (chapter.chapterContents && chapter.chapterContents.length > 0) {
                formattedText += chapter.chapterContents.join("\n\n") + "\n\n";
            }
        });
        
        return formattedText;
    }

    // Format the book content into chunks for sequential TTS processing
    function prepareTTSChunks(content: BookContent): TTSChunk[] {
        const chunks: TTSChunk[] = [];
        
        // Add book title and author as the first chunk
        chunks.push({
            text: `${bookDetails?.title || 'Book'} by ${bookDetails?.author || 'Unknown author'}.`,
            isChapterTitle: false
        });
        
        // Process each chapter
        content.chapters.forEach(chapter => {
            // Add chapter title
            if (chapter.chapterTitle) {
                chunks.push({
                    text: `Chapter ${chapter.chapterNumber}: ${chapter.chapterTitle}`,
                    chapterNumber: chapter.chapterNumber,
                    isChapterTitle: true
                });
            } else {
                chunks.push({
                    text: `Chapter ${chapter.chapterNumber}`,
                    chapterNumber: chapter.chapterNumber,
                    isChapterTitle: true
                });
            }
            
            // Add chapter paragraphs
            if (chapter.chapterContents && chapter.chapterContents.length > 0) {
                chapter.chapterContents.forEach(paragraph => {
                    if (paragraph.trim()) {
                        chunks.push({
                            text: paragraph,
                            chapterNumber: chapter.chapterNumber,
                            isChapterTitle: false
                        });
                    }
                });
            }
        });
        
        return chunks;
    }
    
    // Process next paragraph in the queue
    async function processNextParagraph() {
        if (currentParagraphIndex >= paragraphQueue.length) {
            isPlaying = false;
            isGenerating = false;
            return;
        }
        
        if (!ttsService || isPaused) return;
        
        isGenerating = true;
        const chunk = paragraphQueue[currentParagraphIndex];
        streamedText = chunk.text;
        
        try {
            // Check that text is not empty before sending to TTS engine
            if (!chunk.text || chunk.text.trim() === '') {
                console.warn('Empty text chunk found, skipping to next paragraph');
                currentParagraphIndex++;
                processNextParagraph();
                return;
            }
            
            // Generate speech for just this paragraph
            await ttsService.generateSpeech(chunk.text, selectedVoice, speedSetting);
        } catch (err) {
            console.error('Error generating speech for paragraph:', err);
            error = err instanceof Error ? err.message : 'Unknown error generating speech';
            isGenerating = false;
        }
    }

    // Preload the next paragraph to avoid pauses between readings
    async function preloadNextParagraph() {
        if (!ttsService || isPaused) return;
        
        // Check if there's a next paragraph to preload
        const nextIndex = currentParagraphIndex + 1;
        if (nextIndex >= paragraphQueue.length) return;
        
        // Set the current paragraph index to the next one
        currentParagraphIndex = nextIndex;
        
        // Process this paragraph
        const chunk = paragraphQueue[currentParagraphIndex];
        streamedText = chunk.text;
        
        try {
            // Check that text is not empty before sending to TTS engine
            if (!chunk.text || chunk.text.trim() === '') {
                console.warn('Empty text chunk found, skipping to next paragraph');
                currentParagraphIndex++;
                processNextParagraph();
                return;
            }
            
            // Generate speech for the next paragraph
            await ttsService.generateSpeech(chunk.text, selectedVoice, speedSetting);
        } catch (err) {
            console.error('Error generating speech for next paragraph:', err);
            error = err instanceof Error ? err.message : 'Unknown error generating speech';
        }
    }

    // Playback control functions
    function handlePause() {
        if (!isPlaying) return;
        isPaused = true;
        audioQueue.clearQueue(); // Clear the current audio queue
    }
    
    function handleResume() {
        if (!isPlaying || !isPaused) return;
        isPaused = false;
        processNextParagraph(); // Continue from current paragraph
    }
    
    function handleStop() {
        isPlaying = false;
        isPaused = false;
        isGenerating = false;
        audioQueue.clearQueue();
        streamedText = "";
        currentParagraphIndex = 0;
    }
</script>

<div class="mb-6">
    <a class="btn btn-sm mb-4" href="/books">
        ← Back to Book List
    </a>
    {#if bookDetails}
        <div class="flex flex-col md:flex-row gap-6">
            <!-- Cover and metadata -->
            <div class="w-full md:w-1/3">
                {#if bookDetails.coverUrl}
                    <img src={bookDetails.coverUrl} alt={bookDetails.title} class="w-full max-w-sm rounded-lg shadow mb-4" />
                {/if}
                
                <h2 class="text-xl font-bold">{bookDetails.title}</h2>
                <p class="text-lg mb-2">by {bookDetails.author}</p>
                
                
                <div class="stats shadow my-4 w-full">
                    <!-- {#if bookDetails.wordCount}
                        <div class="stat">
                            <div class="stat-title">Words</div>
                            <div class="stat-value text-lg">{bookDetails.wordCount.toLocaleString()}</div>
                        </div>
                    {/if} -->
                    
                    {#if deviceType}
                        <div class="stat">
                            <div class="stat-title">Device</div>
                            <div class="stat-value text-lg">{deviceType}</div>
                        </div>
                    {/if}
                </div>
                
                <!-- TTS Controls -->
                <div class="my-4">
                    {#if availableVoices.length > 0}
                        <div class="mb-4">
                            <label for="voice-select" class="block mb-2">Voice:</label>
                            <select 
                                id="voice-select"
                                bind:value={selectedVoice}
                                class="select select-bordered w-full"
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
                            class="range range-sm w-full"
                        />
                        <span class="ml-2">{speedSetting.toFixed(1)}x</span>
                    </div>
                    
                    <!-- Playback control buttons -->
                    <div class="flex gap-2 mb-4">
                        <button 
                            class="btn btn-primary flex-1" 
                            onclick={handlePlay}
                            disabled={!ttsService || isGenerating && !isPaused}
                        >
                            <Play />
                            {isGenerating && !isPaused ? 'Reading...' : 'Read Aloud'}
                        </button>
                        
                        {#if isPlaying}
                            {#if isPaused}
                                <button 
                                    class="btn btn-outline" 
                                    onclick={handleResume}
                                >
                                    Resume
                                </button>
                            {:else}
                                <button 
                                    class="btn btn-outline" 
                                    onclick={handlePause}
                                >
                                    Pause
                                </button>
                            {/if}
                            
                            <button 
                                class="btn btn-outline btn-error" 
                                onclick={handleStop}
                            >
                                Stop
                            </button>
                        {/if}
                    </div>
                </div>
            </div>
            
            <!-- Description and TTS content -->
            <div class="w-full md:w-2/3">
                {#if bookDetails.description}
                    <div class="collapse collapse-arrow mb-6">
                        <input type="radio" name="book-accordian" checked={true} />
                        <div class="collapse-title font-semibold">Description</div>
                        <div class="collapse-content text-sm">{bookDetails.description}</div>
                    </div>
                {/if}
                
                {#if streamedText}
                    <div class="mt-4 p-4 border rounded-md bg-base-200">
                        <h3 class="text-lg font-semibold mb-2">Currently speaking:</h3>
                        {#if currentParagraphIndex < paragraphQueue.length}
                            <div class="text-sm mb-2">
                                {#if paragraphQueue[currentParagraphIndex].chapterNumber}
                                    <span class="badge badge-primary">
                                        Chapter {paragraphQueue[currentParagraphIndex].chapterNumber}
                                    </span>
                                {/if}
                                <span class="badge badge-neutral ml-2">
                                    Paragraph {currentParagraphIndex + 1} of {paragraphQueue.length}
                                </span>
                            </div>
                        {/if}
                        <p>{streamedText}</p>
                    </div>
                {/if}
                
                {#if isGenerating}
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
                
                {#if bookContent}
                    <div class="collapse collapse-arrow mb-6">
                        <input type="radio" name="book-accordian" />
                        <div class="collapse-title font-semibold">Book Content</div>
                        <div class="collapse-content text-sm">
                            <div class="max-h-96 overflow-y-auto">
                                {#if bookContent.chapters && bookContent.chapters.length > 0}
                                    {#each bookContent.chapters as chapter}
                                        <div class="mb-4">
                                            <h3 class="font-bold">
                                                {chapter.chapterTitle ? 
                                                    `Chapter ${chapter.chapterNumber}: ${chapter.chapterTitle}` : 
                                                    `Chapter ${chapter.chapterNumber}`}
                                            </h3>
                                            {#each chapter.chapterContents as paragraph}
                                                <p class="mb-2">{paragraph}</p>
                                            {/each}
                                        </div>
                                    {/each}
                                {:else}
                                    <p>No content available</p>
                                {/if}
                            </div>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</div>