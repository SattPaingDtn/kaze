import { createStore } from "./store";

/**
 * KAZE sound: an ambient score + UI sound effects, all SYNTHESISED with the
 * Web Audio API, so there are zero audio files to download or license.
 *
 * Rules a real campaign site must follow:
 *  - OFF by default. Browsers block autoplay, and WCAG 1.4.2 says any audio
 *    that plays for more than 3 s needs a control. The header toggle is that control.
 *  - The AudioContext is created inside a user gesture (the toggle click, or the
 *    first click/key after a visit that left sound on).
 *  - Hidden tab → context suspended (no CPU, no sound in the background).
 */

export type Cue = "tick" | "paint" | "view" | "xray" | "launch" | "ping" | "confirm" | "wind" | "bump";

const KEY = "kaze-sound";
export const soundStore = createStore({ on: false });

type Graph = {
  ctx: AudioContext;
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
  verb: ConvolverNode;
  delay: DelayNode;
  noise: AudioBuffer;
};

let g: Graph | null = null;
let timer = 0;
let nextBar = 0;
let bar = 0;
let bed: (() => void) | null = null;

/* ───────────────────────── public API ───────────────────────── */

/** Called once on the client: restores the visitor's choice (still needs a gesture to start). */
export function initSound() {
  let saved = false;
  try {
    saved = localStorage.getItem(KEY) === "on";
  } catch {}
  if (!saved) return;
  soundStore.set({ on: true });
  // Autoplay policy: wait for the first real interaction, then start.
  const start = () => {
    window.removeEventListener("pointerdown", start);
    window.removeEventListener("keydown", start);
    if (soundStore.get().on) void start_();
  };
  window.addEventListener("pointerdown", start);
  window.addEventListener("keydown", start);
}

export function setSound(on: boolean) {
  soundStore.set({ on });
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  if (on) void start_();
  else stop_();
}

/** Fire-and-forget. Silently does nothing while sound is off or not yet started. */
export function play(cue: Cue) {
  if (!g || !soundStore.get().on || g.ctx.state !== "running") return;
  CUES[cue](g, g.ctx.currentTime + 0.01);
}

let drive: ReturnType<typeof driveVoice> | null = null;

/**
 * Test-drive sound, called every frame with the car's speed (m/s) and throttle
 * (0..1). `null` stops it. Silent while sound is off; picks up when turned on.
 */
export function driveSound(speed: number | null, load = 0) {
  if (speed === null) {
    drive?.stop();
    drive = null;
    return;
  }
  if (!g || !soundStore.get().on || g.ctx.state !== "running") return;
  drive ??= driveVoice(g);
  drive.set(Math.abs(speed), load);
}

/* ───────────────────────── engine ───────────────────────── */

async function start_() {
  if (!g) g = build();
  const { ctx, master } = g;
  await ctx.resume();
  ramp(ctx, master.gain, 0.55, 1.2); // compressor adds make-up gain: leave headroom
  if (!timer) {
    nextBar = Math.max(nextBar, ctx.currentTime + 0.05);
    schedule();
    timer = window.setInterval(schedule, 400);
  }
  if (!bed) bed = windBed(g);
}

function stop_() {
  if (!g) return;
  const graph = g;
  ramp(graph.ctx, graph.master.gain, 0, 0.5);
  window.clearInterval(timer);
  timer = 0;
  window.setTimeout(() => {
    if (soundStore.get().on) return; // turned back on during the fade
    void graph.ctx.suspend(); // frees the audio thread; time freezes, queued notes wait
  }, 650);
}

