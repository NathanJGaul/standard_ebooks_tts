import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Book } from '../+server';

// In-memory cache with expiration
type CacheEntry = {
    data: BookDetails;
    timestamp: number;
};

// Cache with a TTL of 1 day (in milliseconds)
const CACHE_TTL = 24 * 60 * 60 * 1000;
const cache: Record<string, CacheEntry> = {};

// Target URL for scraping
const STANDARD_EBOOKS_BASE_URL = "https://standardebooks.org";

// Extended book interface with additional details
interface BookDetails extends Book {
    fullText?: string;    // Full text content (if available)
    language?: string;    // Book language
    subjects?: string[];  // Book subjects/categories
    publicationDate?: string; // Publication date
    wordCount?: number;   // Word count (if available)
    readingEase?: number; // Reading ease score (if available)
    chapters?: { 
        title: string;
        url: string;
    }[];                  // Chapter information
}

/**
 * Fetch and parse detailed book data from Standard Ebooks
 */
async function scrapeBookDetails(id: string): Promise<BookDetails> {
    try {
        // Check cache first
        const cacheKey = `book_${id}`;
        const cached = cache[cacheKey];
        
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            console.log(`[API] Serving book details from cache: ${id}`);
            return cached.data;
        }
        
        // Fetch data
        const url = `${STANDARD_EBOOKS_BASE_URL}/ebooks/${id}`;
        console.log(`[API] Fetching book details from: ${url}`);
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'standard_ebooks_tts/1.0.0'
            }
        });
        
        if (!response.ok) {
            throw error(response.status, `Failed to fetch book details (status: ${response.status})`);
        }
        
        // Parse HTML
        const html = await response.text();
        
        // Extract book details
        const bookDetails = parseBookDetailsHtml(html, id);
        
        // Save to cache
        cache[cacheKey] = {
            data: bookDetails,
            timestamp: Date.now()
        };
        
        return bookDetails;
    } catch (err) {
        console.error('Error scraping book details:', err);
        throw error(500, 'Failed to fetch book details from Standard Ebooks');
    }
}

/**
 * Parse HTML to extract detailed book information
 */
function parseBookDetailsHtml(html: string, id: string): BookDetails {
    try {
        // Basic book properties
        const title = extractValue(html, /<h1[^>]*>(.*?)<\/h1>/);
        const author = extractValue(html, /<h2[^>]*>(.*?)<\/h2>/);
        const description = extractValue(html, /<meta name="description" content="([^"]+)"/);
        
        // Cover URL
        const coverMatch = html.match(/src="([^"]+cover\.jpg)"/);
        const coverUrl = coverMatch 
            ? `${STANDARD_EBOOKS_BASE_URL}${coverMatch[1]}`
            : '';
            
        // Extract metadata
        const language = extractValue(html, /<dd class="language">([^<]+)<\/dd>/);
        
        // Subjects/categories
        const subjects: string[] = [];
        const subjectMatches = html.matchAll(/<a href="\/ebooks\/subjects\/[^"]+"[^>]*>([^<]+)<\/a>/g);
        for (const match of subjectMatches) {
            if (match[1]) subjects.push(match[1].trim());
        }
        
        // Publication date
        const publicationDate = extractValue(html, /<dd class="created">([^<]+)<\/dd>/);
        
        // Word count
        const wordCountStr = extractValue(html, /<dd class="word-count">([^<]+)<\/dd>/);
        const wordCount = wordCountStr ? parseInt(wordCountStr.replace(/,/g, ''), 10) : undefined;
        
        // Reading ease
        const readingEaseStr = extractValue(html, /<dd class="reading-ease">([^<]+)<\/dd>/);
        const readingEase = readingEaseStr ? parseFloat(readingEaseStr) : undefined;
        
        // Get chapters if available
        const chapters = extractChapters(html);
        
        // URLs
        const url = `${STANDARD_EBOOKS_BASE_URL}/ebooks/${id}`;
        const downloadUrl = `${STANDARD_EBOOKS_BASE_URL}/ebooks/${id}/download/epub`;
        
        return {
            id,
            title,
            author,
            coverUrl,
            description,
            url,
            downloadUrl,
            language,
            subjects,
            publicationDate,
            wordCount,
            readingEase,
            chapters
        };
    } catch (err) {
        console.error('Error parsing book details HTML:', err);
        
        // Return minimal book object if parsing fails
        return {
            id,
            title: "Error retrieving book",
            author: "",
            coverUrl: "",
            description: "",
            url: `${STANDARD_EBOOKS_BASE_URL}/ebooks/${id}`,
            downloadUrl: `${STANDARD_EBOOKS_BASE_URL}/ebooks/${id}/download/epub`,
        };
    }
}

/**
 * Extract chapters from the book HTML
 */
function extractChapters(html: string) {
    const chapters: { title: string; url: string }[] = [];
    
    try {
        // Find the table of contents section if it exists
        const tocSection = html.match(/<section id="toc"[^>]*>([\s\S]*?)<\/section>/);
        
        if (tocSection && tocSection[1]) {
            // Extract links from the TOC
            const chapterMatches = tocSection[1].matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g);
            
            for (const match of chapterMatches) {
                if (match[1] && match[2]) {
                    chapters.push({
                        url: match[1].startsWith('http') ? match[1] : `${STANDARD_EBOOKS_BASE_URL}${match[1]}`,
                        title: match[2].trim()
                    });
                }
            }
        }
    } catch (err) {
        console.error('Error extracting chapters:', err);
    }
    
    return chapters;
}

/**
 * Helper function to extract values using regex
 */
function extractValue(html: string, pattern: RegExp): string {
    const match = html.match(pattern);
    return match && match[1] 
        ? match[1]
            .replace(/<[^>]+>/g, '') // Remove HTML tags
            .replace(/&amp;/g, '&')   // Fix HTML entities
            .replace(/&quot;/g, '"')
            .trim()
        : '';
}

/**
 * GET handler for book details API
 */
export const GET: RequestHandler = async ({ params }) => {
    try {
        const { id } = params;
        
        if (!id) {
            throw error(400, 'Missing book ID');
        }
        
        // Get book details
        const bookDetails = await scrapeBookDetails(id);
        
        // Return as JSON
        return new Response(JSON.stringify(bookDetails), {
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
        console.error('Book details API request failed:', e);
        throw error(500, 'Failed to retrieve book details');
    }
};