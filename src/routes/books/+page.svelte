<script lang="ts">
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
</script>

<!-- Books list view -->
<div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
    {#each data.books as book}
        <div class="card card-border shadow-lg">
            {#if book.coverUrl}
                <a href="books/{book.id}">
                    <figure>
                        <img src={book.coverUrl} alt={book.title} class="rounded-lg object-contain" />
                    </figure>
                </a>
            {/if}
            
            <!-- <div class="card-body">
                <h2 class="card-title">{book.title}</h2>
                <p class="mb-2">{book.author}</p>
                
                {#if book.description}
                    <p class="text-sm text-gray-500">{truncate(book.description, 150)}</p>
                {/if}
                
                <div class="card-actions justify-end mt-4">
                    <a class="btn btn-primary" href="books/{book.id}">View Details</a>
                </div>
            </div> -->
        </div>
    {/each}
</div>

<!-- Pagination -->
<div class="flex justify-between mt-8">
    <a class="btn btn-outline"
        href="{data.page > 1 ? `books?page=${data.page - 1}` : 'javascript:undefined'}"
        data-sveltekit-reload>
        Previous Page
    </a>
    
    <span class="my-auto">Page {data.page}</span>
    
    <a class="btn btn-outline"
        href="books?page={data.page + 1}"
        data-sveltekit-reload>
        Next Page
    </a>
</div>