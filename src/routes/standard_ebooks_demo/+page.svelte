<script lang="ts">
    import { onMount } from "svelte";
    import type { Book } from "../api/books/+server";

    // State variables
    let books = $state<Book[]>([]);
    let selectedBook = $state<Book | null>(null);
    let bookDetails = $state<any>(null);
    let textChunks = $state<{ text: string, index: number }[]>([]);
    let currentChunk = $state<number>(0);
    let isLoading = $state(true);
    let error = $state<string | null>(null);
    let currentPage = $state(1);
    let totalChunks = $state(0);
    let ttsText = $state('');

    // Fetch books on component load
    onMount(async () => {
        await fetchBooks();
    });

    // Function to fetch books from our API
    async function fetchBooks(page = 1) {
        try {
            isLoading = true;
            error = null;

            const response = await fetch(`/api/books?page=${page}?no-cache=false`);
            
            if (!response.ok) {
                throw new Error(`Error fetching books: ${response.status}`);
            }
            
            const data = await response.json();
            books = data.books;
            currentPage = data.page;
            isLoading = false;
            console.log('Books loaded:', books.length);
        } catch (err) {
            console.error('Error loading books:', err);
            error = err instanceof Error ? err.message : 'Failed to load books';
            isLoading = false;
        }
    }

    // Function to load next page of books
    async function nextPage() {
        await fetchBooks(currentPage + 1);
    }

    // Function to load previous page of books
    async function prevPage() {
        if (currentPage > 1) {
            await fetchBooks(currentPage - 1);
        }
    }

    // Function to fetch details for a specific book
    async function fetchBookDetails(book: Book) {
        try {
            selectedBook = book;
            bookDetails = null;
            textChunks = [];
            isLoading = true;
            error = null;

            const response = await fetch(`/api/books/${book.id}`);
            
            if (!response.ok) {
                throw new Error(`Error fetching book details: ${response.status}`);
            }
            
            bookDetails = await response.json();
            isLoading = false;
        } catch (err) {
            console.error('Error loading book details:', err);
            error = err instanceof Error ? err.message : 'Failed to load book details';
            isLoading = false;
        }
    }

    // Function to fetch book content for TTS
    async function fetchBookContent() {
        if (!selectedBook) return;

        try {
            textChunks = [];
            isLoading = true;
            error = null;

            // We'll only fetch chunk by chunk as needed to avoid large payloads
            const response = await fetch(`/api/books/${selectedBook.id}/content?chunk=${currentChunk}`);
            
            if (!response.ok) {
                throw new Error(`Error fetching book content: ${response.status}`);
            }
            
            const data = await response.json();
            ttsText = data.chunk.text;
            totalChunks = data.totalChunks;
            isLoading = false;
        } catch (err) {
            console.error('Error loading book content:', err);
            error = err instanceof Error ? err.message : 'Failed to load book content';
            isLoading = false;
        }
    }

    // Function to navigate to next text chunk
    function nextChunk() {
        if (currentChunk < totalChunks - 1) {
            currentChunk++;
            fetchBookContent();
        }
    }

    // Function to navigate to previous text chunk
    function prevChunk() {
        if (currentChunk > 0) {
            currentChunk--;
            fetchBookContent();
        }
    }

    // Function to send text to TTS engine
    function speakText() {
        // For now, just alert the text - in a real implementation you'd hook this up to your TTS engine
        alert(`TTS would speak: ${ttsText.substring(0, 100)}...`);
        // Here you would connect to your existing Kokoro TTS system
    }

    // Helper function to truncate text
    function truncate(text: string, length = 100) {
        return text && text.length > length ? text.substring(0, length) + '...' : text;
    }
</script>

