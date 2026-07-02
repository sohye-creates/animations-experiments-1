// 섹션 모듈들을 불러와 조립 + 루프 + 네비게이션 + 컨트롤 패널
import { lenis, mountCanvas, resize } from './core.js';
import GUI from 'lil-gui';
import { createDrape } from './sections/drape.js';
import { createComing } from './sections/coming.js';
import { createPixel } from './sections/pixel.js';
import { createPattern } from './sections/pattern.js';
import { createCursor } from './sections/cursor.js';
import { createTransition } from './sections/transition.js';
import { createLogo } from './sections/logo.js';

mountCanvas();

// canvas 텍스트가 Aeonik으로 그려지도록 폰트 먼저 로드 (섹션 생성 전).
// 단, 최대 1.5초만 기다림 — 폰트가 안 떠도 앱은 절대 멈추지 않게.
try {
  await Promise.race([
    Promise.all([document.fonts.load("400 40px 'Aeonik'"), document.fonts.load("500 40px 'Aeonik'")]),
    new Promise(r => setTimeout(r, 1500)),
  ]);
} catch (e) {}

// 여기에 섹션을 추가하면 자동으로 DOM·네비·전환·패널이 반영됨
const sections = [createDrape(), createComing(), createPixel(), createPattern(), createCursor(), createTransition(), createLogo()];

const container = document.getElementById('sections');
sections.forEach(s => container.appendChild(s.el));
lenis.resize();

// 하단 중앙 네비게이션 (섹션 이름 링크)
const nav = document.getElementById('nav');
const links = sections.map(s => {
  const b = document.createElement('button');
  b.className = 'nav-link'; b.textContent = s.label;
  b.addEventListener('click', () => lenis.scrollTo('#' + s.el.id, { duration: 1.2 }));
  nav.appendChild(b);
  return b;
});
const hint = document.getElementById('hint');

// ── 디자이너용 컨트롤 패널 (lil-gui) : 섹션마다 폴더, 활성 섹션 것만 표시 ──
const gui = new GUI({ title: 'controls · designer' });
const folders = {};
for (const s of sections) {
  if (!s.controls) continue;
  const f = gui.addFolder(s.label);
  const defaults = { ...s.params };          // 처음 값 = 리셋 기준
  const ctrls = [];
  for (const c of s.controls) {
    const ctrl = c.color ? f.addColor(s.params, c.key) : f.add(s.params, c.key, c.min, c.max, c.step);
    if (c.name) ctrl.name(c.name);
    if (c.info) addInfo(ctrl, c.info);
    ctrls.push(ctrl);
  }
  // reset → 기본값 복원, copy → 현재 값 JSON 복사
  f.add({ fn: () => { Object.assign(s.params, defaults); ctrls.forEach(c => c.updateDisplay()); } }, 'fn').name('↺ reset');
  f.add({ fn: () => copySettings(s) }, 'fn').name('⧉ copy settings');
  folders[s.id] = f;
}

// 각 컨트롤 옆 ⓘ 아이콘 → 클릭하면 설명 툴팁
let tip;
function addInfo(controller, text) {
  const icon = document.createElement('span');
  icon.textContent = 'ⓘ';
  icon.title = text; // hover 폴백
  icon.style.cssText = 'cursor:pointer;margin-left:5px;opacity:.55;font-size:11px;flex:0 0 auto;';
  controller.$name.style.display = 'flex';
  controller.$name.style.alignItems = 'center';
  controller.$name.appendChild(icon);
  icon.addEventListener('click', e => {
    e.stopPropagation();
    if (tip) tip.remove();
    tip = document.createElement('div');
    tip.textContent = text;
    tip.style.cssText = 'position:fixed;z-index:10000;max-width:230px;padding:8px 10px;'
      + 'background:#111;color:#eee;border:1px solid #333;border-radius:6px;font:12px/1.5 system-ui;'
      + 'box-shadow:0 6px 20px rgba(0,0,0,.5);pointer-events:none;';
    document.body.appendChild(tip);
    const r = icon.getBoundingClientRect();
    tip.style.top = (r.bottom + 6) + 'px';
    tip.style.left = Math.min(r.left, innerWidth - 244) + 'px';
    setTimeout(() => addEventListener('click', dismissTip, { once: true }), 0);
  });
}
function dismissTip() { if (tip) { tip.remove(); tip = null; } }
function showPanel(id) {
  for (const k in folders) folders[k].domElement.style.display = k === id ? '' : 'none';
}
function copySettings(s) {
  const out = {};
  for (const c of s.controls) out[c.key] = s.params[c.key];
  const txt = `${s.label}: ${JSON.stringify(out)}`;
  navigator.clipboard?.writeText(txt).catch(() => {});
  console.log('[copied]', txt);
}

let active = null;
function loop(now) {
  lenis.raf(now || 0);
  const s = lenis.scroll;
  const mid = s + innerHeight * 0.5;

  let a = sections[0];
  for (const sec of sections) if (mid >= sec.el.offsetTop) a = sec;

  if (a !== active) {
    active?.onLeave?.();
    a.onEnter?.();
    active = a;
    hint.textContent = a.hint || '';
    document.body.dataset.active = a.id;
    links.forEach((d, i) => d.classList.toggle('active', sections[i] === a));
    showPanel(a.id);
  }

  a.render(now, s);
  requestAnimationFrame(loop);
}

resize();
showPanel(sections[0].id);
requestAnimationFrame(loop);
