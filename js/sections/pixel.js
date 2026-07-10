// 섹션: PIXEL REVEAL — 문장을 단어(그룹) 단위로 쪼개 배치.
// intro-1: 120px 간격의 옅은 회색 그리드 라인들이 왼쪽부터 살짝 stagger를 두고
//          아래→위로 자란 뒤 그 자리에 영구히 남음(사라지지 않음). 그 다음 단어들이
//          왼쪽→오른쪽, 위→아래 순서로 하나씩 이미 덮인(검은 박스) 채로 등장.
// intro-2: "연결어"(plain) 단어들만 순서대로 랜덤 픽셀 디졸브로 박스가 벗겨져 평문으로 노출.
//          "내용어"(boxed) 단어들은 계속 검은 박스로 남아 hover를 기다림.
//          커버 박스는 텍스트 높이의 85%만 덮어 아래 꼬리(디센더)가 항상 살짝 보임.
// intro-3~4: boxed 박스 중 하나라도 mouseover 하면 전체가 동시에: 검은 커버는 아래→위로
//          벗겨지고, 그 순간 왼쪽→오른쪽 그라데이션(FDFDFB~CCF017) 색이 잠깐 머물다 사라지며
//          같은 그라데이션의 하이라이트 박스 위에 실제 텍스트가 드러남. 동시에 배경이
//          하양 → 하늘색(15F2FE)으로 단순 fade in.
// intro-5: mouseout 되면 단어 쪽은 위 과정이 그대로 역재생되지만, 배경은 단순 fade out이
//          아니라 소용돌이 모양으로 번지는 하프톤(테두리 도형 → 채워진 도형)이 퍼지며 사라짐.
import * as THREE from 'three';
import { renderer, camera } from '../core.js';

const clamp01 = v => Math.min(1, Math.max(0, v));

// 문장을 토큰으로 분해. boxed=true → 내용어(검은 박스로 가려졌다가 hover로만 드러남),
// boxed=false → 연결어(intro-2에서 순서대로 영구히 드러남). noSpace → 앞 단어에 붙임(문장부호).
const WORDS = [
  { t: 'We' }, { t: 'do' },
  { t: 'branding', boxed: true }, { t: 'systems', boxed: true },
  { t: ',', noSpace: true },
  { t: 'video', boxed: true }, { t: 'production', boxed: true },
  { t: ',', noSpace: true }, { t: 'creative' },
  { t: 'campaigns', boxed: true },
  { t: '&' },
  { t: 'digital', boxed: true }, { t: 'innovation', boxed: true },
  { t: '.', noSpace: true },
  { t: 'All', boxed: true },
  { t: 'things' }, { t: 'that' },
  { t: 'get', boxed: true },
  { t: 'you' },
  { t: 'noticed', boxed: true },
  { t: '♥' },
];

const MAX_BOXES = 24;

