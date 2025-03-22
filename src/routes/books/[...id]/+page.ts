import type { PageLoad } from "./$types";
import { type Book } from "$lib/types/books";

export const load: PageLoad = async ({ params, fetch }) => {
  const id = params.id;
  const bookDetails = await fetchBookDetails(id, fetch);
  return {
    id,
    bookDetails,
  };
};

async function fetchBookDetails(
  bookId: string,
  fetchMethod = fetch,
): Promise<Book | null> {
  try {
    const response = await fetchMethod(`/api/books/${bookId}`);
    if (!response.ok) {
      throw new Error(`Error fetching book details: ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    console.error("Error loading book details:", err);
    return null;
  }
}
