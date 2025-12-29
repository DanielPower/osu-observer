<script lang="ts">
	import AudioControls from '$lib/components/AudioControls.svelte';
	import { readBeatmap, readScore, readAudio } from '$lib/osu_files.js';
	import { simulateReplay } from '$lib/osu_simulation.js';
	import { createRenderData, createRenderer } from '$lib/renderer.js';
	import { onMount } from 'svelte';

  let { data } = $props();
	let audio: HTMLAudioElement | null = $state(null);


	onMount(async () => {
    data.deferredData.then(async ({ beatmapUrl, scoreUrl, beatmapSetId }) => {
      const beatmap = await readBeatmap(beatmapUrl);
      const score = await readScore(scoreUrl);
      audio = await readAudio(`/beatmaps/${beatmapSetId}/${beatmap.general.audioFilename}`);
      if (!score.replay) {
        throw new Error('No replay data found in the score file.');
      }
      const simulation = simulateReplay(score.replay, beatmap, 0);
      console.log(simulation);
      const renderer = await createRenderer({ beatmap, score });
      document.getElementById('viewer_container')!.appendChild(renderer.canvas);
      const update = () => {
        if (!audio) {
          throw new Error('No audio file found in the beatmap set.');
        }
        if (!audio.paused) {
          renderer.update(audio.currentTime * 1000);
        }
        requestAnimationFrame(update);
      };
      createRenderData({ beatmap, score });
      update();
    });
	});
</script>

<div class="flex flex-col items-center">
  {#await data.deferredData}
    <p>Loading beatmap data...</p>
  {:then deferredData}
    <h1 class="text-4xl font-bold">
        {deferredData.title} - {deferredData.artist}<br />
        {deferredData.version}
    </h1>
    <h2>Played by {data.username}</h2>
    <div class="w-[640px]">
      <div id="viewer_container"></div>
      {#if audio}
        <AudioControls {audio} />
      {/if}
    </div>
  {/await}
</div>

<style>
	#viewer_container {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}
</style>
