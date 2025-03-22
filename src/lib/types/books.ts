export interface Book {
  id: string; // Unique identifier (slug or URL path)
  title: string; // Book title
  author: string; // Book author
  coverUrl: string; // URL to cover image
  description: string; // Book description
  url: string; // URL to the book on Standard Ebooks
  downloadUrl: string; // URL to download the book (epub)
}

export interface BookDetails extends Book {
  fullText?: string; // Full text content (if available)
  language?: string; // Book language
  subjects?: string[]; // Book subjects/categories
  publicationDate?: string; // Publication date
  wordCount?: number; // Word count (if available)
  readingEase?: number; // Reading ease score (if available)
  chapters?: {
    title: string;
    url: string;
  }[]; // Chapter information
}

export interface BookContent {
  chapters: {
    chapterNumber: number;
    chapterTitle: string;
    chapterContents: string[];
  }[];
}
