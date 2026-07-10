// 섹션: DRAPE — 스크롤 시 상단이 천처럼 접히는 효과 (배경 = assets/works 이미지)
// opts.introCurtain=true면, 진입 시 배경이 픽셀 커튼으로 하양→검정으로 바뀌는 효과가
// 이미지들 "뒤에서" 같이 진행됨(flow 시퀀스에서 pixel → drape로 넘어갈 때 전용 —
// 기존 독립 drape 데모는 그대로 opts 없이 호출되어 이 효과가 안 붙음).
import * as THREE from 'three';
import { renderer, camera, lenis } from '../core.js';

const clamp01 = v => Math.min(1, Math.max(0, v));

const WORKS = [
  'work-eop', 'work-keel', 'work-luray', 'work-penfed-holiday', 'work-penfed-petals',
  'work-penfed-tunnel', 'work-rewind24', 'work-rewind25', 'work-sweater', 'work-wpa',
].map(f => `./assets/works/${f}.webp`);

const VERT = /* glsl */`
  attribute vec3 position; attribute vec2 uv;
  uniform mat4 modelMatrix, viewMatrix, projectionMatrix;
  uniform float uViewHeight, uLensRadius, uMaxAngle, uWaveAmp, uWaveFreq;
  uniform float uZWave, uZWavelength, uFlapLen, uBleedPx, uOnsetPx, uFold, uFoldOffset;
  varying vec2 vUv; varying float vShade;
  void main() {
    vUv = uv;
    vec4 wPos = modelMatrix * vec4(position, 1.0);
    float yFold = uViewHeight * (0.5 - uFold) + uFoldOffset;
    float above = wPos.y - yFold;
    float ab = max(above, 0.0);
    float m = smoothstep(-uBleedPx, uOnsetPx, above);
    float R = uLensRadius, arcLen = R * uMaxAngle, y, z;
    if (ab <= arcLen) { float a = ab / R; y = R*sin(a); z = -R*(1.0-cos(a)); }
    else { float e = ab-arcLen; y = R*sin(uMaxAngle)+e*cos(uMaxAngle); z = -R*(1.0-cos(uMaxAngle))-e*sin(uMaxAngle); }
    float topFade = 1.0 - smoothstep(uFlapLen*0.6, uFlapLen, ab);
    float zWaveBack = sin(ab / uZWavelength);
    z += zWaveBack * uZWave * topFade;
    float band = uFold * uViewHeight;
    float env = sin(clamp(ab/band, 0.0, 1.0) * 3.14159);
    float wHoriz = sin(uv.x * 6.28318 * uWaveFreq);
    z += wHoriz * env * uWaveAmp; y += wHoriz * env * uWaveAmp * 0.3;
    wPos.y = mix(wPos.y, yFold + y, m);
    wPos.z += z * m;
    vShade = clamp(min(ab/R, uMaxAngle)/uMaxAngle + abs(zWaveBack)*topFade*0.12, 0.0, 1.0) * m;
    gl_Position = projectionMatrix * viewMatrix * wPos;
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D tImg; uniform float uImgAspect;
  varying vec2 vUv; varying float vShade;
  vec2 coverUV(vec2 uv, float ia, float ba){        // cover-fit (평면 비율에 맞춰 크롭)
    vec2 s = uv - 0.5; if (ba > ia) s.y *= ia / ba; else s.x *= ba / ia; return s + 0.5;
  }
  void main() {
    vec3 col = texture2D(tImg, coverUV(vUv, uImgAspect, 1280.0 / 853.0)).rgb;
    col *= (1.0 - vShade * 0.55);                    // 접히는 곳 음영
    gl_FragColor = vec4(col, 1.0);
  }
`;

