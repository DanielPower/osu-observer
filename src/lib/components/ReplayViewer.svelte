<script lang="ts">
	import { env } from '$env/dynamic/public';
	import { page } from '$app/stores';
	import { getSkinAsset, modAssetNames } from '$lib/asset_urls';
	import AudioControls from '$lib/components/AudioControls.svelte';
	import OptionsPopup from '$lib/components/OptionsPopup.svelte';
	import { readBeatmap, readScore, readAudio } from '$lib/osu_files.js';
	import { simulateScore, type Simulation } from '$lib/osu_simulation.js';
	import { createRenderer, type Renderer } from '$lib/renderer/renderer.js';
	import { StandardModCombination, StandardRuleset } from 'osu-standard-stable';
	import { onDestroy, onMount } from 'svelte';
	import { updateSkinTextures } from '$lib/skin';
	import { togglePause } from '$lib/utils';

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
	let backgroundDim = $state(0.5);
	const optionsPopoverId = 'options-popover';

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
		audio.volume = 0.5;
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
		renderer.setBackgroundDim(backgroundDim);
		document.getElementById('viewer_container')!.appendChild(renderer.canvas);

		let lastAudioTime = 0;
		let lastPerformanceTime = 0;
		let lastFpsUpdate = 0;
		let frameCount = 0;
		const audioElement = audio;

		renderer.app.ticker.add(() => {
			const now = performance.now();
			const delta = now - lastPerformanceTime;
			lastPerformanceTime = now;

			const audioTimeMs = audioElement.currentTime * 1000;

			if (audioTimeMs !== lastAudioTime) {
				time = audioTimeMs;
				lastAudioTime = audioTimeMs;
			} else if (!audio?.paused) {
				time += delta;
			}

			frameCount++;
			if (now - lastFpsUpdate >= 100) {
				framerate = (frameCount * 1000) / (now - lastFpsUpdate);
				lastFpsUpdate = now;
				frameCount = 0;
			}

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

	function handleBackgroundDimChange(newDim: number) {
		backgroundDim = newDim;
		if (renderer) {
			renderer.setBackgroundDim(newDim);
		}
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (!audio) return;

		if (e.code === 'Space') {
			e.preventDefault();
			togglePause(audio);
		} else if (e.code === 'ArrowLeft') {
			e.preventDefault();
			audio.currentTime = Math.max(0, audio.currentTime - 5);
		} else if (e.code === 'ArrowRight') {
			e.preventDefault();
			audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
		}
	}}
/>

<div
	class="fullscreen-wrapper relative overflow-hidden rounded-xl bg-slate-950 shadow-2xl"
	bind:this={viewerContainer}
>
	{framerate.toFixed(1)} fps
	<div
		class="fullscreen-video flex items-center justify-center"
		id="viewer_container"
		role="button"
		tabindex="0"
		onkeydown={() => {}}
		onclick={() => {
			if (audio) {
				togglePause(audio);
			}
		}}
	></div>
	{#if audio}
		<div class="fullscreen-controls z-20">
			<AudioControls {audio} fullscreenContainer={viewerContainer} {optionsPopoverId} />
		</div>
	{/if}
	<!-- Options popover -->
	<OptionsPopup
		popoverId={optionsPopoverId}
		{audio}
		{backgroundDim}
		on:backgroundDimChange={(e) => handleBackgroundDimChange(e.detail)}
	/>
	{#if mods}
		{#each mods.all as mod (mod.acronym)}
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
