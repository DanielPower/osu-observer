<script lang="ts">
</script>

<div class="flex w-full flex-1 flex-col items-center justify-center">
	<p class="mb-4 text-center text-xl">
		Quickly view and analyze osu! replays. Enter a Score ID below to get started.
	</p>
	<form
		class="mb-6 w-full max-w-md"
		on:submit|preventDefault={() => {
			const input = document.getElementById('score-id') as HTMLInputElement;
			const scoreId = input.value.trim();
			if (scoreId) {
				window.location.href = `/score/${scoreId}`;
			}
		}}
	>
		<input
			id="score-id"
			type="text"
			placeholder="Enter Score ID"
			class="w-full rounded-lg border border-gray-300 p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
		/>
		<button
			type="submit"
			class="mt-4 w-full rounded-lg bg-blue-600 p-3 text-white transition-colors hover:bg-blue-600"
		>
			View Beatmap
		</button>
	</form>
</div>
