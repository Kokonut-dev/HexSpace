// Opt-in diagnostics: requestAnimationFrame gaps include rendering and scheduling.
export function performanceOverlay(parent) {
  if (!new URLSearchParams(location.search).has("perf")) return () => {};
  const output = document.createElement("output");
  output.className = "performance";
  parent.append(output);
  const samples = [];
  let last = 0,
    report = 0;
  return (now) => {
    if (last && now - last < 250 && !document.hidden) samples.push(now - last);
    last = now;
    if (now - report < 1000 || !samples.length) return;
    const sorted = samples.splice(0).sort((a, b) => a - b);
    const average = sorted.reduce((sum, n) => sum + n, 0) / sorted.length;
    output.textContent = `${Math.round(1000 / average)} FPS · p95 ${sorted[Math.floor((sorted.length - 1) * 0.95)].toFixed(1)} ms`;
    report = now;
  };
}