function build(): Graph {
  const ctx = new AudioContext({ latencyHint: "interactive" });

  const comp = ctx.createDynamicsCompressor(); // glue + safety against clipping
  comp.threshold.value = -16;
  comp.ratio.value = 3;
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(comp).connect(ctx.destination);

  // Reverb from a generated impulse response (decaying stereo noise): "a big quiet hall".
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, 3.8, 2.4);
  const verbOut = gain(ctx, 0.5);
  verb.connect(verbOut).connect(master);

  // Dark ping-pong-ish echo for plucks and chimes.
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.42;
  const fb = gain(ctx, 0.36);
  const damp = filter(ctx, "lowpass", 2400);
  delay.connect(damp).connect(fb).connect(delay);
  damp.connect(gain(ctx, 0.5)).connect(master);
  damp.connect(verb);

  const music = gain(ctx, 0.55);
  music.connect(master);
  music.connect(gain(ctx, 0.7)).connect(verb);
  const sfx = gain(ctx, 0.9);
  sfx.connect(master);
  sfx.connect(gain(ctx, 0.3)).connect(verb);

  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) void ctx.suspend();
    else if (soundStore.get().on) void ctx.resume();
  });

  return { ctx, master, music, sfx, verb, delay, noise };
}

/* ───────────────────────── music ───────────────────────── */

const BAR = 7.5; // seconds per chord — slow, like breathing
// [bass, ...voices] (MIDI). Dm9 → B♭maj7 → Gm9 → A7sus4, voiced close and low.
const CHORDS = [
  [38, 53, 57, 60, 64],
  [34, 53, 57, 62, 65],
  [31, 53, 57, 58, 62],
  [33, 52, 55, 57, 62],
];
const PENTA = [62, 65, 67, 69, 72, 74, 77, 79]; // D minor pentatonic: never clashes

function schedule() {
  if (!g) return;
  while (nextBar < g.ctx.currentTime + 1.5) {
    const [root, ...voices] = CHORDS[bar % CHORDS.length];
    pad(g, nextBar, voices);
    bass(g, nextBar, root);
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const at = nextBar + 0.6 + Math.floor(Math.random() * 12) * (BAR / 14);
      pluck(g, at, PENTA[Math.floor(Math.random() * PENTA.length)]);
    }
    nextBar += BAR;
    bar++;
  }
}

function pad({ ctx, music }: Graph, t: number, notes: number[]) {
  const lp = filter(ctx, "lowpass", 750, 0.4);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const depth = gain(ctx, 380);
  lfo.connect(depth).connect(lp.frequency);
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(0.035, t + 2.8);
  out.gain.setValueAtTime(0.035, t + BAR);
  out.gain.linearRampToValueAtTime(0, t + BAR + 3.6);
  lp.connect(out).connect(music);
  const end = t + BAR + 3.7;
  for (const m of notes) {
    for (const cents of [-8, 8]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = mtof(m);
      o.detune.value = cents;
      o.connect(lp);
      o.start(t);
      o.stop(end);
    }
  }
  lfo.start(t);
  lfo.stop(end);
}

function bass({ ctx, music }: Graph, t: number, m: number) {
  const o = ctx.createOscillator();
  o.frequency.value = mtof(m);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.2, t + 1.6);
  env.gain.setValueAtTime(0.2, t + BAR);
  env.gain.linearRampToValueAtTime(0, t + BAR + 2.5);
  o.connect(env).connect(music);
  o.start(t);
  o.stop(t + BAR + 2.6);
}

function pluck({ ctx, music, delay }: Graph, t: number, m: number) {
  const env = ctx.createGain();
  decay(env.gain, t, 0.07, 1.8);
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.random() * 1.2 - 0.6;
  env.connect(pan);
  pan.connect(music);
  pan.connect(delay);
  for (const [type, mult, lvl] of [["triangle", 1, 1], ["sine", 2, 0.3]] as const) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = mtof(m) * mult;
    const v = gain(ctx, lvl);
    o.connect(v).connect(env);
    o.start(t);
    o.stop(t + 2);
  }
}

