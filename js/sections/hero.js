// 섹션: HERO — 소용돌이 배경 위에 "WORSTKEPTSECRET" 두 겹 원형 텍스트가 회전(둘 다 완벽한 원, 왜곡 없음).
// 배경은 블랙홀로 빨려드는 듯한 pixelated 로그 스파이럴. 안쪽 원 내부에는 그와 별개로,
// 빗방울 모양 띠(strip) 텍스처를 극좌표로 감아서 만든 소용돌이(디자이너 레퍼런스 그대로 포팅)가
// 안쪽 원 둘레에서 시작해 중심(키홀)으로 갈수록 얇아지고 어두워지며 빨려든다.
// 스크롤하면 키홀(SVG)이 화면을 덮을 만큼 커지며(+ 줌인) 다음 섹션으로 전환됨.
// (참고: flow 시퀀스의 hero 자리는 이제 heroPixels.js가 대체 — 이 파일은 코드 보존용)
import * as THREE from 'three';
import { renderer, camera } from '../core.js';

const WORD = 'WORSTKEPTSECRET';
const RING_REPEATS = 2;          // 원 한 바퀴에 문구가 두 번 반복
const RING_R_FRAC = 0.34;        // 베이크 텍스처 안에서 원형 텍스트의 반지름(0..0.5)
const LETTER_GAP_FRAC = 0.16;    // 글자 사이 살짝 띄우기(폰트 크기에 비례)

