import { HitResult, SampleSet } from "osu-classes";
import type { HitSample } from "osu-classes";
import { StandardBeatmap, Slider } from "osu-standard-stable";
import type { Simulation, SimulatedFrame } from "osu-simulation";
import {
  getMaxBonusSpins,
  getSpinsRequired,
  getSpinsRequiredForBonus,
  partitionPoint,
  PLAYFIELD,
} from "./math";
import { loadSkinSounds, type SampleKey, type SkinSounds, SAMPLE_KEYS } from "./skin";

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

// lazer's DrawableHitObject.MINIMUM_SAMPLE_VOLUME (percent).
const MINIMUM_SAMPLE_VOLUME = 5;

// lazer pans samples by horizontal playfield position: balance = level * 2 * (x - 0.5),
// with the PositionalHitsoundsLevel setting defaulting to 0.2 (OsuConfigManager).
const POSITIONAL_HITSOUNDS_LEVEL = 0.2;

// Slider slide loops follow the ball's position; resample its pan this often.
const SLIDE_PAN_STEP_MS = 20;

// DrawableSpinner's spinning loop: fades in over 300ms while spinning, out over 240ms
// otherwise, and is stopped when the spinner finishes its 240ms fade out.
const SPIN_FADE_IN_MS = 300;
const SPIN_FADE_OUT_MS = 240;
// The spinning sample's frequency rises with spinner progress (legacy
// SpinnerFrequencyModulate, on by default).
const SPIN_BASE_RATE = 20_000 / 44_100;
const SPIN_RATE_PER_PROGRESS = 40_000 / 44_100;
const SPIN_MAX_RATE = 100_000 / 44_100;
// SpinnerRotationTracker.IsSpinning: the displayed disc rotation (damped towards
// the real rotation with a 0.99 per-ms factor) lags it by more than 10 degrees.
const SPIN_DISPLAY_DAMPING = 0.99;
const SPINNING_LAG_DEGREES = 10;

export type ScheduledSample = { key: SampleKey; volume: number };
export type OneShotEvent = { time: number; samples: ScheduledSample[]; pan: number };

// A breakpoint in an AudioParam automation: "set" jumps to the value at `time`,
// "linear" ramps from the previous breakpoint to reach the value at `time`.
export type Breakpoint = { time: number; value: number; ramp: "set" | "linear" };

// A looping sample (slider slide/whistle, spinner spin) playing from startTime to stopTime.
export type LoopEvent = {
  kind: "slide" | "spin";
  startTime: number;
  stopTime: number;
  samples: ScheduledSample[];
  gain: Breakpoint[];
  pan: Breakpoint[];
  rate: Breakpoint[];
};

export type HitsoundSchedule = { oneShots: OneShotEvent[]; loops: LoopEvent[] };

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

function sampleVolume(sample: HitSample | undefined): number {
  return Math.max(MINIMUM_SAMPLE_VOLUME, sample?.volume || 100) / 100;
}

function panAt(x: number): number {
  const position = x / PLAYFIELD.width;
  return Math.round(POSITIONAL_HITSOUNDS_LEVEL * 2 * (position - 0.5) * 100) / 100;
}

function samplesToKeys(samples: HitSample[], defaultSet: string): ScheduledSample[] {
  const result: ScheduledSample[] = [];
  for (const sample of samples) {
    // Skin scope: ignore beatmap-embedded custom files.
    if (sample.filename) continue;
    const set = resolveSampleSet(sample.sampleSet, defaultSet);
    const key = `${set}-hit${sample.hitSound.toLowerCase()}`;
    if (SAMPLE_KEY_SET.has(key)) {
      result.push({ key: key as SampleKey, volume: sampleVolume(sample) });
    }
  }
  return result;
}

function findSample(samples: HitSample[], hitSound: string): HitSample | undefined {
  return samples.find((s) => !s.filename && s.hitSound.toLowerCase() === hitSound);
}

