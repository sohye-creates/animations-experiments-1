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

  // 반쪽 중앙에 놓인 로고 알파 (px: 화면 픽셀, center: 반쪽 중앙 px)
  float logoA(sampler2D t, float aspect, vec2 px, vec2 center){
    float H = uLogoH, W = H * aspect;
    vec2 uvl = (px - center) / vec2(W, H) + 0.5;
    float ins = step(0.0,uvl.x)*step(uvl.x,1.0)*step(0.0,uvl.y)*step(uvl.y,1.0);
    return texture2D(t, vec2(uvl.x, uvl.y)).a * ins;
  }

  void main(){
    vec2 px = vUv * uRes;
    bool left = vUv.x < 0.5;
    float hover = left ? uHoverL : uHoverR;
    vec3 bg  = left ? uLeftBg  : uRightBg;
    vec3 ink = left ? uLeftInk : uRightInk;
    vec2 center = vec2(left ? uRes.x * 0.25 : uRes.x * 0.75, uRes.y * 0.5);

    // 픽셀 셀마다 이미지/워드 선택 (hover 진행에 따라 랜덤하게 flip → 픽셀 전환)
    vec2 cell = floor(px / uCell);
    float showWord = step(hash(cell), hover);

    float a = mix(logoA(tImgLogo, uImgAspect, px, center),
                  logoA(tWordLogo, uWordAspect, px, center), showWord);

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