<main class="container mx-auto p-4">
    <h1 class="text-2xl font-bold mb-6">Standard Ebooks Library</h1>

    <!-- Error display -->
    {#if error}
        <div class="alert alert-error mb-4">
            <span>{error}</span>
        </div>
    {/if}

    <!-- Loading state -->
    {#if isLoading}
        <div class="flex justify-center my-8">
            <span class="loading loading-spinner loading-lg"></span>
        </div>
    {/if}

    <!-- Book detail view -->
    {#if selectedBook && bookDetails}
        <div class="mb-6">
            <button class="btn btn-sm mb-4" onclick={() => { selectedBook = null; bookDetails = null; }}>
                ← Back to Book List
            </button>
            
            <div class="flex flex-col md:flex-row gap-6">
                <!-- Cover and metadata -->
                <div class="w-full md:w-1/3">
                    {#if bookDetails.coverUrl}
                        <img src={bookDetails.coverUrl} alt={bookDetails.title} class="w-full max-w-sm rounded-lg shadow mb-4" />
                    {/if}
                    
                    <h2 class="text-xl font-bold">{bookDetails.title}</h2>
                    <p class="text-lg mb-2">by {bookDetails.author}</p>
                    
                    {#if bookDetails.language || bookDetails.publicationDate}
                        <div class="stats shadow mb-4 w-full">
                            {#if bookDetails.language}
                                <div class="stat">
                                    <div class="stat-title">Language</div>
                                    <div class="stat-value text-lg">{bookDetails.language}</div>
                                </div>
                            {/if}
                            
                            {#if bookDetails.publicationDate}
                                <div class="stat">
                                    <div class="stat-title">Published</div>
                                    <div class="stat-value text-lg">{bookDetails.publicationDate}</div>
                                </div>
                            {/if}
                            
                            {#if bookDetails.wordCount}
                                <div class="stat">
                                    <div class="stat-title">Words</div>
                                    <div class="stat-value text-lg">{bookDetails.wordCount.toLocaleString()}</div>
                                </div>
                            {/if}
                        </div>
                    {/if}
                    
                    <div class="my-4">
                        <button class="btn btn-primary w-full" onclick={fetchBookContent}>
                            Generate Audio
                        </button>
                    </div>
                    
                    {#if bookDetails.subjects && bookDetails.subjects.length > 0}
                        <div class="mt-4">
                            <h3 class="font-semibold mb-2">Subjects</h3>
                            <div class="flex flex-wrap gap-2">
                                {#each bookDetails.subjects as subject}
                                    <span class="badge badge-outline">{subject}</span>
                                {/each}
                            </div>
                        </div>
                    {/if}
                    
                    <div class="mt-4">
                        <a href={bookDetails.downloadUrl} class="link link-primary" target="_blank">Download ePub</a>
                    </div>
                </div>
                
                <!-- Description and TTS content -->
                <div class="w-full md:w-2/3">
                    {#if bookDetails.description}
                        <div class="mb-6">
                            <h3 class="font-semibold mb-2">Description</h3>
                            <p>{bookDetails.description}</p>
                        </div>
                    {/if}
                    
                    {#if ttsText}
                        <div class="border rounded-lg p-4 bg-base-200">
                            <div class="flex justify-between mb-4">
                                <h3 class="font-semibold">Text for TTS</h3>
                                <span>Chunk {currentChunk + 1} of {totalChunks}</span>
                            </div>
                            
                            <div class="max-h-96 overflow-y-auto mb-4 p-4 bg-base-100 rounded">
                                <p style="white-space: pre-wrap;">{ttsText}</p>
                            </div>
                            
                            <div class="flex justify-between">
                                <button class="btn btn-sm btn-outline" disabled={currentChunk === 0} onclick={prevChunk}>
                                    Previous Chunk
                                </button>
                                
                                <button class="btn btn-sm btn-primary" onclick={speakText}>
                                    Read Aloud
                                </button>
                                
                                <button class="btn btn-sm btn-outline" disabled={currentChunk === totalChunks - 1} onclick={nextChunk}>
                                    Next Chunk
                                </button>
                            </div>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    {:else}
        <!-- Books list view -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {#each books as book}
                <div class="card bg-base-100 shadow-xl h-full">
                    {#if book.coverUrl}
                        <figure class="pt-6 px-6">
                            <img src={book.coverUrl} alt={book.title} class="rounded-lg max-h-64 object-contain" />
                        </figure>
                    {/if}
                    
                    <div class="card-body">
                        <h2 class="card-title">{book.title}</h2>
                        <p class="mb-2">{book.author}</p>
                        
                        {#if book.description}
                            <p class="text-sm text-gray-500">{truncate(book.description, 150)}</p>
                        {/if}
                        
                        <div class="card-actions justify-end mt-4">
                            <button class="btn btn-primary" onclick={() => fetchBookDetails(book)}>View Details</button>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
        
        <!-- Pagination -->
        <div class="flex justify-between mt-8">
            <button class="btn btn-outline" disabled={currentPage <= 1} onclick={prevPage}>
                Previous Page
            </button>
            
            <span class="my-auto">Page {currentPage}</span>
            
            <button class="btn btn-outline" onclick={nextPage}>
                Next Page
            </button>
        </div>
    {/if}
</main>