function bodyNormalSample(slider: Slider): HitSample | undefined {
  return findSample(slider.samples, "normal") ?? slider.samples[0];
}

function frameAt(frames: SimulatedFrame[], time: number): SimulatedFrame | undefined {
  const idx = partitionPoint(frames, 0, frames.length, (f) => f.time <= time);
  return frames[idx - 1] ?? frames[frames.length - 1];
}

function isTrackingAt(frames: SimulatedFrame[], time: number): boolean {
  return frameAt(frames, time)?.activeSliderProgress !== undefined;
}

// Contiguous spans within [start, end] where `active(frame)` holds, using the
// frames' step-function semantics (a frame's state lasts until the next frame).
function activeSpans(
  frames: SimulatedFrame[],
  start: number,
  end: number,
  active: (frame: SimulatedFrame) => boolean,
): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  let spanStart: number | null = active(frameAt(frames, start) ?? frames[0]) ? start : null;
  let i = partitionPoint(frames, 0, frames.length, (f) => f.time <= start);
  for (; i < frames.length && frames[i].time < end; i++) {
    const isActive = active(frames[i]);
    if (isActive && spanStart === null) spanStart = frames[i].time;
    if (!isActive && spanStart !== null) {
      spans.push({ start: spanStart, end: frames[i].time });
      spanStart = null;
    }
  }
  if (spanStart !== null) spans.push({ start: spanStart, end });
  return spans;
}

function sliderBallX(slider: Slider, time: number): number {
  const elapsed = Math.min(Math.max(time - slider.startTime, 0), slider.duration);
  const spanDuration = slider.spanDuration;
  const span = Math.min(Math.floor(elapsed / spanDuration), slider.spans - 1);
  const progressInSpan = (elapsed - span * spanDuration) / spanDuration;
  const pathProgress = span % 2 === 1 ? 1 - progressInSpan : progressInSpan;
  return slider.path.positionAt(Math.min(1, Math.max(0, pathProgress))).x + slider.startX;
}