/** 風 — a quiet, ever-moving wind under the music. Returns a stopper. */
function windBed(graph: Graph) {
  const { ctx, music } = graph;
  const src = noiseSrc(graph);
  const bp = filter(ctx, "bandpass", 500, 0.9);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.05;
  lfo.connect(gain(ctx, 260)).connect(bp.frequency);
  const v = gain(ctx, 0.05);
  src.connect(bp).connect(v).connect(music);
  src.start();
  lfo.start();
  return () => {
    src.stop();
    lfo.stop();
  };
}

/**
 * Continuous EV drive voice: inverter whine (pitch = speed, louder on throttle),
 * a sub rumble for weight, and wind noise that grows with speed². The music
 * ducks while you drive so the car owns the mix.
 */
function driveVoice(graph: Graph) {
  const { ctx, sfx, music } = graph;
  const out = gain(ctx, 0);
  out.connect(sfx);
  const whine = gain(ctx, 0);
  whine.connect(out);
  const oscs = ([["sine", 1, 1], ["triangle", 2.01, 0.3], ["sine", 3, 0.12]] as const).map(([type, mult, lvl]) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = 140 * mult;
    o.connect(gain(ctx, lvl)).connect(whine);
    o.start();
    return { o, mult };
  });
  const sub = ctx.createOscillator();
  sub.frequency.value = 38;
  const subGain = gain(ctx, 0);
  sub.connect(subGain).connect(out);
  sub.start();
  const air = noiseSrc(graph);
  const airF = filter(ctx, "bandpass", 400, 0.6);
  const airGain = gain(ctx, 0);
  air.connect(airF).connect(airGain).connect(out);
  air.start();
  ramp(ctx, out.gain, 1, 0.4);

  let last = 0;
  const to = (p: AudioParam, v: number, t: number) => {
    p.cancelScheduledValues(t);
    p.setTargetAtTime(v, t, 0.06);
  };
  return {
    set(v: number, load: number) {
      const t = ctx.currentTime;
      if (t - last < 0.05) return; // ~20 updates/s is plenty for a smooth glide
      last = t;
      const x = Math.min(v / 50, 1); // 0..1 of top speed
      oscs.forEach(({ o, mult }) => to(o.frequency, (140 + x * 1500) * mult, t));
      to(whine.gain, v < 0.2 ? 0 : 0.012 + 0.03 * load + 0.025 * x, t);
      to(sub.frequency, 34 + x * 40, t);
      to(subGain.gain, Math.min(v / 6, 1) * (0.05 + 0.08 * load), t);
      to(airF.frequency, 350 + x * 1800, t);
      to(airGain.gain, x * x * 0.22, t);
      to(music.gain, 0.55 - 0.3 * Math.min(v / 15, 1), t);
    },
    stop() {
      const t = ctx.currentTime;
      ramp(ctx, out.gain, 0, 0.3);
      to(music.gain, 0.55, t);
      oscs.forEach(({ o }) => o.stop(t + 0.4));
      sub.stop(t + 0.4);
      air.stop(t + 0.4);
    },
  };
}

/* ───────────────────────── sound effects ───────────────────────── */

