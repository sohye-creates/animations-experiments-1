// 섹션: DOT MODEL — GLB 3D 모델을 "점점이 패턴식 음영"(오더드 디더링)으로 그리고, 가만히
// idle 회전하다가 마우스 위치에 따라 기울어짐. newdays.work에서 관찰한 기법을 참고해 포팅:
// 3D를 평범하게 라이팅해서 밝기(그레이스케일)를 구한 뒤, 화면 좌표 기준 4x4 Bayer(오더드
// 디더링) 행렬로 그 밝기를 "찍을까 말까"로 이진화 — 그래서 형태는 회전해도 점 패턴 자체는
// 화면에 고정되어 보임(오브젝트 표면 UV가 아니라 gl_FragCoord로 판정하기 때문).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { renderer, camera } from '../core.js';

const clamp01 = v => Math.min(1, Math.max(0, v));

// 표준 4x4 Bayer(오더드 디더링) 임계값 행렬 — 컴퓨터 그래픽스의 일반적인 공개 기법(특정
// 사이트의 창작물이 아니라 교과서적인 알고리즘). WebGL1 호환을 위해 동적 배열 인덱싱 대신
// if/else 분기로 구현.
const BAYER_GLSL = /* glsl */`
  float bayerThreshold(vec2 screenPos, float cell) {
    vec2 p = mod(floor(screenPos / cell), 4.0);
    int x = int(p.x), y = int(p.y);
    if (x == 0) {
      if (y == 0) return 0.0 / 16.0;
      if (y == 1) return 8.0 / 16.0;
      if (y == 2) return 2.0 / 16.0;
      return 10.0 / 16.0;
    } else if (x == 1) {
      if (y == 0) return 12.0 / 16.0;
      if (y == 1) return 4.0 / 16.0;
      if (y == 2) return 14.0 / 16.0;
      return 6.0 / 16.0;
    } else if (x == 2) {
      if (y == 0) return 3.0 / 16.0;
      if (y == 1) return 11.0 / 16.0;
      if (y == 2) return 1.0 / 16.0;
      return 9.0 / 16.0;
    } else {
      if (y == 0) return 15.0 / 16.0;
      if (y == 1) return 7.0 / 16.0;
      if (y == 2) return 13.0 / 16.0;
      return 5.0 / 16.0;
    }
  }
`;

const VERT = /* glsl */`
  attribute vec3 position; attribute vec3 normal; attribute vec2 uv;
  uniform mat4 modelMatrix, viewMatrix, projectionMatrix;
  uniform mat3 normalMatrix;
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;
// baked 텍스처(assets/chatter.glb의 Baked_BaseColor, 2048x2048)를 실제로 뜯어서 살펴보고 찾은
// "진짜 눈동자" 4곳의 UV 사각형. 어두운 곳 전부를 눈동자로 치면(밝기만으로 판정) 입 안쪽의
// 삼각형 빈 공간처럼 그냥 어두운 다른 부분까지 같이 걸려버리고, 구 표면(눈알)의 곡률 때문에
// 화면 기준 법선으로 앞/뒤를 가르면 눈동자 원이 반달처럼 잘려버림 — 그래서 밝기 대신
// "텍스처 위 정확히 이 네 자리에 있는가"로만 판정.
const EYE_RECTS_GLSL = /* glsl */`
  bool inEyeRect(vec2 uv) {
    if (uv.x > 0.5625 && uv.x < 0.6133 && uv.y > 0.0547 && uv.y < 0.1035) return true;
    if (uv.x > 0.1973 && uv.x < 0.2578 && uv.y > 0.0566 && uv.y < 0.1172) return true;
    if (uv.x > 0.3066 && uv.x < 0.3555 && uv.y > 0.0918 && uv.y < 0.1426) return true;
    if (uv.x > 0.8691 && uv.x < 0.9297 && uv.y > 0.1309 && uv.y < 0.1895) return true;
    return false;
  }
`;
const FRAG = /* glsl */`
  precision highp float;
  uniform float uCell, uAmbient, uDiffuse, uUseMap, uPupilThreshold;
  uniform vec3 uLightDir, uInk, uBg, uPupilInk;
  uniform sampler2D uBaseColorMap;
  varying vec3 vNormal;
  varying vec2 vUv;
  ${BAYER_GLSL}
  ${EYE_RECTS_GLSL}
  void main() {
    float lambert = max(0.0, dot(normalize(vNormal), normalize(uLightDir)));
    float brightness = clamp(uAmbient + lambert * uDiffuse, 0.0, 1.0);
    float thr = bayerThreshold(gl_FragCoord.xy, uCell);
    float dotOn = step(thr, brightness);
    float texLuma = dot(texture2D(uBaseColorMap, vUv).rgb, vec3(0.299, 0.587, 0.114));
    float isPupil = uUseMap * step(texLuma, uPupilThreshold) * (inEyeRect(vUv) ? 1.0 : 0.0);
    vec3 ink = mix(uInk, uPupilInk, isPupil);
    gl_FragColor = vec4(mix(uBg, ink, dotOn), 1.0);
  }