function scheduleSlider(
  i: number,
  beatmap: StandardBeatmap,
  simulation: Simulation,
  defaultSet: string,
  schedule: HitsoundSchedule,
): void {
  const sim = simulation.hitObjects[i];
  const slider = beatmap.hitObjects[i] as Slider;
  const frames = simulation.frames;
  const nodeSamples = slider.nodeSamples ?? [];
  const sliderData = sim.slider!;
  const endTime = slider.endTime;

  // Head (played on click, at the head's actual judgement time).
  if (sim.result !== HitResult.Miss) {
    const samples = samplesToKeys(nodeSamples[0] ?? [], defaultSet);
    if (samples.length)
      schedule.oneShots.push({ time: sim.resultTime, samples, pan: panAt(sim.x) });
  }

  // Repeats: repeatPositions[j] correspond to nodeSamples[1 + j].
  for (let j = 0; j < sliderData.repeatPositions.length; j++) {
    const { time, position } = sliderData.repeatPositions[j];
    if (!isTrackingAt(frames, time)) continue;
    const samples = samplesToKeys(nodeSamples[1 + j] ?? [], defaultSet);
    if (samples.length) schedule.oneShots.push({ time, samples, pan: panAt(position.x) });
  }

  // Ticks use the slider body's normal sample bank and volume.
  const bodySample = bodyNormalSample(slider);
  const bodySet = resolveSampleSet(bodySample?.sampleSet ?? "Normal", defaultSet);
  const tickKey = `${bodySet}-slidertick`;
  for (const tick of sliderData.tickPositions) {
    if (!isTrackingAt(frames, tick.time)) continue;
    if (SAMPLE_KEY_SET.has(tickKey)) {
      schedule.oneShots.push({
        time: tick.time,
        samples: [{ key: tickKey as SampleKey, volume: sampleVolume(bodySample) }],
        pan: panAt(tick.position.x),
      });
    }
  }

  // Tail: lazer's DrawableSlider plays the tail samples itself, once the slider is judged at
  // its end time (not at the 36ms-early tail leniency point), and only if the tail was hit.
  const tailHit = sim.endResult !== undefined && sim.endResult !== HitResult.Miss;
  if (nodeSamples.length > 1 && tailHit) {
    const samples = samplesToKeys(nodeSamples[nodeSamples.length - 1], defaultSet);
    // The slider drawable's centre is the middle of its body's bounding box.
    const xs = sliderData.path.map((p) => p.x);
    const centreX = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : sim.x;
    if (samples.length) schedule.oneShots.push({ time: endTime, samples, pan: panAt(centreX) });
  }

  // Slide/whistle loop: plays while tracking, panned to follow the ball.
  const slideSamples: ScheduledSample[] = [];
  const whistleSample = findSample(slider.samples, "whistle");
  if (bodySample) {
    const key = `${bodySet}-sliderslide`;
    if (SAMPLE_KEY_SET.has(key)) {
      slideSamples.push({ key: key as SampleKey, volume: sampleVolume(bodySample) });
    }
  }
  if (whistleSample) {
    const key = `${resolveSampleSet(whistleSample.sampleSet, defaultSet)}-sliderwhistle`;
    if (SAMPLE_KEY_SET.has(key)) {
      slideSamples.push({ key: key as SampleKey, volume: sampleVolume(whistleSample) });
    }
  }
  if (!slideSamples.length) return;

  const spans = activeSpans(
    frames,
    slider.startTime,
    endTime,
    (f) => f.activeSliderProgress !== undefined,
  );
  for (const span of spans) {
    const pan: Breakpoint[] = [];
    for (let t = span.start; t < span.end; t += SLIDE_PAN_STEP_MS) {
      pan.push({ time: t, value: panAt(sliderBallX(slider, t)), ramp: "linear" });
    }
    pan.push({ time: span.end, value: panAt(sliderBallX(slider, span.end)), ramp: "linear" });
    schedule.loops.push({
      kind: "slide",
      startTime: span.start,
      stopTime: span.end,
      samples: slideSamples,
      gain: [{ time: span.start, value: 1, ramp: "set" }],
      pan,
      rate: [{ time: span.start, value: 1, ramp: "set" }],
    });
  }
}

