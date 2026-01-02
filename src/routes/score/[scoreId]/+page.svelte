<script lang="ts">
	import AudioControls from '$lib/components/AudioControls.svelte';
	import ResultTracker from '$lib/components/ResultTracker.svelte';
	import { readBeatmap, readScore, readAudio } from '$lib/osu_files.js';
	import { simulateReplay, type Simulation } from '$lib/osu_simulation.js';
	import { createRenderer, type Renderer } from '$lib/renderer.js';
	import { StandardRuleset } from 'osu-standard-stable';
	import { onMount } from 'svelte';

  let { data } = $props();
	let audio: HTMLAudioElement | null = $state(null);
	let viewerContainer: HTMLElement | null = $state(null);

  const standard = new StandardRuleset();
  let time = $state(0);
  let simulation: Simulation | undefined = $state();

  const update = (audio: HTMLAudioElement, renderer: Renderer) => {
    time = audio.currentTime * 1000;
    renderer.update(time);
    requestAnimationFrame(() => update(audio, renderer));
  };

	onMount(async () => {
    data.deferredData.then(async ({ beatmapUrl, scoreUrl, beatmapSetId }) => {
      const beatmap = standard.applyToBeatmap(await readBeatmap(beatmapUrl));
      const score = await readScore(scoreUrl);
      audio = await readAudio(`/beatmaps/${beatmapSetId}/${beatmap.general.audioFilename}`);
      if (!audio) {
        throw new Error('No audio file found in the beatmap set.');
      }
      if (!score.replay) {
        throw new Error('No replay data found in the score file.');
      }
      simulation = simulateReplay(standard.applyToReplay(score.replay), beatmap, 0);
      const renderer = await createRenderer({ beatmap, score, simulation, width: 1280, height: 720 });
      document.getElementById('viewer_container')!.appendChild(renderer.canvas);
      update(audio, renderer);
    });
	});
</script>

<div class="min-h-screen bg-linear-to-b from-slate-900 to-slate-800">
  <div class="container mx-auto px-4 py-8 max-w-5xl">
    {#await data.deferredData}
      <div class="flex items-center justify-center h-96">
        <p class="text-xl text-slate-300">Loading beatmap data...</p>
      </div>
    {:then deferredData}
      <!-- Title Section -->
      <div class="mb-8 text-center">
        <h1 class="text-5xl font-bold text-white mb-2">
          {deferredData.title}
        </h1>
        <p class="text-2xl text-slate-300 mb-4">
          {deferredData.artist}
        </p>
        <div class="inline-block px-4 py-2 bg-blue-600 rounded-lg">
          <p class="text-lg font-semibold text-white">{deferredData.version}</p>
        </div>
      </div>

      <!-- Video Container (Main Focal Point) -->
      <div class="bg-slate-950 rounded-xl shadow-2xl overflow-hidden fullscreen-wrapper" bind:this={viewerContainer}>
        <div class="flex items-center justify-center fullscreen-video" id="viewer_container"></div>
        {#if audio}
          <div class="fullscreen-controls">
            <AudioControls {audio} fullscreenContainer={viewerContainer} />
          </div>
        {/if}
      </div>
      {#if simulation}
        <ResultTracker {simulation} {time} />
      {/if}

      <!-- Metadata Section -->
      <div class="bg-slate-800 rounded-xl shadow-xl p-6">
        <h2 class="text-2xl font-bold text-white mb-4">Replay Information</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-slate-700 rounded-lg p-4">
            <p class="text-sm text-slate-400 mb-1">Player</p>
            <p class="text-lg font-semibold text-white">{data.username}</p>
          </div>
          <div class="bg-slate-700 rounded-lg p-4">
            <p class="text-sm text-slate-400 mb-1">Current Time</p>
            <p class="text-lg font-semibold text-white">{(time / 1000).toFixed(2)}s</p>
          </div>
          <div class="bg-slate-700 rounded-lg p-4">
            <p class="text-sm text-slate-400 mb-1">Score ID</p>
            <p class="text-lg font-semibold text-white">{data.scoreId}</p>
          </div>
          <div class="bg-slate-700 rounded-lg p-4">
            <p class="text-sm text-slate-400 mb-1">Beatmap Set ID</p>
            <p class="text-lg font-semibold text-white">{deferredData.beatmapSetId}</p>
          </div>
        </div>
      </div>
    {/await}
  </div>
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
