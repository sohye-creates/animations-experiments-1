// 섹션: PATTERN — 커서 주변 원 안을 브랜드 도형으로 채움. 도형/색은 뒤 이미지 밝기로 선택.
// 마우스 움직임 감지 시 시작하고, 요소들이 중심에서 픽셀처럼 퍼져나가며 나타남. 원 바깥은 fade out.
import { Transform, Plane, Program, Mesh, Texture } from 'ogl';
import { gl, renderer, camera } from '../core.js';

const hexToRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

const VERT = /* glsl */`
  attribute vec3 position; attribute vec2 uv;
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D tImg;
  uniform vec2 uRes, uMouse;
  uniform float uImgAspect, uImgW, uCell, uRadius, uFade, uOpacity, uJitter, uThresh, uDither, uPresence;
  uniform vec3 uPurple, uBlue1, uBlue2, uCyan1, uCyan2;
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

    // ── 커서 중심에서 픽셀처럼 퍼져나감(uPresence 0→1) + 원 바깥 fade ──
    float dist = length(ccpx - uMouse * uRes);
    float jit = (hash(cell + 7.7) - 0.5) * uFade * 1.6;   // 셀 랜덤 → 퍼지는 앞단이 픽셀처럼 들쭉날쭉
    float front = uPresence * uRadius;
    float on = 1.0 - smoothstep(front - uFade, front, dist + jit);

    vec3 patterned = mix(img, shapeColor, cov * uOpacity * on);
    vec3 col = mix(vec3(0.0), patterned, inRect);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createPattern() {
  const params = {
    uImgW: 900, uCell: 8, uRadius: 280, uFade: 40, uOpacity: 0.7,
    uJitter: 0.12, uThresh: 0.4, uDither: 0.15,
    purple: '#5741D3', blue1: '#476DDE', blue2: '#369AE9', cyan1: '#15F2FE', cyan2: '#26C6F3',
  };
  const controls = [
    { key: 'uImgW', min: 400, max: 1400, step: 10, info: 'Centered image width (px).' },
    { key: 'uCell', min: 4, max: 40, step: 1, info: 'Shape cell size (px). Smaller = denser.' },
    { key: 'uRadius', min: 60, max: 700, step: 10, info: 'Cursor reveal radius (px).' },
    { key: 'uFade', min: 0, max: 200, step: 5, info: 'Fade width at the circle edge (px).' },
    { key: 'uOpacity', min: 0.2, max: 1, step: 0.02, info: 'Pattern opacity. Lower shows more image.' },
    { key: 'uJitter', min: 0, max: 0.4, step: 0.02, info: 'Random shape offset (breaks grid moiré).' },
    { key: 'uThresh', min: 0, max: 1, step: 0.02, info: 'Brightness split between dark / light shapes.' },
    { key: 'uDither', min: 0, max: 0.6, step: 0.02, info: 'Shape-pick randomness. 0 = follows brightness exactly.' },
    { key: 'purple', color: true, info: 'Dark: ring / hollow square.' },
    { key: 'blue1', color: true, info: 'Dark: hollow square / checker.' },
    { key: 'blue2', color: true, info: 'Dark checker / light square.' },
    { key: 'cyan1', color: true, info: 'Light: brightest circle.' },
    { key: 'cyan2', color: true, info: 'Light: circle / square.' },
  ];

  const scene = new Transform();
  const IMG_ASPECT = 2000 / 792;
  const tex = new Texture(gl);
  const img = new Image();
  img.src = './assets/test-image.jpg';
  img.onload = () => { tex.image = img; };

  const program = new Program(gl, {
    vertex: VERT, fragment: FRAG, cullFace: false,
    uniforms: {
      tImg: { value: tex }, uImgAspect: { value: IMG_ASPECT }, uRes: { value: [innerWidth, innerHeight] },
      uMouse: { value: [0.5, 0.5] }, uImgW: { value: params.uImgW }, uCell: { value: params.uCell },
      uRadius: { value: params.uRadius }, uFade: { value: params.uFade }, uOpacity: { value: params.uOpacity },
      uJitter: { value: params.uJitter }, uThresh: { value: params.uThresh }, uDither: { value: params.uDither },
      uPresence: { value: 0 },
      uPurple: { value: hexToRgb(params.purple) }, uBlue1: { value: hexToRgb(params.blue1) },
      uBlue2: { value: hexToRgb(params.blue2) }, uCyan1: { value: hexToRgb(params.cyan1) },
      uCyan2: { value: hexToRgb(params.cyan2) },
    },
  });
  const mesh = new Mesh(gl, { geometry: new Plane(gl, { width: 2, height: 2 }), program });
  mesh.frustumCulled = false;
  mesh.setParent(scene);

  const el = document.createElement('section'); el.id = 'sec-pattern';

  // 마우스 움직임 감지 시작 + 중심에서 퍼지는 presence
  let isActive = false, moved = false, presence = 0;
  let tx = 0.5, ty = 0.5, mx = 0.5, my = 0.5;
  addEventListener('pointermove', e => {
    tx = e.clientX / innerWidth; ty = 1 - e.clientY / innerHeight;
    if (isActive && !moved) { mx = tx; my = ty; moved = true; }   // 첫 움직임: 위치 맞추고 시작(점프 방지)
  });

  return {
    id: 'pattern', label: 'pattern', hint: 'move cursor ✦', el, params, controls,
    onEnter() { isActive = true; moved = false; presence = 0; },   // 들어올 때마다 다시 퍼짐
    onLeave() { isActive = false; },
    render() {
      if (moved) presence += (1 - presence) * 0.07;   // 중심에서 서서히 퍼짐
      mx += (tx - mx) * 0.15; my += (ty - my) * 0.15;
      const u = program.uniforms;
      u.uMouse.value = [mx, my]; u.uRes.value = [innerWidth, innerHeight]; u.uPresence.value = presence;
      u.uImgW.value = params.uImgW; u.uCell.value = params.uCell; u.uRadius.value = params.uRadius;
      u.uFade.value = params.uFade; u.uOpacity.value = params.uOpacity; u.uJitter.value = params.uJitter;
      u.uThresh.value = params.uThresh; u.uDither.value = params.uDither;
      u.uPurple.value = hexToRgb(params.purple); u.uBlue1.value = hexToRgb(params.blue1);
      u.uBlue2.value = hexToRgb(params.blue2); u.uCyan1.value = hexToRgb(params.cyan1);
      u.uCyan2.value = hexToRgb(params.cyan2);
      renderer.render({ scene, camera });
    },
  };
}