// 원형으로 휘어진 문구를 정사각 캔버스에 그려 텍스처로 만듦(한 번만 베이크, 안/밖 원에서 재사용)
function ringTextTexture(text, repeats, radiusFrac, size = 2048) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const R = size * radiusFrac;
  const full = text.repeat(repeats);

  let fs = size * 0.05;
  const setFont = () => { ctx.font = `700 ${fs}px 'Aeonik', system-ui, sans-serif`; };
  const totalWidth = () => { let w = 0; for (const ch of full) w += ctx.measureText(ch).width + fs * LETTER_GAP_FRAC; return w; };
  setFont();
  fs *= (2 * Math.PI * R) / totalWidth();   // 문구+간격이 정확히 360°를 채우도록 폰트 크기 보정
  setFont();

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-Math.PI / 2);   // 12시 방향부터 시작
  for (const ch of full) {
    const a = (ctx.measureText(ch).width + fs * LETTER_GAP_FRAC) / R;
    ctx.rotate(a / 2);
    ctx.save();
    ctx.translate(0, -R);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    ctx.rotate(a / 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// 인라인 SVG(키홀 아이콘) → 알파 마스크 텍스처
const KEYHOLE_SVG = '<svg width="48" height="72" viewBox="0 0 48 72" xmlns="http://www.w3.org/2000/svg">'
  + '<path d="M36 6H42V24H36V42H42V54H48V72H0V54H6V42H12V24H6V6H12V0H36V6Z" fill="#fff"/></svg>';

function svgAlphaTex(svgStr, height = 512) {
  const tex = new THREE.Texture();
  tex.generateMipmaps = false;
  const info = { tex, aspect: 48 / 72 };
  const img = new Image();
  img.onload = () => {
    const w = Math.round(height * img.naturalWidth / img.naturalHeight);
    const c = document.createElement('canvas'); c.width = w; c.height = height;
    c.getContext('2d').drawImage(img, 0, 0, w, height);
    info.tex.image = c; info.tex.needsUpdate = true; info.aspect = w / height;
  };
  img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svgStr);
  return info;
}

// 소용돌이 "띠(strip)" 텍스처(assets/vortex-strip.png, 1024x256) — 극좌표로 감아서 샘플링됨.
// x축 = 각도(0..2π, seamless 반복), y축 = 중심 홀(0)→안쪽 원 둘레(1) 반지름. 아래쪽(1)이 굵고 위쪽(0)이 뾰족.
function vortexStripTex() {
  const tex = new THREE.Texture();
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  const img = new Image();
  img.onload = () => { tex.image = img; tex.needsUpdate = true; };
  img.src = './assets/vortex-strip.png';
  return tex;
}

const VERT = /* glsl */`
  attribute vec3 position; attribute vec2 uv;
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D tRing, tHole, tVortex;
  uniform vec2 uRes;
  uniform float uOuterAngle, uOuterR, uInnerAngle, uInnerR;
  uniform float uPixelCell, uBgArms, uBgTwist;
  uniform float uVortexPhase, uVortexTwist, uVortexFocus, uVortexHole, uVortexPixel, uVortexScale, uZoom;
  uniform float uHoleW, uHoleH, uOpenT, uGlowStrength;
  uniform vec3 uTextColor, uKeyholeColor, uHoleFill, uGlowColor;
  varying vec2 vUv;

  vec2 pixelSnap(vec2 c, float cell){
    return (floor(c / cell) + 0.5) * cell;
  }

  // 블랙홀로 빨려드는 듯한 로그 스파이럴(팔이 중심에 가까울수록 빠르게 휘감김) — 격자 스냅으로 pixelated, 살짝 부드러운 엣지
  // darken은 안쪽 원(fadeR) 안에서만 어두워지고, 그 밖(원 바깥)은 그라데이션 없이 평평함
  vec3 background(vec2 c, float fadeR){
    vec2 cc = pixelSnap(c, uPixelCell);
    float r = length(cc);
    float theta = atan(cc.y, cc.x);
    float twist = uBgTwist * log(max(r, 1.0));
    float arm = sin(theta * uBgArms - twist);
    float band = smoothstep(-0.08, 0.08, arm);   // 얇은 anti-alias 폭만 남긴 거의 하드엣지 줄무늬
    float darken = smoothstep(0.0, fadeR, r);
    return mix(vec3(0.0), vec3(0.16), band) * darken;
  }

  // 키홀 뒤 radial glow: 중심 어둡고 바깥으로 밝아지다가 소용돌이 바깥 경계에서 opacity 0으로 사라짐
  vec3 keyholeGlow(vec2 c, float vortexR){
    float t = clamp(length(c) / vortexR, 0.0, 1.0);
    float b = pow(t, 1.6);                          // 중심 근처에선 천천히 밝아짐
    float fade = 1.0 - smoothstep(0.55, 0.95, t);    // 바깥 경계 전에 미리 사라짐
    return uGlowColor * b * fade * uGlowStrength;
  }

  // 코멧테일 모양 막대들을 극좌표(각도, 반지름)로 감아 안쪽 원 둘레에서 키홀 쪽으로 빨려드는 소용돌이
  float innerVortex(vec2 c, float ringR){
    vec2 cc = c;
    if (uVortexPixel > 0.5) cc = pixelSnap(cc, uVortexPixel);
    vec2 p = cc / ringR;
    float r = length(p);
    if (r >= 1.0) return 0.0;
    float a = atan(p.y, p.x);
    float rn = (r - uVortexHole) / (1.0 - uVortexHole);
    if (rn <= 0.0) return 0.0;
    float a0 = a + uVortexTwist * pow(1.0 - rn, uVortexFocus) + uVortexPhase;
    float col = texture2D(tVortex, vec2(a0 / 6.28318530718, 1.0 - rn)).r;   // 두꺼운 쪽(이미지 아래)이 안쪽 원 바깥으로
    col *= smoothstep(0.0, 0.09, rn);    // 홀 경계에서 부드럽게 시작
    col *= smoothstep(1.0, 0.96, r);     // 안쪽 원 경계에서 부드럽게 종료
    return col;
  }

  float ringAlpha(vec2 c, float ringR, float angle){
    float r = length(c);
    float th = atan(c.y, c.x) + angle;
    vec2 p = vec2(cos(th), sin(th)) * r;
    vec2 uv = p * (${RING_R_FRAC} / ringR) + 0.5;
    return texture2D(tRing, uv).a;
  }

  void main(){
    vec2 px = vUv * uRes;
    vec2 c = (px - uRes * 0.5) / uZoom;
    float vortexR = uInnerR * uVortexScale;   // 소용돌이가 들어갈 원 크기(안쪽 원보다 살짝 작게)

    vec3 col = background(c, vortexR);
    col += keyholeGlow(c, vortexR);
    float vx = innerVortex(c, vortexR);
    col = mix(col, vec3(1.0), vx);

    float ao = ringAlpha(c, uOuterR, uOuterAngle);
    float ai = ringAlpha(c, uInnerR, uInnerAngle);
    col = mix(col, uTextColor, ao);
    col = mix(col, uTextColor, ai);

    vec2 kc = px - uRes * 0.5;                              // 키홀은 줌 영향을 받지 않음(화면 고정 크기로 성장)
    vec2 huv = kc / vec2(uHoleW, uHoleH) + 0.5;
    float inHole = step(0.0, huv.x) * step(huv.x, 1.0) * step(0.0, huv.y) * step(huv.y, 1.0);
    float hm = texture2D(tHole, huv).a * inHole;
    col = mix(col, mix(uKeyholeColor, uHoleFill, uOpenT), hm);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createHero() {
  const params = {
    outerSpeed: 6, innerSpeed: 20, innerMinDiam: 740, outerGap: 190,
    pixelCell: 6, bgArms: 8, bgTwist: 1.4,
    vortexTwist: 0.5, vortexFocus: 1.7, vortexHole: 0.22, vortexPixel: 0, vortexScale: 0.86,
    glowColor: '#FFFFFF', glowStrength: 0.14,
    plungeZoom: 1.7, keyholeMinH: 100, keyholeMaxH: 2600,
    textColor: '#FFFFFF', keyholeColor: '#D1F91A', holeFill: '#FFFFFF',
  };
  const controls = [
    { key: 'outerSpeed', min: -60, max: 60, step: 1, info: 'Outer ring rotation speed (deg/s). Negative = reverse direction.' },
    { key: 'innerSpeed', min: -60, max: 60, step: 1, info: 'Inner ring + inner vortex rotation speed (deg/s) — both spin together as one disk. Negative = reverse direction.' },
    { key: 'innerMinDiam', min: 400, max: 1200, step: 10, info: 'Inner ring minimum diameter (px). Grows to 80% of viewport height if taller.' },
    { key: 'outerGap', min: 20, max: 200, step: 5, info: 'Radius gap (px) between inner and outer ring.' },
    { key: 'pixelCell', min: 2, max: 20, step: 1, info: 'Background spiral pixelation cell size (px).' },
    { key: 'bgArms', min: 1, max: 16, step: 1, info: 'Number of background spiral arms.' },
    { key: 'bgTwist', min: 0, max: 4, step: 0.05, info: 'Background spiral twist (how tightly it winds toward center).' },
    { key: 'vortexScale', min: 0.5, max: 1, step: 0.01, info: 'Vortex circle size relative to the inner ring — shrink so it sits neatly inside.' },
    { key: 'vortexTwist', min: 0, max: 1.25, step: 0.01, info: 'Inner vortex twist (turns). How much the tails curl as they near the keyhole.' },
    { key: 'vortexFocus', min: 0.8, max: 3, step: 0.1, info: 'Inner vortex focus exponent. Higher = twist concentrated closer to the keyhole.' },
    { key: 'vortexHole', min: 0.05, max: 0.45, step: 0.01, info: 'Empty gap (fraction of vortex radius) left open at the keyhole.' },
    { key: 'vortexPixel', min: 0, max: 14, step: 1, info: 'Inner vortex pixelation (0 = off, smooth).' },
    { key: 'glowColor', color: true, info: 'Radial glow color behind the keyhole.' },
    { key: 'glowStrength', min: 0, max: 1, step: 0.02, info: 'Radial glow brightness — dark at center, brighter outward, fades out at the vortex edge.' },
    { key: 'plungeZoom', min: 1, max: 4, step: 0.1, info: 'Camera zoom-in amount by the time scroll reaches the keyhole.' },
    { key: 'keyholeMinH', min: 40, max: 240, step: 5, info: 'Keyhole size (px) at rest.' },
    { key: 'keyholeMaxH', min: 800, max: 4000, step: 50, info: 'Keyhole size (px) at full scroll — big enough to cover the screen.' },
    { key: 'textColor', color: true, info: 'Ring text color.' },
    { key: 'keyholeColor', color: true, info: 'Keyhole icon color (at rest).' },
    { key: 'holeFill', color: true, info: 'Color revealed through the keyhole as it opens.' },
  ];

  const scene = new THREE.Scene();
  const ringTex = ringTextTexture(WORD, RING_REPEATS, RING_R_FRAC);
  const hole = svgAlphaTex(KEYHOLE_SVG);
  const vortexTex = vortexStripTex();

  const material = new THREE.RawShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    uniforms: {
      tRing: { value: ringTex }, tHole: { value: hole.tex }, tVortex: { value: vortexTex },
      uRes: { value: new THREE.Vector2(innerWidth, innerHeight) },
      uOuterAngle: { value: 0 }, uOuterR: { value: 500 },
      uInnerAngle: { value: 0 }, uInnerR: { value: 420 },
      uPixelCell: { value: params.pixelCell }, uBgArms: { value: params.bgArms },
      uBgTwist: { value: params.bgTwist },
      uVortexPhase: { value: 0 }, uVortexTwist: { value: params.vortexTwist * 2 * Math.PI },
      uVortexFocus: { value: params.vortexFocus }, uVortexHole: { value: params.vortexHole },
      uVortexPixel: { value: params.vortexPixel }, uVortexScale: { value: params.vortexScale },
      uZoom: { value: 1 },
      uHoleW: { value: params.keyholeMinH * hole.aspect }, uHoleH: { value: params.keyholeMinH }, uOpenT: { value: 0 },
      uGlowStrength: { value: params.glowStrength }, uGlowColor: { value: new THREE.Color(params.glowColor) },
      uTextColor: { value: new THREE.Color(params.textColor) },
      uKeyholeColor: { value: new THREE.Color(params.keyholeColor) }, uHoleFill: { value: new THREE.Color(params.holeFill) },
    },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false; scene.add(mesh);

  const el = document.createElement('section'); el.id = 'sec-hero';

  return {
    id: 'hero', label: 'hero', hint: 'scroll ↓ — into the keyhole', el, params, controls,
    render(now, s) {
      const range = Math.max(1, el.offsetHeight - innerHeight);
      const p = Math.min(1, Math.max(0, (s - el.offsetTop) / range));
      const t = (now || 0) / 1000;

      const innerR = Math.max(params.innerMinDiam, innerHeight * 0.8) / 2;
      const outerR = innerR + params.outerGap;

      const innerAngle = t * params.innerSpeed * Math.PI / 180;

      const u = material.uniforms;
      u.uRes.value.set(innerWidth, innerHeight);
      u.uOuterAngle.value = t * params.outerSpeed * Math.PI / 180;
      u.uOuterR.value = outerR;
      u.uInnerAngle.value = innerAngle;
      u.uInnerR.value = innerR;
      u.uPixelCell.value = params.pixelCell; u.uBgArms.value = params.bgArms;
      u.uBgTwist.value = params.bgTwist;
      u.uVortexPhase.value = innerAngle;   // 안쪽 원과 같은 속도·방향으로 함께 회전
      u.uVortexTwist.value = params.vortexTwist * 2 * Math.PI;
      u.uVortexFocus.value = params.vortexFocus; u.uVortexHole.value = params.vortexHole;
      u.uVortexPixel.value = params.vortexPixel; u.uVortexScale.value = params.vortexScale;
      u.uZoom.value = 1 + p * (params.plungeZoom - 1);

      const holeH = params.keyholeMinH + (params.keyholeMaxH - params.keyholeMinH) * Math.pow(p, 1.4);
      u.uHoleH.value = holeH; u.uHoleW.value = holeH * hole.aspect;
      u.uOpenT.value = Math.min(1, p * 1.8);

      u.uGlowStrength.value = params.glowStrength; u.uGlowColor.value.set(params.glowColor);
      u.uTextColor.value.set(params.textColor);
      u.uKeyholeColor.value.set(params.keyholeColor);
      u.uHoleFill.value.set(params.holeFill);
      renderer.render(scene, camera);
    },
  };
}