function scheduleSpinner(
  i: number,
  beatmap: StandardBeatmap,
  simulation: Simulation,
  defaultSet: string,
  schedule: HitsoundSchedule,
): void {
  const sim = simulation.hitObjects[i];
  const spinner = beatmap.hitObjects[i];
  const frames = simulation.frames;
  const startTime = spinner.startTime;
  const endTime = sim.endTime ?? startTime;
  const duration = endTime - startTime;
  const od = beatmap.difficulty.overallDifficulty;
  const spinsRequired = getSpinsRequired(duration, od);
  const spinsRequiredForBonus = getSpinsRequiredForBonus(duration, od);
  const totalTicks = spinsRequiredForBonus + getMaxBonusSpins(duration, od);

  // Spinner samples (and the spin/bonus sounds) use the first sample's bank and volume.
  const reference = spinner.samples[0];
  const referenceVolume = sampleVolume(reference);

  // Completion: lazer judges the spinner at its end time and plays its samples if hit.
  if (sim.result !== HitResult.Miss) {
    const samples = samplesToKeys(spinner.samples, defaultSet);
    if (samples.length) schedule.oneShots.push({ time: endTime, samples, pan: 0 });
  }

  const first = partitionPoint(frames, 0, frames.length, (f) => f.time < startTime);
  const last = partitionPoint(frames, 0, frames.length, (f) => f.time < endTime);

  // Bonus: each full spin past SpinsRequiredForBonus triggers a bonus tick's "spinnerbonus";
  // past the last tick, lazer plays "spinnerbonus-max" (falling back to "spinnerbonus").
  const bonusKey: SampleKey = "spinnerbonus";
  const maxKey: SampleKey = "spinnerbonus-max";
  let completedSpins = 0;
  for (let f = first; f < last; f++) {
    const rotation = frames[f].currentSpinnerRotation;
    if (rotation === undefined) continue;
    const spins = Math.floor((rotation * 180) / Math.PI / 360);
    for (; completedSpins < spins; completedSpins++) {
      if (completedSpins < spinsRequiredForBonus) continue;
      const key = completedSpins < totalTicks ? bonusKey : maxKey;
      schedule.oneShots.push({
        time: frames[f].time,
        samples: [{ key, volume: referenceVolume }],
        pan: 0,
      });
    }
  }

  // Spinning loop: follow lazer's IsSpinning (the displayed disc lagging the real rotation).
  let displayed = 0;
  let prevTime = startTime;
  const spinningFrames = new Set<SimulatedFrame>();
  for (let f = first; f < last; f++) {
    const frame = frames[f];
    const rotation = ((frame.currentSpinnerRotation ?? 0) * 180) / Math.PI;
    const elapsed = Math.max(0, frame.time - prevTime);
    displayed = rotation + (displayed - rotation) * SPIN_DISPLAY_DAMPING ** elapsed;
    prevTime = frame.time;
    if (Math.abs(rotation - displayed) > SPINNING_LAG_DEGREES) spinningFrames.add(frame);
  }
  const spans = activeSpans(frames, startTime, endTime, (f) => spinningFrames.has(f));
  if (!spans.length) return;

  const gain: Breakpoint[] = [];
  let fade = { from: 0, to: 0, start: 0, length: 1 };
  const valueAt = (t: number) =>
    fade.from + (fade.to - fade.from) * Math.min(1, Math.max(0, (t - fade.start) / fade.length));
  const fadeTo = (t: number, to: number, fadeMs: number) => {
    const from = valueAt(t);
    const previous = gain[gain.length - 1];
    // A fade cut short by the next one ends its ramp where it got to.
    if (previous && previous.time > t) gain.pop();
    gain.push({ time: t, value: from, ramp: previous ? "linear" : "set" });
    gain.push({ time: t + fadeMs, value: to, ramp: "linear" });
    fade = { from, to, start: t, length: fadeMs };
  };
  for (const span of spans) {
    fadeTo(span.start, 1, SPIN_FADE_IN_MS);
    fadeTo(span.end, 0, SPIN_FADE_OUT_MS);
  }

  const rate: Breakpoint[] = [];
  for (let f = first; f < last; f++) {
    const rotation = ((frames[f].currentSpinnerRotation ?? 0) * 180) / Math.PI;
    const progress = spinsRequired === 0 ? 1 : rotation / 360 / spinsRequired;
    const value = Math.min(SPIN_MAX_RATE, SPIN_BASE_RATE + progress * SPIN_RATE_PER_PROGRESS);
    if (rate.length && rate[rate.length - 1].value === value) continue;
    rate.push({ time: frames[f].time, value, ramp: rate.length ? "linear" : "set" });
  }

  schedule.loops.push({
    kind: "spin",
    startTime: spans[0].start,
    stopTime: endTime + SPIN_FADE_OUT_MS,
    samples: [{ key: "spinnerspin", volume: referenceVolume }],
    gain,
    pan: [{ time: spans[0].start, value: 0, ramp: "set" }],
    rate,
  });
}

