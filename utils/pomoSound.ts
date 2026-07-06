// Plays a short chime using Web Audio API — no audio files needed.
// workDone: bright ascending bell (집중 완료)
// breakDone: warm lower tone (휴식 완료)

type SoundType = "workDone" | "breakDone";

const NOTES: Record<SoundType, { freq: number; delay: number }[]> = {
  workDone: [
    { freq: 523.25, delay: 0 },    // C5
    { freq: 659.25, delay: 0.15 }, // E5
    { freq: 783.99, delay: 0.3 },  // G5
  ],
  breakDone: [
    { freq: 392.0, delay: 0 },    // G4
    { freq: 523.25, delay: 0.2 }, // C5
  ],
};

export function playPomoSound(type: SoundType) {
  if (typeof window === "undefined") return;
  try {
    const ctx = new AudioContext();
    NOTES[type].forEach(({ freq, delay }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      gain.gain.setValueAtTime(0.4, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.6);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.65);
      osc.onended = () => ctx.close();
    });
  } catch {
    // AudioContext 미지원 환경 무시
  }
}
