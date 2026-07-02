// 모든 섹션이 공유하는 렌더러 · 카메라 · 스무스 스크롤
import { Renderer, Camera } from 'ogl';
import Lenis from 'lenis';

export const lenis = new Lenis({ lerp: 0.08, smoothWheel: true });

export const renderer = new Renderer({ alpha: true, dpr: Math.min(2, devicePixelRatio) });
export const gl = renderer.gl;
gl.clearColor(0, 0, 0, 0);

export const camera = new Camera(gl, { fov: 45, near: 1, far: 10000 });

// index.html 의 <canvas id="gl"> 자리를 OGL 캔버스로 교체
export function mountCanvas() {
  const c = document.getElementById('gl');
  c.replaceWith(gl.canvas);
  gl.canvas.id = 'gl';
}

export function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.perspective({ aspect: innerWidth / innerHeight, near: 1, far: 10000 });
  // 2*dist*tan(fov/2) == viewportHeight  ->  1 world unit = 1px
  camera.position.z = (innerHeight / 2) / Math.tan((camera.fov * Math.PI / 180) / 2);
  lenis.resize(); // 스크롤 가능 높이 재계산
}
addEventListener('resize', resize);