export function buildHitsoundSchedule(
  beatmap: StandardBeatmap,
  simulation: Simulation,
): HitsoundSchedule {
  const schedule: HitsoundSchedule = { oneShots: [], loops: [] };

  // The simulation preserves the beatmap's hit-object order; if the counts ever
  // disagree we can't safely correlate samples, so disable hitsounds rather than
  // play the wrong ones.
  if (beatmap.hitObjects.length !== simulation.hitObjects.length) {
    return schedule;
  }

  const defaultSet = defaultSampleSetName(beatmap);

  for (let i = 0; i < simulation.hitObjects.length; i++) {
    const sim = simulation.hitObjects[i];
    if (sim.type & HIT_TYPE_SPINNER) {
      scheduleSpinner(i, beatmap, simulation, defaultSet, schedule);
    } else if ((sim.type & HIT_TYPE_SLIDER) !== 0 && sim.slider !== undefined) {
      scheduleSlider(i, beatmap, simulation, defaultSet, schedule);
    } else if (sim.result !== HitResult.Miss) {
      const samples = samplesToKeys(beatmap.hitObjects[i].samples, defaultSet);
      if (samples.length) {
        schedule.oneShots.push({ time: sim.resultTime, samples, pan: panAt(sim.x) });
      }
    }
  }

  schedule.oneShots.sort((a, b) => a.time - b.time);
  schedule.loops.sort((a, b) => a.startTime - b.startTime);
  return schedule;
}

// Value of an automation curve at `time`.
function breakpointValueAt(points: Breakpoint[], time: number): number {
  const idx = partitionPoint(points, 0, points.length, (p) => p.time <= time);
  const prev = points[idx - 1];
  const next = points[idx];
  if (!prev) return points[0]?.value ?? 1;
  if (!next || next.ramp === "set") return prev.value;
  return prev.value + ((next.value - prev.value) * (time - prev.time)) / (next.time - prev.time);
}

type ActiveLoop = {
  event: LoopEvent;
  sources: AudioBufferSourceNode[];
  gain: GainNode;
  panner: StereoPannerNode;
  // How far into the event's automation has been handed to WebAudio.
  scheduledUntil: number;
  stopScheduled: boolean;
};

