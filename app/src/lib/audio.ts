export function makeAudioSubscribe(audio: HTMLAudioElement | null, ...events: string[]) {
  return (notify: () => void) => {
    if (!audio) return () => {};
    for (const event of events) audio.addEventListener(event, notify);
    return () => {
      for (const event of events) audio.removeEventListener(event, notify);
    };
  };
}
