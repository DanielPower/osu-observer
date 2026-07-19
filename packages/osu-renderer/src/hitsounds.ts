import { HitResult, SampleSet } from "osu-classes";
import type { HitSample } from "osu-classes";
import { StandardBeatmap, Slider } from "osu-standard-stable";
import type { Simulation, SimulatedFrame } from "osu-simulation";
import { partitionPoint } from "./math";
import {
  loadSkinSounds,
  type SampleKey,
  type SkinSounds,
  SAMPLE_KEYS,
} from "./skin";

const HIT_TYPE_SLIDER = 1 << 1;
const HIT_TYPE_SPINNER = 1 << 3;

const SAMPLE_KEY_SET = new Set<string>(SAMPLE_KEYS);

// Scheduler tuning (WebAudio "two clocks" lookahead pattern).
const SCHEDULER_INTERVAL_MS = 25;
const LOOKAHEAD_MS = 100;
const DRIFT_THRESHOLD_MS = 40;
// Events more than this far in the past (e.g. after a drift correction) are
// dropped rather than played late.
const PAST_TOLERANCE_MS = 50;

type ScheduledSample = { key: SampleKey; volume: number };
type OneShotEvent = { time: number; samples: ScheduledSample[] };
type SlideEntry = { startTime: number; endTime: number; slideKeys: SampleKey[] };

export type HitsoundEngine = {
  loadSounds: (urls: Partial<Record<SampleKey, string>>) => Promise<void>;
  setAudio: (audio: HTMLAudioElement | null) => void;
  setEffectsVolume: (volume: number) => void;
  dispose: () => void;
};

// The beatmap's default sample bank ([General] SampleSet), used when an object's
// resolved sample set is "None" (osu falls back to this, then to Normal).
function defaultSampleSetName(beatmap: StandardBeatmap): string {
  const name = SampleSet[beatmap.general.sampleSet];
  return name && name !== "None" ? name.toLowerCase() : "normal";
}

function resolveSampleSet(sampleSet: string, defaultSet: string): string {
  const set = sampleSet.toLowerCase();
  return set === "none" ? defaultSet : set;
}

function samplesToKeys(samples: HitSample[], defaultSet: string): ScheduledSample[] {
  const result: ScheduledSample[] = [];
  for (const sample of samples) {
    // Skin scope: ignore beatmap-embedded custom files.
    if (sample.filename) continue;
    const set = resolveSampleSet(sample.sampleSet, defaultSet);
    const key = `${set}-hit${sample.hitSound.toLowerCase()}`;
    if (SAMPLE_KEY_SET.has(key)) {
      result.push({ key: key as SampleKey, volume: (sample.volume || 100) / 100 });
    }
  }
  return result;
}

function bodyNormalSample(slider: Slider): HitSample | undefined {
  return (
    slider.samples.find((s) => !s.filename && s.hitSound.toLowerCase() === "normal") ??
    slider.samples[0]
  );
}

function isTrackingAt(frames: SimulatedFrame[], time: number): boolean {
  const idx = partitionPoint(frames, 0, frames.length, (f) => f.time <= time);
  const frame = frames[idx - 1] ?? frames[frames.length - 1];
  return frame?.activeSliderProgress !== undefined;
}

