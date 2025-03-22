import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import * as cheerio from "cheerio";
import type { BookContent } from "$lib/types/books";

// Target URL for scraping
const STANDARD_EBOOKS_EBOOKS_URL = "https://standardebooks.org/ebooks";
const STANDARD_EBOOKS_BOOK_CONTENT_URL = "text/single-page";

function getBookContentUrl(id: string): string {
  return `${STANDARD_EBOOKS_EBOOKS_URL}/${id}/${STANDARD_EBOOKS_BOOK_CONTENT_URL}`;
}

/**
 * GET handler for book details API
 */
export const GET: RequestHandler = async ({ url, params }) => {
  try {
    const { id } = params;
    const chunkParam = url.searchParams.get("chunk");
    const chunk = chunkParam ? parseInt(chunkParam, 10) : undefined;

    if (!id) {
      throw error(400, "Missing book ID");
    }

    if (chunk) {
      console.log(
        `[API] Fetching book content for ID: ${id}, chunk: ${chunk}`,
      );
    } else {
      console.log(`[API] Fetching book content for ID: ${id}`);
    }

    // Get book text content
    const bookContentUrl = getBookContentUrl(id);
    const response = await fetch(bookContentUrl, {
      headers: {
        "User-Agent": "standard_ebooks_tts/1.0.0",
      },
    });

    if (!response.ok) {
      throw error(
        response.status,
        `[API] Failed to fetch book content: ${response.statusText}`,
      );
    }

    const html = await response.text();

    const $ = cheerio.load(html);
    let bookContent: BookContent = {
      chapters: [],
    };
    try {
      bookContent = $.extract({
        chapters: [
          {
            selector: `section[id^='chapter-']`,
            value: (el) => {
              const chapterNumber = parseInt(
                $(el).attr("id")?.split("-")[1]!,
                10,
              );
              const chapterTitle = $(el).find('p[epub\\:type="title"]').text()
                .trim();
              const chapterContents: string[] = $(el).find("p:not(hgroup p)")
                .map((i, pEl) =>
                  $(pEl).text().trim().replace(/^[“"']|[”"']$/g, "")
                )
                .get();
              return {
                chapterNumber,
                chapterTitle,
                chapterContents,
              };
            },
          },
        ],
      });
    } catch (e) {
      console.error("Error extracting book content:", e);
      throw error(500, "Failed to extract book content");
    }

    if (!bookContent.chapters || bookContent.chapters.length === 0) {
      throw error(404, "Book content not found");
    }

    // Return as JSON
    return new Response(JSON.stringify(bookContent), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (e: any) {
    if (e.status && e.body) {
      throw e; // Re-throw SvelteKit errors
    }
    console.error("Book details API request failed:", e);
    throw error(500, "Failed to retrieve book details");
  }
};
