// 섹션: LIST — directional-aware hover post list.
// 행에 hover 하면 커서가 들어온 방향(위/아래/좌/우)에서 색상 블럭이 슬라이드로 채워지고
// 이미지가 커짐. 커서를 리스트로 움직이면 각 행이 순차로 블럭을 들이고 내보내 → 흐르는 느낌.
// 실제 그림은 DOM/CSS. 이 섹션의 WebGL 렌더는 캔버스를 비우기만 함.
import * as THREE from 'three';
import { renderer, camera } from '../core.js';

const ROWS = [
  { t: 'WKS Launches “The Fight of Our Lives” Campaign on Behalf of BIO', img: 'work-sweater' },
  { t: 'The Metro Bed Collection. Next Stop: Bedtime.', img: 'work-luray' },
  { t: 'WKS Establishes Executive and Leadership Teams', img: 'work-wpa' },
  { t: 'WKS Named Finalist for Five Anthem Awards', img: 'work-penfed-petals' },
  { t: 'WKS Rewind 2025 — A Year in Motion', img: 'work-rewind25' },
];

// 커서 진입/이탈 지점 → 가까운 모서리 (0 top, 1 right, 2 bottom, 3 left)
const OUT = ['translateY(-101%)', 'translateX(101%)', 'translateY(101%)', 'translateX(-101%)'];
function edge(ev, el) {
  const r = el.getBoundingClientRect();
  const nx = (ev.clientX - r.left - r.width / 2) / (r.width / 2);
  const ny = (ev.clientY - r.top - r.height / 2) / (r.height / 2);
  if (Math.abs(ny) > Math.abs(nx)) return ny < 0 ? 0 : 2;   // top / bottom (넓은 행이라 대부분 여기)
  return nx < 0 ? 3 : 1;                                     // left / right
}

export function createList() {
  const params = { accent: '#C6F000', dur: 0.42 };
  const controls = [
    { key: 'accent', color: true, info: 'Hover fill color.' },
    { key: 'dur', min: 0.15, max: 1, step: 0.02, info: 'Fill / image transition speed (s).' },
  ];

  const scene = new THREE.Scene();  // 캔버스 클리어용

  const el = document.createElement('section'); el.id = 'sec-list';
  const wrap = document.createElement('div'); wrap.className = 'dl-wrap';
  wrap.innerHTML = `
    <div class="dl-h">News &amp; Insights</div>
    <button class="dl-viewall">View All News ✦</button>
    <div class="dl-list"></div>`;
  el.appendChild(wrap);
  const list = wrap.querySelector('.dl-list');

  for (const row of ROWS) {
    const r = document.createElement('div'); r.className = 'dl-row';
    r.innerHTML = `
      <div class="dl-fill"></div>
      <div class="dl-rt">${row.t}</div>
      <div class="dl-pill">Post Type</div>
      <div class="dl-thumb"><img src="./assets/works/${row.img}.webp" alt=""></div>`;
    const fill = r.querySelector('.dl-fill');
    r.addEventListener('pointerenter', e => {
      const d = edge(e, r);
      fill.style.transition = 'none';
      fill.style.transform = OUT[d];
      fill.offsetHeight;                                    // reflow
      fill.style.transition = `transform ${params.dur}s cubic-bezier(.4,0,.1,1)`;
      fill.style.transform = 'translate(0,0)';
    });
    r.addEventListener('pointerleave', e => {
      fill.style.transition = `transform ${params.dur}s cubic-bezier(.4,0,.1,1)`;
      fill.style.transform = OUT[edge(e, r)];
    });
    list.appendChild(r);
  }

  return {
    id: 'list', label: 'list', hint: 'hover the rows ✦', el, params, controls,
    render() {
      el.style.setProperty('--accent', params.accent);
      el.style.setProperty('--dl-dur', params.dur + 's');
      renderer.render(scene, camera);                   // 캔버스 클리어 (이전 섹션 잔상 제거)
    },
  };
}