const CUES: Record<Cue, (g: Graph, t: number) => void> = {
  /** Small mechanical click: wheels, leather, toggles. */
  tick({ ctx, sfx }, t) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(2400, t);
    o.frequency.exponentialRampToValueAtTime(1300, t + 0.04);
    const e = ctx.createGain();
    decay(e.gain, t, 0.09, 0.07);
    o.connect(e).connect(sfx);
    o.start(t);
    o.stop(t + 0.1);
  },

  /** Paint change: a bright shimmer sweeping up + a two-note chime. */
  paint(graph, t) {
    const { ctx, sfx, delay } = graph;
    sweep(graph, t, { type: "bandpass", q: 2, from: 500, to: 5200, len: 0.75, peak: 0.4 });
    [81, 88].forEach((m, i) => {
      const o = ctx.createOscillator();
      o.frequency.value = mtof(m);
      const e = ctx.createGain();
      decay(e.gain, t + 0.12 + i * 0.09, 0.08, 1.8);
      o.connect(e);
      e.connect(sfx);
      e.connect(delay);
      o.start(t + 0.12 + i * 0.09);
      o.stop(t + 2.2);
    });
  },

  /** Camera move: air rushing past, left to right, with a little low-end weight. */
  view(graph, t) {
    const { ctx, sfx } = graph;
    sweep(graph, t, { type: "lowpass", q: 1, from: 250, to: 1900, len: 1.15, peak: 0.12, pan: [-0.7, 0.7] });
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(75, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.6);
    const e = ctx.createGain();
    decay(e.gain, t + 0.05, 0.08, 0.6);
    o.connect(e).connect(sfx);
    o.start(t);
    o.stop(t + 0.8);
  },

  /** Chapter change on the campaign page: the same wind, softer and slower. */
  wind(graph, t) {
    sweep(graph, t, { type: "bandpass", q: 0.8, from: 350, to: 1300, len: 1.7, peak: 0.12, pan: [0.5, -0.5] });
  },

  /** X-ray: a resonant scan sweep and two data blips. */
  xray(graph, t) {
    const { ctx, sfx } = graph;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 110;
    const bp = filter(ctx, "bandpass", 300, 9);
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + 0.8);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(0.09, t + 0.1);
    e.gain.linearRampToValueAtTime(0, t + 0.9);
    o.connect(bp).connect(e).connect(sfx);
    o.start(t);
    o.stop(t + 1);
    [0.15, 0.3].forEach((dt, i) => {
      const b = ctx.createOscillator();
      b.type = "square";
      b.frequency.value = i ? 2349 : 1760;
      const be = ctx.createGain();
      decay(be.gain, t + dt, 0.025, 0.06);
      b.connect(be).connect(sfx);
      b.start(t + dt);
      b.stop(t + dt + 0.1);
    });
  },

  /**
   * Engine view: the GT-01 is electric (+ range extender), so its "engine note"
   * is an e-axle inverter whine rising with speed, a sub rumble and wind rush —
   * the same recipe real EV makers use for their AVAS / launch sounds.
   */
  launch(graph, t) {
    const { ctx, sfx, music } = graph;
    const whine = ctx.createGain();
    whine.gain.setValueAtTime(0, t);
    whine.gain.linearRampToValueAtTime(0.05, t + 0.3);
    whine.gain.linearRampToValueAtTime(0.09, t + 2);
    whine.gain.linearRampToValueAtTime(0, t + 3.4);
    whine.connect(sfx);
    for (const [type, mult, lvl] of [["sine", 1, 1], ["triangle", 2.01, 0.35], ["sine", 3, 0.15]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(170 * mult, t);
      o.frequency.exponentialRampToValueAtTime(2100 * mult, t + 2.2);
      o.frequency.exponentialRampToValueAtTime(800 * mult, t + 3.4);
      o.connect(gain(ctx, lvl)).connect(whine);
      o.start(t);
      o.stop(t + 3.5);
    }
    const sub = ctx.createOscillator();
    sub.frequency.setValueAtTime(36, t);
    sub.frequency.exponentialRampToValueAtTime(64, t + 2);
    const se = ctx.createGain();
    se.gain.setValueAtTime(0, t);
    se.gain.linearRampToValueAtTime(0.3, t + 0.25);
    se.gain.linearRampToValueAtTime(0, t + 3);
    sub.connect(se).connect(sfx);
    sub.start(t);
    sub.stop(t + 3.1);
    sweep(graph, t + 0.2, { type: "bandpass", q: 0.7, from: 300, to: 2600, len: 3, peak: 0.2, pan: [-0.4, 0.4] });
    // Duck the music so the launch owns the moment, then bring it back.
    music.gain.cancelScheduledValues(t);
    music.gain.setTargetAtTime(0.18, t, 0.1);
    music.gain.setTargetAtTime(0.55, t + 2.8, 0.7);
  },

  /** Test drive: you touched a building. A dull body thud + a scrape of noise. */
  bump(graph, t) {
    const { ctx, sfx } = graph;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const e = ctx.createGain();
    decay(e.gain, t, 0.35, 0.35);
    o.connect(e).connect(sfx);
    o.start(t);
    o.stop(t + 0.4);
    sweep(graph, t, { type: "bandpass", q: 1.5, from: 900, to: 2600, len: 0.35, peak: 0.12 });
  },

  /** Hotspot opened: a soft glass bell. */
  ping({ ctx, sfx, delay }, t) {
    for (const [f, lvl] of [[1318.5, 1], [1975.5, 0.4]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const e = ctx.createGain();
      decay(e.gain, t, 0.07 * lvl, 1.4);
      o.connect(e);
      e.connect(sfx);
      e.connect(delay);
      o.start(t);
      o.stop(t + 1.6);
    }
  },

  /** Reserve: a rising D-minor arpeggio that resolves up an octave. */
  confirm({ ctx, sfx, delay }, t) {
    [62, 65, 69, 74, 81].forEach((m, i) => {
      const at = t + i * 0.075;
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = mtof(m);
      const e = ctx.createGain();
      decay(e.gain, at, 0.06, 1.6);
      o.connect(e);
      e.connect(sfx);
      e.connect(delay);
      o.start(at);
      o.stop(at + 1.8);
    });
  },
};

/* ───────────────────────── helpers ───────────────────────── */

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

function gain(ctx: BaseAudioContext, v: number) {
  const n = ctx.createGain();
  n.gain.value = v;
  return n;
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q = 1) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/** Percussive envelope: near-instant attack, exponential decay. */
function decay(p: AudioParam, t: number, peak: number, len: number) {
  p.setValueAtTime(0.0001, t);
  p.exponentialRampToValueAtTime(peak, t + 0.006);
  p.exponentialRampToValueAtTime(0.0001, t + len);
}

function ramp(ctx: BaseAudioContext, p: AudioParam, to: number, len: number) {
  const t = ctx.currentTime;
  p.cancelScheduledValues(t);
  p.setValueAtTime(p.value, t);
  p.linearRampToValueAtTime(to, t + len);
}

function noiseSrc({ ctx, noise }: Graph) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  s.loop = true;
  s.loopStart = Math.random(); // different grain every time
  return s;
}

