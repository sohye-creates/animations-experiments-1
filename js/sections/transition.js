// 섹션: TRANSITION — 어두운(이미지+First Section) 페이지가 고정된 채,
// 스크롤하면 검정 페이지가 픽셀 커튼(20px, 4가지 그레이)으로 아래→위 번지며 덮고,
// 다 덮이면 "Second Section"(흰 텍스트) 내용이 뜸.
import { Transform, Plane, Program, Mesh, Texture } from 'ogl';
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
  uniform sampler2D tImg, tText1, tText2;
  uniform vec2 uRes;
  uniform float uProgress, uImgAspect, uT1Aspect, uT2Aspect;
  uniform float uPixel, uScatter, uCurtainEnd, uContentStart, uDarken;
  uniform vec3 uC0, uC1, uC2, uC3;
  varying vec2 vUv;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  vec2 coverUV(vec2 uv, float ia, float sa){
    vec2 s = uv - 0.5; if (sa > ia) s.y *= ia / sa; else s.x *= sa / ia; return s + 0.5;
  }
  // 화면 중앙 정렬 텍스트 알파 (c = 비율보정 좌표)
  float textA(sampler2D tx, vec2 c, float aspect){
    float W = 0.30 * (uRes.x / uRes.y), H = W / aspect;
    vec2 t = vec2(c.x/(2.0*W), c.y/(2.0*H)) + 0.5;
    float ins = step(0.0,t.x)*step(t.x,1.0)*step(0.0,t.y)*step(t.y,1.0);
    return texture2D(tx, t).a * ins;
  }
  vec3 pick(float r){ return r < 0.25 ? uC0 : r < 0.5 ? uC1 : r < 0.75 ? uC2 : uC3; }

  void main(){
    float sa = uRes.x / uRes.y;
    vec2 uv = vUv;
    vec2 c = uv - 0.5; c.x *= sa;

    // 페이지1: 어두운 이미지 + "First Section"(흰 글자)
    vec3 page1 = texture2D(tImg, coverUV(uv, uImgAspect, sa)).rgb * uDarken;
    page1 = mix(page1, vec3(1.0), textA(tText1, c, uT1Aspect));

    // 픽셀 커튼: 20px 셀, 아래→위 + 랜덤 산포
    vec2 grid = uRes / uPixel;
    vec2 cell = floor(uv * grid);
    float cellY = (cell.y + 0.5) / grid.y;              // 0 아래 → 1 위
    float rnd = hash(cell), rnd2 = hash(cell + 7.0);
    float curtain = uProgress / uCurtainEnd * 1.15;   // 살짝 오버슈트 → 최상단까지 완전 하얗게
    float thr = cellY * (1.0 - uScatter) + rnd * uScatter;
    float d = curtain - thr;                             // >0 이면 덮임

    vec3 col;
    if (d > 0.0) {
      // 앞단은 그레이 픽셀, 뒤로 갈수록 검정으로 정착
      float edge = smoothstep(0.12, 0.0, d);
      col = mix(vec3(0.0), pick(rnd2), edge);
      // 다 덮인 뒤 "Second Section"(흰 글자, 검정 배경 위)
      float contentP = smoothstep(uContentStart, 1.0, uProgress);
      col = mix(col, vec3(1.0), textA(tText2, c, uT2Aspect) * contentP);
    } else {
      col = page1;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createTransition() {
  const params = {
    pixel: 20, scatter: 0.22, darken: 0.4, curtainEnd: 0.7, contentStart: 0.82,
    c0: '#0E0E10', c1: '#414143', c2: '#767678', c3: '#C4C4C5',
  };
  const controls = [
    { key: 'pixel', min: 6, max: 60, step: 2, info: 'Pixel square size (px).' },
    { key: 'scatter', min: 0, max: 0.6, step: 0.02, info: 'Curtain edge randomness. 0 = straight rows.' },
    { key: 'darken', min: 0, max: 1, step: 0.02, info: 'Darkness of the first-section image.' },
    { key: 'curtainEnd', min: 0.4, max: 1, step: 0.02, info: 'Scroll point where white fully covers.' },
    { key: 'contentStart', min: 0.5, max: 1, step: 0.02, info: 'Scroll point where 2nd content fades in.' },
    { key: 'c0', color: true, info: 'Pixel color 1.' },
    { key: 'c1', color: true, info: 'Pixel color 2.' },
    { key: 'c2', color: true, info: 'Pixel color 3.' },
    { key: 'c3', color: true, info: 'Pixel color 4.' },
  ];

  const scene = new Transform();
  const IMG_ASPECT = 1280 / 853;
  const tImg = new Texture(gl);
  const img = new Image(); img.src = './assets/image.jpg'; img.onload = () => { tImg.image = img; };
  const t1 = textTexture('First Section');
  const t2 = textTexture('Second Section');

  const program = new Program(gl, {
    vertex: VERT, fragment: FRAG, cullFace: false,
    uniforms: {
      tImg: { value: tImg }, tText1: { value: t1.tex }, tText2: { value: t2.tex },
      uImgAspect: { value: IMG_ASPECT }, uT1Aspect: { value: t1.aspect }, uT2Aspect: { value: t2.aspect },
      uRes: { value: [innerWidth, innerHeight] }, uProgress: { value: 0 },
      uPixel: { value: params.pixel }, uScatter: { value: params.scatter }, uDarken: { value: params.darken },
      uCurtainEnd: { value: params.curtainEnd }, uContentStart: { value: params.contentStart },
      uC0: { value: hexToRgb(params.c0) }, uC1: { value: hexToRgb(params.c1) },
      uC2: { value: hexToRgb(params.c2) }, uC3: { value: hexToRgb(params.c3) },
    },
  });
  const mesh = new Mesh(gl, { geometry: new Plane(gl, { width: 2, height: 2 }), program });
  mesh.frustumCulled = false; mesh.setParent(scene);

  const el = document.createElement('section'); el.id = 'sec-transition';

  return {
    id: 'transition', label: 'transition', hint: 'scroll ↓ — pixel curtain', el, params, controls,
    render(now, s) {
      // 섹션 안에서 스크롤한 만큼 진행도 0..1 (첫 페이지는 고정, 커튼만 올라옴)
      const range = Math.max(1, el.offsetHeight - innerHeight);
      const p = Math.min(1, Math.max(0, (s - el.offsetTop) / range));
      const u = program.uniforms;
      u.uProgress.value = p; u.uRes.value = [innerWidth, innerHeight];
      u.uPixel.value = params.pixel; u.uScatter.value = params.scatter; u.uDarken.value = params.darken;
      u.uCurtainEnd.value = params.curtainEnd; u.uContentStart.value = params.contentStart;
      u.uC0.value = hexToRgb(params.c0); u.uC1.value = hexToRgb(params.c1);
      u.uC2.value = hexToRgb(params.c2); u.uC3.value = hexToRgb(params.c3);
      renderer.render({ scene, camera });
    },
  };
}