function buildSchedule(
  beatmap: StandardBeatmap,
  simulation: Simulation,
): { oneShots: OneShotEvent[]; slideEntries: SlideEntry[] } {
  const oneShots: OneShotEvent[] = [];
  const slideEntries: SlideEntry[] = [];

  // The simulation preserves the beatmap's hit-object order; if the counts ever
  // disagree we can't safely correlate samples, so disable hitsounds rather than
  // play the wrong ones.
  if (beatmap.hitObjects.length !== simulation.hitObjects.length) {
    return { oneShots, slideEntries };
  }

  const frames = simulation.frames;
  const defaultSet = defaultSampleSetName(beatmap);

  for (let i = 0; i < simulation.hitObjects.length; i++) {
    const sim = simulation.hitObjects[i];
    if (sim.type & HIT_TYPE_SPINNER) continue;

    const isSlider = (sim.type & HIT_TYPE_SLIDER) !== 0 && sim.slider !== undefined;
    if (!isSlider) {
      if (sim.result !== HitResult.Miss) {
        const samples = samplesToKeys(beatmap.hitObjects[i].samples, defaultSet);
        if (samples.length) oneShots.push({ time: sim.resultTime, samples });
      }
      continue;
    }

    const slider = beatmap.hitObjects[i] as Slider;
    const nodeSamples = slider.nodeSamples ?? [];
    const sliderData = sim.slider!;
    const endTime = sim.endTime ?? sliderData.duration + sim.time;

    // Head (played on click, at the head's actual judgement time).
    if (sim.result !== HitResult.Miss && nodeSamples[0]) {
      const samples = samplesToKeys(nodeSamples[0], defaultSet);
      if (samples.length) oneShots.push({ time: sim.resultTime, samples });
    }

    // Repeats: repeatPositions[j] correspond to nodeSamples[1 + j].
    for (let j = 0; j < sliderData.repeatPositions.length; j++) {
      const node = nodeSamples[1 + j];
      const time = sliderData.repeatPositions[j].time;
      if (node && isTrackingAt(frames, time)) {
        const samples = samplesToKeys(node, defaultSet);
        if (samples.length) oneShots.push({ time, samples });
      }
    }

    // Tail: plays only if the tail was hit (tracked to the end).
    const tailNode = nodeSamples[nodeSamples.length - 1];
    if (nodeSamples.length > 1 && tailNode && sim.endResult !== undefined && sim.endResult !== HitResult.Miss) {
      const samples = samplesToKeys(tailNode, defaultSet);
      if (samples.length) oneShots.push({ time: sim.endResultTime ?? endTime, samples });
    }

    // Ticks + slide/whistle loop use the slider body's sample set.
    const bodySample = bodyNormalSample(slider);
    const bodySet = resolveSampleSet(bodySample?.sampleSet ?? "Normal", defaultSet);
    const bodyVolume = (bodySample?.volume || 100) / 100;

    const tickKey = `${bodySet}-slidertick`;
    if (SAMPLE_KEY_SET.has(tickKey)) {
      for (const tick of sliderData.tickPositions) {
        if (isTrackingAt(frames, tick.time)) {
          oneShots.push({ time: tick.time, samples: [{ key: tickKey as SampleKey, volume: bodyVolume }] });
        }
      }
    }

    const slideKeys: SampleKey[] = [];
    const slideKey = `${bodySet}-sliderslide`;
    if (SAMPLE_KEY_SET.has(slideKey)) slideKeys.push(slideKey as SampleKey);
    if (slider.samples.some((s) => !s.filename && s.hitSound.toLowerCase() === "whistle")) {
      const whistleKey = `${bodySet}-sliderwhistle`;
      if (SAMPLE_KEY_SET.has(whistleKey)) slideKeys.push(whistleKey as SampleKey);
    }
    if (slideKeys.length) slideEntries.push({ startTime: sim.time, endTime, slideKeys });
  }

  oneShots.sort((a, b) => a.time - b.time);
  slideEntries.sort((a, b) => a.startTime - b.startTime);
  return { oneShots, slideEntries };
}

