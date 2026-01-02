<script lang="ts">
	import { env } from '$env/dynamic/public';
	import AudioControls from '$lib/components/AudioControls.svelte';
	import { readBeatmap, readScore, readAudio } from '$lib/osu_files.js';
	import { simulateReplay, type Simulation } from '$lib/osu_simulation.js';
	import { createRenderer, type Renderer } from '$lib/renderer.js';
	import { StandardRuleset } from 'osu-standard-stable';
	import { onDestroy, onMount } from 'svelte';

	const {
		scoreId,
		beatmapId,
		beatmapSetId
	}: { scoreId: string; beatmapId: string; beatmapSetId: string } = $props();

	let time = $state(0);
	let audio: HTMLAudioElement | null = $state(null);
	let viewerContainer: HTMLElement | null = $state(null);
	const standard = new StandardRuleset();
	let simulation: Simulation | undefined = $state();

	const update = (audio: HTMLAudioElement, renderer: Renderer) => {
		time = audio.currentTime * 1000;
		renderer.update(time);
		requestAnimationFrame(() => update(audio, renderer));
	};

	onMount(async () => {
		const beatmap = standard.applyToBeatmap(
			await readBeatmap(`${env.PUBLIC_SERVE_MEDIA_PATH}/beatmaps/${beatmapSetId}/${beatmapId}.osu`)
		);
		const score = await readScore(`${env.PUBLIC_SERVE_MEDIA_PATH}/scores/${scoreId}.osr`);
		audio = await readAudio(
			`${env.PUBLIC_SERVE_MEDIA_PATH}/beatmaps/${beatmapSetId}/${beatmap.general.audioFilename}`
		);
		if (!audio) {
			throw new Error('No audio file found in the beatmap set.');
		}
		if (!score.replay) {
			throw new Error('No replay data found in the score file.');
		}
		simulation = simulateReplay(standard.applyToReplay(score.replay), beatmap, 0);
		const renderer = await createRenderer({
			beatmap,
			score,
			simulation,
			width: 1920,
			height: 1080
		});
		document.getElementById('viewer_container')!.appendChild(renderer.canvas);
		update(audio, renderer);
	});

	onDestroy(() => {
		console.log('destroying score page, cleaning up audio');
		if (audio) {
			audio.pause();
			audio.src = '';
			audio.load();
		}
	});
</script>

<div
	class="fullscreen-wrapper overflow-hidden rounded-xl bg-slate-950 shadow-2xl"
	bind:this={viewerContainer}
>
	<div class="fullscreen-video flex items-center justify-center" id="viewer_container"></div>
	{#if audio}
		<div class="fullscreen-controls">
			<AudioControls {audio} fullscreenContainer={viewerContainer} />
		</div>
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

	/* Fullscreen styles */
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
