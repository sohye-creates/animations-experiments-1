// 글자를 2D 캔버스에 그려 three.js 텍스처로 만드는 공용 유틸
// tightY=true 면 글자 높이에 딱 맞게(위아래 여백 최소) 캔버스를 잡음
import * as THREE from 'three';

export function textTexture(text, fs = 180, ls = 12, tightY = false) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const setFont = () => {
    ctx.font = `500 ${fs}px 'Aeonik', system-ui, sans-serif`;
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = ls + 'px';
  };
  setFont();
  const m = ctx.measureText(text);
  const w = Math.ceil(m.width);

  if (tightY) {
    // 실제 글자 상/하 경계로 높이를 타이트하게
    const asc = Math.ceil(m.actualBoundingBoxAscent || fs * 0.72);
    const desc = Math.ceil(m.actualBoundingBoxDescent || fs * 0.05);
    const padX = 6, padY = 4;
    c.width = w + padX * 2; c.height = asc + desc + padY * 2;
    setFont();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, c.width / 2, padY + asc);
  } else {
    c.width = w + 120; c.height = Math.ceil(fs * 1.7);
    setFont();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, c.width / 2, c.height / 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  return { tex, aspect: c.width / c.height };
}
