import type { WeatherType } from './types';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientFilter: BiquadFilterNode | null = null;
  private muted = true;
  private volume = 0.45;
  private currentWeather: WeatherType = 'clear';

  private ensureContext() {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);
      this.setupAmbientNoise();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private setupAmbientNoise() {
    if (!this.ctx || !this.masterGain) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.06;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    this.ambientFilter = this.ctx.createBiquadFilter();
    this.ambientFilter.type = 'lowpass';
    this.ambientFilter.frequency.value = 600;

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0.0;

    source.connect(this.ambientFilter);
    this.ambientFilter.connect(this.ambientGain);
    this.ambientGain.connect(this.masterGain);
    source.start();
    this.updateWeatherAmbience(this.currentWeather);
  }

  public syncSettings(muted: boolean, volume: number, weather: WeatherType) {
    this.muted = muted;
    this.volume = volume;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : volume, this.ctx.currentTime, 0.08);
    }
    if (weather !== this.currentWeather) {
      this.currentWeather = weather;
      this.updateWeatherAmbience(weather);
    }
  }

  public unlockAndSetMute(muted: boolean, weather: WeatherType) {
    this.muted = muted;
    if (!muted) {
      this.ensureContext();
    }
    this.syncSettings(muted, this.volume, weather);
  }

  private updateWeatherAmbience(weather: WeatherType) {
    if (!this.ctx || !this.ambientGain || !this.ambientFilter) return;
    const now = this.ctx.currentTime;
    if (weather === 'rain') {
      this.ambientFilter.frequency.setTargetAtTime(1150, now, 0.4);
      this.ambientGain.gain.setTargetAtTime(0.24, now, 0.4);
    } else if (weather === 'breeze') {
      this.ambientFilter.frequency.setTargetAtTime(520, now, 0.4);
      this.ambientGain.gain.setTargetAtTime(0.11, now, 0.4);
    } else if (weather === 'mist' || weather === 'snow') {
      this.ambientFilter.frequency.setTargetAtTime(340, now, 0.4);
      this.ambientGain.gain.setTargetAtTime(0.06, now, 0.4);
    } else {
      this.ambientGain.gain.setTargetAtTime(0.015, now, 0.4);
    }
  }

  private playTone(freq: number, duration: number, type: OscillatorType = 'sine', gainPeak = 0.14, delay = 0) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  public playPetChime() {
    this.playTone(523.25, 0.22, 'sine', 0.13, 0);
    this.playTone(659.25, 0.28, 'sine', 0.11, 0.07);
  }

  public playChatChime() {
    this.playTone(493.88, 0.14, 'triangle', 0.09, 0);
    this.playTone(587.33, 0.16, 'triangle', 0.09, 0.06);
  }

  public playFeedChime() {
    this.playTone(440, 0.18, 'triangle', 0.12, 0);
    this.playTone(587.33, 0.24, 'triangle', 0.12, 0.06);
  }

  public playAssignChime(accepted: boolean) {
    if (accepted) {
      this.playTone(587.33, 0.16, 'sine', 0.09, 0);
      this.playTone(783.99, 0.2, 'sine', 0.08, 0.05);
    } else {
      this.playTone(392.0, 0.16, 'triangle', 0.08, 0);
      this.playTone(349.23, 0.22, 'triangle', 0.07, 0.08);
    }
  }

  public playBuildChime() {
    this.playTone(392.0, 0.2, 'triangle', 0.12, 0);
    this.playTone(493.88, 0.22, 'triangle', 0.12, 0.08);
    this.playTone(587.33, 0.32, 'sine', 0.13, 0.16);
  }

  public playArrivalChime() {
    this.playTone(523.25, 0.24, 'sine', 0.1, 0);
    this.playTone(659.25, 0.24, 'sine', 0.1, 0.1);
    this.playTone(783.99, 0.36, 'sine', 0.11, 0.2);
  }

  public playChiefFanfare() {
    this.playTone(440, 0.22, 'triangle', 0.11, 0);
    this.playTone(554.37, 0.22, 'triangle', 0.11, 0.09);
    this.playTone(659.25, 0.35, 'sine', 0.12, 0.18);
    this.playTone(880, 0.45, 'sine', 0.1, 0.28);
  }
}

export const audioEngine = new AudioEngine();
