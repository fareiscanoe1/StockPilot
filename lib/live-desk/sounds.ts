const STORAGE_KEY = "epai-desk-sounds";

export function deskSoundsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setDeskSoundsEnabled(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Short, low-volume beep using Web Audio (no asset file). */
function beep(freq: number, durationMs: number, gain = 0.04) {
  if (typeof window === "undefined" || !deskSoundsEnabled()) return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
    window.setTimeout(() => void ctx.close(), durationMs + 80);
  } catch {
    /* autoplay blocked or unsupported */
  }
}

export function playHighConvictionChime() {
  beep(880, 90, 0.045);
  window.setTimeout(() => beep(1174, 120, 0.035), 70);
}

export function playAlertThresholdMet() {
  beep(660, 100, 0.05);
  window.setTimeout(() => beep(990, 140, 0.04), 90);
}

export function playScanCompleteTick() {
  beep(523, 55, 0.03);
}