`;

export function createDotModel() {
  const MODEL_SRC = './assets/chatter.glb';

  const params = {
    cell: 5, targetSize: 450, offsetY: -110,
    ambient: 0.18, diffuse: 1.0,
    lightX: 0.5, lightY: 0.8, lightZ: 0.6,
    idleSpeed: 0.35, idleAmpY: 0.16, idleAmpX: 0.08, tiltMax: 0.5, tiltEase: 0.06,
    spinRange: Math.PI * 2,
    baseTiltX: 0.25, baseTiltY: 1.335,
    pupilThreshold: 0.15,
    ink: '#C6F000', bg: '#0B0B0C', pupilInk: '#000000',
  };
  const controls = [
    { key: 'cell', min: 2, max: 16, step: 1, info: 'Dither dot grid size (px) — bigger = chunkier dots.' },
    { key: 'targetSize', min: 100, max: 700, step: 10, info: 'Model is auto-scaled so its longest side is this many px.' },
    { key: 'offsetY', min: -300, max: 300, step: 5, info: 'Vertical position offset (px) — negative moves it down the screen.' },
    { key: 'ambient', min: 0, max: 1, step: 0.02, info: 'Minimum brightness even on unlit faces.' },
    { key: 'diffuse', min: 0, max: 2, step: 0.05, info: 'How strongly the single light affects brightness.' },
    { key: 'lightX', min: -1, max: 1, step: 0.05, info: 'Light direction X.' },
    { key: 'lightY', min: -1, max: 1, step: 0.05, info: 'Light direction Y.' },
    { key: 'lightZ', min: -1, max: 1, step: 0.05, info: 'Light direction Z.' },
    { key: 'idleSpeed', min: 0, max: 1.5, step: 0.01, info: 'Idle sway speed — how fast it wanders left/right and up/down.' },
    { key: 'idleAmpY', min: 0, max: 0.6, step: 0.01, info: 'Idle sway amount (rad) left/right, around Y.' },
    { key: 'idleAmpX', min: 0, max: 0.6, step: 0.01, info: 'Idle sway amount (rad) up/down, around X.' },
    { key: 'tiltMax', min: 0, max: 1.2, step: 0.02, info: 'Max nod angle (rad) toward the mouse (up/down mouse → X tilt).' },
    { key: 'spinRange', min: 0, max: 12.56, step: 0.1, info: 'Total Y-axis spin range (rad) across the full screen width — 6.28 = one full 360° turn edge-to-edge.' },
    { key: 'tiltEase', min: 0.01, max: 0.3, step: 0.01, info: 'How quickly the tilt/spin eases toward the mouse target. Lower = smoother/slower.' },
    { key: 'baseTiltX', min: -1, max: 1, step: 0.02, info: 'Resting/default tilt (rad) around X, on top of the mouse-driven tilt — positive leans the front toward the viewer.' },
    { key: 'baseTiltY', min: -3.14, max: 3.14, step: 0.02, info: 'Resting/default rotation (rad) around Y — where the idle sway/spin is centered (e.g. near-profile view).' },
    { key: 'pupilThreshold', min: 0, max: 0.6, step: 0.02, info: 'How dark a spot inside the eye UV regions must be to count as a pupil and use pupilInk instead of ink.' },
    { key: 'ink', color: true, info: 'Dot color.' },
    { key: 'bg', color: true, info: 'Background color (between dots).' },
    { key: 'pupilInk', color: true, info: 'Ink color used only where the model\'s baked texture is dark inside the real eye UV regions.' },
  ];

  const el = document.createElement('section'); el.id = 'sec-dot-model';

  const scene = new THREE.Scene();

  // sampler2D 유니폼은 항상 뭔가에 바인딩돼 있어야 하므로, 실제 텍스처가 로드되기 전까지
  // 쓰는 1x1 더미(투명/검정) 텍스처. uUseMap이 0이면 셰이더에서 어차피 안 씀.
  const dummyTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  dummyTex.needsUpdate = true;

  const material = new THREE.RawShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    uniforms: {
      uCell: { value: params.cell }, uAmbient: { value: params.ambient }, uDiffuse: { value: params.diffuse },
      uLightDir: { value: new THREE.Vector3(params.lightX, params.lightY, params.lightZ) },
      uInk: { value: new THREE.Color(params.ink) }, uBg: { value: new THREE.Color(params.bg) },
      uPupilInk: { value: new THREE.Color(params.pupilInk) }, uPupilThreshold: { value: params.pupilThreshold },
      uBaseColorMap: { value: dummyTex }, uUseMap: { value: 0 },
    },
  });

  const group = new THREE.Group();
  scene.add(group);
  let modelReady = false;

  new GLTFLoader().load(MODEL_SRC, (gltf) => {
    const root = gltf.scene;
    let baseColorMap = null;
    root.traverse(child => {
      if (child.isMesh) {
        // 커스텀 셰이더로 바꾸기 전에, GLTFLoader가 만들어둔 원래 재질의 baseColor 텍스처를
        // 확보 — 눈동자(검은 부분)를 그 텍스처의 밝기로 골라내는 데 씀.
        if (!baseColorMap && child.material?.map) baseColorMap = child.material.map;
        child.material = material;
      }
    });
    if (baseColorMap) { material.uniforms.uBaseColorMap.value = baseColorMap; material.uniforms.uUseMap.value = 1; }

    // 모델을 원점에 중심 맞추고, 가장 긴 변이 targetSize(px)가 되도록 스케일 자동 조정.
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    root.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = params.targetSize / maxDim;
    root.scale.setScalar(scale);
    baseScale = scale; baseMaxDim = maxDim;

    group.add(root);
    modelReady = true;
  }, undefined, (err) => console.error('[dotModel] GLB load failed', err));

  let baseScale = 1, baseMaxDim = 1;

  // 마우스 위치 추적 — pattern.js/pixel.js와 같은 패턴.
  let mx = 0.5, my = 0.5;
  addEventListener('pointermove', e => { mx = e.clientX / innerWidth; my = e.clientY / innerHeight; });

  let tiltX = 0, spinY = 0;

  return {
    id: 'dot-model', label: 'dot model', hint: 'move your mouse — drag left/right to spin it all the way around', el, params, controls,
    onEnter() {},
    onLeave() {},
    render(now) {
      const t = now / 1000;
      // 계속 한 방향으로 도는 대신, 서로 다른(딱 안 맞는 비율의) 두 개의 사인파로 좌우/위아래를
      // 살짝 오가게 함 — 진동수 비율이 어긋나 있어서 똑같은 패턴이 반복되는 느낌이 덜함.
      const idleY = Math.sin(t * params.idleSpeed) * params.idleAmpY;
      const idleX = Math.sin(t * params.idleSpeed * 0.63 + 1.3) * params.idleAmpX;
      // 마우스 좌우(mx)는 Y축을 spinRange만큼(기본 2π = 360도) 전부 돌림 — 화면 이쪽 끝에서
      // 저쪽 끝까지 움직이면 모델을 한 바퀴 다 볼 수 있게.
      const targetSpinY = (mx - 0.5) * params.spinRange;
      const targetTiltX = (my - 0.5) * 2 * params.tiltMax;
      tiltX += (targetTiltX - tiltX) * params.tiltEase;
      spinY += (targetSpinY - spinY) * params.tiltEase;
      // baseTiltX/baseTiltY: 마우스가 정중앙이고 sway가 0일 때도 걸려 있는 기본 자세 — 정면이
      // 아니라 화면 앞쪽으로 살짝, 그리고 거의 옆모습에 가깝게.
      group.rotation.set(tiltX + params.baseTiltX + idleX, params.baseTiltY + idleY + spinY, 0);
      group.position.set(0, params.offsetY, 0);

      if (modelReady && params.targetSize !== baseScale * baseMaxDim) {
        const scale = params.targetSize / baseMaxDim;
        group.children[0]?.scale.setScalar(scale);
      }

      const u = material.uniforms;
      u.uCell.value = params.cell; u.uAmbient.value = params.ambient; u.uDiffuse.value = params.diffuse;
      u.uLightDir.value.set(params.lightX, params.lightY, params.lightZ);
      u.uInk.value.set(params.ink); u.uBg.value.set(params.bg);
      u.uPupilInk.value.set(params.pupilInk); u.uPupilThreshold.value = params.pupilThreshold;

      renderer.render(scene, camera);
    },
  };
}
