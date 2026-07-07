// 섹션: EYE — 눈(eye.jpg) 뒤에 눈동자(pupil.jpg)를 겹쳐 놓고, 커서를 따라 눈동자만 움직임.
// 합성된 밝기를 6x6px 그리드 한 칸당 한 번씩 샘플링해 하프톤 도트로 변환:
//   가장 밝음(흰색) → 빈칸 / 약한 그레이 → light-circle·light-square(테두리만) 랜덤 /
//   어두운 그레이·검정 → dark-circle·dark-square(채워짐) 랜덤.
// 두 이미지를 먼저 합성한 뒤 단 한 번의 그리드로 도트화하므로, 눈동자가 움직여도
// 그리드 자체는 화면 좌표에 고정돼 흔들리지 않고 밝기만 바뀜(레이어 간 정합성 보장).
import { Transform, Plane, Program, Mesh, Texture } from 'ogl';
import { gl, renderer, camera } from '../core.js';

const hexToRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

const VERT = /* glsl */`
  attribute vec3 position; attribute vec2 uv;
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D tEye, tPupil;
  uniform vec2 uRes, uCursor;
  uniform float uImgW, uCell, uThreshHigh, uThreshLow, uRangeX, uRangeY, uInvert;
  uniform vec3 uDotColor;
  varying vec2 vUv;

  float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

  float sdDiscFilled(vec2 q){ return step(length(q), 0.44); }
  float sdSquareFilled(vec2 q){ return step(max(abs(q.x), abs(q.y)), 0.44); }
  float sdRingOutline(vec2 q){ return step(abs(length(q) - 0.44), 0.09); }
  float sdHollowSqOutline(vec2 q){ return step(abs(max(abs(q.x), abs(q.y)) - 0.44), 0.07); }

  void main(){
    vec2 halfSz = vec2(uImgW * 0.5);
    vec2 rc = uRes * 0.5;

    // 셀 하나당 밝기 한 번만 샘플링(셀 중심 픽셀 기준) — 그리드는 화면 좌표 고정
    vec2 grid = uRes / uCell;
    vec2 cell = floor(vUv * grid);
    vec2 q = fract(vUv * grid) - 0.5;
    vec2 ccpx = ((cell + 0.5) / grid) * uRes;

    vec2 dEdge = halfSz - abs(ccpx - rc);
    float inRect = step(0.0, min(dEdge.x, dEdge.y));

    vec2 iuv = (ccpx - (rc - halfSz)) / (2.0 * halfSz);
    vec2 offsetUV = uCursor * vec2(uRangeX, uRangeY);   // 커서 위치 → 눈동자만 이미지 공간에서 offset
    vec2 puv = clamp(iuv - offsetUV, 0.0, 1.0);

    vec3 eyeCol = texture2D(tEye, iuv).rgb;
    vec3 pupilCol = texture2D(tPupil, puv).rgb;
    vec3 combined = eyeCol * pupilCol;   // 흰 종이 위 잉크 두 장 겹치기 = multiply

    float L = lum(combined);
    if (uInvert > 0.5) L = 1.0 - L;

    vec3 col = vec3(0.0);
    if (inRect > 0.5 && L < uThreshHigh) {
      float h = hash(cell);
      float cov = (L < uThreshLow)
        ? ((h < 0.5) ? sdDiscFilled(q)   : sdSquareFilled(q))
        : ((h < 0.5) ? sdRingOutline(q)  : sdHollowSqOutline(q));
      col = uDotColor * cov;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

// 홍채(눈동자)가 pupil.jpg 전체 캔버스(1254px) 중 실제로 차지하는 비율 — 약 27%.
// rangeX/rangeY는 "눈동자 자기 크기 기준 %"로 지정하므로, 셰이더에 넘길 때는
// 이 비율을 곱해 이미지 전체 폭 기준 UV로 환산해야 함(그래야 20%가 눈동자 지름의 20%가 됨).
const IRIS_W_FRAC = 341 / 1254;
const IRIS_H_FRAC = 332 / 1254;

export function createEye() {
  const params = {
    imgW: 1200, cell: 5, threshHigh: 0.8, threshLow: 0.24,
    rangeX: 0.20, rangeY: 0.10, ease: 0.1, invert: 0,
    dotColor: '#595959',
  };
  const controls = [
    { key: 'imgW', min: 300, max: 1600, step: 10, info: 'Displayed eye size (px, square).' },
    { key: 'cell', min: 3, max: 14, step: 1, info: 'Dot grid cell size (px).' },
    { key: 'threshHigh', min: 0.5, max: 0.99, step: 0.01, info: 'Brightness above this = blank (paper white).' },
    { key: 'threshLow', min: 0.05, max: 0.9, step: 0.01, info: 'Brightness below this = dark filled dot/square.' },
    { key: 'rangeX', min: 0, max: 1, step: 0.01, info: 'Max pupil shift left/right, as % of the pupil’s own width.' },
    { key: 'rangeY', min: 0, max: 1, step: 0.01, info: 'Max pupil shift up/down, as % of the pupil’s own height.' },
    { key: 'ease', min: 0.02, max: 0.3, step: 0.01, info: 'Pupil follow smoothing (higher = snappier).' },
    { key: 'invert', min: 0, max: 1, step: 1, info: 'Invert brightness (0 = off, 1 = on).' },
    { key: 'dotColor', color: true, info: 'Dot/outline color.' },
  ];

  const scene = new Transform();
  const texOpts = { generateMipmaps: false, wrapS: gl.CLAMP_TO_EDGE, wrapT: gl.CLAMP_TO_EDGE, minFilter: gl.LINEAR, magFilter: gl.LINEAR };
  const tEye = new Texture(gl, texOpts);
  const tPupil = new Texture(gl, texOpts);
  const eyeImg = new Image(); eyeImg.onload = () => { tEye.image = eyeImg; }; eyeImg.src = './assets/eye.jpg';
  const pupilImg = new Image(); pupilImg.onload = () => { tPupil.image = pupilImg; }; pupilImg.src = './assets/pupil.jpg';

  const program = new Program(gl, {
    vertex: VERT, fragment: FRAG, cullFace: false,
    uniforms: {
      tEye: { value: tEye }, tPupil: { value: tPupil },
      uRes: { value: [innerWidth, innerHeight] }, uCursor: { value: [0, 0] },
      uImgW: { value: params.imgW }, uCell: { value: params.cell },
      uThreshHigh: { value: params.threshHigh }, uThreshLow: { value: params.threshLow },
      uRangeX: { value: params.rangeX }, uRangeY: { value: params.rangeY }, uInvert: { value: params.invert },
      uDotColor: { value: hexToRgb(params.dotColor) },
    },
  });
  const mesh = new Mesh(gl, { geometry: new Plane(gl, { width: 2, height: 2 }), program });
  mesh.frustumCulled = false; mesh.setParent(scene);

  const el = document.createElement('section'); el.id = 'sec-eye';

  // 커서 위치(-1..1, 화면 전체 기준) → 매끄럽게 뒤따라가는 눈동자 offset
  let tx = 0, ty = 0, cx = 0, cy = 0;
  addEventListener('pointermove', e => {
    tx = (e.clientX / innerWidth) * 2 - 1;
    ty = (1 - e.clientY / innerHeight) * 2 - 1;
  });

  return {
    id: 'eye', label: 'eye', hint: 'move your cursor ✦', el, params, controls,
    render() {
      cx += (tx - cx) * params.ease; cy += (ty - cy) * params.ease;
      const u = program.uniforms;
      u.uRes.value = [innerWidth, innerHeight]; u.uCursor.value = [cx, cy];
      u.uImgW.value = params.imgW; u.uCell.value = params.cell;
      u.uThreshHigh.value = params.threshHigh; u.uThreshLow.value = params.threshLow;
      u.uRangeX.value = params.rangeX * IRIS_W_FRAC; u.uRangeY.value = params.rangeY * IRIS_H_FRAC; u.uInvert.value = params.invert;
      u.uDotColor.value = hexToRgb(params.dotColor);
      renderer.render({ scene, camera });
    },
  };
}
