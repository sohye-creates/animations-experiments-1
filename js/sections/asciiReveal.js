// 섹션: ASCII REVEAL — 버튼을 누르면 이미지가 문자(텍스트)로 전환되는 데모.
// 이미지를 문자 셀 크기만큼 아주 작은 canvas에 다시 그려(브라우저의 축소 스케일링이 곧
// "복잡도 낮추기" 역할) 각 셀의 밝기를 문자 램프(어두움=촘촘한 문자 ↔ 밝음=여백)에 매핑하고,
// 그 문자열을 실제 DOM 텍스트로 이미지 위에 오버레이. WebGL을 전혀 쓰지 않는 순수 DOM+Canvas2D
// 섹션이라 render()는 canvas.render() 호출 없이 스크램블 리빌 애니메이션만 갱신함.
// 램프(밝기→문자) 생성 로직은 asciiVideo.js와 공유 — core/asciiRamp.js 참고.
import { clamp01, getRamp } from '../core/asciiRamp.js';

export function createAsciiReveal() {
  const IMG_SRC = './assets/works/work-keel.webp';

  const params = {
    fontPx: 9, lineHeightMult: 1.05, gap: 2, levels: 24, revealDur: 900, sweep: 0.55, contrast: 1.25,
    ink: '#C6F000', bg: '#0B0B0C',
  };
  const controls = [
    { key: 'fontPx', min: 5, max: 16, step: 0.5, info: 'Character cell font size (px) — smaller = finer/denser ASCII grid.' },
    { key: 'lineHeightMult', min: 0.8, max: 1.4, step: 0.02, info: 'Row height as a multiple of fontPx.' },
    { key: 'gap', min: 0, max: 8, step: 0.5, info: 'Extra spacing (px) added between character cells, both horizontally and vertically.' },
    { key: 'levels', min: 6, max: 60, step: 1, info: 'Number of distinct brightness levels (characters) in the ramp. Fewer = flat backgrounds collapse onto one character (N) more readily; more = smoother but busier gradient.' },
    { key: 'contrast', min: 0.5, max: 2.5, step: 0.05, info: 'Boosts tonal separation around midtones so the image\'s shapes/edges read more clearly in text form.' },
    { key: 'revealDur', min: 200, max: 2500, step: 50, info: 'Image→text scramble reveal duration (ms).' },
    { key: 'sweep', min: 0, max: 0.9, step: 0.02, info: 'Fraction of the duration spent staggering rows (top→bottom) before each row settles.' },
    { key: 'ink', color: true, info: 'Text color.' },
    { key: 'bg', color: true, info: 'Text layer background (shows through empty/space cells).' },
  ];

  const el = document.createElement('section'); el.id = 'sec-ascii';
  const wrap = document.createElement('div'); wrap.className = 'ai-wrap';
  const frame = document.createElement('div'); frame.className = 'ai-frame';
  const img = document.createElement('img'); img.className = 'ai-img'; img.src = IMG_SRC; img.alt = '';
  // DOM 텍스트(<pre>)로 하면 브라우저마다 monospace 글자 사이/줄 사이에 서브픽셀 반올림으로
  // 미세한(1~2px) 틈이 생김 — 각 글자를 canvas에 x=col*chW, y=row*chH로 직접 지정해서 찍으면
  // 셀 경계를 내가 통제하므로 그런 틈이 생기지 않음.
  const textCanvas = document.createElement('canvas'); textCanvas.className = 'ai-text-canvas';
  const tx = textCanvas.getContext('2d');
  const btn = document.createElement('button'); btn.className = 'ai-toggle'; btn.textContent = 'Aa → Letters';
  frame.append(img, textCanvas);
  wrap.append(frame, btn);
  el.appendChild(wrap);

  // probe: 실제 렌더 폰트로 문자 셀 크기(px)를 측정 — pixel.js의 buildLayout()과 동일한
  // "실측 폰트 프로브" 기법. 이 chW/chH를 canvas 위 글자 배치에도 그대로 씀.
  const probe = document.createElement('canvas').getContext('2d');
  const tiny = document.createElement('canvas');
  const tctx = tiny.getContext('2d', { willReadFrequently: true });

  let ready = false, mode = 'image', revealStart = null, resolved = false;
  let targetRows = [];

  // chW/chH = 셀 "간격"(pitch) — 글자 자체 크기(fontPx)는 그대로 두고 다음 셀까지의
  // 이동 거리에만 gap을 더해서, 글자들 사이(가로/세로 모두)에 여백이 생기게 함.
  function cellSize() {
    probe.font = `${params.fontPx}px Menlo, 'Courier New', monospace`;
    const glyphW = probe.measureText('0').width || params.fontPx * 0.6;
    const chW = glyphW + params.gap;
    const chH = params.fontPx * params.lineHeightMult + params.gap;
    return { chW, chH };
  }

  // textCanvas를 frame과 같은 CSS 크기로, DPR을 반영해 선명하게 맞춤.
  function resizeTextCanvas() {
    const rect = frame.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    textCanvas.width = Math.round(rect.width * dpr);
    textCanvas.height = Math.round(rect.height * dpr);
    textCanvas.style.width = rect.width + 'px';
    textCanvas.style.height = rect.height + 'px';
    tx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // lines(문자열 배열)를 x=col*chW, y=row*chH에 직접 그림 — DOM 텍스트 흐름을 타지 않으므로
  // 셀 사이에 반올림으로 인한 틈이 생기지 않음.
  function paintText(lines) {
    const rect = frame.getBoundingClientRect();
    const { chW, chH } = cellSize();
    tx.fillStyle = params.bg; tx.fillRect(0, 0, rect.width, rect.height);
    tx.fillStyle = params.ink;
    tx.font = `${params.fontPx}px Menlo, 'Courier New', monospace`;
    tx.textBaseline = 'top';
    for (let y = 0; y < lines.length; y++) {
      const row = lines[y], py = y * chH;
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === ' ') continue;   // 배경이 이미 채워져 있으니 스페이스는 그릴 필요 없음
        tx.fillText(ch, x * chW, py);
      }
    }
  }

  // object-fit: cover와 동일한 크롭 — 크롭 비율은 항상 "실제 프레임 픽셀 비율"(aw:ah)로 계산.
  // dw:dh(문자 그리드 셀 개수 비율)로 크롭하면 안 됨 — 모노스페이스 셀은 정사각형이 아니라서
  // (chW≠chH) 그 비율로 크롭하면 원본과 다른 비율로 잘려 이미지가 위아래로 늘어나 보임.
  // 크롭은 실제 비율대로, 그 결과를 (dw,dh) 그리드 해상도로 리샘플만 함.
  function drawCover(ctx, dw, dh, aw, ah) {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const scale = Math.max(aw / iw, ah / ih);
    const sw = aw / scale, sh = ah / scale;
    ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, dw, dh);
  }

  function buildTargetRows() {
    const rect = frame.getBoundingClientRect();
    if (!rect.width || !rect.height || !img.naturalWidth) return;
    resizeTextCanvas();
    const { chW, chH } = cellSize();
    const ramp = getRamp(params.fontPx, params.levels);
    const w = Math.max(1, Math.round(rect.width / chW)), h = Math.max(1, Math.round(rect.height / chH));
    tiny.width = w; tiny.height = h;
    drawCover(tctx, w, h, rect.width, rect.height);
    const { data } = tctx.getImageData(0, 0, w, h);
    const rows = [];
    for (let y = 0; y < h; y++) {
      let row = '';
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        // 표준 휘도(luma) 가중치(BT.601) — 어두운 픽셀일수록 ramp 앞쪽(촘촘한 문자).
        const L = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        // 대비를 살짝 키워 중간톤 근처의 형태/윤곽이 더 뚜렷하게 나뉘도록 함.
        const Ladj = clamp01((L / 255 - 0.5) * params.contrast + 0.5) * 255;
        const idx = Math.min(ramp.length - 1, Math.floor((Ladj / 255) * ramp.length));
        row += ramp[idx];
      }
      rows.push(row);
    }
    targetRows = rows;
  }

  function randomRow(len, ramp) {
    let s = '';
    for (let i = 0; i < len; i++) s += ramp[(Math.random() * ramp.length) | 0];
    return s;
  }

  function frameAt(p) {
    const rows = targetRows.length, sweep = params.sweep;
    const ramp = getRamp(params.fontPx, params.levels);
    const lines = new Array(rows);
    for (let y = 0; y < rows; y++) {
      const rowStart = rows > 1 ? (y / (rows - 1)) * sweep : 0;
      const rowP = clamp01((p - rowStart) / Math.max(1e-4, 1 - sweep));
      lines[y] = rowP >= 1 ? targetRows[y] : randomRow(targetRows[y].length, ramp);
    }
    return lines;
  }

  function enterTextMode() {
    buildTargetRows();
    mode = 'text'; resolved = false; revealStart = null;
    img.style.opacity = '0'; textCanvas.style.opacity = '1';
    btn.classList.add('on'); btn.textContent = 'Aa → Image';
  }
  function enterImageMode() {
    mode = 'image';
    img.style.opacity = '1'; textCanvas.style.opacity = '0';
    btn.classList.remove('on'); btn.textContent = 'Aa → Letters';
  }

  btn.addEventListener('click', () => { if (!ready) return; mode === 'image' ? enterTextMode() : enterImageMode(); });

  const onResize = () => { if (mode === 'text') buildTargetRows(); };
  addEventListener('resize', onResize);

  if (img.complete && img.naturalWidth) ready = true;
  else img.addEventListener('load', () => { ready = true; });

  return {
    id: 'ascii', label: 'ascii', hint: 'click the button to turn the image into text', el, params, controls,
    onEnter() {},
    onLeave() {},
    render(now) {
      if (mode !== 'text' || resolved || !targetRows.length) return;
      if (revealStart == null) revealStart = now;
      const p = clamp01((now - revealStart) / params.revealDur);
      paintText(frameAt(p));
      if (p >= 1) { resolved = true; paintText(targetRows); }
    },
  };
}
