import type { PageLoad } from './$types';
import type { Book } from "$lib/types/books";

export const load: PageLoad = async ({ fetch, url }) => {
    const page = parseInt(url.searchParams.get('page') ?? '1', 10);
    const validPage = !isNaN(page) && page > 0 ? page : 1;

    // Fetch books from API
    const books = await fetchBooks(validPage, fetch);

    return { page: validPage, books };
};

// Function to fetch books from our API
async function fetchBooks(page = 1, fetchMethod = fetch): Promise<Book[]> {
    try {
        const response = await fetchMethod(`/api/books?page=${page}?no-cache=false`);
        if (!response.ok) throw new Error(`[SERVER] Error fetching books: ${response.status}`);
        const data = await response.json();
        console.log('[SERVER] Books loaded:', data.books.length);
        return data.books;
    } catch (err) {
        console.error('[SERVER] Error loading books:', err);
        return [];
    }
}