/** Filtered-noise "whoosh": the filter opens, then closes, while the sound pans across. */
function sweep(
  graph: Graph,
  t: number,
  o: { type: BiquadFilterType; q: number; from: number; to: number; len: number; peak: number; pan?: [number, number] },
) {
  const { ctx, sfx } = graph;
  const src = noiseSrc(graph);
  const f = filter(ctx, o.type, o.from, o.q);
  f.frequency.setValueAtTime(o.from, t);
  f.frequency.exponentialRampToValueAtTime(o.to, t + o.len * 0.45);
  f.frequency.exponentialRampToValueAtTime(o.from, t + o.len);
  const e = ctx.createGain();
  e.gain.setValueAtTime(0, t);
  e.gain.linearRampToValueAtTime(o.peak, t + o.len * 0.4);
  e.gain.linearRampToValueAtTime(0, t + o.len);
  const p = ctx.createStereoPanner();
  if (o.pan) {
    p.pan.setValueAtTime(o.pan[0], t);
    p.pan.linearRampToValueAtTime(o.pan[1], t + o.len);
  }
  src.connect(f).connect(e).connect(p).connect(sfx);
  src.start(t, Math.random());
  src.stop(t + o.len + 0.05);
}

/** Stereo impulse response: noise with a power-curve decay = synthetic reverb tail. */
function impulse(ctx: BaseAudioContext, seconds: number, power: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** power;
  }
  return buf;
}
