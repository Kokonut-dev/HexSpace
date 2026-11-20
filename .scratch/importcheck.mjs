import './domstub.mjs';
const mods = ['game.js','render/flight.js','render/stationview.js','render/hud.js','render/mapview.js','render/spritecache.js','render/starfield.js','world/sector.js','systems/world-tick.js','systems/ai.js','systems/combat.js','station/layout.js','station/avatar.js','core/input.js','core/audio.js'];
for (const m of mods) {
  try { await import('/home/user/HexSpace/src/' + m); console.log('ok', m); }
  catch (e) { console.log('FAIL', m, '->', e.message); }
}
