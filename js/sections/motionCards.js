// 섹션: MOTION CARDS — SVG path(꽃 모양, 3개의 튀어나온 점 + 3개의 오목한 점)를 따라
// 6개의 박스가 스크롤에 맞춰 같은 속도로 다음 점까지 부드럽게 이동. 데스크탑/모바일 각각
// 다른 SVG(assets/path-desktop.svg, path-mobile.svg)를 씀. 순수 DOM(WebGL 없음) 섹션.
const clamp01 = v => Math.min(1, Math.max(0, v));

// Figma가 내보내는 "M x y C x1 y1 x2 y2 x y C ... Z" 형태만 다루는 아주 단순한 파서 —
// 범용 SVG path 파서가 아니라 이 두 에셋(path-desktop/mobile.svg)에 맞춘 최소 구현.
function parsePathSegments(d) {
  const nums = d.replace(/[MCZ]/g, ' ').trim().split(/[\s,]+/).map(Number);
  const start = [nums[0], nums[1]];
  const segments = [];
  let prev = start;
  for (let i = 2; i + 6 <= nums.length; i += 6) {
    const c1 = [nums[i], nums[i + 1]], c2 = [nums[i + 2], nums[i + 3]], p1 = [nums[i + 4], nums[i + 5]];
    segments.push({ p0: prev, c1, c2, p1 });
    prev = p1;
  }
  return segments;
}

function cubicPoint(seg, t) {
  const mt = 1 - t;
  const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
  return [
    a * seg.p0[0] + b * seg.c1[0] + c * seg.c2[0] + d * seg.p1[0],
    a * seg.p0[1] + b * seg.c1[1] + c * seg.c2[1] + d * seg.p1[1],
  ];
}

// progress(연속값, 정수=꼭짓점) → path 위의 좌표. 6개 세그먼트를 순환.
function positionAt(segments, progress) {
  const n = segments.length;
  const p = ((progress % n) + n) % n;
  const idx = Math.floor(p);
  return cubicPoint(segments[idx], p - idx);
}