export function createHitsoundEngine({
  beatmap,
  simulation,
}: {
  beatmap: StandardBeatmap;
  simulation: Simulation;
}): HitsoundEngine {
  const { oneShots, loops } = buildHitsoundSchedule(beatmap, simulation);

  const audioContext = new AudioContext();
  const effectsGain = audioContext.createGain();
  effectsGain.gain.value = 0.5;
  effectsGain.connect(audioContext.destination);

  const sounds: SkinSounds = {};

  let audioElement: HTMLAudioElement | null = null;
  let schedulerInterval: ReturnType<typeof setInterval> | null = null;
  let cursor = 0;
  let loopCursor = 0;
  let anchor: { song: number; ctx: number; rate: number } | null = null;
  const scheduledSources = new Set<AudioBufferSourceNode>();
  const activeLoops = new Set<ActiveLoop>();

  const resumeOnce = () => {
    audioContext.resume().catch(() => {});
  };
  document.addEventListener("pointerdown", resumeOnce, { once: true });
  document.addEventListener("keydown", resumeOnce, { once: true });

  function reanchor(): void {
    const song = audioElement ? audioElement.currentTime * 1000 : 0;
    anchor = { song, ctx: audioContext.currentTime, rate: audioElement?.playbackRate ?? 1 };
  }

  function songToCtx(time: number): number {
    return Math.max(
      audioContext.currentTime,
      anchor!.ctx + (time - anchor!.song) / (anchor!.rate * 1000),
    );
  }

  function stopSource(src: AudioBufferSourceNode): void {
    src.onended = null;
    try {
      src.stop();
    } catch {
      // already stopped
    }
  }

  function dropScheduledSources(): void {
    for (const src of scheduledSources) stopSource(src);
    scheduledSources.clear();
  }

  function stopLoops(): void {
    for (const loop of activeLoops) {
      for (const src of loop.sources) stopSource(src);
    }
    activeLoops.clear();
  }

  // Cancel pending audio and re-align the schedule cursors with the current song
  // position, so seeks/pauses/rate changes never burst or play stale-rate sounds.
  function resetScheduling(): void {
    dropScheduledSources();
    stopLoops();
    anchor = null;
    const song = audioElement ? audioElement.currentTime * 1000 : 0;
    cursor = partitionPoint(oneShots, 0, oneShots.length, (e) => e.time < song);
    // Loops that are still playing at the new position are restarted on the next tick.
    loopCursor = partitionPoint(loops, 0, loops.length, (e) => e.startTime <= song);
    while (loopCursor > 0 && loops[loopCursor - 1].stopTime > song) loopCursor--;
  }

  function playOneShot(event: OneShotEvent, whenCtx: number): void {
    for (const sample of event.samples) {
      const buffer =
        sounds[sample.key] ?? (sample.key === "spinnerbonus-max" ? sounds.spinnerbonus : undefined);
      if (!buffer) continue;
      const src = audioContext.createBufferSource();
      src.buffer = buffer;
      const gain = audioContext.createGain();
      gain.gain.value = sample.volume;
      const panner = audioContext.createStereoPanner();
      panner.pan.value = event.pan;
      src.connect(gain).connect(panner).connect(effectsGain);
      src.start(whenCtx);
      scheduledSources.add(src);
      src.onended = () => scheduledSources.delete(src);
    }
  }

  function startLoop(event: LoopEvent, songNow: number): void {
    const from = Math.max(songNow, event.startTime);
    const gain = audioContext.createGain();
    const panner = audioContext.createStereoPanner();
    gain.connect(panner).connect(effectsGain);
    const whenCtx = songToCtx(from);
    gain.gain.setValueAtTime(breakpointValueAt(event.gain, from), whenCtx);
    panner.pan.setValueAtTime(breakpointValueAt(event.pan, from), whenCtx);

    const sources: AudioBufferSourceNode[] = [];
    for (const sample of event.samples) {
      const buffer = sounds[sample.key];
      if (!buffer) continue;
      const src = audioContext.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.playbackRate.setValueAtTime(breakpointValueAt(event.rate, from), whenCtx);
      const sampleGain = audioContext.createGain();
      sampleGain.gain.value = sample.volume;
      src.connect(sampleGain).connect(gain);
      src.start(whenCtx);
      sources.push(src);
    }
    activeLoops.add({ event, sources, gain, panner, scheduledUntil: from, stopScheduled: false });
  }

  // Hand the loop's automation breakpoints in (scheduledUntil, horizon] to WebAudio.
  function scheduleLoopAutomation(loop: ActiveLoop, horizon: number): void {
    const apply = (points: Breakpoint[], params: AudioParam[]) => {
      let idx = partitionPoint(points, 0, points.length, (p) => p.time <= loop.scheduledUntil);
      for (; idx < points.length && points[idx].time <= horizon; idx++) {
        const point = points[idx];
        const when = songToCtx(point.time);
        for (const param of params) {
          if (point.ramp === "linear") param.linearRampToValueAtTime(point.value, when);
          else param.setValueAtTime(point.value, when);
        }
      }
    };
    apply(loop.event.gain, [loop.gain.gain]);
    apply(loop.event.pan, [loop.panner.pan]);
    apply(
      loop.event.rate,
      loop.sources.map((s) => s.playbackRate),
    );
    loop.scheduledUntil = horizon;

    if (!loop.stopScheduled && loop.event.stopTime <= horizon) {
      const when = songToCtx(loop.event.stopTime);
      for (const src of loop.sources) src.stop(when);
      loop.stopScheduled = true;
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
      playOneShot(event, songToCtx(event.time));
    }

    while (loopCursor < loops.length && loops[loopCursor].startTime <= horizon) {
      const event = loops[loopCursor];
      loopCursor++;
      if (event.stopTime <= songNow) continue;
      startLoop(event, songNow);
    }

    for (const loop of activeLoops) {
      scheduleLoopAutomation(loop, horizon);
      if (loop.event.stopTime < songNow) activeLoops.delete(loop);
    }
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
      stopLoops();
      if (audioElement) detachListeners(audioElement);
      document.removeEventListener("pointerdown", resumeOnce);
      document.removeEventListener("keydown", resumeOnce);
      audioContext.close().catch(() => {});
    },
  };
}
