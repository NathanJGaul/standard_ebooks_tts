import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// In-memory cache with expiration
type CacheEntry = {
    data: BookContent;
    timestamp: number;
};

// Cache with a TTL of 1 day (in milliseconds)
const CACHE_TTL = 24 * 60 * 60 * 1000;
const cache: Record<string, CacheEntry> = {};

// Target URL for scraping
const STANDARD_EBOOKS_BASE_URL = "https://standardebooks.org";

interface TextChunk {
    text: string;
    index: number;
}

interface BookContent {
    id: string;
    title: string;
    chunks: TextChunk[];
    totalChunks: number;
}

/**
 * Fetch and process book content
 */
async function getBookContent(id: string): Promise<BookContent> {
    try {
        // Check cache first
        const cacheKey = `book_content_${id}`;
        const cached = cache[cacheKey];
        
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            console.log(`[API] Serving book content from cache: ${id}`);
            return cached.data;
        }
        
        // Fetch the book details first to get metadata
        const bookDetailsUrl = `${STANDARD_EBOOKS_BASE_URL}/ebooks/${id}`;
        console.log(`[API] Fetching book details: ${bookDetailsUrl}`);
        
        const detailsResponse = await fetch(bookDetailsUrl, {
            headers: {
                'User-Agent': 'standard_ebooks_tts/1.0.0'
            }
        });
        
        if (!detailsResponse.ok) {
            throw error(detailsResponse.status, `Failed to fetch book details (status: ${detailsResponse.status})`);
        }
        
        const detailsHtml = await detailsResponse.text();
        
        // Extract title for reference
        const titleMatch = detailsHtml.match(/<h1[^>]*>(.*?)<\/h1>/);
        const title = titleMatch && titleMatch[1] 
            ? titleMatch[1].replace(/<[^>]+>/g, '').trim() 
            : 'Unknown Title';
        
        // Fetch text version of the book if available
        const textUrl = `${STANDARD_EBOOKS_BASE_URL}/ebooks/${id}/download/plain`;
        console.log(`[API] Fetching book text: ${textUrl}`);
        
        const textResponse = await fetch(textUrl, {
            headers: {
                'User-Agent': 'standard_ebooks_tts/1.0.0'
            }
        });
        
        // Process book text
        let fullText = '';
        
        if (textResponse.ok) {
            fullText = await textResponse.text();
        } else {
            // If text version not available, try to scrape from HTML if possible
            console.log(`[API] Text version not available, attempting to extract from HTML`);
            
            // Try to extract content from reading sections if available
            const readingUrl = `${STANDARD_EBOOKS_BASE_URL}/read/ebooks/${id}`;
            const readingResponse = await fetch(readingUrl, {
                headers: {
                    'User-Agent': 'standard_ebooks_tts/1.0.0'
                }
            });
            
            if (readingResponse.ok) {
                const readingHtml = await readingResponse.text();
                fullText = extractTextContent(readingHtml);
            } else {
                throw error(404, 'Book text content not available');
            }
        }
        
        // Process the full text into chunks suitable for TTS
        const chunks = processTextIntoChunks(fullText);
        
        const bookContent: BookContent = {
            id,
            title,
            chunks,
            totalChunks: chunks.length
        };
        
        // Save to cache
        cache[cacheKey] = {
            data: bookContent,
            timestamp: Date.now()
        };
        
        return bookContent;
    } catch (err) {
        console.error('Error getting book content:', err);
        throw error(500, 'Failed to fetch book content');
    }
}

/**
 * Extract text content from HTML
 */
function extractTextContent(html: string): string {
    try {
        // Look for the main content area
        const contentMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/);
        if (!contentMatch || !contentMatch[1]) return '';
        
        const mainContent = contentMatch[1];
        
        // Remove script and style tags first
        let cleanContent = mainContent
            .replace(/<script[\s\S]*?<\/script>/g, '')
            .replace(/<style[\s\S]*?<\/style>/g, '');
            
        // Extract text from paragraphs and headers
        let extractedText = '';
        const textElements = cleanContent.match(/<(p|h[1-6])[^>]*>([\s\S]*?)<\/\1>/g) || [];
        
        for (const element of textElements) {
            // Remove HTML tags but keep line breaks and reasonable spacing
            const textContent = element
                .replace(/<br\s*\/?>/g, '\n') // Convert <br> to newlines
                .replace(/<[^>]+>/g, '') // Remove all other HTML tags
                .replace(/&nbsp;/g, ' ') // Handle non-breaking spaces
                .replace(/&amp;/g, '&') // Handle ampersands
                .replace(/&quot;/g, '"') // Handle quotes
                .replace(/&lt;/g, '<') // Handle less-than
                .replace(/&gt;/g, '>'); // Handle greater-than
                
            extractedText += textContent + '\n\n';
        }
        
        return extractedText.trim();
    } catch (err) {
        console.error('Error extracting text content:', err);
        return '';
    }
}

/**
 * Process text into chunks appropriate for TTS
 */
function processTextIntoChunks(text: string, maxChunkLength = 1000): TextChunk[] {
    // Add reasonable chunk size to avoid TTS limits, yet maintain context
    const chunks: TextChunk[] = [];
    
    // Split by paragraphs first
    const paragraphs = text.split(/\n\s*\n/);
    
    let currentChunk = '';
    let chunkIndex = 0;
    
    for (const paragraph of paragraphs) {
        // If adding this paragraph would exceed the max length, save current chunk and start new one
        if (currentChunk && (currentChunk.length + paragraph.length > maxChunkLength)) {
            chunks.push({
                text: currentChunk.trim(),
                index: chunkIndex++
            });
            currentChunk = '';
        }
        
        // Add paragraph to current chunk
        currentChunk += paragraph + '\n\n';
        
        // If current chunk is already at/over limit, save it
        if (currentChunk.length >= maxChunkLength) {
            chunks.push({
                text: currentChunk.trim(),
                index: chunkIndex++
            });
            currentChunk = '';
        }
    }
    
    // Add any remaining text
    if (currentChunk.trim()) {
        chunks.push({
            text: currentChunk.trim(),
            index: chunkIndex
        });
    }
    
    return chunks;
}

/**
 * GET handler for book content API
 */
export const GET: RequestHandler = async ({ params, url }) => {
    try {
        const { id } = params;
        
        if (!id) {
            throw error(400, 'Missing book ID');
        }
        
        // Check if a specific chunk is requested
        const chunkParam = url.searchParams.get('chunk');
        const chunkIndex = chunkParam ? parseInt(chunkParam, 10) : null;
        
        // Get book content
        const bookContent = await getBookContent(id);
        
        // If a specific chunk was requested, return only that chunk
        if (chunkIndex !== null && !isNaN(chunkIndex)) {
            const chunk = bookContent.chunks.find(c => c.index === chunkIndex);
            
            if (!chunk) {
                throw error(404, `Chunk ${chunkIndex} not found`);
            }
            
            return new Response(JSON.stringify({
                id: bookContent.id,
                title: bookContent.title,
                chunk,
                totalChunks: bookContent.totalChunks
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'public, max-age=86400' // Cache for 1 day
                }
            });
        }
        
        // Return book content (with all chunks)
        return new Response(JSON.stringify(bookContent), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=86400' // Cache for 1 day
            }
        });
    } catch (e: any) {
        if (e.status && e.body) {
            throw e; // Re-throw SvelteKit errors
        }
        console.error('Book content API request failed:', e);
        throw error(500, 'Failed to retrieve book content');
    }
};