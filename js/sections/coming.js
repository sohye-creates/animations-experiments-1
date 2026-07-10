// 섹션: WARP TEXT — 노이즈 자율 모션 + 마우스 스프링 추적 + 하프톤
// morable.co (Unicorn Studio) 설정 참고:
//   noise speed 0.25 / trackMouse 0.12 / mouseMomentum 0.8 / mouseSpring 0.58
import * as THREE from 'three';
import { renderer, camera } from '../core.js';
import { textTexture } from '../text.js';

const VERT = /* glsl */`
  attribute vec3 position; attribute vec2 uv;
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D tText;
  uniform vec2 uRes;
  uniform vec2 uMouse;      // 스프링으로 부드럽게 따라온 마우스(0..1, y up)
  uniform float uTime, uTexAspect;
  uniform float uFollow, uIdle, uRepel, uSpeed, uNoiseScale;
  varying vec2 vUv;

  float vnoise(vec2 p){
    vec2 i=floor(p), f=fract(p);
    float a=fract(sin(dot(i,vec2(127.1,311.7)))*43758.5453);
    float b=fract(sin(dot(i+vec2(1,0),vec2(127.1,311.7)))*43758.5453);
    float c=fract(sin(dot(i+vec2(0,1),vec2(127.1,311.7)))*43758.5453);
    float d=fract(sin(dot(i+vec2(1,1),vec2(127.1,311.7)))*43758.5453);
    vec2 u=f*f*(3.0-2.0*f);
    return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
  }

  void main(){
    vec2 uv = vUv;
    vec2 c = uv - 0.5; c.x *= uRes.x / uRes.y;   // 비율 보정
    vec2 mo = uMouse - 0.5; mo.x *= uRes.x / uRes.y;

    c -= mo * uFollow;                            // 커서 쪽으로 끌림(trackMouse)

    float t = uTime * uSpeed;                     // 자율 노이즈
    vec2 nd = vec2(vnoise(c*uNoiseScale + t), vnoise(c*uNoiseScale + 7.3 - t)) - 0.5;
    c += nd * uIdle;

    float d = length(c - mo);                     // 커서 근처 국소 왜곡
    float infl = smoothstep(0.42, 0.0, d);
    c += normalize(c - mo + 1e-4) * infl * uRepel;

    float W = 0.36 * (uRes.x / uRes.y);           // 글자 폭 ≈ 화면 너비의 72%
    float H = W / uTexAspect;
    vec2 tuv = vec2(c.x/(2.0*W), c.y/(2.0*H)) + 0.5;
    float tin = step(0.0,tuv.x)*step(tuv.x,1.0)*step(0.0,tuv.y)*step(tuv.y,1.0);
    float a = texture2D(tText, tuv).a * tin;

    vec2 g = uv * uRes / 5.0;                      // 하프톤 도트
    float dot = smoothstep(0.5, 0.42, length(fract(g)-0.5));
    a *= (0.8 + 0.2 * dot);

    vec3 bg = mix(vec3(0.02,0.02,0.045), vec3(0.07,0.05,0.11),
                  uv.y + 0.12*sin(uTime*uSpeed + uv.x*2.0));
    vec3 col = mix(bg, vec3(1.0), a);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createComing() {
  const params = { uFollow: 0.12, uIdle: 0.045, uRepel: 0.045, uSpeed: 0.25, uNoiseScale: 3.0 };
  const controls = [
    { key: 'uFollow', min: 0, max: 0.4, step: 0.01, info: 'How much the text drifts toward the cursor.' },
    { key: 'uIdle', min: 0, max: 0.15, step: 0.005, info: 'Idle wobble amount (moves on its own).' },
    { key: 'uRepel', min: 0, max: 0.15, step: 0.005, info: 'Distortion strength near the cursor.' },
    { key: 'uSpeed', min: 0, max: 1, step: 0.02, info: 'Idle noise flow speed.' },
    { key: 'uNoiseScale', min: 1, max: 8, step: 0.2, info: 'Noise detail. Larger = finer ripples.' },
  ];

  const scene = new THREE.Scene();
  const { tex, aspect } = textTexture('WORKS KEPT SECRET');
  const material = new THREE.RawShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    uniforms: {
      tText: { value: tex }, uTexAspect: { value: aspect },
      uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, uMouse: { value: new THREE.Vector2(0.5, 0.5) }, uTime: { value: 0 },
      uFollow: { value: params.uFollow }, uIdle: { value: params.uIdle }, uRepel: { value: params.uRepel },
      uSpeed: { value: params.uSpeed }, uNoiseScale: { value: params.uNoiseScale },
    },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const el = document.createElement('section'); el.id = 'sec-coming';

  // 마우스 스프링 추종 (spring 0.58 / momentum 0.8 참고)
  let tmx = 0.5, tmy = 0.5, mx = 0.5, my = 0.5, vmx = 0, vmy = 0;
  addEventListener('pointermove', e => { tmx = e.clientX / innerWidth; tmy = 1 - e.clientY / innerHeight; });

  return {
    id: 'coming', label: 'warp text', hint: 'move cursor ✦', el, params, controls,
    render(now) {
      vmx += (tmx - mx) * 0.2; vmx *= 0.8; mx += vmx;
      vmy += (tmy - my) * 0.2; vmy *= 0.8; my += vmy;
      const u = material.uniforms;
      u.uTime.value = (now || 0) / 1000; u.uMouse.value.set(mx, my); u.uRes.value.set(innerWidth, innerHeight);
      u.uFollow.value = params.uFollow; u.uIdle.value = params.uIdle; u.uRepel.value = params.uRepel;
      u.uSpeed.value = params.uSpeed; u.uNoiseScale.value = params.uNoiseScale;
      renderer.render(scene, camera);
    },
  };
}
