<script>
	let { children } = $props();
</script>

<header class="p-4">
    <h1 class="text-2xl font-bold mb-6">Standard Ebooks Library</h1>
</header>

<main class="container mx-auto p-4">
    {@render children()}
</main>