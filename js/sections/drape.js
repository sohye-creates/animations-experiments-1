// 섹션: DRAPE — 스크롤 시 상단이 천처럼 접히는 효과
import { Transform, Plane, Program, Mesh } from 'ogl';
import { gl, renderer, camera, lenis } from '../core.js';

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
  uniform vec3 uColor; varying vec2 vUv; varying float vShade;
  void main() {
    vec3 col = uColor * mix(1.05, 0.85, vUv.y);
    col *= (1.0 - vShade * 0.55);
    float line = smoothstep(0.46, 0.5, abs(fract(vUv.y * 18.0) - 0.5));
    col *= (1.0 - 0.06 * line);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createDrape() {
  const IMG_W = 710, IMG_H = IMG_W / (1280 / 853), GAP = 40, COUNT = 10, TOP_PAD = 120, SEG = 60;
  const COLOR = [0.49, 0.78, 0.89];

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

  const scene = new Transform();
  const geo = new Plane(gl, { width: IMG_W, height: IMG_H, widthSegments: SEG, heightSegments: SEG });

  const el = document.createElement('section');
  el.id = 'sec-drape';
  const scroller = document.createElement('div');
  scroller.id = 'scroller';
  scroller.style.paddingTop = TOP_PAD + 'px';
  el.appendChild(scroller);

  const items = [];
  for (let i = 0; i < COUNT; i++) {
    const d = document.createElement('div'); d.className = 'item'; scroller.appendChild(d);
    const program = new Program(gl, {
      vertex: VERT, fragment: FRAG, cullFace: false,
      uniforms: {
        uColor: { value: COLOR }, uViewHeight: { value: innerHeight },
        uLensRadius: { value: params.uLensRadius }, uMaxAngle: { value: params.uMaxAngle }, uFold: { value: params.uFold },
        uWaveAmp: { value: params.uWaveAmp }, uWaveFreq: { value: 1.0 },
        uZWave: { value: params.uZWave }, uZWavelength: { value: params.uZWavelength }, uFlapLen: { value: params.uFlapLen },
        uBleedPx: { value: 25 }, uOnsetPx: { value: 60 }, uFoldOffset: { value: 0 },
      },
    });
    const mesh = new Mesh(gl, { geometry: geo, program }); mesh.setParent(scene);
    items.push({ mesh, rel: TOP_PAD + i * (IMG_H + GAP) + IMG_H / 2 });
  }
  scroller.style.paddingBottom = innerHeight + 'px';

  const fade = document.createElement('div'); fade.className = 'top-fade'; document.body.appendChild(fade);

  let foldOffset = 0;
  return {
    id: 'drape', label: 'drape', hint: 'scroll ↓', el, params, controls,
    onEnter() { fade.style.opacity = '1'; },
    onLeave() { fade.style.opacity = '0'; },
    render(now, s) {
      foldOffset += (-Math.min(Math.abs(lenis.velocity) * params.foldGain, params.foldMax) - foldOffset) * 0.1;
      const base = el.offsetTop;
      for (const { mesh, rel } of items) {
        mesh.position.y = innerHeight / 2 - ((base + rel) - s);
        const u = mesh.program.uniforms;
        u.uViewHeight.value = innerHeight; u.uFoldOffset.value = foldOffset;
        u.uFold.value = params.uFold; u.uMaxAngle.value = params.uMaxAngle; u.uLensRadius.value = params.uLensRadius;
        u.uWaveAmp.value = params.uWaveAmp; u.uZWave.value = params.uZWave;
        u.uZWavelength.value = params.uZWavelength; u.uFlapLen.value = params.uFlapLen;
      }
      renderer.render({ scene, camera });
    },
  };
}
