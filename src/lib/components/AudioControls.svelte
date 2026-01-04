<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	// Props
	export let audio: HTMLAudioElement;
	export let fullscreenContainer: HTMLElement | null = null;

	// State
	let isPlaying = false;
	let currentTime = 0;
	let duration = 0;
	let seekValue = 0;
	let isDragging = false;
	let isFullscreen = false;

	// Format time in MM:SS format
	function formatTime(seconds: number): string {
		if (isNaN(seconds)) return '00:00';

		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = Math.floor(seconds % 60);

		return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
	}

	// Toggle fullscreen
	function toggleFullscreen() {
		if (!fullscreenContainer) return;

		if (!document.fullscreenElement) {
			fullscreenContainer.requestFullscreen().catch((err) => {
				console.error('Error attempting to enable fullscreen:', err);
			});
		} else {
			document.exitFullscreen();
		}
	}

	// Handle fullscreen change
	function handleFullscreenChange() {
		isFullscreen = !!document.fullscreenElement;
	}

	// Toggle play/pause
	function togglePlayPause() {
		if (audio.paused) {
			audio.play();
		} else {
			audio.pause();
		}
	}

	// Handle seek bar change
	function handleSeek() {
		if (audio && !isNaN(duration) && duration > 0) {
			audio.currentTime = (seekValue / 100) * duration;
		}
	}

	// Handle seek bar drag start
	function handleSeekStart() {
		isDragging = true;
	}

	// Handle seek bar drag end
	function handleSeekEnd() {
		isDragging = false;
		handleSeek();
	}

	// Update audio time
	function updateTime() {
		if (!isDragging && audio) {
			currentTime = audio.currentTime;
			if (duration > 0) {
				seekValue = (currentTime / duration) * 100;
			}
		}
	}

	// Event listeners
	function setupEventListeners() {
		if (audio) {
			audio.addEventListener('play', () => {
				isPlaying = true;
			});
			audio.addEventListener('pause', () => {
				isPlaying = false;
			});
			audio.addEventListener('timeupdate', updateTime);
			audio.addEventListener('durationchange', () => {
				duration = audio.duration;
				updateTime();
			});
			audio.addEventListener('loadedmetadata', () => {
				duration = audio.duration;
				updateTime();
			});

			// Initial values
			isPlaying = !audio.paused;
			currentTime = audio.currentTime;
			duration = audio.duration || 0;
			if (duration > 0) {
				seekValue = (currentTime / duration) * 100;
			}
		}
	}

	// Cleanup event listeners
	function cleanupEventListeners() {
		if (audio) {
			audio.removeEventListener('play', () => {
				isPlaying = true;
			});
			audio.removeEventListener('pause', () => {
				isPlaying = false;
			});
			audio.removeEventListener('timeupdate', updateTime);
			audio.removeEventListener('durationchange', () => {
				duration = audio.duration;
				updateTime();
			});
			audio.removeEventListener('loadedmetadata', () => {
				duration = audio.duration;
				updateTime();
			});
		}
	}

	onMount(() => {
		setupEventListeners();
		document.addEventListener('fullscreenchange', handleFullscreenChange);
	});

	onDestroy(() => {
		cleanupEventListeners();
		document.removeEventListener('fullscreenchange', handleFullscreenChange);
	});

	// Watch for audio prop changes
	$: if (audio) {
		cleanupEventListeners();
		setupEventListeners();
	}
</script>

<div class="flex w-full flex-wrap items-center gap-2 rounded bg-slate-700 p-2">
	<button
		class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white transition-colors hover:bg-blue-600 focus:outline-none"
		on:click={togglePlayPause}
		aria-label={isPlaying ? 'Pause' : 'Play'}
	>
		{#if isPlaying}
			<svg class="h-5 w-5 fill-current" viewBox="0 0 24 24">
				<rect x="6" y="4" width="4" height="16" />
				<rect x="14" y="4" width="4" height="16" />
			</svg>
		{:else}
			<svg class="h-5 w-5 fill-current" viewBox="0 0 24 24">
				<polygon points="5,3 19,12 5,21" />
			</svg>
		{/if}
	</button>

	<div class="relative h-5 flex-grow">
		<div class="absolute w-full">
			<input
				type="range"
				min="0"
				max="100"
				bind:value={seekValue}
				step="0.001"
				on:input={handleSeek}
				on:mousedown={handleSeekStart}
				on:mouseup={handleSeekEnd}
				on:touchstart={handleSeekStart}
				on:touchend={handleSeekEnd}
				class="absolute z-10 h-2 w-full cursor-pointer appearance-none bg-transparent"
			/>
		</div>
		<div class="absolute top-1/2 right-0 left-0 h-2 -translate-y-1/2 rounded bg-gray-300"></div>
		<div
			class="absolute top-1/2 left-0 h-2 -translate-y-1/2 rounded bg-blue-500"
			style="width: {seekValue}%"
		></div>
	</div>
	<div class="min-w-[100px] text-center font-mono text-sm">
		<span>{formatTime(currentTime)}</span>
		<span class="mx-1">/</span>
		<span>{formatTime(duration)}</span>
	</div>
	<button
		class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-600 text-white transition-colors hover:bg-slate-500 focus:outline-none"
		on:click={toggleFullscreen}
		aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
		disabled={!fullscreenContainer}
	>
		{#if isFullscreen}
			<svg class="h-5 w-5 fill-current" viewBox="0 0 24 24">
				<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
			</svg>
		{:else}
			<svg class="h-5 w-5 fill-current" viewBox="0 0 24 24">
				<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
			</svg>
		{/if}
	</button>
</div>
