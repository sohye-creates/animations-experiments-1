// 섹션: WHITE OUT — video-reveal의 풀스크린 비디오가 픽셀 커튼과 함께 하양으로 dissolve됨.
// (그 다음이 Client/Partners 섹션 자리인데, 이번 범위에는 포함하지 않고 여기서 마무리)
import * as THREE from 'three';
import { renderer, camera } from '../core.js';

const clamp01 = v => Math.min(1, Math.max(0, v));

const VERT = /* glsl */`
  attribute vec3 position; attribute vec2 uv;
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform vec2 uRes;
  uniform float uProgress, uPixel, uScatter;
  varying vec2 vUv;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

  void main(){
    vec2 grid = uRes / uPixel;
    vec2 cell = floor(vUv * grid);
    float cellY = (cell.y + 0.5) / grid.y;
    float rnd = hash(cell);
    float thr = cellY * (1.0 - uScatter) + rnd * uScatter;
    float curtain = uProgress * 1.15;
    vec3 col = mix(vec3(0.04), vec3(1.0), step(thr, curtain));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createWhiteOut(videoEl) {
  const params = {
    pixel: 20, scatter: 0.25, curtainEnd: 0.75, videoFadeEnd: 0.5,
  };
  const controls = [
    { key: 'pixel', min: 6, max: 60, step: 2, info: 'Pixel square size (px).' },
    { key: 'scatter', min: 0, max: 0.6, step: 0.02, info: 'Curtain edge randomness.' },
    { key: 'curtainEnd', min: 0.3, max: 1, step: 0.02, info: 'Scroll point where white fully covers.' },
    { key: 'videoFadeEnd', min: 0.1, max: 1, step: 0.02, info: 'Scroll point where the video is fully faded out.' },
  ];

  const scene = new THREE.Scene();
  const material = new THREE.RawShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    uniforms: {
      uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, uProgress: { value: 0 },
      uPixel: { value: params.pixel }, uScatter: { value: params.scatter },
    },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false; scene.add(mesh);

  const el = document.createElement('section'); el.id = 'sec-white-out';

  return {
    id: 'white-out', label: 'flow · white', hint: 'scroll ↓', el, params, controls,
    onEnter() { if (videoEl) videoEl.style.display = 'block'; },
    onLeave() { if (videoEl) videoEl.style.opacity = '1'; },
    render(now, s) {
      const range = Math.max(1, el.offsetHeight - innerHeight);
      const p = clamp01((s - el.offsetTop) / range);
      if (videoEl) videoEl.style.opacity = String(1 - clamp01(p / params.videoFadeEnd));

      const u = material.uniforms;
      u.uRes.value.set(innerWidth, innerHeight); u.uProgress.value = p / params.curtainEnd;
      u.uPixel.value = params.pixel; u.uScatter.value = params.scatter;
      renderer.render(scene, camera);
    },
  };
}
