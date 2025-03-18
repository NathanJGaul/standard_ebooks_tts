import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as cheerio from 'cheerio';

// Target URL for scraping
const STANDARD_EBOOKS_EBOOKS_URL = "https://standardebooks.org/ebooks";
const STANDARD_EBOOKS_BOOK_CONTENT_URL = "text/single-page"

function getBookContentUrl(id: string): string {
    return `${STANDARD_EBOOKS_EBOOKS_URL}/${id}/${STANDARD_EBOOKS_BOOK_CONTENT_URL}`;
}

/**
 * GET handler for book details API
 */
export const GET: RequestHandler = async ({ url, params }) => {
    try {
        const { id } = params;
        const chunkParam = url.searchParams.get('chunk');
        const chunk = chunkParam ? parseInt(chunkParam, 10) : undefined;
        
        if (!id) {
            throw error(400, 'Missing book ID');
        }
        
        chunk ? console.log(`[API] Fetching book content for ID: ${id}, chunk: ${chunk}`)
              : console.log(`[API] Fetching book content for ID: ${id}`);

        const noCache = true; // For testing purposes, always bypass cache
        
        // Get book text content
        const bookContentUrl = getBookContentUrl(id);
        const response = await fetch(bookContentUrl, {
            headers: {
                'User-Agent': 'standard_ebooks_tts/1.0.0'
            }
        });

        if (!response.ok) {
            throw error(response.status, `[API] Failed to fetch book content: ${response.statusText}`);
        }

        const html = await response.text();

        const $ = cheerio.load(html);
        const bookContent = $('#chapter-1').text().trim(); // Extract content from the first chapter

        // Set appropriate cache headers
        const cacheControl = noCache
            ? 'no-store, max-age=0'
            : 'public, max-age=86400'; // Cache for 1 day
        
        // Return as JSON
        return new Response(JSON.stringify({ "chapter-1": bookContent }), {
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
        console.error('Book details API request failed:', e);
        throw error(500, 'Failed to retrieve book details');
    }
};