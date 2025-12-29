<script lang="ts">
</script>

<div class="flex flex-col items-center">
  <h1 class="text-4xl font-bold mb-6">Welcome to the osu! Beatmap Viewer</h1>
  <p class="mb-4 text-center max-w-xl">
    Explore and visualize osu! beatmaps with ease. Upload your beatmap files and see detailed information,
    including hit objects, timing points, and more.
  </p>
  <form class="mb-6 w-full max-w-md" on:submit|preventDefault={() => {
    const input = document.getElementById('score-id') as HTMLInputElement;
    const scoreId = input.value.trim();
    if (scoreId) {
      window.location.href = `/score/${scoreId}`;
    }
  }}>
    <input
      id="score-id"
      type="text"
      placeholder="Enter Score ID"
      class="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
    <button
      type="submit"
      class="mt-4 w-full bg-blue-500 text-white p-3 rounded-lg hover:bg-blue-600 transition-colors"
    >
      View Beatmap
    </button>
  </form>
</div>