const VERT = /* glsl */`
  attribute vec3 position; attribute vec2 uv;
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */`
  precision highp float;
  #define MAX_BOXES ${MAX_BOXES}
  uniform sampler2D tText;
  uniform vec2 uRes;
  uniform float uTexAspect, uBlockScale, uCellScale, uScatter, uDwell, uHoverGlobal, uTime, uIntroT;
  uniform float uTailFrac;
  uniform float uLineSpacing, uLineColStagger, uLineGrowDur;
  uniform float uLeaveT, uSwirlDur, uSkyCell;
  uniform vec3 uBg, uInk, uCover, uGradFrom, uGradTo, uSkyColor, uSkyDot, uLineColor;
  uniform float uBoxX0[MAX_BOXES];
  uniform float uBoxY0[MAX_BOXES];
  uniform float uBoxX1[MAX_BOXES];
  uniform float uBoxY1[MAX_BOXES];
  uniform float uBoxKind[MAX_BOXES];
  uniform float uBoxAppear[MAX_BOXES];
  uniform float uBoxState[MAX_BOXES];
  varying vec2 vUv;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

  float sdDiscFilled(vec2 q){ return step(length(q), 0.44); }
  float sdSquareFilled(vec2 q){ return step(max(abs(q.x), abs(q.y)), 0.44); }
  float sdRingOutline(vec2 q){ return step(abs(length(q) - 0.44), 0.09); }
  float sdHollowSqOutline(vec2 q){ return step(abs(max(abs(q.x), abs(q.y)) - 0.44), 0.07); }

  void main(){
    vec2 c = vUv - 0.5; c.x *= uRes.x / uRes.y;
    float boxW = uBlockScale * (uRes.x / uRes.y);
    float boxH = boxW / uTexAspect;
    float inBlock = step(abs(c.x), boxW) * step(abs(c.y), boxH);
    vec2 tuv = vec2(c.x / (2.0 * boxW), c.y / (2.0 * boxH)) + 0.5;

    // ---- intro-1: 120px 간격 그리드 라인, 왼쪽부터 stagger를 두고 자란 뒤 영구히 유지.
    // 하양 배경 위에서만 보이고, 하늘색 배경(hover)이 덮이면 그 뒤로 가려짐. ----
    float xPx = c.x * uRes.y;
    float nearestK = floor(xPx / uLineSpacing + 0.5);
    float lineX = nearestK * uLineSpacing;
    float distToLine = abs(xPx - lineX);
    float xFromLeftPx = vUv.x * uRes.x;
    float colDelay = (xFromLeftPx / uLineSpacing) * uLineColStagger;
    float colProg = clamp((uIntroT - colDelay) / uLineGrowDur, 0.0, 1.0);
    float lineMask = step(distToLine, 0.5) * step(abs(c.y), colProg * 0.5);
    vec3 whiteBg = mix(uBg, uLineColor, lineMask);

    // ---- 배경: hover 시작은 하양(그리드 포함)→하늘색 단순 fade, hover 종료는 소용돌이
    // 하프톤이 퍼지며 사라짐(사라진 자리에는 그리드가 다시 드러남). ----
    vec3 bg = mix(whiteBg, uSkyColor, uHoverGlobal);
    if (uLeaveT >= 0.0 && uLeaveT < uSwirlDur) {
      float prog = uLeaveT / uSwirlDur;
      vec2 skyCellId = floor(vUv * uRes / uSkyCell);
      vec2 skyCellUv = (skyCellId + 0.5) * uSkyCell / uRes;
      // 화면 중앙을 중심으로 퍼지는 원형 소용돌이 대신, 좌우로 불규칙하게 오가며
      // 번지는 웨이브 — y에 따라 다르게 흔들리는 x축 기준 파형 + 셀별 노이즈.
      float wander = sin(skyCellUv.y * 6.0 + uLeaveT * 1.4) * 0.18
                    + sin(skyCellUv.y * 13.0 - uLeaveT * 0.8) * 0.10;
      float swirl = skyCellUv.x + wander + 0.16 * (hash(skyCellId) - 0.5);
      float d = swirl - (prog * 1.4 - 0.2);
      vec2 q = fract(vUv * uRes / uSkyCell) - 0.5;
      float hC = hash(skyCellId * 1.3 + 4.0);
      if (d > 0.10) {
        bg = uSkyColor;
      } else if (d > 0.0) {
        float shape = hC < 0.5 ? sdRingOutline(q) : sdHollowSqOutline(q);
        bg = mix(uSkyColor, uSkyDot, shape);
      } else if (d > -0.16) {
        float shape = hC < 0.5 ? sdDiscFilled(q) : sdSquareFilled(q);
        bg = mix(whiteBg, uSkyColor, shape);
      } else {
        bg = whiteBg;
      }
    }

    vec3 col = bg;

    if (inBlock > 0.5) {
      float ta = texture2D(tText, tuv).a;
      vec3 content = mix(bg, uInk, ta);
      col = content;

      for (int i = 0; i < MAX_BOXES; i++) {
        float kind = uBoxKind[i];
        if (kind < -0.5) continue;
        float x0 = uBoxX0[i], y0 = uBoxY0[i], x1 = uBoxX1[i], y1 = uBoxY1[i];
        if (tuv.x < x0 || tuv.x > x1 || tuv.y < y0 || tuv.y > y1) continue;

        float appear = uBoxAppear[i];
        if (appear < 0.5) { col = bg; break; }

        float lx = (tuv.x - x0) / max(1e-4, x1 - x0);
        float lyFull = (tuv.y - y0) / max(1e-4, y1 - y0);

        if (lyFull < uTailFrac) {
          // 커버 박스가 텍스트 높이의 (1-uTailFrac)만 덮으므로, 아래 꼬리는 등장하고 나면 항상 보임
          col = content;
        } else {
          float ly = (lyFull - uTailFrac) / (1.0 - uTailFrac);
          float state = uBoxState[i];
          // 박스 자체의 화면상 종횡비(uTexAspect 기준)로 셀을 정사각형으로 맞춤 — uRes를 쓰면
          // 화면 종횡비와 블록 종횡비가 달라 셀이 직사각형이 되는 버그가 있었음.
          vec2 cells = vec2(floor(uCellScale * (x1 - x0) / max(1e-4, y1 - y0) * uTexAspect), uCellScale);
          vec2 cid = floor(vec2(lx, ly) * cells);

          if (kind < 0.5) {
            // 연결어: 랜덤 픽셀 디졸브로 벗겨져 평문 노출 (영구)
            float r = hash(cid + float(i) * 7.31);
            // state가 사실상 0일 때 hash(cid)가 부동소수점상 0에 아주 가깝게 나오는 셀이 있어도
            // 절대 새어나오지 않도록(logo.js와 동일한 잔재 픽셀 버그) 최소 임계값으로 잠금.
            float show = step(1e-4, state) * step(r, state);
            col = mix(uCover, content, show);
          } else {
            // 내용어: 아래→위 커버 해제 + 좌→우 그라데이션 드웰 + 영구 하이라이트 배경
            float r2 = hash(cid * 1.7 + float(i) * 3.11);
            float thresh = ly * (1.0 - uScatter) + r2 * uScatter;
            float p = state * 1.5 - 0.03;
            vec3 grad = mix(uGradFrom, uGradTo, lx);
            if (p < thresh) col = uCover;
            else if (p < thresh + uDwell) col = grad;
            else col = mix(grad, uInk, ta);
          }
        }
        break;
      }
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

// 문장을 fontPx/lineHeightMult/blockWpx 기준으로 줄바꿈(줄마다 가운데 정렬)하고, 같은 줄에서
// boxed 상태가 이어지는 토큰들을 하나의 박스로 합쳐 캔버스(잉크 텍스처) + 박스 목록을 만듦.
function buildLayout(p) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = `500 ${p.fontPx}px Aeonik, system-ui, sans-serif`;
  const spaceW = probe.measureText(' ').width;
  // 라인마다 실제로 쓰인 글자 기준으로 ascent/descent를 재서, 특정 글자(예: 'd','b'처럼
  // 표본 문자열에 없는 어센더)가 타이트 박스 위/아래로 삐져나오는 일이 없게 함.
  const fallbackAsc = p.fontPx * 0.75, fallbackDesc = p.fontPx * 0.22;
  const lineH = p.fontPx * p.lineHeightMult;

  let x = 0, lineIdx = 0;
  const placed = [];
  const lineAsc = [], lineDesc = [], lineWidth = [];
  WORDS.forEach((w, idx) => {
    const wm = probe.measureText(w.t);
    const wid = wm.width;
    const lead = (idx === 0 || w.noSpace) ? 0 : spaceW;
    if (x + lead + wid > p.blockWpx && x > 0) { lineWidth[lineIdx] = x; lineIdx++; x = 0; }
    else x += lead;
    placed.push({ ...w, line: lineIdx, x, width: wid });
    x += wid;
    lineAsc[lineIdx] = Math.max(lineAsc[lineIdx] || 0, wm.actualBoundingBoxAscent || fallbackAsc);
    lineDesc[lineIdx] = Math.max(lineDesc[lineIdx] || 0, wm.actualBoundingBoxDescent || fallbackDesc);
  });
  lineWidth[lineIdx] = x;
  const numLines = lineIdx + 1;
  const canvasW = p.blockWpx, canvasH = numLines * lineH;

  // 각 줄을 blockWpx 안에서 가운데 정렬
  const lineOffset = lineWidth.map(w => (canvasW - w) / 2);
  placed.forEach(w => { w.x += lineOffset[w.line]; });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(canvasW * dpr); canvas.height = Math.ceil(canvasH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.font = `500 ${p.fontPx}px Aeonik, system-ui, sans-serif`;
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  placed.forEach(w => {
    const asc = lineAsc[w.line], desc = lineDesc[w.line], tightH = asc + desc;
    const top = w.line * lineH + (lineH - tightH) / 2;
    ctx.fillText(w.t, w.x, top + asc);
  });

  const boxes = [];
  for (const w of placed) {
    const last = boxes[boxes.length - 1];
    if (last && last.line === w.line && !!last.boxed === !!w.boxed) last.x1 = w.x + w.width;
    else boxes.push({ line: w.line, boxed: !!w.boxed, x0: w.x, x1: w.x + w.width });
  }
  // 안티앨리어싱으로 살짝 삐져나온 잉크 픽셀이 박스 밖(=커버 안 된 영역)으로 새지 않도록
  // 박스 경계에 약간의 여유(padding)를 둠.
  const padX = 2, padY = 2;
  let plainOrder = 0;
  boxes.forEach((b, i) => {
    const asc = lineAsc[b.line], desc = lineDesc[b.line], tightH = asc + desc;
    const top = b.line * lineH + (lineH - tightH) / 2 - padY;
    const bottom = top + tightH + padY * 2;
    b.tx0 = (b.x0 - padX) / canvasW; b.tx1 = (b.x1 + padX) / canvasW;
    b.ty0 = 1 - bottom / canvasH; b.ty1 = 1 - top / canvasH;
    b.kind = b.boxed ? 1 : 0;
    b.order = i;
    b.plainOrder = b.boxed ? -1 : plainOrder++;
  });

  return { canvas, texAspect: canvasW / canvasH, boxes };
}

export function createPixel() {
  const params = {
    blockScale: 0.30, fontPx: 48, lineHeightMult: 1.2, blockWpx: 760,
    tailFrac: 0.15,
    cellScale: 10, scatter: 0.5, dwell: 0.25,
    lineDur: 0.5, lineSpacing: 120, lineColStagger: 0.06,
    wordStagger: 0.045, introGap: 0.25, plainStagger: 0.07, plainDur: 0.45,
    hoverEase: 0.025, swirlDur: 1.3,
    bg: '#FFFFFF', ink: '#141414', cover: '#000000',
    gradFrom: '#FDFDFB', gradTo: '#CCF017',
    skyColor: '#15F2FE', skyDot: '#FFFFFF', skyCell: 16,
    lineColor: '#EAEAEA',
  };
  const controls = [
    { key: 'blockScale', min: 0.15, max: 0.6, step: 0.01, info: 'Text block width (fraction of screen).' },
    { key: 'fontPx', min: 24, max: 110, step: 1, info: 'Font size (px). Triggers relayout.' },
    { key: 'lineHeightMult', min: 1.0, max: 1.6, step: 0.02, info: 'Line height multiplier. Triggers relayout.' },
    { key: 'blockWpx', min: 300, max: 1400, step: 10, info: 'Wrap width for layout (design px), lines are centered within it. Triggers relayout.' },
    { key: 'tailFrac', min: 0, max: 0.4, step: 0.01, info: 'Fraction of text height left exposed below the cover box (descender tail).' },
    { key: 'cellScale', min: 4, max: 24, step: 1, info: 'Pixel dissolve grid density (always square cells).' },
    { key: 'scatter', min: 0, max: 1, step: 0.02, info: 'Reveal randomness for boxed (content) words.' },
    { key: 'dwell', min: 0.05, max: 0.6, step: 0.02, info: 'How long the gradient color lingers before revealing text.' },
    { key: 'lineDur', min: 0.1, max: 1.5, step: 0.05, info: 'Intro: grid line grow duration per column (s).' },
    { key: 'lineSpacing', min: 40, max: 300, step: 5, info: 'Background grid line spacing (px), centered on screen.' },
    { key: 'lineColStagger', min: 0, max: 0.2, step: 0.005, info: 'Grid lines: extra delay per column-width from the left edge (s).' },
    { key: 'wordStagger', min: 0.01, max: 0.15, step: 0.005, info: 'Intro-1: delay between each word box appearing.' },
    { key: 'introGap', min: 0, max: 1, step: 0.05, info: 'Pause between intro-1 finishing and intro-2 starting.' },
    { key: 'plainStagger', min: 0.01, max: 0.2, step: 0.005, info: 'Intro-2: delay between each connector word dissolving.' },
    { key: 'plainDur', min: 0.1, max: 1.0, step: 0.05, info: 'Intro-2: dissolve duration per connector word.' },
    { key: 'hoverEase', min: 0.005, max: 0.4, step: 0.005, info: 'Hover fade/reveal speed. Lower = slower.' },
    { key: 'swirlDur', min: 0.3, max: 3, step: 0.1, info: 'Duration of the swirl halftone dissolve when the hover ends.' },
    { key: 'bg', color: true, info: 'Idle page background.' },
    { key: 'ink', color: true, info: 'Revealed text color.' },
    { key: 'cover', color: true, info: 'Cover box color.' },
    { key: 'gradFrom', color: true, info: 'Hover gradient — left side (FDFDFB by default).' },
    { key: 'gradTo', color: true, info: 'Hover gradient — right side (CCF017 by default).' },
    { key: 'skyColor', color: true, info: 'Background hover color.' },
    { key: 'skyDot', color: true, info: 'Swirl dissolve halftone dot color.' },
    { key: 'skyCell', min: 6, max: 40, step: 1, info: 'Swirl dissolve halftone cell size (px, always square).' },
    { key: 'lineColor', color: true, info: 'Intro grid line color.' },
  ];

  const scene = new THREE.Scene();
  let layout = buildLayout(params);
  let layoutCache = { fontPx: params.fontPx, lineHeightMult: params.lineHeightMult, blockWpx: params.blockWpx };
  const tText = new THREE.Texture(layout.canvas);
  tText.generateMipmaps = false;
  tText.needsUpdate = true;

  const mk = (fill = 0) => new Array(MAX_BOXES).fill(fill);
  const uBoxX0 = mk(2), uBoxY0 = mk(2), uBoxX1 = mk(2), uBoxY1 = mk(2);
  const uBoxKind = mk(-1), uBoxAppear = mk(0), uBoxState = mk(0);

  function applyBoxesToStaticUniforms(lay) {
    for (let i = 0; i < MAX_BOXES; i++) {
      const b = lay.boxes[i];
      if (!b) { uBoxKind[i] = -1; continue; }
      uBoxX0[i] = b.tx0; uBoxY0[i] = b.ty0; uBoxX1[i] = b.tx1; uBoxY1[i] = b.ty1; uBoxKind[i] = b.kind;
    }
  }
  applyBoxesToStaticUniforms(layout);

  const material = new THREE.RawShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    uniforms: {
      tText: { value: tText }, uTexAspect: { value: layout.texAspect },
      uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, uBlockScale: { value: params.blockScale },
      uCellScale: { value: params.cellScale }, uScatter: { value: params.scatter }, uDwell: { value: params.dwell },
      uHoverGlobal: { value: 0 }, uTime: { value: 0 }, uIntroT: { value: 0 }, uTailFrac: { value: params.tailFrac },
      uLineSpacing: { value: params.lineSpacing }, uLineColStagger: { value: params.lineColStagger }, uLineGrowDur: { value: params.lineDur },
      uLeaveT: { value: -1 }, uSwirlDur: { value: params.swirlDur }, uSkyCell: { value: params.skyCell },
      uBg: { value: new THREE.Color(params.bg) }, uInk: { value: new THREE.Color(params.ink) }, uCover: { value: new THREE.Color(params.cover) },
      uGradFrom: { value: new THREE.Color(params.gradFrom) }, uGradTo: { value: new THREE.Color(params.gradTo) },
      uSkyColor: { value: new THREE.Color(params.skyColor) }, uSkyDot: { value: new THREE.Color(params.skyDot) },
      uLineColor: { value: new THREE.Color(params.lineColor) },
      uBoxX0: { value: uBoxX0 }, uBoxY0: { value: uBoxY0 }, uBoxX1: { value: uBoxX1 }, uBoxY1: { value: uBoxY1 },
      uBoxKind: { value: uBoxKind }, uBoxAppear: { value: uBoxAppear }, uBoxState: { value: uBoxState },
    },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const el = document.createElement('section'); el.id = 'sec-pixel';

  let isActive = false, introStart = null, hoverGlobal = 0;
  let prevHoverTarget = 0, leaveT = -1, lastNow = null;
  let clientX = -1, clientY = -1;
  addEventListener('pointermove', e => { clientX = e.clientX; clientY = e.clientY; });

  function pointerInAnyBoxedRect(lay) {
    if (!isActive || clientX < 0) return false;
    const boxW = params.blockScale * (innerWidth / innerHeight), boxH = boxW / lay.texAspect;
    const cx = (clientX / innerWidth - 0.5) * (innerWidth / innerHeight);
    const cy = (1 - clientY / innerHeight) - 0.5;
    const tux = cx / (2 * boxW) + 0.5, tuy = cy / (2 * boxH) + 0.5;
    return lay.boxes.some(b => b.kind === 1 && tux >= b.tx0 && tux <= b.tx1 && tuy >= b.ty0 && tuy <= b.ty1);
  }

  return {
    id: 'pixel', label: 'pixel reveal', hint: 'hover the highlighted words ✦', el, params, controls,
    onEnter() { isActive = true; introStart = null; },
    onLeave() { isActive = false; },
    render(now) {
      if (introStart == null) introStart = now;
      const t = (now - introStart) / 1000;
      const dt = lastNow == null ? 0 : Math.max(0, (now - lastNow) / 1000);
      lastNow = now;

      // fontPx/lineHeightMult/blockWpx 변경 시에만 캔버스·박스 재계산
      if (layoutCache.fontPx !== params.fontPx || layoutCache.lineHeightMult !== params.lineHeightMult || layoutCache.blockWpx !== params.blockWpx) {
        layout = buildLayout(params);
        layoutCache = { fontPx: params.fontPx, lineHeightMult: params.lineHeightMult, blockWpx: params.blockWpx };
        tText.image = layout.canvas; tText.needsUpdate = true;
        applyBoxesToStaticUniforms(layout);
      }

      const n = layout.boxes.length;
      const introEnd = (n > 0 ? (n - 1) * params.wordStagger : 0) + 0.06 + params.introGap;

      const hoverTarget = pointerInAnyBoxedRect(layout) ? 1 : 0;
      if (hoverTarget === 1) leaveT = -1;
      else if (prevHoverTarget === 1 && hoverTarget === 0) leaveT = 0;
      else if (leaveT >= 0) leaveT += dt;
      prevHoverTarget = hoverTarget;
      hoverGlobal += (hoverTarget - hoverGlobal) * params.hoverEase;

      for (let i = 0; i < MAX_BOXES; i++) {
        const b = layout.boxes[i];
        if (!b) { uBoxAppear[i] = 0; uBoxState[i] = 0; continue; }
        const appearAt = b.order * params.wordStagger;
        uBoxAppear[i] = clamp01((t - appearAt) / 0.06);
        if (b.kind === 0) {
          const dissolveAt = introEnd + b.plainOrder * params.plainStagger;
          uBoxState[i] = clamp01((t - dissolveAt) / params.plainDur);
        } else {
          uBoxState[i] = hoverGlobal;
        }
      }

      const u = material.uniforms;
      u.uRes.value.set(innerWidth, innerHeight); u.uTexAspect.value = layout.texAspect;
      u.uBlockScale.value = params.blockScale; u.uCellScale.value = params.cellScale;
      u.uScatter.value = params.scatter; u.uDwell.value = params.dwell; u.uTailFrac.value = params.tailFrac;
      u.uHoverGlobal.value = hoverGlobal; u.uTime.value = now * 0.001; u.uIntroT.value = t;
      u.uLineSpacing.value = params.lineSpacing; u.uLineColStagger.value = params.lineColStagger; u.uLineGrowDur.value = params.lineDur;
      u.uLeaveT.value = leaveT; u.uSwirlDur.value = params.swirlDur; u.uSkyCell.value = params.skyCell;
      u.uBg.value.set(params.bg); u.uInk.value.set(params.ink); u.uCover.value.set(params.cover);
      u.uGradFrom.value.set(params.gradFrom); u.uGradTo.value.set(params.gradTo);
      u.uSkyColor.value.set(params.skyColor); u.uSkyDot.value.set(params.skyDot);
      u.uLineColor.value.set(params.lineColor);
      renderer.render(scene, camera);
    },
  };
}
