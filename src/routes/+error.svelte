<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="max-w-4xl">
	<h1 class="mt-4 text-2xl">Error {page.status}</h1>
	<p class="mt-2">{page.error?.message}</p>
</div>
