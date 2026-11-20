let enabled = false,
  bed;
const clips = {};
function wave(freq, seconds, ambient = false) {
  const n = Math.floor(12000 * seconds),
    b = new ArrayBuffer(44 + n * 2),
    v = new DataView(b);
  const str = (o, s) =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 12000, true);
  v.setUint32(28, 24000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / 12000,
      a = ambient
        ? 0.35 + 0.28 * Math.cos(t * Math.PI * 0.5)
        : (1 - i / n) ** 2;
    const phase = 2 * Math.PI * freq * t * (ambient ? 1 : 1 - (0.48 * i) / n);
    v.setInt16(
      44 + 2 * i,
      Math.round(
        (Math.sin(phase) + 0.34 * Math.sin(phase * (ambient ? 1.5 : 2))) *
          a *
          11000,
      ),
      true,
    );
  }
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
}
export function toggleAudio() {
  enabled = !enabled;
  if (enabled) {
    bed ??= new Howl({
      src: [wave(55, 8, true)],
      format: ["wav"],
      loop: true,
      volume: 0.22,
    });
    if (!bed.playing()) bed.play();
    cue("dock");
  } else bed?.pause();
  return enabled;
}
export function cue(type) {
  if (!enabled) return;
  const f = { shot: 260, dock: 660, hit: 112, jump: 480 }[type] ?? 380;
  clips[type] ??= new Howl({
    src: [wave(f, 0.24)],
    format: ["wav"],
    volume: 0.28,
  });
  clips[type].play();
}
