<script lang="ts">
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';

	export let audio: HTMLAudioElement | null = null;
	export let backgroundDim: number = 0;
	export let popoverId: string = 'options-popover';

	let volume: number = audio?.volume ?? 1;

	const dispatch = createEventDispatcher<{
		backgroundDimChange: number;
	}>();

	function handleVolumeChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const newVolume = parseFloat(target.value);
		if (audio) {
			audio.volume = newVolume;
		}
	}

	function handleAudioVolumeChange() {
		if (audio) {
			volume = audio.volume;
		}
	}

	function handleBackgroundDimChange(event: Event) {
		const target = event.target as HTMLInputElement;
		backgroundDim = parseFloat(target.value);
		dispatch('backgroundDimChange', backgroundDim);
	}

	function setupAudioListener() {
		if (audio) {
			volume = audio.volume;
			audio.addEventListener('volumechange', handleAudioVolumeChange);
		}
	}

	function cleanupAudioListener() {
		if (audio) {
			audio.removeEventListener('volumechange', handleAudioVolumeChange);
		}
	}

	onMount(() => {
		setupAudioListener();
	});

	onDestroy(() => {
		cleanupAudioListener();
	});

	// Watch for audio prop changes
	$: if (audio) {
		cleanupAudioListener();
		setupAudioListener();
	}
</script>

<div id={popoverId} popover="auto" class="rounded-lg bg-slate-800 p-4 shadow-xl">
	<h2 class="mb-4 text-lg font-semibold text-white">Options</h2>

	<div class="w-64 space-y-4">
		<!-- Volume Slider -->
		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<label for="volume-slider" class="text-sm text-gray-300">Volume</label>
				<span class="text-sm text-gray-400">{Math.round(volume * 100)}%</span>
			</div>
			<input
				id="volume-slider"
				type="range"
				min="0"
				max="1"
				step="0.01"
				value={volume}
				on:input={handleVolumeChange}
				class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-600 accent-blue-500"
			/>
		</div>

		<!-- Background Dim Slider -->
		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<label for="dim-slider" class="text-sm text-gray-300">Background Dim</label>
				<span class="text-sm text-gray-400">{Math.round(backgroundDim * 100)}%</span>
			</div>
			<input
				id="dim-slider"
				type="range"
				min="0"
				max="1"
				step="0.01"
				value={backgroundDim}
				on:input={handleBackgroundDimChange}
				class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-600 accent-blue-500"
			/>
		</div>
	</div>
</div>

<style>
	[popover] {
		border: none;
		margin: 0;
		position: fixed;
		inset: unset;
		position-anchor: --options-button;
		bottom: anchor(top);
		right: anchor(right);
	}

	[popover]::backdrop {
		background: transparent;
	}

	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #3b82f6;
		cursor: pointer;
		border: none;
	}

	input[type='range']::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #3b82f6;
		cursor: pointer;
		border: none;
	}

	input[type='range']::-webkit-slider-runnable-track {
		height: 8px;
		border-radius: 4px;
	}

	input[type='range']::-moz-range-track {
		height: 8px;
		border-radius: 4px;
	}
</style>
