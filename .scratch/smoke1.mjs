import { generateSector } from '/home/user/HexSpace/src/world/galaxy.js';
import { freshGame, exportSave, importSave, sanitize } from '/home/user/HexSpace/src/core/save.js';
import { shipStats, installModule, changeHull, slotLayout } from '/home/user/HexSpace/src/customization/fitting.js';
import { priceAt, marketFor, buy, sell, cargoUsed } from '/home/user/HexSpace/src/systems/economy.js';
import { generateBoard, accept, advance, complete, checkDeliveries, acceptStory, storyAvailable, missionProgressText } from '/home/user/HexSpace/src/systems/missions.js';

const st = freshGame(4242);
const home = generateSector(st.seed, 0, 0);
console.log('home', home.name, home.station.name, home.economy, home.station.services.join(','));
const stats = shipStats(st.hull, st.fit);
console.log('stats', JSON.stringify({mass:stats.mass,power:stats.power,draw:stats.draw,shield:stats.shield,hull:stats.hullPoints,cargo:stats.cargo,thrust:Math.round(stats.thrust),weapons:stats.weapons.length,brownout:stats.brownout}));
console.log('slots', slotLayout(st.hull).map(s=>s.key).join(','));
const inst = installModule(st, 'w2', 'pulseLaser', 420);
console.log('install pulse', inst);
console.log('owned', st.ownedModules.join(','));

// market
const m = marketFor(st, home);
console.log('stock ore', m.stock.ore, 'buy price', priceAt(st,home,'ore','buy'), 'sell', priceAt(st,home,'ore','sell'));
console.log(buy(st, home, 'ore', 5, stats.cargo));
console.log('credits', st.credits, 'cargo', st.cargo, 'stock now', m.stock.ore);

// board + missions
const board = generateBoard(st, home);
console.log('board', board.map(b=>b.type+':'+b.title).join(' | '));
const ok = accept(st, board.find(b=>b.type!=='delivery') ?? board[0], stats);
console.log('accept', ok);
console.log('progress', st.missions.map(x=>missionProgressText(st,x)).join(' / '));

// story
console.log('story available', storyAvailable(st)?.title);
console.log(acceptStory(st));
console.log('missions', st.missions.map(m=>m.type+':'+m.title).join(' | '));

// hull purchase check
console.log('changeHull sabre (rank gate)', changeHull(st, 'sabre', 9200));

// save round trip
const code = exportSave(st);
const back = importSave(code);
console.log('export len', code.length, 'import ok', !!back.state, back.error ?? '');
console.log('sanitize stable', JSON.stringify(sanitize(JSON.parse(JSON.stringify(st)))).length > 0);
// corrupt
console.log('corrupt import', importSave('HXSP1.xxx.yyy').error);