export function createMotionCards() {
  const N = 6;
  const SRC = { desktop: './assets/path-desktop.svg', mobile: './assets/path-mobile.svg' };
  const svgCache = {};

  const params = {
    pxPerStep: 260, loopSteps: 18, ease: 0.08,
    boxW: 280, boxH: 380, statRepeat: 5, pathScale: 1.15,
    zHigh: 30, zMid: 20, zLow: 10,
    debugPath: false,
  };
  const controls = [
    { key: 'pxPerStep', min: 80, max: 600, step: 10, info: 'Scroll distance (px) to move from one point to the next.' },
    { key: 'loopSteps', min: 6, max: 60, step: 1, info: 'How many point-to-point steps of scroll room the section reserves (6 = one full loop).' },
    { key: 'ease', min: 0.02, max: 0.3, step: 0.01, info: 'How quickly the boxes ease toward the scroll-driven target position. Lower = smoother/slower catch-up.' },
    { key: 'boxW', min: 120, max: 500, step: 5, info: 'Placeholder card width (px).' },
    { key: 'boxH', min: 120, max: 600, step: 5, info: 'Placeholder card height (px).' },
    { key: 'statRepeat', min: 1, max: 10, step: 1, info: 'How many times the "stat" line repeats inside each card.' },
    { key: 'pathScale', min: 0.5, max: 2.5, step: 0.05, info: 'Scales the whole path (and box positions) up/down.' },
    { key: 'zHigh', min: 1, max: 50, step: 1, info: 'z-index for the topmost box (desktop only).' },
    { key: 'zMid', min: 1, max: 50, step: 1, info: 'z-index for the two next-highest boxes (desktop only).' },
    { key: 'zLow', min: 1, max: 50, step: 1, info: 'z-index for the remaining (lowest) boxes (desktop only).' },
    { key: 'debugPath', info: 'Show the actual SVG path outline, to check the boxes line up with it.' },
  ];

  const el = document.createElement('section'); el.id = 'sec-motion-cards';
  // render()는 이 섹션이 "활성"일 때만 불리는데, 활성 여부 자체가 스크롤 범위(=높이)로
  // 정해지므로 높이를 render() 안에서 처음 정하면 아예 활성화될 기회가 없음 — 생성 시점에
  // 바로 정해둠(이후 main.js의 lenis.resize() 호출이 이 높이를 반영해감).
  el.style.height = `calc(100vh + ${params.pxPerStep * params.loopSteps}px)`;
  const stage = document.createElement('div'); stage.className = 'mp-stage';
  el.appendChild(stage);

  const pathImg = document.createElement('img'); pathImg.className = 'mp-path-debug';
  stage.appendChild(pathImg);

  // 카드 안 내용: eyebrow(작은 라벨) + stat(큰 텍스트, 여러 번 반복) — 실제 와이어프레임이
  // 들어오기 전까지의 자리표시용 구조.
  const boxes = [];
  const statLists = [];
  for (let i = 0; i < N; i++) {
    const b = document.createElement('div'); b.className = 'mp-card';
    const eyebrow = document.createElement('div'); eyebrow.className = 'mp-eyebrow'; eyebrow.textContent = `eyebrow${i + 1}`;
    const statList = document.createElement('div'); statList.className = 'mp-stats';
    b.append(eyebrow, statList);
    stage.appendChild(b);
    boxes.push(b);
    statLists.push(statList);
  }

  function rebuildStats(n) {
    for (const list of statLists) {
      list.innerHTML = '';
      for (let j = 0; j < n; j++) {
        const s = document.createElement('div'); s.className = 'mp-stat'; s.textContent = 'stat comes here';
        list.appendChild(s);
      }
    }
  }
  let lastStatRepeat = -1;

  let isDesktop = innerWidth >= 768;
  let segments = null, viewW = 1, viewH = 1, zTierForIndex = new Array(N).fill(1);

  function computeZTiers(segs) {
    const anchors = segs.map(s => s.p0);
    const order = anchors.map((a, i) => i).sort((a, b) => anchors[a][1] - anchors[b][1]);
    const tiers = new Array(N).fill(1);
    tiers[order[0]] = 3;
    tiers[order[1]] = 2; tiers[order[2]] = 2;
    tiers[order[3]] = 1; tiers[order[4]] = 1; tiers[order[5]] = 1;
    return tiers;
  }

  async function loadPath(which) {
    if (!svgCache[which]) {
      const res = await fetch(SRC[which]);
      const text = await res.text();
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');
      const d = doc.querySelector('path').getAttribute('d');
      svgCache[which] = {
        segments: parsePathSegments(d),
        viewW: parseFloat(svgEl.getAttribute('width')),
        viewH: parseFloat(svgEl.getAttribute('height')),
        url: SRC[which],
      };
    }
    return svgCache[which];
  }

  async function applyBreakpoint() {
    const which = isDesktop ? 'desktop' : 'mobile';
    const data = await loadPath(which);
    segments = data.segments; viewW = data.viewW; viewH = data.viewH;
    zTierForIndex = computeZTiers(segments);
    pathImg.src = data.url;
  }
  applyBreakpoint();

  addEventListener('resize', () => {
    const nowDesktop = innerWidth >= 768;
    if (nowDesktop !== isDesktop) { isDesktop = nowDesktop; applyBreakpoint(); }
  });

  let progress = 0;

  return {
    id: 'motion-cards', label: 'motion cards', hint: 'scroll ↕ — 6 boxes travel the path together', el, params, controls,
    // stage는 position:fixed라서(아래 CSS) 섹션이 활성일 때만 보여줘야 함 — 안 그러면 다른
    // 섹션을 보는 중에도 화면에 계속 떠 있게 됨(videoReveal.js의 <video> 토글과 같은 패턴).
    onEnter() { stage.style.display = 'block'; },
    onLeave() { stage.style.display = 'none'; },
    render(now, s) {
      if (!segments) return;

      el.style.height = `calc(100vh + ${params.pxPerStep * params.loopSteps}px)`;
      const local = Math.max(0, s - el.offsetTop);
      const target = local / params.pxPerStep;
      progress += (target - progress) * params.ease;

      if (params.statRepeat !== lastStatRepeat) { rebuildStats(params.statRepeat); lastStatRepeat = params.statRepeat; }

      const scale = params.pathScale;
      stage.style.width = (viewW * scale) + 'px';
      stage.style.height = (viewH * scale) + 'px';
      pathImg.style.width = (viewW * scale) + 'px';
      pathImg.style.height = (viewH * scale) + 'px';
      pathImg.style.opacity = params.debugPath ? '0.5' : '0';

      for (let k = 0; k < N; k++) {
        const p = positionAt(segments, progress + k);
        const [x, y] = [p[0] * scale, p[1] * scale];
        const box = boxes[k];
        box.style.width = params.boxW + 'px'; box.style.height = params.boxH + 'px';
        box.style.transform = `translate(${x - params.boxW / 2}px, ${y - params.boxH / 2}px)`;
        if (isDesktop) {
          const idx = Math.round(((progress + k) % N + N) % N) % N;
          const tier = zTierForIndex[idx];
          box.style.zIndex = tier === 3 ? params.zHigh : tier === 2 ? params.zMid : params.zLow;
        } else {
          box.style.zIndex = 1;
        }
      }
    },
  };
}
