// 섹션: VIDEO REVEAL — drape 다음에 이어지는 마지막 아이템(비디오)이 스크롤에 따라
// 화면 전체 크기로 커지고, 동시에 양옆에서 하프톤 도트로 이루어진 "귀" 모양 그래픽이 나타남.
// 비디오는 실제 <video> DOM 엘리먼트(나중에 PHP 템플릿이 실제 파일 경로만 넣어주면 되도록
// 구조를 잡아둠 — 지금은 실제 영상 에셋이 없어 poster 이미지로 대체)이고, 배경/귀 그래픽만
// 캔버스(WebGL)로 그림. DOM 콘텐츠 + 캔버스 연출이 공존하는 구조의 예시.
import * as THREE from 'three';
import { renderer, camera } from '../core.js';

const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / Math.max(1e-5, b - a)); return t * t * (3 - 2 * t); };

const VERT = /* glsl */`
  attribute vec3 position; attribute vec2 uv;
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform vec2 uRes;
  uniform float uEarT, uCell, uMarginFrac;
  uniform vec3 uBg, uDotColor;
  varying vec2 vUv;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float sdDiscFilled(vec2 q){ return step(length(q), 0.44); }
  float sdSquareFilled(vec2 q){ return step(max(abs(q.x), abs(q.y)), 0.44); }
  float sdRingOutline(vec2 q){ return step(abs(length(q) - 0.44), 0.09); }
  float sdHollowSqOutline(vec2 q){ return step(abs(max(abs(q.x), abs(q.y)) - 0.44), 0.07); }

  // 귀(comma/파이즐리) 모양 SDF — 동그란 머리 + 아래로 말리는 꼬리
  float earShape(vec2 p){
    float head = length(p - vec2(0.0, 0.30)) - 0.30;
    vec2 a = vec2(0.0, 0.05), b = vec2(-0.18, -0.42);
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float tail = length(pa - ba * h) - 0.16;
    return min(head, tail);
  }

  void main(){
    // 셀 하나당 한 번만 판정(하프톤 그리드는 화면 좌표 고정) — eye.js와 동일한 기법
    vec2 grid = uRes / uCell;
    vec2 cell = floor(vUv * grid);
    vec2 q = fract(vUv * grid) - 0.5;
    vec2 cuv = (cell + 0.5) / grid;
    vec2 cc = cuv - 0.5; cc.x *= uRes.x / uRes.y;

    // 화면 폭(半)의 바깥쪽 uMarginFrac 비율만 귀 그래픽 영역 — 비디오가 그 안쪽까지만 커지므로
    // 항상 이 마진 밖으로는 비디오가 덮지 않고, 화면 비율이 바뀌어도 항상 가장자리에 붙음.
    float halfW = (uRes.x / uRes.y) * 0.5;
    float bandStart = halfW * (1.0 - uMarginFrac);
    float within = step(bandStart, abs(cc.x));

    float side = cc.x < 0.0 ? -1.0 : 1.0;
    float earCx = side * halfW * (1.0 - uMarginFrac * 0.5);
    vec2 earCenter = vec2(earCx, 0.0);
    vec2 lp = cc - earCenter; lp.x *= side; lp /= max(1e-4, halfW * uMarginFrac);
    float d = earShape(lp);

    float rnd = hash(cell);
    float shape = 0.0;
    if (within > 0.5) {
      if (abs(d) < 0.05) shape = rnd < 0.5 ? sdRingOutline(q) : sdHollowSqOutline(q);
      else if (d < 0.0) shape = rnd < 0.5 ? sdDiscFilled(q) : sdSquareFilled(q);
    }
    vec3 col = mix(uBg, uDotColor, shape * uEarT);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createVideoReveal() {
  const params = {
    startW: 620, startH: 380, cell: 6, marginFrac: 0.16,
    growStart: 0.05, growEnd: 0.55, earStart: 0.45, earEnd: 0.85,
    bg: '#0A0A0A', dotColor: '#C6F000',
  };
  const controls = [
    { key: 'startW', min: 300, max: 900, step: 10, info: 'Video width (px) at rest, before it grows.' },
    { key: 'startH', min: 200, max: 700, step: 10, info: 'Video height (px) at rest, before it grows.' },
    { key: 'cell', min: 3, max: 14, step: 1, info: 'Ear halftone dot grid cell size (px).' },
    { key: 'marginFrac', min: 0.05, max: 0.35, step: 0.01, info: 'Side margin (fraction of half-width) reserved for the ear graphics — the video grows to fill only the rest.' },
    { key: 'growStart', min: 0, max: 0.5, step: 0.01, info: 'Scroll progress where the video starts growing.' },
    { key: 'growEnd', min: 0.2, max: 0.9, step: 0.01, info: 'Scroll progress where the video reaches its full size.' },
    { key: 'earStart', min: 0, max: 0.9, step: 0.01, info: 'Scroll progress where the ear graphics start appearing.' },
    { key: 'earEnd', min: 0.1, max: 1, step: 0.01, info: 'Scroll progress where the ear graphics are fully in.' },
    { key: 'bg', color: true, info: 'Background color.' },
    { key: 'dotColor', color: true, info: 'Ear halftone dot color.' },
  ];

  const scene = new THREE.Scene();
  const material = new THREE.RawShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    uniforms: {
      uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, uEarT: { value: 0 }, uCell: { value: params.cell },
      uMarginFrac: { value: params.marginFrac },
      uBg: { value: new THREE.Color(params.bg) }, uDotColor: { value: new THREE.Color(params.dotColor) },
    },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false; scene.add(mesh);

  const el = document.createElement('section'); el.id = 'sec-video-reveal';

  // 실제 <video> DOM 엘리먼트 — 나중에 PHP 템플릿이 src만 채워주면 됨.
  // 지금은 영상 에셋이 없어 poster 이미지로 자리를 대신함.
  const video = document.createElement('video');
  video.className = 'vr-video';
  video.muted = true; video.loop = true; video.playsInline = true; video.autoplay = true;
  video.poster = './assets/works/work-wpa.webp';
  // video.src = './assets/works/reel.mp4';   // 실제 영상 파일 준비되면 연결
  document.body.appendChild(video);

  return {
    id: 'video-reveal', label: 'flow · video', hint: 'scroll ↓', el, params, controls,
    videoEl: video,
    onEnter() { video.style.display = 'block'; },
    onLeave() { video.style.display = 'none'; video.style.opacity = '1'; },
    render(now, s) {
      const range = Math.max(1, el.offsetHeight - innerHeight);
      const p = clamp01((s - el.offsetTop) / range);
      const grow = smooth(params.growStart, params.growEnd, p);
      const ear = smooth(params.earStart, params.earEnd, p);

      // 비디오는 화면 전체가 아니라 (1-marginFrac)만큼만 커짐 — 나머지 가장자리는 귀 그래픽 자리
      const maxW = innerWidth * (1 - params.marginFrac);
      const w = params.startW + (maxW - params.startW) * grow;
      const h = params.startH + (innerHeight - params.startH) * grow;
      video.style.width = w + 'px'; video.style.height = h + 'px';
      video.style.borderRadius = (4 * (1 - grow)) + 'px';

      const u = material.uniforms;
      u.uRes.value.set(innerWidth, innerHeight); u.uEarT.value = ear; u.uCell.value = params.cell;
      u.uMarginFrac.value = params.marginFrac;
      u.uBg.value.set(params.bg); u.uDotColor.value.set(params.dotColor);
      renderer.render(scene, camera);
    },
  };
}
