<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	let { children } = $props();

	let scoreId = $state('');

	function handleSubmit(event: Event) {
		event.preventDefault();
		if (scoreId.trim()) {
			goto(resolve(`/score/${scoreId.trim()}`));
			scoreId = '';
		}
	}
</script>

<div class="min-h-screen">
	<!-- Header Bar -->
	<header class="border-b border-slate-700 bg-slate-800 px-6 py-4">
		<div class="mx-auto flex max-w-6xl items-center justify-between">
			<a href="/"><h1 class="text-2xl font-bold text-white">osu! observer</h1></a>
			<div class="flex justify-center gap-2">
				<div class="text-lg text-white">Skin</div>
				<select
					class="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-white focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
					value={page.url.searchParams.get('skin')}
					onchange={(event) => {
						const url = new URL(page.url);
						url.searchParams.set('skin', event.currentTarget.value);
						goto(url.toString());
					}}
				>
					<option value="Cookiezi04">Cookiezi04</option>
					<option value="BubbleSkin17-10-13">BubbleSkin17-10-13</option>
					<option value="BasicallyA_NEET">BasicallyA_NEET</option>
				</select>
			</div>
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
	<div class="mx-auto flex max-w-6xl flex-1 text-white">
		{@render children()}
	</div>
</div>

<style>
	:global(body) {
		background-color: var(--color-slate-900);
	}
</style>
