export const togglePause = (audio: HTMLAudioElement) => {
	if (audio.paused) {
		audio.play();
	} else {
		audio.pause();
	}
};

