import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { type Book } from "$lib/types/books";

export const load: PageLoad = async ({ params, fetch }) => {
    const id = params.id;
    const bookDetails = await fetchBookDetails(id, fetch);
	return {
        id,
        bookDetails
    };
};

async function fetchBookDetails(bookId: string, fetchMethod = fetch): Promise<Book | null> {
    try {
        const response = await fetchMethod(`/api/books/${bookId}`);
        if (!response.ok) {
            throw new Error(`Error fetching book details: ${response.status}`);
        }
        return await response.json();
    } catch (err) {
        console.error('Error loading book details:', err);
        return null;
    }
}

// // Function to fetch book content for TTS
// async function fetchBookContent() {
//     if (!selectedBook) return;

//     try {
//         // textChunks = [];
//         isLoading = true;
//         error = null;
//         ttsText = '';

//         // We'll only fetch chunk by chunk as needed to avoid large payloads
//         console.log(`/api/books/${selectedBook.id}/content`);
//         const response = await fetch(`/api/books/${selectedBook.id}/content`); //?chunk=${currentChunk}
//         console.log('Response:', response);
//         if (!response.ok) {
//             throw new Error(`Error fetching book content: ${response.status}`);
//         }

//         const content = await response.json();
//         console.log('Fetched content:', content);
        
//         // Extract text from the first chapter
//         // if (data["chapter-1"]) {
//         //     ttsText = data["chapter-1"];
//         //     totalChunks = 1;
//         // } else {
//         //     throw new Error('No content found in the book');
//         // }

//         // console.log(data)
        
//         isLoading = false;
//     } catch (err) {
//         console.error('Error loading book content:', err);
//         error = err instanceof Error ? err.message : 'Failed to load book content';
//         isLoading = false;
//     }
// }