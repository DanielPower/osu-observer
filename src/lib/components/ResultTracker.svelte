<script lang="ts">
	import type { Simulation } from "$lib/osu_simulation";

  let { simulation, time }: { simulation: Simulation; time: number } = $props();
  const frameIndex = $derived(simulation.frames.findIndex((frame) => frame.time > time) - 1);
  const frame = $derived(simulation.frames[frameIndex]);
</script>

<div>
  <p>300: {frame?.great || 0}</p>
  <p>100: {frame?.good || 0}</p>
  <p>50: {frame?.okay || 0}</p>
  <p>miss: {frame?.miss || 0}</p>
</div>
