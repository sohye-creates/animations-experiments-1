// 섹션: CURSOR — 커서를 따라다니는 손 아이콘 + 시안 "View/More" 계단형 박스.
// View/More가 ease로 위로 스크롤, 클릭하면 픽셀로 사각형이 됐다 복귀, 움직이면 다시 계단형.
// 실제 그림은 DOM/CSS. 이 섹션의 WebGL 렌더는 캔버스를 비우기만 함.
import * as THREE from 'three';
import { renderer, camera } from '../core.js';

export function createCursor() {
  const params = {
    btnW: 80, fontPx: 16, linePx: 24, scrollDur: 3.0,
    follow: 0.10, offsetX: 0, offsetY: 0, demoColor: '#34353b', btnColor: '#00F2FF',
  };
  const controls = [
    { key: 'btnW', min: 60, max: 380, step: 10, info: 'Box width (px). Height is half.' },
    { key: 'fontPx', min: 8, max: 32, step: 1, info: 'View / More font size (px).' },
    { key: 'linePx', min: 16, max: 80, step: 1, info: 'Line spacing (px). Larger = smaller peek of the next word.' },
    { key: 'scrollDur', min: 1, max: 6, step: 0.2, info: 'Seconds per scroll cycle. Higher = slower.' },
    { key: 'follow', min: 0.05, max: 0.4, step: 0.01, info: 'Follow elasticity. Lower = more lag / drag.' },
    { key: 'offsetX', min: -100, max: 100, step: 2, info: 'Horizontal offset from cursor (px). 0 = centered.' },
    { key: 'offsetY', min: -100, max: 120, step: 2, info: 'Vertical offset from cursor (px). 0 = centered.' },
    { key: 'demoColor', color: true, info: 'Demo target box color.' },
    { key: 'btnColor', color: true, info: 'Cursor box color.' },
  ];

  const scene = new THREE.Scene();   // 캔버스 비우기용 빈 씬

  const el = document.createElement('section'); el.id = 'sec-cursor';
  const box = document.createElement('div'); box.className = 'btn-demo';
  el.appendChild(box);

  // 따라다니는 박스는 캔버스 위(z4)에 있어야 하므로 body 에 append
  const wrap = document.createElement('div'); wrap.className = 'cbtn-wrap';

  // 클릭 시 사각형을 채우는 픽셀 그리드(계단 버튼 뒤) — 각 픽셀 랜덤 delay
  const pixels = document.createElement('div'); pixels.className = 'cbtn-pixels';
  for (let i = 0; i < 50; i++) {   // 10 x 5
    const p = document.createElement('i');
    p.style.transitionDelay = (Math.random() * 0.22).toFixed(3) + 's';
    pixels.appendChild(p);
  }

  const btn = document.createElement('div'); btn.className = 'cbtn';
  const scroll = document.createElement('div'); scroll.className = 'cbtn__scroll';
  ['More', 'View', 'More', 'View', 'More'].forEach(t => {   // 5칸 → -2줄 이동이 완전 seamless 무한루프
    const s = document.createElement('span'); s.textContent = t; scroll.appendChild(s);
  });
  btn.appendChild(scroll);
  wrap.appendChild(pixels); wrap.appendChild(btn);
  document.body.appendChild(wrap);

  // 커서 지점의 손 아이콘
  const hand = document.createElement('div'); hand.className = 'cbtn-cursor';
  hand.innerHTML = '<img src="./assets/cursor-hand.svg" alt="">';
  document.body.appendChild(hand);

  const inBox = e => {
    const r = box.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };

  let isActive = false, hovering = false;
  let tx = innerWidth / 2, ty = innerHeight / 2, bx = tx, by = ty, vx = 0, vy = 0;

  addEventListener('pointermove', e => {
    tx = e.clientX; ty = e.clientY;
    hovering = inBox(e);
    if (isActive) wrap.classList.remove('expanded');   // 움직이면 다시 계단형(픽셀 사라짐)
  });
  let popTimer;
  addEventListener('pointerdown', e => {               // 클릭(모바일 탭 포함) → 픽셀로 채워 사각형 됐다가 복귀
    if (isActive && inBox(e)) {
      wrap.classList.add('expanded');
      clearTimeout(popTimer);
      popTimer = setTimeout(() => wrap.classList.remove('expanded'), 600);
    }
  });

  function applyParams() {
    box.style.setProperty('--demo-color', params.demoColor);
    wrap.style.setProperty('--btn-color', params.btnColor);
    wrap.style.setProperty('--btn-w', params.btnW + 'px');
    wrap.style.setProperty('--btn-h', (params.btnW / 2) + 'px');
    wrap.style.setProperty('--btn-line', params.linePx + 'px');
    wrap.style.setProperty('--btn-font', params.fontPx + 'px');
    wrap.style.setProperty('--scroll-dur', params.scrollDur + 's');
  }

  return {
    id: 'cursor', label: 'cursor', hint: 'move & click the box ✦', el, params, controls,
    onEnter() { isActive = true; },
    onLeave() { isActive = false; hovering = false; wrap.classList.remove('show', 'expanded'); hand.classList.remove('show'); },
    render() {
      applyParams();
      // 스프링: 커서를 탄성 있게(늦게 끌려오듯) 따라옴
      vx += (tx - bx) * params.follow; vx *= 0.82; bx += vx;
      vy += (ty - by) * params.follow; vy *= 0.82; by += vy;
      const shown = isActive && hovering;
      // 박스 중앙이 커서(손가락 끝)에 오도록. offset 은 선택적 미세조정
      wrap.style.left = (bx - params.offsetX) + 'px';
      wrap.style.top  = (by - params.offsetY) + 'px';
      wrap.classList.toggle('show', shown);
      // 손 아이콘은 커서 지점에 정확히(오프셋 없이)
      hand.style.left = tx + 'px'; hand.style.top = ty + 'px';
      hand.classList.toggle('show', shown);
      renderer.render(scene, camera);              // 캔버스 클리어 (이전 섹션 잔상 제거)
    },
  };
}
