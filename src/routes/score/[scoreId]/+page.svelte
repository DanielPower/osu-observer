<script lang="ts">
	import ReplayViewer from '$lib/components/ReplayViewer.svelte';

	let { data } = $props();
</script>

{#key data.scoreId}
	<div class="w-full bg-linear-to-b from-slate-900 to-slate-800">
		<div class="mx-auto px-4 py-8">
			{#await data.deferredData}
				<div class="flex h-96 items-center justify-center">
					<p class="text-xl text-slate-300">Loading beatmap data...</p>
				</div>
			{:then deferredData}
				<!-- Title Section -->
				<div class="mb-4 text-center">
					<h1 class="mb-1 text-5xl font-bold text-white">
						{deferredData.title}
					</h1>
					<p class="mb-2 text-2xl text-slate-300">
						{deferredData.artist}
					</p>
					<span>
						<div class="inline-block rounded-lg bg-blue-600 px-2 py-1">
							<p class="text-lg font-semibold text-white">{deferredData.version}</p>
						</div>
					</span>
				</div>

				<!-- Video Container (Main Focal Point) -->
				{#key data.scoreId}
					<ReplayViewer
						scoreId={data.scoreId}
						beatmapId={`${deferredData.beatmapId}`}
						beatmapSetId={`${deferredData.beatmapSetId}`}
					/>
				{/key}

				<!-- Metadata Section -->
				<div class="rounded-xl bg-slate-800 p-6 shadow-xl">
					<h2 class="mb-4 text-2xl font-bold text-white">Replay Information</h2>
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div class="rounded-lg bg-slate-700 p-4">
							<p class="mb-1 text-sm text-slate-400">Player</p>
							<p class="text-lg font-semibold text-white">{data.username}</p>
						</div>
						<div class="rounded-lg bg-slate-700 p-4">
							<p class="mb-1 text-sm text-slate-400">Score ID</p>
							<p class="text-lg font-semibold text-white">{data.scoreId}</p>
						</div>
						<div class="rounded-lg bg-slate-700 p-4">
							<p class="mb-1 text-sm text-slate-400">Beatmap Set ID</p>
							<p class="text-lg font-semibold text-white">{deferredData.beatmapSetId}</p>
						</div>
					</div>
				</div>
			{/await}
		</div>
	</div>
{/key}
