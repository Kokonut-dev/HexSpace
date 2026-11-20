import {
  GAME,
  PAL,
  FACTIONS,
  SECURITY,
  ECONOMIES,
  GOODS,
  HULLS,
  SHIP_RANKS,
  MODULES,
  CONSUMABLES,
  ENEMIES,
  ITEMS,
  NAMES,
  STORY,
  JOBS,
  CHATTER,
} from "../config.js";
import { TAU, mulberry32, hash, rand, randInt, pick, chance, shuffle, weighted, clamp, fmt, clock, segmentCircle } from "./utils.js";

/**
 * AudioEngine: procedural audio, no external dependencies.
 * Uses Web Audio API (or fallback) to synthesize pads, engine hum, and SFX.
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.compressor = null;
    this.master = null;
    this.sounds = {};
    this.active = false;
    this.engineNode = null;
    this.engineGain = null;
    this.brownout = 0;
    this.settings = {};
  }

  init(settings = {}) {
    this.settings = settings;
    if (!this.ctx) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.ctx = new AudioContext();
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -24;
        this.compressor.knee.value = 30;
        this.compressor.ratio.value = 12;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.25;
        this.master = this.ctx.createGain();
        this.master.gain.value = (settings.volume ?? settings.masterVolume ?? 0.7) * 0.24;
        this.compressor.connect(this.ctx.destination);
        this.master.connect(this.compressor);
      } catch (e) {
        console.warn("AudioContext unavailable", e);
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  setActive(v) {
    this.active = !!v;
    if (!this.active) {
      this.stopEngine();
      this.stopPad();
      return;
    }
    if (this.ctx?.state === "suspended") this.ctx.resume().catch(() => {});
    this.startPad();
  }

  setSound(id, val) {
    this.sounds[id] = val;
  }

  setVolume(v) {
    if (this.master) this.master.gain.setTargetAtTime((v ?? 0.7) * 0.24, this.ctx.currentTime, 0.04);
  }

  // Generative pad/chords
  startPad() {
    if (!this.ctx || !this.active || this.padNode) return;
    const chords = [
      [110, 164.81, 220], // A minor
      [130.81, 164.81, 196], // C major
      [98, 146.83, 196], // G
      [110, 146.83, 174.61], // D minor
    ];
    const voices = chords[0].map((frequency, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.value = [0.018, 0.011, 0.007][index];
      osc.connect(gain);
      gain.connect(this.master);
      osc.start();
      return { osc, gain };
    });
    this.padNode = voices;
    let chord = 0;
    this.padTimer = setInterval(() => {
      if (!this.active || !this.padNode) return;
      chord = (chord + 1) % chords.length;
      const now = this.ctx.currentTime;
      voices.forEach((voice, index) => voice.osc.frequency.setTargetAtTime(chords[chord][index], now, 0.8));
    }, 4200);
  }

  stopPad() {
    const voices = this.padNode;
    if (!voices) return;
    this.padNode = null;
    clearInterval(this.padTimer);
    this.padTimer = null;
    const now = this.ctx.currentTime;
    for (const voice of voices) voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    setTimeout(() => voices.forEach((voice) => voice.osc.stop()), 500);
  }

  // Low, filtered engine ambience; no sawtooth edge or abrupt gain steps.
  updateEngine({ moving, speed, boosting, active, brownout }) {
    if (!this.ctx || !this.active) return;
    this.brownout = brownout ?? 0;
    if (!active) {
      this.stopEngine();
      return;
    }
    if (!this.engineNode) {
      this.engineNode = this.ctx.createOscillator();
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineGain = this.ctx.createGain();
      this.engineNode.type = "sine";
      this.engineNode.frequency.value = 62;
      this.engineFilter.type = "lowpass";
      this.engineFilter.frequency.value = 260;
      this.engineFilter.Q.value = 0.5;
      this.engineGain.gain.value = 0.0001;
      this.engineNode.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineNode.start();
    }
    const baseFreq = 48 + (speed / 1000) * 72;
    const boostFreq = boosting ? 18 : 0;
    const targetFreq = Math.max(40, baseFreq + boostFreq - this.brownout * 8);
    const now = this.ctx.currentTime;
    this.engineNode.frequency.setTargetAtTime(targetFreq, now, 0.12);
    this.engineFilter.frequency.setTargetAtTime(boosting ? 420 : 260, now, 0.2);
    const targetGain = moving ? 0.022 : 0.005;
    this.engineGain.gain.setTargetAtTime(targetGain, now, 0.18);
  }

  stopEngine() {
    if (!this.engineNode) return;
    const node = this.engineNode;
    const gain = this.engineGain;
    this.engineNode = null;
    this.engineGain = null;
    this.engineFilter = null;
    const now = this.ctx?.currentTime ?? 0;
    gain?.gain.setTargetAtTime(0.0001, now, 0.035);
    setTimeout(() => { try { node.stop(); } catch {} }, 140);
  }

  // Synthesized SFX
  play(name) {
    if (!this.ctx || !this.active) return;
    const now = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.connect(this.master);

    const sfx = {
      cannon: () => this.synthPulse(gain, now, 0.08, 180, 0.5),
      laser: () => this.synthPulse(gain, now, 0.12, 440, 0.3),
      plasma: () => this.synthPulse(gain, now, 0.2, 220, 0.8),
      rail: () => this.synthPulse(gain, now, 0.05, 880, 0.2),
      mine: () => this.synthPulse(gain, now, 0.1, 110, 0.6),
      missile: () => this.synthPulse(gain, now, 0.15, 330, 0.4),
      enemyShot: () => this.synthPulse(gain, now, 0.08, 220, 0.3),
      bossShot: () => this.synthPulse(gain, now, 0.3, 110, 0.9),
      hit: () => this.synthNoise(gain, now, 0.05, 0.4),
      explode: () => this.synthNoise(gain, now, 0.4, 1.0),
      bossDown: () => this.synthSweep(gain, now, 0.8, 440, 110),
      rock: () => this.synthPulse(gain, now, 0.06, 660, 0.2),
      pickup: () => this.synthPulse(gain, now, 0.08, 880, 0.2),
      ui: () => this.synthPulse(gain, now, 0.04, 1100, 0.1),
      uiBack: () => this.synthPulse(gain, now, 0.04, 880, 0.1),
      error: () => this.synthPulse(gain, now, 0.1, 110, 0.5),
      dock: () => this.synthSweep(gain, now, 0.3, 220, 440),
      undock: () => this.synthSweep(gain, now, 0.3, 440, 220),
      jump: () => this.synthSweep(gain, now, 0.5, 110, 880),
      warp: () => this.synthSweep(gain, now, 0.8, 110, 1760),
      alarm: () => this.synthPulse(gain, now, 0.2, 440, 0.8),
      rankup: () => this.synthSweep(gain, now, 0.4, 440, 880),
      reward: () => this.synthPulse(gain, now, 0.1, 660, 0.3),
      scan: () => this.synthPulse(gain, now, 0.06, 1320, 0.1),
      talk: () => this.synthPulse(gain, now, 0.1, 330, 0.4),
      step: () => this.synthPulse(gain, now, 0.03, 220, 0.1),
      door: () => this.synthPulse(gain, now, 0.1, 550, 0.3),
    };

    const fn = sfx[name];
    if (fn) fn();
  }

  // Synth helpers
  synthPulse(gain, now, dur, freq, vol) {
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol * (this.settings.sfxVolume ?? 0.8) * 0.14, now + 0.008);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + dur);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  }

  synthNoise(gain, now, dur, vol) {
    const bufferSize = this.ctx.sampleRate * dur;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = 1500;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol * (this.settings.sfxVolume ?? 0.8) * 0.10, now + 0.012);
    source.connect(filter);
    filter.connect(gain);
    source.start(now);
    source.stop(now + dur);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  }

  synthSweep(gain, now, dur, start, end) {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = start;
    osc.frequency.exponentialRampToValueAtTime(end, now + dur);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.08 * (this.settings.sfxVolume ?? 0.8), now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + dur);
  }
}

// Singleton instance
export const audio = new AudioEngine();
