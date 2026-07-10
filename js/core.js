// 모든 섹션이 공유하는 렌더러 · 카메라 · 스무스 스크롤 (three.js 기반)
import * as THREE from 'three';
import Lenis from 'lenis';

export const lenis = new Lenis({ lerp: 0.08, smoothWheel: true });

export const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(2, devicePixelRatio));

export const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 10000);

// index.html 의 <canvas id="gl"> 자리를 three.js 캔버스로 교체
export function mountCanvas() {
  const c = document.getElementById('gl');
  c.replaceWith(renderer.domElement);
  renderer.domElement.id = 'gl';
}

export function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  // 2*dist*tan(fov/2) == viewportHeight  ->  1 world unit = 1px
  camera.position.z = (innerHeight / 2) / Math.tan((camera.fov * Math.PI / 180) / 2);
  camera.updateProjectionMatrix();
  lenis.resize(); // 스크롤 가능 높이 재계산
}
addEventListener('resize', resize);
