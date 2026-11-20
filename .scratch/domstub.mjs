// Minimal DOM stub sufficient to import the game modules in Node.
const noop = () => {};
function makeEl(tag='div'){
  const el = {
    tagName: tag, nodeType: 1, style:{}, dataset:{}, children:[], classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},
    append: (...c)=>el.children.push(...c), appendChild:(c)=>el.children.push(c), replaceChildren:noop, remove: noop,
    setAttribute:noop, getAttribute:()=>null, addEventListener:noop, removeEventListener:noop, querySelector:()=>null,
    querySelectorAll:()=>[], focus:noop, blur:noop, getContext:()=>ctx2d(), getBoundingClientRect:()=>({left:0,top:0,width:960,height:540}),
    width:480, height:270, hidden:false, textContent:'', innerHTML:'', onclick:null, click:noop, closest:()=>null,
    setPointerCapture:noop, hasPointerCapture:()=>false, insertBefore:noop, removeChild:noop, firstChild:null, lastChild:null
  };
  return el;
}
const ctx2d = () => new Proxy({ canvas:{width:480,height:270}, measureText:()=>({width:10}), createRadialGradient:()=>({addColorStop:noop}), createLinearGradient:()=>({addColorStop:noop}) }, { get(t,k){ if(k in t) return t[k]; return typeof k==='string' ? (()=>{}) : undefined; }, set(){return true;} });
globalThis.document = {
  createElement: makeEl,
  getElementById:()=>makeEl(),
  querySelector:()=>makeEl(),
  querySelectorAll:()=>[],
  body: makeEl(),
  documentElement: makeEl(),
  addEventListener:noop,
  activeElement:null,
  createTextNode:(text)=>({ nodeType: 3, nodeValue: String(text) })
};
globalThis.window = { addEventListener:noop, removeEventListener:noop, devicePixelRatio:1, innerWidth:1280, innerHeight:720, AudioContext:null, requestAnimationFrame:()=>0, matchMedia:()=>({matches:false}) };
globalThis.performance = globalThis.performance ?? { now: () => Date.now() };
globalThis.localStorage = { store:{}, getItem(k){return this.store[k]??null;}, setItem(k,v){this.store[k]=String(v);}, removeItem(k){delete this.store[k];} };
globalThis.ResizeObserver = class { observe(){} disconnect(){} };
globalThis.btoa = (s)=>Buffer.from(s,'binary').toString('base64');
globalThis.atob = (s)=>Buffer.from(s,'base64').toString('binary');
