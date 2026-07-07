// 섹션: LOGO — 좌(흰 배경)/우(어두운 배경) 반분할. 기본은 이미지 로고가 중앙에.
// 반쪽에 마우스를 올리면 픽셀 크로스페이드로 이미지 로고 → 워드마크 로고로 전환(픽셀로 사라지고/나타남).
import { Transform, Plane, Program, Mesh, Texture } from 'ogl';
import { gl, renderer, camera } from '../core.js';

const hexToRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

// 흰색 SVG 로고 → 알파 마스크 텍스처 (색은 셰이더에서 입힘)
function svgTex(url) {
  const info = { tex: new Texture(gl, { generateMipmaps: false }), aspect: 1 };
  const img = new Image();
  img.onload = () => {
    const H = 256, W = Math.max(1, Math.round(H * img.naturalWidth / img.naturalHeight));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    c.getContext('2d').drawImage(img, 0, 0, W, H);
    info.tex.image = c; info.aspect = W / H;
  };
  img.src = url;
  return info;
}

const VERT = /* glsl */`
  attribute vec3 position; attribute vec2 uv;
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D tImgLogo, tWordLogo;
  uniform vec2 uRes;
  uniform float uImgAspect, uWordAspect, uLogoH, uCell, uHoverL, uHoverR;
  uniform vec3 uLeftBg, uRightBg, uLeftInk, uRightInk;
  varying vec2 vUv;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

  // 왼쪽 기준선(leftX)에 정렬된 로고 알파 (px: 화면 픽셀, centerY: 반쪽 세로 중앙)
  float logoA(sampler2D t, float aspect, vec2 px, float leftX, float centerY){
    float H = uLogoH, W = H * aspect;
    vec2 uvl = vec2((px.x - leftX) / W, (px.y - centerY) / H + 0.5);
    float ins = step(0.0,uvl.x)*step(uvl.x,1.0)*step(0.0,uvl.y)*step(uvl.y,1.0);
    return texture2D(t, uvl).a * ins;
  }

  void main(){
    vec2 px = vUv * uRes;
    bool left = vUv.x < 0.5;
    float hover = left ? uHoverL : uHoverR;
    vec3 bg  = left ? uLeftBg  : uRightBg;
    vec3 ink = left ? uLeftInk : uRightInk;
    // 반쪽 전체는 그대로 중앙 배치 — 더 넓은 로고(보통 워드마크) 기준으로 중앙을 잡고,
    // 이미지 로고는 그 왼쪽 기준선에만 맞춰서 둘 사이의 정렬만 왼쪽 기준으로 통일.
    float halfCenterX = left ? uRes.x * 0.25 : uRes.x * 0.75;
    float maxW = uLogoH * max(uImgAspect, uWordAspect);
    float leftX = halfCenterX - maxW * 0.5;
    float centerY = uRes.y * 0.5;

    // 픽셀 셀마다 이미지/워드 선택 (hover 진행에 따라 랜덤하게 flip → 픽셀 전환)
    vec2 cell = floor(px / uCell);
    // hover가 사실상 0일 때는 hash(cell)이 부동소수점상 0에 아주 가깝게 나오는 셀이 있어도
    // 절대 워드 로고가 새어나오지 않도록(잔재 픽셀 방지) 최소 임계값으로 완전히 잠금.
    float showWord = step(1e-4, hover) * step(hash(cell), hover);

    float a = mix(logoA(tImgLogo, uImgAspect, px, leftX, centerY),
                  logoA(tWordLogo, uWordAspect, px, leftX, centerY), showWord);

    gl_FragColor = vec4(mix(bg, ink, a), 1.0);
  }
`;

export function createLogo() {
  const params = {
    logoH: 124, cell: 7, ease: 0.14,
    leftBg: '#FFFFFF', rightBg: '#111111', leftInk: '#111111', rightInk: '#FFFFFF',
  };
  const controls = [
    { key: 'logoH', min: 40, max: 300, step: 2, info: 'Logo height (px).' },
    { key: 'cell', min: 4, max: 40, step: 1, info: 'Pixel cell size (px).' },
    { key: 'ease', min: 0.03, max: 0.4, step: 0.01, info: 'Hover transition speed.' },
    { key: 'leftBg', color: true, info: 'Left half background.' },
    { key: 'rightBg', color: true, info: 'Right half background.' },
    { key: 'leftInk', color: true, info: 'Left logo color.' },
    { key: 'rightInk', color: true, info: 'Right logo color.' },
  ];

  const scene = new Transform();
  const imgLogo = svgTex('./assets/logo_white_image.svg');
  const wordLogo = svgTex('./assets/logo_white_word.svg');

  const program = new Program(gl, {
    vertex: VERT, fragment: FRAG, cullFace: false,
    uniforms: {
      tImgLogo: { value: imgLogo.tex }, tWordLogo: { value: wordLogo.tex },
      uImgAspect: { value: 1 }, uWordAspect: { value: 1.3 },
      uRes: { value: [innerWidth, innerHeight] }, uLogoH: { value: params.logoH }, uCell: { value: params.cell },
      uHoverL: { value: 0 }, uHoverR: { value: 0 },
      uLeftBg: { value: hexToRgb(params.leftBg) }, uRightBg: { value: hexToRgb(params.rightBg) },
      uLeftInk: { value: hexToRgb(params.leftInk) }, uRightInk: { value: hexToRgb(params.rightInk) },
    },
  });
  const mesh = new Mesh(gl, { geometry: new Plane(gl, { width: 2, height: 2 }), program });
  mesh.frustumCulled = false; mesh.setParent(scene);

  const el = document.createElement('section'); el.id = 'sec-logo';

  let isActive = false, tx = -1, ty = -1, hl = 0, hr = 0;
  addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; });

  return {
    id: 'logo', label: 'logo', hint: 'hover each half ✦', el, params, controls,
    onEnter() { isActive = true; },
    onLeave() { isActive = false; },
    render() {
      // hover는 각 반쪽의 로고 영역 안에 커서가 있을 때만 (섹션 전체가 아니라)
      const w = innerWidth, h = innerHeight;
      const hw = params.logoH * Math.max(imgLogo.aspect, wordLogo.aspect) / 2 + 24;  // 로고 히트영역 반너비
      const hh = params.logoH / 2 + 24;
      const overRow = Math.abs(ty - h * 0.5) < hh;
      const lT = isActive && overRow && Math.abs(tx - w * 0.25) < hw ? 1 : 0;
      const rT = isActive && overRow && Math.abs(tx - w * 0.75) < hw ? 1 : 0;
      hl += (lT - hl) * params.ease; hr += (rT - hr) * params.ease;
      const u = program.uniforms;
      u.uRes.value = [innerWidth, innerHeight]; u.uLogoH.value = params.logoH; u.uCell.value = params.cell;
      u.uHoverL.value = hl; u.uHoverR.value = hr;
      u.uImgAspect.value = imgLogo.aspect; u.uWordAspect.value = wordLogo.aspect;
      u.uLeftBg.value = hexToRgb(params.leftBg); u.uRightBg.value = hexToRgb(params.rightBg);
      u.uLeftInk.value = hexToRgb(params.leftInk); u.uRightInk.value = hexToRgb(params.rightInk);
      renderer.render({ scene, camera });
    },
  };
}
