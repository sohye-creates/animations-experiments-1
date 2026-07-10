// 섹션: PATTERN — 커서 주변 원 안을 브랜드 도형으로 채움. 도형/색은 뒤 이미지 밝기로 선택.
// 마우스 움직임 감지 시 시작하고, 요소들이 중심에서 픽셀처럼 퍼져나가며 나타남. 원 바깥은 fade out.
// 커서가 빠르게 움직일수록 반지름이 줄고, 멈추면 원래 크기로 서서히 커짐(ease) + 지나간
// 자리에 옅어지는 트레일(잔상)이 잠깐 남았다가 사라짐.
import * as THREE from 'three';
import { renderer, camera } from '../core.js';

const clamp01 = v => Math.min(1, Math.max(0, v));
const TRAIL_N = 20;

const VERT = /* glsl */`
  attribute vec3 position; attribute vec2 uv;
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */`
  precision highp float;
  #define TRAIL_N ${TRAIL_N}
  uniform sampler2D tImg;
  uniform vec2 uRes, uMouse;
  uniform float uImgAspect, uImgW, uCell, uRadius, uFade, uOpacity, uJitter, uThresh, uDither, uPresence;
  uniform vec3 uPurple, uBlue1, uBlue2, uCyan1, uCyan2;
  uniform float uTrailX[TRAIL_N];
  uniform float uTrailY[TRAIL_N];
  uniform float uTrailR[TRAIL_N];
  uniform float uTrailA[TRAIL_N];
  varying vec2 vUv;

  float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

  float sdRing(vec2 q){ return step(abs(length(q) - 0.40), 0.09); }
  float sdHollowSq(vec2 q){ return step(abs(max(abs(q.x), abs(q.y)) - 0.40), 0.075); }
  float sdChecker(vec2 q){ vec2 g = floor(clamp(q + 0.5, 0.0, 0.999) * 3.0); return 1.0 - mod(g.x + g.y, 2.0); }
  float sdDisc(vec2 q){ return step(length(q), 0.46); }
  float sdSquare(vec2 q){ return step(max(abs(q.x), abs(q.y)), 0.46); }

  void main(){
    vec2 px = vUv * uRes;
    vec2 halfSz = vec2(uImgW * 0.5, uImgW / uImgAspect * 0.5);
    vec2 rc = uRes * 0.5;
    vec2 dEdge = halfSz - abs(px - rc);
    float inRect = step(0.0, min(dEdge.x, dEdge.y));       // 이미지 안에서만(하드 클립)

    vec2 iuv = (px - (rc - halfSz)) / (2.0 * halfSz);
    vec3 img = texture2D(tImg, iuv).rgb;

    vec2 grid = uRes / uCell;
    vec2 cell = floor(vUv * grid);
    vec2 cuv = fract(vUv * grid) - 0.5;
    vec2 ccpx = ((cell + 0.5) / grid) * uRes;
    float L = lum(texture2D(tImg, (ccpx - (rc - halfSz)) / (2.0 * halfSz)).rgb);

    float h1 = hash(cell), h2 = hash(cell + 5.5);
    vec2 q = cuv - (vec2(hash(cell + 1.3), hash(cell + 2.9)) - 0.5) * uJitter;

    // ── 이미지 밝기로 도형/색 선택 ──
    float cov; vec3 shapeColor;
    if (L < uThresh) {
      float d = clamp(L / uThresh + (h2 - 0.5) * uDither, 0.0, 1.0);
      if (d < 0.34)      { cov = sdRing(q);     shapeColor = uPurple; }
      else if (d < 0.67) { cov = sdHollowSq(q); shapeColor = (h1 < 0.5) ? uPurple : uBlue1; }
      else               { cov = sdChecker(q);  shapeColor = (h1 < 0.5) ? uBlue1 : uBlue2; }
    } else {
      float b = clamp((L - uThresh) / (1.0 - uThresh) + (h2 - 0.5) * uDither, 0.0, 1.0);
      if (b < 0.5) { cov = sdDisc(q);   shapeColor = (h1 < 0.5) ? uCyan2 : uCyan1; }
      else         { cov = sdSquare(q); shapeColor = (h1 < 0.5) ? uBlue2 : uCyan2; }
    }

    // ── 커서 트레일: 최근 위치들을 각자의(속도로 줄어든) 반지름 + 나이에 따른 알파로 겹쳐 그림.
    // 가장 최근 샘플이 곧 "지금 커서 위치"라, 트레일이 0개일 때와 동작이 동일함. ──
    float jit = (hash(cell + 7.7) - 0.5) * uFade * 1.6;   // 셀 랜덤 → 앞단이 픽셀처럼 들쭉날쭉
    float on = 0.0;
    for (int i = 0; i < TRAIL_N; i++) {
      float ta = uTrailA[i];
      if (ta <= 0.001) continue;
      vec2 tp = vec2(uTrailX[i], uTrailY[i]) * uRes;
      float dist = length(ccpx - tp);
      float front = uPresence * uTrailR[i];
      float o = (1.0 - smoothstep(front - uFade, front, dist + jit)) * ta;
      on = max(on, o);
    }

    vec3 patterned = mix(img, shapeColor, cov * uOpacity * on);
    vec3 col = mix(vec3(0.0), patterned, inRect);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createPattern() {
  const params = {
    uImgW: 1200, uCell: 8, uRadius: 180, uFade: 40, uOpacity: 0.7,
    uJitter: 0.12, uThresh: 0.4, uDither: 0.15,
    speedShrink: 0.55, minRadiusMul: 0.45, speedScale: 3, radiusEase: 0.15,
    trailLife: 0.65, trailShrink: 0.65, breatheAmp: 0.09, breatheSpeed: 0.35,
    purple: '#5741D3', blue1: '#476DDE', blue2: '#369AE9', cyan1: '#15F2FE', cyan2: '#26C6F3',
  };
  const controls = [
    { key: 'uImgW', min: 400, max: 1400, step: 10, info: 'Centered image width (px).' },
    { key: 'uCell', min: 4, max: 40, step: 1, info: 'Shape cell size (px). Smaller = denser.' },
    { key: 'uRadius', min: 60, max: 700, step: 10, info: 'Cursor reveal radius at rest (px).' },
    { key: 'uFade', min: 0, max: 200, step: 5, info: 'Fade width at the circle edge (px).' },
    { key: 'uOpacity', min: 0.2, max: 1, step: 0.02, info: 'Pattern opacity. Lower shows more image.' },
    { key: 'uJitter', min: 0, max: 0.4, step: 0.02, info: 'Random shape offset (breaks grid moiré).' },
    { key: 'uThresh', min: 0, max: 1, step: 0.02, info: 'Brightness split between dark / light shapes.' },
    { key: 'uDither', min: 0, max: 0.6, step: 0.02, info: 'Shape-pick randomness. 0 = follows brightness exactly.' },
    { key: 'speedShrink', min: 0, max: 1, step: 0.02, info: 'How much cursor speed shrinks the circle (0 = no effect).' },
    { key: 'minRadiusMul', min: 0.1, max: 1, step: 0.02, info: 'Smallest size (fraction of uRadius) at top speed.' },
    { key: 'speedScale', min: 1, max: 30, step: 0.5, info: 'How fast counts as "fast". Lower = shrinks more easily.' },
    { key: 'radiusEase', min: 0.02, max: 0.5, step: 0.01, info: 'How quickly the size eases toward its target.' },
    { key: 'trailLife', min: 0.05, max: 1.2, step: 0.05, info: 'How long the trailing afterimage lingers (s).' },
    { key: 'trailShrink', min: 0, max: 1, step: 0.05, info: 'How much the trail also shrinks as it ages — higher makes the current (already speed-shrunk) position read as clearly the largest/freshest point.' },
    { key: 'breatheAmp', min: 0, max: 0.2, step: 0.01, info: 'Idle breathing size wobble (fraction of radius).' },
    { key: 'breatheSpeed', min: 0.05, max: 2, step: 0.05, info: 'Idle breathing cycles per second.' },
    { key: 'purple', color: true, info: 'Dark: ring / hollow square.' },
    { key: 'blue1', color: true, info: 'Dark: hollow square / checker.' },
    { key: 'blue2', color: true, info: 'Dark checker / light square.' },
    { key: 'cyan1', color: true, info: 'Light: brightest circle.' },
    { key: 'cyan2', color: true, info: 'Light: circle / square.' },
  ];

  const scene = new THREE.Scene();
  const IMG_ASPECT = 2000 / 792;
  const tex = new THREE.Texture();
  const img = new Image();
  img.src = './assets/test-image.jpg';
  img.onload = () => { tex.image = img; tex.needsUpdate = true; };

  const mk = (fill = 0) => new Array(TRAIL_N).fill(fill);
  const uTrailX = mk(0.5), uTrailY = mk(0.5), uTrailR = mk(0), uTrailA = mk(0);

  const material = new THREE.RawShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    uniforms: {
      tImg: { value: tex }, uImgAspect: { value: IMG_ASPECT }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) }, uImgW: { value: params.uImgW }, uCell: { value: params.uCell },
      uRadius: { value: params.uRadius }, uFade: { value: params.uFade }, uOpacity: { value: params.uOpacity },
      uJitter: { value: params.uJitter }, uThresh: { value: params.uThresh }, uDither: { value: params.uDither },
      uPresence: { value: 0 },
      uPurple: { value: new THREE.Color(params.purple) }, uBlue1: { value: new THREE.Color(params.blue1) },
      uBlue2: { value: new THREE.Color(params.blue2) }, uCyan1: { value: new THREE.Color(params.cyan1) },
      uCyan2: { value: new THREE.Color(params.cyan2) },
      uTrailX: { value: uTrailX }, uTrailY: { value: uTrailY }, uTrailR: { value: uTrailR }, uTrailA: { value: uTrailA },
    },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const el = document.createElement('section'); el.id = 'sec-pattern';

  // 마우스 움직임 감지 시작 + 중심에서 퍼지는 presence
  let isActive = false, moved = false, presence = 0;
  let tx = 0.5, ty = 0.5, mx = 0.5, my = 0.5;
  let prevTx = 0.5, prevTy = 0.5, radiusMul = 1;
  let lastNow = null, lastPushT = 0;
  const trail = []; // { x, y, r, born } — 최근 것이 배열 맨 앞

  addEventListener('pointermove', e => {
    tx = e.clientX / innerWidth; ty = 1 - e.clientY / innerHeight;
    if (isActive && !moved) { mx = tx; my = ty; prevTx = tx; prevTy = ty; moved = true; }   // 첫 움직임: 위치 맞추고 시작(점프 방지)
  });

  return {
    id: 'pattern', label: 'pattern', hint: 'move cursor ✦', el, params, controls,
    onEnter() {
      isActive = true; moved = false; presence = 0; radiusMul = 1;
      prevTx = tx; prevTy = ty; lastNow = null; lastPushT = 0; trail.length = 0;
    },   // 들어올 때마다 다시 퍼짐
    onLeave() { isActive = false; },
    render(now) {
      const dt = lastNow == null ? 1 / 60 : Math.max(1e-3, (now - lastNow) / 1000);
      lastNow = now;

      if (moved) presence += (1 - presence) * 0.07;   // 중심에서 서서히 퍼짐
      mx += (tx - mx) * 0.15; my += (ty - my) * 0.15;

      // 커서 속도 → 반지름이 줄었다가(빠를수록) 멈추면 다시 원래 크기로(ease)
      const speed = Math.hypot(tx - prevTx, ty - prevTy) / dt;
      prevTx = tx; prevTy = ty;
      const shrinkT = clamp01(speed / params.speedScale);
      const targetMul = Math.max(params.minRadiusMul, 1 - params.speedShrink * shrinkT);
      radiusMul += (targetMul - radiusMul) * params.radiusEase;
      // 가만히 있을 때도 살짝 숨쉬듯 커졌다 작아졌다(느린 사인파) — 속도로 줄어든 크기 위에 그대로 얹힘
      const breathe = 1 + params.breatheAmp * Math.sin((now / 1000) * params.breatheSpeed * Math.PI * 2);
      const currentRadius = params.uRadius * radiusMul * breathe;

      // 트레일: trailLife를 TRAIL_N 개 슬롯에 고르게 펴서, 프레임레이트와 무관하게 일정한 길이로 남음
      if (moved) {
        const pushInterval = (params.trailLife * 1000) / TRAIL_N;
        if (!trail.length || now - lastPushT >= pushInterval) {
          lastPushT = now;
          trail.unshift({ x: mx, y: my, r: currentRadius, born: now });
          if (trail.length > TRAIL_N) trail.length = TRAIL_N;
        } else {
          trail[0].x = mx; trail[0].y = my; trail[0].r = currentRadius; // 다음 push까지는 최신 위치로 계속 갱신
        }
      }
      for (let i = 0; i < TRAIL_N; i++) {
        const t = trail[i];
        if (!t) { uTrailA[i] = 0; continue; }
        const ageFrac = clamp01((now - t.born) / 1000 / params.trailLife);
        uTrailX[i] = t.x; uTrailY[i] = t.y;
        // 알파만 페이드하면, 줄어들기 전(빠르게 움직이기 시작한 순간) 찍힌 큰 반지름의 잔상이
        // 안 사라진 채 한동안 겹쳐 보여서 "현재 위치는 안 줄고 트레일만 줄어드는" 느낌이 남.
        // 나이 들수록 반지름도 같이 줄여서, 방금 찍힌(=지금 속도를 반영한) 샘플이 항상 제일 크게 보이게 함.
        uTrailR[i] = t.r * (1 - params.trailShrink * ageFrac);
        uTrailA[i] = 1 - ageFrac;
      }

      const u = material.uniforms;
      u.uMouse.value.set(mx, my); u.uRes.value.set(innerWidth, innerHeight); u.uPresence.value = presence;
      u.uImgW.value = params.uImgW; u.uCell.value = params.uCell; u.uRadius.value = params.uRadius;
      u.uFade.value = params.uFade; u.uOpacity.value = params.uOpacity; u.uJitter.value = params.uJitter;
      u.uThresh.value = params.uThresh; u.uDither.value = params.uDither;
      u.uPurple.value.set(params.purple); u.uBlue1.value.set(params.blue1);
      u.uBlue2.value.set(params.blue2); u.uCyan1.value.set(params.cyan1);
      u.uCyan2.value.set(params.cyan2);
      renderer.render(scene, camera);
    },
  };
}