export function createHitsoundEngine({
  beatmap,
  simulation,
}: {
  beatmap: StandardBeatmap;
  simulation: Simulation;
}): HitsoundEngine {
  const { oneShots, slideEntries } = buildSchedule(beatmap, simulation);
  const frames = simulation.frames;

  const audioContext = new AudioContext();
  const effectsGain = audioContext.createGain();
  effectsGain.gain.value = 0.5;
  effectsGain.connect(audioContext.destination);

  const sounds: SkinSounds = {};

  let audioElement: HTMLAudioElement | null = null;
  let schedulerInterval: ReturnType<typeof setInterval> | null = null;
  let cursor = 0;
  let anchor: { song: number; ctx: number; rate: number } | null = null;
  const scheduledSources = new Set<AudioBufferSourceNode>();
  let activeSlide: { startTime: number; sources: AudioBufferSourceNode[] } | null = null;

  const resumeOnce = () => {
    audioContext.resume().catch(() => {});
  };
  document.addEventListener("pointerdown", resumeOnce, { once: true });
  document.addEventListener("keydown", resumeOnce, { once: true });

  function reanchor(): void {
    const song = audioElement ? audioElement.currentTime * 1000 : 0;
    anchor = { song, ctx: audioContext.currentTime, rate: audioElement?.playbackRate ?? 1 };
  }

  function dropScheduledSources(): void {
    for (const src of scheduledSources) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        // already stopped
      }
    }
    scheduledSources.clear();
  }

  function stopSlide(): void {
    if (!activeSlide) return;
    for (const src of activeSlide.sources) {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    }
    activeSlide = null;
  }

  // Cancel pending audio and re-align the schedule cursor with the current song
  // position, so seeks/pauses/rate changes never burst or play stale-rate sounds.
  function resetScheduling(): void {
    dropScheduledSources();
    stopSlide();
    anchor = null;
    const song = audioElement ? audioElement.currentTime * 1000 : 0;
    cursor = partitionPoint(oneShots, 0, oneShots.length, (e) => e.time < song);
  }

  function playOneShot(event: OneShotEvent, whenCtx: number): void {
    for (const sample of event.samples) {
      const buffer = sounds[sample.key];
      if (!buffer) continue;
      const src = audioContext.createBufferSource();
      src.buffer = buffer;
      const gain = audioContext.createGain();
      gain.gain.value = sample.volume;
      src.connect(gain).connect(effectsGain);
      src.start(whenCtx);
      scheduledSources.add(src);
      src.onended = () => scheduledSources.delete(src);
    }
  }

  function updateSlide(songNow: number): void {
    const idx = partitionPoint(slideEntries, 0, slideEntries.length, (e) => e.startTime <= songNow) - 1;
    const entry = idx >= 0 ? slideEntries[idx] : null;
    const inSlide = entry !== null && songNow >= entry.startTime && songNow <= entry.endTime;

    if (inSlide && entry && isTrackingAt(frames, songNow)) {
      if (!activeSlide || activeSlide.startTime !== entry.startTime) {
        stopSlide();
        activeSlide = { startTime: entry.startTime, sources: [] };
        for (const key of entry.slideKeys) {
          const buffer = sounds[key];
          if (!buffer) continue;
          const src = audioContext.createBufferSource();
          src.buffer = buffer;
          src.loop = true;
          src.connect(effectsGain);
          src.start();
          activeSlide.sources.push(src);
        }
      }
    } else {
      stopSlide();
    }
  }

  function tick(): void {
    if (!audioElement || audioElement.paused || audioContext.state !== "running") return;

    if (!anchor) reanchor();
    const ctxNow = audioContext.currentTime;
    let songNow = anchor!.song + (ctxNow - anchor!.ctx) * anchor!.rate * 1000;

    const actual = audioElement.currentTime * 1000;
    if (
      Math.abs(actual - songNow) > DRIFT_THRESHOLD_MS ||
      audioElement.playbackRate !== anchor!.rate
    ) {
      reanchor();
      songNow = anchor!.song;
    }

    const rate = anchor!.rate;
    const horizon = songNow + LOOKAHEAD_MS * rate;

    while (cursor < oneShots.length && oneShots[cursor].time <= horizon) {
      const event = oneShots[cursor];
      cursor++;
      if (event.time < songNow - PAST_TOLERANCE_MS) continue;
      const whenCtx = Math.max(ctxNow, anchor!.ctx + (event.time - anchor!.song) / (rate * 1000));
      playOneShot(event, whenCtx);
    }

    updateSlide(songNow);
  }

  const onPlay = () => {
    audioContext.resume().catch(() => {});
    resetScheduling();
  };
  const onDisrupt = () => resetScheduling();

  function attachListeners(el: HTMLAudioElement): void {
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onDisrupt);
    el.addEventListener("seeking", onDisrupt);
    el.addEventListener("seeked", onDisrupt);
    el.addEventListener("ratechange", onDisrupt);
  }

  function detachListeners(el: HTMLAudioElement): void {
    el.removeEventListener("play", onPlay);
    el.removeEventListener("pause", onDisrupt);
    el.removeEventListener("seeking", onDisrupt);
    el.removeEventListener("seeked", onDisrupt);
    el.removeEventListener("ratechange", onDisrupt);
  }

  return {
    async loadSounds(urls) {
      const newSounds = await loadSkinSounds(urls, audioContext);
      for (const key of Object.keys(sounds)) {
        delete sounds[key as SampleKey];
      }
      Object.assign(sounds, newSounds);
    },

    setAudio(el) {
      if (audioElement) detachListeners(audioElement);
      audioElement = el;
      resetScheduling();
      if (el) {
        attachListeners(el);
        if (!schedulerInterval) schedulerInterval = setInterval(tick, SCHEDULER_INTERVAL_MS);
      } else if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
      }
    },

    setEffectsVolume(volume) {
      effectsGain.gain.value = Math.min(1, Math.max(0, volume));
    },

    dispose() {
      if (schedulerInterval) clearInterval(schedulerInterval);
      schedulerInterval = null;
      dropScheduledSources();
      stopSlide();
      if (audioElement) detachListeners(audioElement);
      document.removeEventListener("pointerdown", resumeOnce);
      document.removeEventListener("keydown", resumeOnce);
      audioContext.close().catch(() => {});
    },
  };
}
