import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

// Define book interface
export interface Book {
    id: string;           // Unique identifier (slug or URL path)
    title: string;        // Book title
    author: string;       // Book author
    coverUrl: string;     // URL to cover image
    description: string;  // Book description
    url: string;          // URL to the book on Standard Ebooks
    downloadUrl: string;  // URL to download the book (epub)
}

// In-memory cache with expiration
type CacheEntry = {
    data: Book[];
    timestamp: number;
};

// Cache with a TTL of 1 hour (in milliseconds)
const CACHE_TTL = 60 * 60 * 1000;
const cache: Record<string, CacheEntry> = {};

// Security and rate limiting
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 30; // 30 requests per minute
const requestLog: Record<string, number[]> = {};

// Target URL for scraping
const STANDARD_EBOOKS_BASE_URL = "https://standardebooks.org";
const STANDARD_EBOOKS_EBOOKS_URL = `${STANDARD_EBOOKS_BASE_URL}/ebooks`;

/**
 * Check if the client exceeds rate limits
 */
function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    
    // Initialize request log for this IP if it doesn't exist
    if (!requestLog[ip]) {
        requestLog[ip] = [];
    }
    
    // Clean up old requests outside the window
    requestLog[ip] = requestLog[ip].filter(time => time > now - RATE_LIMIT_WINDOW);
    
    // Check if rate limit is exceeded
    if (requestLog[ip].length >= MAX_REQUESTS) {
        return false;
    }
    
    // Add current request
    requestLog[ip].push(now);
    return true;
}

/**
 * Fetch and parse book data from Standard Ebooks
 */
async function scrapeBooks(page = 1, skipCache = false): Promise<Book[]> {
    try {
        // Check cache first (unless skipCache is true)
        const cacheKey = `books_page_${page}`;
        const cached = cache[cacheKey];
        
        if (!skipCache && cached && cached.data.length > 0 && Date.now() - cached.timestamp < CACHE_TTL) {
            console.log(`[API] Serving books from cache, page ${page}`);
            return cached.data;
        }
        
        // Fetch data
        const url = `${STANDARD_EBOOKS_EBOOKS_URL}?page=${page}`;
            
        console.log(`[API] Fetching books from: ${url}${skipCache ? ' (cache bypassed)' : ''}`);
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'standard_ebooks_tts/1.0.0'
            }
        });
        
        if (!response.ok) {
            throw error(response.status, `Failed to fetch books from Standard Ebooks (status: ${response.status})`);
        }
        
        // Parse HTML
        const html = await response.text();
        
        // Use server-side HTML parsing
        const books = parseBookHtml(html);
        
        // Save to cache
        cache[cacheKey] = {
            data: books,
            timestamp: Date.now()
        };
        
        return books;
    } catch (err) {
        console.error('Error scraping books:', err);
        throw error(500, 'Failed to fetch books from Standard Ebooks');
    }
}

/**
 * Parse HTML to extract book information
 */
function parseBookHtml(html: string): Book[] {
    try {
        // Since we're on the server, we need to use a Node.js HTML parser
        // Here we're using a string-based extraction approach that doesn't depend on DOM
        
        const books: Book[] = [];
        
        // Split the HTML into sections for each book
        // This regex pattern looks for the common pattern of book entries on Standard Ebooks
        const bookSections = html.match(/<li typeof="schema:Book"[^>]*>([\s\S]*?)<\/li>/g) || [];
        console.log(`[API] Found ${bookSections.length} book sections`);
        for (const section of bookSections) {
            try {
                // Extract book ID from URL path
                const idMatch = section.match(/href="\/ebooks\/([^"]+)"/);
                const id = idMatch ? idMatch[1] : '';
                
                // Extract title
                const titleMatch = section.match(/<span property="schema:name">(.*?)<\/span>/);
                const title = titleMatch 
                    ? titleMatch[1]
                        .replace(/<[^>]+>/g, '') // Remove HTML tags
                        .replace(/&amp;/g, '&')   // Fix HTML entities
                        .trim() 
                    : '';
                
                // Extract author
                const authorMatch = section.match(/<span property="schema:name">([^<]+)<\/span><\/a><\/p>/);
                const author = authorMatch 
                    ? authorMatch[1]
                        .replace(/&amp;/g, '&')
                        .trim() 
                    : '';
                
                // Extract cover image URL
                const coverMatch = section.match(/<img src="([^"]+)"/);
                const coverUrl = coverMatch 
                    ? `${STANDARD_EBOOKS_BASE_URL}${coverMatch[1]}`
                    : '';
                
                // Get URLs
                const url = `${STANDARD_EBOOKS_BASE_URL}/ebooks/${id}`;
                const downloadUrl = `${STANDARD_EBOOKS_BASE_URL}/ebooks/${id}/download/epub`;
                
                // Description is not present in the provided HTML structure
                // Using an empty string as placeholder
                const description = '';
                
                // Add to books array if we have at least an ID and title
                if (id && title) {
                    books.push({
                        id,
                        title,
                        author,
                        coverUrl,
                        description,
                        url,
                        downloadUrl
                    });
                }
            } catch (err) {
                console.error('Error parsing book section:', err);
                // Continue with next book
            }
        }
        
        return books;
    } catch (err) {
        console.error('Error parsing HTML:', err);
        return [];
    }
}

/**
 * GET handler for books API
 */
export const GET: RequestHandler = async ({ url, getClientAddress }) => {
    try {
        // Rate limiting
        const clientIp = getClientAddress();
        if (!checkRateLimit(clientIp)) {
            throw error(429, 'Too many requests. Please try again later.');
        }
        
        // Get page parameter (default to 1)
        const pageParam = url.searchParams.get('page');
        const page = pageParam ? parseInt(pageParam, 10) : 1;
        
        if (isNaN(page) || page < 1) {
            throw error(400, 'Invalid page parameter');
        }
        
        // Check if cache should be bypassed
        // const noCache = url.searchParams.get('no-cache') === 'true';
        const noCache = true; // For testing purposes, always bypass cache
        
        // Get book data
        const books = await scrapeBooks(page, noCache);
        
        // Set appropriate cache headers
        const cacheControl = noCache 
            ? 'no-store, max-age=0' 
            : 'public, max-age=3600'; // Cache for 1 hour
        
        // Return as JSON
        return new Response(JSON.stringify({ books, page }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': cacheControl
            }
        });
    } catch (e: any) {
        if (e.status && e.body) {
            throw e; // Re-throw SvelteKit errors
        }
        console.error('Books API request failed:', e);
        throw error(500, 'Failed to retrieve books');
    }
};