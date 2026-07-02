// 섹션: PIXEL REVEAL — 텍스트를 가린 박스가 hover 시 개별 픽셀 네모가 랜덤하게
// 아래→위로 시안 계열로 바뀌며(뒤 텍스트 노출) 벗겨짐
import { Transform, Plane, Program, Mesh } from 'ogl';
import { gl, renderer, camera } from '../core.js';
import { textTexture } from '../text.js';

const hexToRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

const VERT = /* glsl */`
  attribute vec3 position; attribute vec2 uv;
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D tText;
  uniform vec2 uRes;
  uniform float uReveal, uTexAspect, uBoxW, uScatter, uDwell, uCellScale;
  uniform vec3 uCover, uCyanA, uCyanB, uCyanC;
  varying vec2 vUv;

  void main(){
    vec2 c = vUv - 0.5; c.x *= uRes.x / uRes.y;
    float boxW = uBoxW * (uRes.x / uRes.y);
    float boxH = boxW / uTexAspect;                // 박스 높이 = 텍스트에 딱 맞게
    float inBox = step(abs(c.x), boxW) * step(abs(c.y), boxH);

    vec2 tuv = vec2(c.x/(2.0*boxW), c.y/(2.0*boxH)) + 0.5;
    float tin = step(0.0,tuv.x)*step(tuv.x,1.0)*step(0.0,tuv.y)*step(tuv.y,1.0);
    float ta = texture2D(tText, tuv).a * tin;

    vec3 bg = vec3(0.03, 0.03, 0.05);
    vec3 content = mix(bg, vec3(1.0), ta);

    vec2 bl = clamp((c / vec2(boxW, boxH)) * 0.5 + 0.5, 0.0, 1.0);  // bl.y: 0 아래 → 1 위
    vec2 cells = vec2(floor(uCellScale * uTexAspect), uCellScale);
    vec2 cid = floor(bl * cells);
    float rnd  = fract(sin(dot(cid, vec2(41.3, 289.1))) * 43758.5453);
    float rnd2 = fract(sin(dot(cid, vec2(93.7, 17.1)))  * 24634.633);
    float cellY = (cid.y + 0.5) / cells.y;

    // 아래일수록 먼저, 큰 랜덤 산포 → 불규칙하게 흩어져 벗겨짐
    float threshold = cellY * (1.0 - uScatter) + rnd * uScatter;
    float p = uReveal * 1.5 - 0.03;

    // 시안 색도 셀마다 랜덤(아래일수록 밝게)
    float ct = clamp(cellY + (rnd2 - 0.5) * 0.5, 0.0, 1.0);
    vec3 cyan = ct < 0.5 ? mix(uCyanA, uCyanB, ct * 2.0)
                         : mix(uCyanB, uCyanC, (ct - 0.5) * 2.0);

    // 덮임 → 잠깐 시안 → 텍스트  (셀 단위 = 픽셀 네모)
    vec3 boxCol = (p < threshold) ? uCover
                : (p < threshold + uDwell) ? cyan : content;
    vec3 col = mix(content, boxCol, inBox);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createPixel() {
  const params = {
    uBoxW: 0.30, uScatter: 0.5, uDwell: 0.30, uCellScale: 9, ease: 0.12,
    cover: '#432CC2', cyanA: '#C3F7FB', cyanB: '#5BF7FE', cyanC: '#04E2F5',
  };
  const controls = [
    { key: 'uBoxW', min: 0.15, max: 0.5, step: 0.01, info: 'Cover box width (relative to screen).' },
    { key: 'uScatter', min: 0, max: 1, step: 0.02, info: 'Reveal randomness. 0 = bottom-up rows, 1 = fully random.' },
    { key: 'uDwell', min: 0.05, max: 0.6, step: 0.02, info: 'How long pixels stay cyan (band thickness).' },
    { key: 'uCellScale', min: 4, max: 20, step: 1, info: 'Pixel grid density. Larger = finer.' },
    { key: 'ease', name: 'speed', min: 0.03, max: 0.4, step: 0.01, info: 'Reveal speed on hover. Higher = faster.' },
    { key: 'cover', color: true, info: 'Cover box color.' },
    { key: 'cyanA', color: true, info: 'Reveal color 1 (bottom, brightest).' },
    { key: 'cyanB', color: true, info: 'Reveal color 2 (mid).' },
    { key: 'cyanC', color: true, info: 'Reveal color 3 (top, darkest).' },
  ];

  const scene = new Transform();
  const { tex, aspect } = textTexture('REVEALED', 180, 12, true);  // tight = 박스가 글자에 딱 맞게
  const program = new Program(gl, {
    vertex: VERT, fragment: FRAG, cullFace: false,
    uniforms: {
      tText: { value: tex }, uTexAspect: { value: aspect }, uRes: { value: [innerWidth, innerHeight] },
      uReveal: { value: 0 }, uBoxW: { value: params.uBoxW }, uScatter: { value: params.uScatter },
      uDwell: { value: params.uDwell }, uCellScale: { value: params.uCellScale },
      uCover: { value: hexToRgb(params.cover) }, uCyanA: { value: hexToRgb(params.cyanA) },
      uCyanB: { value: hexToRgb(params.cyanB) }, uCyanC: { value: hexToRgb(params.cyanC) },
    },
  });
  const mesh = new Mesh(gl, { geometry: new Plane(gl, { width: 2, height: 2 }), program });
  mesh.frustumCulled = false;
  mesh.setParent(scene);

  const el = document.createElement('section'); el.id = 'sec-pixel';

  // 커서가 박스 위에 있으면 hover=1 → 벗겨짐
  let hover = 0, reveal = 0;
  addEventListener('pointermove', e => {
    const cx = (e.clientX / innerWidth - 0.5) * (innerWidth / innerHeight);
    const cy = (1 - e.clientY / innerHeight) - 0.5;
    const boxW = params.uBoxW * (innerWidth / innerHeight), boxH = boxW / aspect;
    hover = (Math.abs(cx) < boxW && Math.abs(cy) < boxH) ? 1 : 0;
  });

  return {
    id: 'pixel', label: 'pixel reveal', hint: 'hover the box ▦', el, params, controls,
    render() {
      reveal += (hover - reveal) * params.ease;
      const u = program.uniforms;
      u.uReveal.value = reveal; u.uRes.value = [innerWidth, innerHeight];
      u.uBoxW.value = params.uBoxW; u.uScatter.value = params.uScatter;
      u.uDwell.value = params.uDwell; u.uCellScale.value = params.uCellScale;
      u.uCover.value = hexToRgb(params.cover); u.uCyanA.value = hexToRgb(params.cyanA);
      u.uCyanB.value = hexToRgb(params.cyanB); u.uCyanC.value = hexToRgb(params.cyanC);
      renderer.render({ scene, camera });
    },
  };
}
