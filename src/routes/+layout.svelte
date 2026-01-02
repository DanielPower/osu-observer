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

<div class="min-h-screen flex flex-col">
	<!-- Header Bar -->
	<header class="bg-slate-800 border-b border-slate-700 px-6 py-4">
		<div class="container mx-auto flex items-center justify-between">
			<a href="/"><h1 class="text-2xl font-bold text-white">osu! observer</h1></a>
			<form onsubmit={handleSubmit} class="flex gap-2">
				<input
					type="text"
					bind:value={scoreId}
					placeholder="Score ID"
					class="px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
				/>
				<button
					type="submit"
					class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
				>
					Go
				</button>
			</form>
		</div>
	</header>

	<!-- Main Content -->
	<div class="flex-1 text-white flex">
		{@render children()}
	</div>
</div>

<style>
	:global(body) {
		background-color: var(--color-slate-900);
	}
</style>
