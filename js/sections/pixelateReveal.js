// 섹션: PIXELATE REVEAL — 이미지가 처음엔 아주 큰 픽셀(모자이크) 블록으로 보이다가,
// 마우스를 올리면 블록 크기가 점점 작아지며(부서지듯) 원본 해상도로 수렴함. 커서를 떼면
// 다시 큰 블록으로 되돌아감.
// 기법: 원본 이미지를 "블록 개수만큼만" 작은 캔버스에 그려 다운샘플한 뒤, 그 결과를
// imageSmoothingEnabled=false로 실제 표시 크기까지 확대 — 보간 없이 확대하니 각 셀이
// 딱딱한 사각 블록으로 보임(고전적인 픽셀레이트 기법).
import { clamp01 } from '../core/asciiRamp.js';

export function createPixelateReveal() {
  const IMG_SRC = './assets/sample-work.jpg';

  const params = {
    frameW: 480, frameH: 480,
    startBlock: 40, minBlock: 1, ease: 0.08,
  };
  const controls = [
    { key: 'frameW', min: 200, max: 900, step: 10, info: 'Display width (px).' },
    { key: 'frameH', min: 200, max: 900, step: 10, info: 'Display height (px).' },
    { key: 'startBlock', min: 4, max: 100, step: 1, info: 'Block size (px) at rest — bigger = chunkier mosaic.' },
    { key: 'minBlock', min: 1, max: 20, step: 1, info: 'Block size (px) when fully hovered — 1 = true full resolution.' },
    { key: 'ease', min: 0.02, max: 0.3, step: 0.01, info: 'How quickly the block size eases toward its target on hover in/out.' },
  ];

  const el = document.createElement('section'); el.id = 'sec-pixelate';
  const frame = document.createElement('div'); frame.className = 'pr-frame';
  const canvas = document.createElement('canvas'); canvas.className = 'pr-canvas';
  const ctx = canvas.getContext('2d');
  frame.appendChild(canvas);
  el.appendChild(frame);

  const img = new Image();
  let ready = false;
  img.onload = () => { ready = true; };
  img.src = IMG_SRC;

  const tiny = document.createElement('canvas');
  const tctx = tiny.getContext('2d');

  let hovering = false;
  frame.addEventListener('mouseenter', () => { hovering = true; });
  frame.addEventListener('mouseleave', () => { hovering = false; });

  // object-fit: cover와 동일한 크롭 — drape.js/asciiReveal.js와 같은 방식.
  function drawCover(ctx, dw, dh) {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const scale = Math.max(dw / iw, dh / ih);
    const sw = dw / scale, sh = dh / scale;
    ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, dw, dh);
  }

  let block = params.startBlock;

  return {
    id: 'pixelate', label: 'pixel image', hint: 'hover the image — blocks shatter into full resolution', el, params, controls,
    onEnter() {},
    onLeave() { hovering = false; },
    render() {
      if (!ready) return;
      canvas.width = params.frameW; canvas.height = params.frameH;
      frame.style.width = params.frameW + 'px'; frame.style.height = params.frameH + 'px';

      const target = hovering ? params.minBlock : params.startBlock;
      block += (target - block) * params.ease;

      const cols = Math.max(1, Math.round(params.frameW / block));
      const rows = Math.max(1, Math.round(params.frameH / block));
      tiny.width = cols; tiny.height = rows;
      drawCover(tctx, cols, rows);

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tiny, 0, 0, cols, rows, 0, 0, params.frameW, params.frameH);
    },
  };
}
