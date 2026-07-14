// 섹션 모듈들을 불러와 조립 + 루프 + 네비게이션 + 컨트롤 패널
import { lenis, mountCanvas, resize, renderer } from './core.js';
import GUI from 'lil-gui';
// import { createHero } from './sections/hero.js';   // flow의 hero 자리는 이제 heroPixels로 대체(코드는 보존)
import { createHeroPixels } from './sections/heroPixels.js';
import { createEye } from './sections/eye.js';
import { createDrape } from './sections/drape.js';
// import { createComing } from './sections/coming.js';   // 현재 프론트에는 노출 안 함(코드는 보존)
import { createPixel } from './sections/pixel.js';
import { createPattern } from './sections/pattern.js';
import { createCursor } from './sections/cursor.js';
import { createTransition } from './sections/transition.js';
import { createLogo } from './sections/logo.js';
import { createList } from './sections/list.js';
import { createAsciiReveal } from './sections/asciiReveal.js';
import { createAsciiVideo } from './sections/asciiVideo.js';
import { createDotModel } from './sections/dotModel.js';
// import { createVideoReveal } from './sections/videoReveal.js';   // flow에 이렇게(드레이프 뒤 별개 섹션) 넣을 게 아니라서 뺌(코드는 보존 — drape 마지막 아이템과 합쳐지는 형태로 나중에 다시 붙일 계획)
// import { createWhiteOut } from './sections/whiteOut.js';         // 위 videoReveal의 <video>가 있어야 동작해서 같이 뺌(코드는 보존)

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
const demoSections = [createEye(), createLogo(), createPixel(), createTransition(), createDrape(), createPattern(), createCursor(), createList(), createAsciiReveal(), createAsciiVideo(), createDotModel()];

// ── FLOW: 지금까지 만든 섹션들을 하나로 이어붙인 연속 시퀀스 (client/partners 직전까지).
// 기존 개별 데모 섹션들은 위에 그대로 두고, 새 인스턴스로 맨 끝에 이어붙임 — 기존 것은 안 건드림.
// hero-pixels(원형 텍스트 링 파티클 + 키홀 화이트아웃) → pixel reveal → drape(진입 시 배경이
// 이미지 뒤에서 백→흑 커튼으로 전환 — transition은 독립 섹션이 아니라 drape 진입부에 녹아있음)
// drape 다음(video reveal · white out)은 아직 안 붙임 — drape 마지막 아이템과 이어지는
// 형태로 다시 설계할 예정(현재처럼 뚝 끊기고 별개 섹션으로 등장하는 방식은 아님).
const flowHero = createHeroPixels();
flowHero.label = 'flow · hero';
const flowPixel = createPixel();
flowPixel.id = 'flow-pixel'; flowPixel.label = 'flow · pixel'; flowPixel.el.id = 'sec-pixel-flow';
const flowDrape = createDrape({ introCurtain: true });
flowDrape.id = 'flow-drape'; flowDrape.label = 'flow · drape'; flowDrape.el.id = 'sec-drape-flow';

const flowSections = [flowHero, flowPixel, flowDrape];
const sections = [...demoSections, ...flowSections];

const container = document.getElementById('sections');
sections.forEach(s => container.appendChild(s.el));
// pixel → drape 핸드오프 구간(아래 loop 참고)만큼 flow-pixel 섹션을 더 늘려서,
// 핸드오프가 시작될 때 pixel이 이미 충분히 보여진 뒤이도록 함.
flowPixel.el.style.height = `calc(100vh + ${flowDrape.params.curtainRange}px)`;
lenis.resize();

// 하단 중앙 네비게이션 — 개별 데모 섹션은 각자 버튼, flow 시퀀스는 하나로 묶어 "flow" 버튼 하나만
const navGroups = [
  ...demoSections.map(s => ({ label: s.label, sections: [s], target: s.el.id })),
  { label: 'flow', sections: flowSections, target: flowHero.el.id },
];
const nav = document.getElementById('nav');
const links = navGroups.map(g => {
  const b = document.createElement('button');
  b.className = 'nav-link'; b.textContent = g.label;
  b.addEventListener('click', () => lenis.scrollTo('#' + g.target, { duration: 1.2 }));
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

// 섹션 전환 시 캔버스를 한 번만 지우고(clear), 필요하면 한 프레임에 두 섹션을 겹쳐 그림
// (pixel → drape 핸드오프). 그래서 각 섹션의 render()는 더 이상 스스로 클리어하지 않게
// core.js에서 렌더러 autoClear를 꺼둠 — 이 loop가 클리어 시점을 전담.
renderer.autoClear = false;

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
    links.forEach((d, i) => d.classList.toggle('active', navGroups[i].sections.includes(a)));
    showPanel(a.id);
  }

  renderer.clear();
  const drapeTop = flowDrape.el.offsetTop;
  const handoff = flowDrape.params.curtainRange;
  if (s >= drapeTop - handoff && s < drapeTop) {
    // 핸드오프: pixel은 그 자리에 그대로(맨 뒤) 두고, 그 위로 transition 커튼이
    // 화면 아래→위로 스윕하며 자연스럽게 덮고, 그 위로 drape 이미지가 (더 아래서
    // 시작해) 같이 올라오며 맨 앞에 그려짐.
    flowPixel.render(now, s);
    renderer.clearDepth();
    flowDrape.renderCurtain(s);
    renderer.clearDepth();
    flowDrape.renderImages(now, s);
  } else {
    a.render(now, s);
  }
  requestAnimationFrame(loop);
}

resize();
showPanel(sections[0].id);
requestAnimationFrame(loop);
