<script lang="ts">
	import { env } from '$env/dynamic/public';
	import { page } from '$app/stores';
	import { getSkinAsset, modAssetNames } from '$lib/asset_urls';
	import AudioControls from '$lib/components/AudioControls.svelte';
	import { readBeatmap, readScore, readAudio } from '$lib/osu_files.js';
	import { simulateScore, type Simulation } from '$lib/osu_simulation.js';
	import { createRenderer, type Renderer } from '$lib/renderer/renderer.js';
	import { StandardModCombination, StandardRuleset } from 'osu-standard-stable';
	import { onDestroy, onMount } from 'svelte';
	import { updateSkinTextures } from '$lib/skin.svelte';

	const {
		scoreId,
		beatmapId,
		beatmapSetId
	}: { scoreId: string; beatmapId: string; beatmapSetId: string } = $props();

	const standard = new StandardRuleset();

	let time = $state(0);
	let framerate = $state(0);
	let audio: HTMLAudioElement | null = $state(null);
	let viewerContainer: HTMLElement | null = $state(null);
	let simulation: Simulation | undefined = $state();
	let mods: StandardModCombination | null = $state(null);
	let renderer: Renderer | null = null;

	onMount(async () => {
		const beatmap = await readBeatmap(
			`${env.PUBLIC_SERVE_MEDIA_PATH}/beatmaps/${beatmapSetId}/${beatmapId}.osu`
		);
		const score = await readScore(`${env.PUBLIC_SERVE_MEDIA_PATH}/scores/${scoreId}.osr`);
		if (!score.replay) {
			throw new Error('No replay data found');
		}

		mods = standard.createModCombination(score.info.rawMods);

		audio = await readAudio(
			`${env.PUBLIC_SERVE_MEDIA_PATH}/beatmaps/${beatmapSetId}/${beatmap.general.audioFilename}`
		);
		if (!audio) {
			throw new Error('No audio file found in the beatmap set.');
		}
		if (mods.has('DT') || mods.has('NC')) {
			audio.playbackRate = 3 / 2;
		}

		const standardBeatmap = standard.applyToBeatmapWithMods(beatmap, mods);
		const standardReplay = standard.applyToReplay(score.replay);
		simulation = simulateScore(standardReplay, standardBeatmap);

		renderer = await createRenderer({
			beatmap: standardBeatmap,
			replay: standardReplay,
			simulation,
			width: 1920,
			height: 1080
		});
		document.getElementById('viewer_container')!.appendChild(renderer.canvas);

		let lastAudioTime = 0;
		let lastAudioSyncTime = 0;
		let lastFpsUpdate = 0;
		let frameCount = 0;
		const audioElement = audio;

		renderer.app.ticker.add(() => {
			const now = performance.now();
			const audioTimeMs = audioElement.currentTime * 1000;

			if (audioTimeMs !== lastAudioTime) {
				lastAudioTime = audioTimeMs;
				lastAudioSyncTime = now;
			}

			let interpolatedTime: number;
			if (audioElement.paused) {
				interpolatedTime = audioTimeMs;
			} else {
				const elapsed = now - lastAudioSyncTime;
				interpolatedTime = lastAudioTime + elapsed * audioElement.playbackRate;
			}

			frameCount++;
			if (now - lastFpsUpdate >= 100) {
				framerate = (frameCount * 1000) / (now - lastFpsUpdate);
				lastFpsUpdate = now;
				frameCount = 0;
			}

			time = interpolatedTime;
			renderer!.update(time);
		});
	});

	onDestroy(() => {
		console.log('destroying score page, cleaning up audio and renderer');
		if (renderer) {
			renderer.destroy();
		}
		if (audio) {
			audio.pause();
			audio.src = '';
			audio.load();
		}
	});

	const skin = $derived($page.url.searchParams.get('skin') || 'Cookiezi04');

	$effect(() => {
		updateSkinTextures(skin);
	});
</script>

<div
	class="fullscreen-wrapper overflow-hidden rounded-xl bg-slate-950 shadow-2xl"
	bind:this={viewerContainer}
>
	{framerate.toFixed(1)} fps
	<div
		class="fullscreen-video flex items-center justify-center"
		id="viewer_container"
		onclick={() => {
			if (audio) {
				audio.paused ? audio.play() : audio.pause();
			}
		}}
	></div>
	{#if audio}
		<div class="fullscreen-controls">
			<AudioControls {audio} fullscreenContainer={viewerContainer} />
		</div>
	{/if}
	{#if mods}
		{#each mods.all as mod}
			<img
				src={getSkinAsset(skin, modAssetNames[mod.acronym as keyof typeof modAssetNames])}
				alt={mod.name}
			/>
		{/each}
	{/if}
</div>

<style>
	#viewer_container {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	#viewer_container :global(canvas) {
		display: block;
		max-width: 100%;
		height: auto;
	}

	.fullscreen-wrapper:fullscreen {
		display: flex;
		flex-direction: column;
		background-color: rgb(2, 6, 23); /* slate-950 */
		padding: 0;
	}

	.fullscreen-wrapper:fullscreen .fullscreen-video {
		flex: 1;
		aspect-ratio: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
	}

	.fullscreen-wrapper:fullscreen #viewer_container :global(canvas) {
		max-height: 100%;
		max-width: 100%;
		width: auto;
		height: auto;
	}
</style>
