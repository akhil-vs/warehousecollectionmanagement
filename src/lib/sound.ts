let ctx: AudioContext | null = null;
let unlocked = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  }
  return ctx;
}

export function isSoundUnlocked(): boolean {
  return unlocked && ctx?.state === 'running';
}

export async function unlockSound(): Promise<boolean> {
  const audio = getCtx();
  if (!audio) return false;
  try {
    if (audio.state === 'suspended') {
      await audio.resume();
    }
    // Silent blip to satisfy autoplay policies
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.01);
    unlocked = audio.state === 'running';
    return unlocked;
  } catch {
    unlocked = false;
    return false;
  }
}

function beepOnce(frequency = 880, durationMs = 120, volume = 0.18): void {
  const audio = getCtx();
  if (!audio || audio.state !== 'running') return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'square';
  osc.frequency.value = frequency;
  gain.gain.value = volume;
  osc.connect(gain);
  gain.connect(audio.destination);
  const now = audio.currentTime;
  osc.start(now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
  osc.stop(now + durationMs / 1000 + 0.02);
}

export async function playBeeps(count: number, frequency = 880): Promise<void> {
  if (!unlocked) {
    await unlockSound();
  }
  for (let i = 0; i < count; i++) {
    beepOnce(frequency, 110);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 180));
  }
}

export const SoundPatterns = {
  markedReady: () => playBeeps(2, 920),
  driverOwning: () => playBeeps(6, 740),
  driverOther: () => playBeeps(3, 640),
  nagUnacked: () => playBeeps(4, 700),
  dockLookup: () => playBeeps(6, 560),
  softAck: () => playBeeps(1, 520),
} as const;
