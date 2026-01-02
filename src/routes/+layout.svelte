<script lang="ts">
	import '../app.css';
	import { goto } from '$app/navigation';
	let { children } = $props();

	let scoreId = $state('');

	function handleSubmit(event: Event) {
		event.preventDefault();
		if (scoreId.trim()) {
			goto(`/score/${scoreId.trim()}`);
			scoreId = '';
		}
	}
</script>

<div class="flex min-h-screen flex-col">
	<!-- Header Bar -->
	<header class="border-b border-slate-700 bg-slate-800 px-6 py-4">
		<div class="container mx-auto flex items-center justify-between">
			<a href="/"><h1 class="text-2xl font-bold text-white">osu! observer</h1></a>
			<form onsubmit={handleSubmit} class="flex gap-2">
				<input
					type="text"
					bind:value={scoreId}
					placeholder="Score ID"
					class="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-white focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
				/>
				<button
					type="submit"
					class="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700"
				>
					Go
				</button>
			</form>
		</div>
	</header>

	<!-- Main Content -->
	<div class="flex flex-1 text-white">
		{@render children()}
	</div>
</div>

<style>
	:global(body) {
		background-color: var(--color-slate-900);
	}
</style>