// transition 커튼 — pixel 위로 화면 "아래→위"로 스윕하며 덮는 오버레이.
// 아직 안 덮인 칸(d<=0)은 discard로 아예 안 그려서, 밑에 이미 그려진 pixel 화면이
// 자연스럽게 그대로 보이다가 커튼이 도달한 자리부터만 점점 어둡게 덮임.
const CURTAIN_VERT = /* glsl */`
  attribute vec3 position; attribute vec2 uv;
  varying vec2 vUv;
  // z를 far plane 근처로 박아둠 — 단독 렌더(솔로 drape)에서 이미지 평면들과 같은
  // 깊이버퍼를 공유할 때 항상 이미지 "뒤"가 되도록. 합성(main.js) 구간은 매 레이어마다
  // clearDepth를 하므로 이 z값과 무관하게 항상 올바른 순서로 그려짐.
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }
`;
const CURTAIN_FRAG = /* glsl */`
  precision highp float;
  uniform vec2 uRes;
  uniform float uProgress, uPixel, uScatter;
  uniform vec3 uC0, uC1, uC2, uC3;
  varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  vec3 pick(float r){ return r < 0.25 ? uC0 : r < 0.5 ? uC1 : r < 0.75 ? uC2 : uC3; }
  void main(){
    vec2 grid = uRes / uPixel;
    vec2 cell = floor(vUv * grid);
    float cellY = (cell.y + 0.5) / grid.y;      // 0 = 화면 맨 아래, 1 = 맨 위
    float rnd = hash(cell), rnd2 = hash(cell + 7.0);
    float curtain = uProgress * 1.15;
    float thr = cellY * (1.0 - uScatter) + rnd * uScatter;
    float d = curtain - thr;
    if (d <= 0.0) discard;                       // 아직 안 덮인 자리 — 밑의 pixel이 그대로 보임
    float edge = smoothstep(0.12, 0.0, d);
    vec3 col = mix(vec3(0.0), pick(rnd2), edge);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createDrape(opts = {}) {
  const introCurtain = !!opts.introCurtain;
  const IMG_W = 710, IMG_H = IMG_W / (1280 / 853), GAP = 40, COUNT = 10, TOP_PAD = 120, SEG = 60;

  // 디자이너 조정용 파라미터
  const params = {
    uFold: 0.15, uMaxAngle: 1.0472, uLensRadius: 90,
    uWaveAmp: 18, uZWave: 26, uZWavelength: 78, uFlapLen: 760,
    foldMax: 50, foldGain: 1.6,
  };
  const controls = [
    { key: 'uFold', min: 0.05, max: 0.4, step: 0.01, info: 'Where the cloth starts folding (from top). Lower = higher up.' },
    { key: 'uMaxAngle', min: 0.3, max: 1.57, step: 0.01, info: 'Max fold-back angle (rad). 1.05≈60°, 1.57≈90°.' },
    { key: 'uLensRadius', min: 40, max: 200, step: 1, info: 'Fold curvature radius. Smaller = sharper.' },
    { key: 'uWaveAmp', min: 0, max: 60, step: 1, info: 'Side-to-side ripple size at the top (px).' },
    { key: 'uZWave', min: 0, max: 60, step: 1, info: 'Depth (z) ripple of the folded flap.' },
    { key: 'uZWavelength', min: 20, max: 160, step: 1, info: 'z ripple wavelength. Larger = gentler.' },
    { key: 'uFlapLen', min: 200, max: 1200, step: 10, info: 'Folded flap length; fades out above this.' },
    { key: 'foldMax', min: 0, max: 120, step: 1, info: 'Max downward dip while scrolling (px).' },
    { key: 'foldGain', min: 0, max: 4, step: 0.1, info: 'How strongly scroll speed dips the fold.' },
  ];

  if (introCurtain) {
    Object.assign(params, {
      curtainPixel: 20, curtainScatter: 0.22, curtainRange: 700, entryDrop: 300,
      curtainC0: '#0E0E10', curtainC1: '#414143', curtainC2: '#767678', curtainC3: '#C4C4C5',
    });
    controls.push(
      { key: 'curtainPixel', min: 6, max: 60, step: 2, info: 'Intro curtain pixel size (px).' },
      { key: 'curtainScatter', min: 0, max: 0.6, step: 0.02, info: 'Intro curtain edge randomness.' },
      { key: 'curtainRange', min: 200, max: 1600, step: 50, info: 'How much scroll (px) it takes for the curtain to finish sweeping bottom→top over pixel.' },
      { key: 'entryDrop', min: 0, max: 800, step: 10, info: 'Extra px the images start lower by at the handoff\'s start, easing to 0 by its end — makes them rise from further below.' },
      { key: 'curtainC0', color: true, info: 'Intro curtain pixel color 1.' },
      { key: 'curtainC1', color: true, info: 'Intro curtain pixel color 2.' },
      { key: 'curtainC2', color: true, info: 'Intro curtain pixel color 3.' },
      { key: 'curtainC3', color: true, info: 'Intro curtain pixel color 4.' },
    );
  }

  // 이미지 평면들(scene)과 transition 커튼(curtainScene)을 별도 scene으로 분리 — main.js가
  // pixel → curtain → drape 이미지 순으로 겹쳐 그릴 때(핸드오프) 각각 따로 호출할 수 있게.
  const scene = new THREE.Scene();
  const curtainScene = new THREE.Scene();
  const geo = new THREE.PlaneGeometry(IMG_W, IMG_H, SEG, SEG);

  let curtainMaterial = null;
  if (introCurtain) {
    curtainMaterial = new THREE.RawShaderMaterial({
      vertexShader: CURTAIN_VERT, fragmentShader: CURTAIN_FRAG, side: THREE.DoubleSide,
      uniforms: {
        uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, uProgress: { value: 0 },
        uPixel: { value: params.curtainPixel }, uScatter: { value: params.curtainScatter },
        uC0: { value: new THREE.Color(params.curtainC0) }, uC1: { value: new THREE.Color(params.curtainC1) },
        uC2: { value: new THREE.Color(params.curtainC2) }, uC3: { value: new THREE.Color(params.curtainC3) },
      },
    });
    const curtainMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), curtainMaterial);
    curtainMesh.frustumCulled = false;
    curtainScene.add(curtainMesh);
  }

  const el = document.createElement('section');
  el.id = 'sec-drape';
  const scroller = document.createElement('div');
  scroller.id = 'scroller';
  scroller.style.paddingTop = TOP_PAD + 'px';
  el.appendChild(scroller);

  const items = [];
  for (let i = 0; i < COUNT; i++) {
    const d = document.createElement('div'); d.className = 'item'; scroller.appendChild(d);
    // 이 평면의 배경 이미지 (assets/works)
    const tex = new THREE.Texture();
    const uni = {
      tImg: { value: tex }, uImgAspect: { value: 1280 / 853 }, uViewHeight: { value: innerHeight },
      uLensRadius: { value: params.uLensRadius }, uMaxAngle: { value: params.uMaxAngle }, uFold: { value: params.uFold },
      uWaveAmp: { value: params.uWaveAmp }, uWaveFreq: { value: 1.0 },
      uZWave: { value: params.uZWave }, uZWavelength: { value: params.uZWavelength }, uFlapLen: { value: params.uFlapLen },
      uBleedPx: { value: 25 }, uOnsetPx: { value: 60 }, uFoldOffset: { value: 0 },
    };
    const im = new Image();
    im.onload = () => { tex.image = im; tex.needsUpdate = true; uni.uImgAspect.value = im.naturalWidth / im.naturalHeight; };
    im.src = WORKS[i % WORKS.length];
    const material = new THREE.RawShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, uniforms: uni });
    const mesh = new THREE.Mesh(geo, material); scene.add(mesh);
    items.push({ mesh, rel: TOP_PAD + i * (IMG_H + GAP) + IMG_H / 2 });
  }
  scroller.style.paddingBottom = innerHeight + 'px';

  const fade = document.createElement('div'); fade.className = 'top-fade'; document.body.appendChild(fade);

  let foldOffset = 0;

  // curtainRange만큼 base(drape 시작점) "이전"부터 진행되어 s===base에 딱 다 스윕되게.
  // (예전엔 s>=base부터 진행이라 drape 진입 직후 한동안 백지처럼 보이는 버그가 있었음)
  function computeIntroP(s, base) {
    if (!curtainMaterial) return 1;
    return clamp01((s - base) / params.curtainRange + 1);
  }

  function updateCurtain(s, base) {
    const introP = computeIntroP(s, base);
    const cu = curtainMaterial.uniforms;
    cu.uRes.value.set(innerWidth, innerHeight); cu.uProgress.value = introP;
    cu.uPixel.value = params.curtainPixel; cu.uScatter.value = params.curtainScatter;
    cu.uC0.value.set(params.curtainC0); cu.uC1.value.set(params.curtainC1);
    cu.uC2.value.set(params.curtainC2); cu.uC3.value.set(params.curtainC3);
    fade.style.opacity = introP >= 1 ? '1' : '0';
    return introP;
  }

  function updateImages(now, s, introP) {
    foldOffset += (-Math.min(Math.abs(lenis.velocity) * params.foldGain, params.foldMax) - foldOffset) * 0.1;
    const base = el.offsetTop;
    // 핸드오프 시작 시점엔 이미지들을 entryDrop만큼 더 아래서 시작시키고, 진행될수록
    // (introP→1) 그 여분을 0으로 줄여 평소 스크롤 위치와 자연스레 이어지게.
    const entryLift = curtainMaterial ? (1 - introP) * (params.entryDrop || 0) : 0;
    for (const { mesh, rel } of items) {
      mesh.position.y = innerHeight / 2 - ((base + rel) - s) - entryLift;
      const u = mesh.material.uniforms;
      u.uViewHeight.value = innerHeight; u.uFoldOffset.value = foldOffset;
      u.uFold.value = params.uFold; u.uMaxAngle.value = params.uMaxAngle; u.uLensRadius.value = params.uLensRadius;
      u.uWaveAmp.value = params.uWaveAmp; u.uZWave.value = params.uZWave;
      u.uZWavelength.value = params.uZWavelength; u.uFlapLen.value = params.uFlapLen;
    }
  }

  return {
    id: 'drape', label: 'drape', hint: 'scroll ↓', el, params, controls,
    // introCurtain 있는 인스턴스(flow)는 fade를 updateCurtain()에서 커튼 진행도로 직접 제어함
    // (transition이 끝나는 순간 나타나야 하므로) — 독립 데모는 그대로 즉시 on/off.
    onEnter() { if (!curtainMaterial) fade.style.opacity = '1'; },
    onLeave() { fade.style.opacity = '0'; },
    // 단독(솔로) 렌더 — 커튼과 이미지를 한 프레임에서 순서대로. 서로 다른 깊이(커튼은 far
    // plane 근처)라 depth buffer가 자연스럽게 이미지를 커튼 위에 그려줘서 clearDepth 불필요.
    render(now, s) {
      const base = el.offsetTop;
      let introP = 1;
      if (curtainMaterial) { introP = updateCurtain(s, base); renderer.render(curtainScene, camera); }
      updateImages(now, s, introP);
      renderer.render(scene, camera);
    },
    // 아래 두 개는 main.js가 pixel → transition → drape 이미지 순으로 합성 렌더할 때(핸드오프
    // 구간)만 따로 호출함 — 그 사이 pixel 레이어가 끼어들어야 해서 한 번에 못 그림.
    renderCurtain(s) {
      if (!curtainMaterial) return 1;
      const base = el.offsetTop;
      const introP = updateCurtain(s, base);
      renderer.render(curtainScene, camera);
      return introP;
    },
    renderImages(now, s) {
      const base = el.offsetTop;
      updateImages(now, s, computeIntroP(s, base));
      renderer.render(scene, camera);
    },
  };
}
