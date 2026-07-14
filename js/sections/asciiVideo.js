// 섹션: ASCII VIDEO — 화면 전체를 덮는 비디오를 실시간으로 문자(텍스트)로 변환하는 데모.
// asciiReveal.js(이미지)와 같은 기법(다운샘플링 → 셀별 밝기 측정 → 문자 램프 매핑)을 쓰지만,
// 정지 이미지가 아니라 재생 중인 <video>를 매 프레임 다시 샘플링해서 계속 갱신함. 그래서
// "한 번 스크램블 후 정착"이 아니라, 텍스트 모드로 들어가는 순간부터 바로 실시간으로 따라가는
// 라이브 필터로 구현(계속 바뀌는 화면을 한 번 스크램블 후 얼리는 건 의미가 없어서 생략).
import { clamp01, getRamp } from '../core/asciiRamp.js';

export function createAsciiVideo() {
  const VIDEO_SRC = './assets/works/video_test_1.mp4';

  const params = {
    fontPx: 9, lineHeightMult: 1.05, gap: 2, levels: 24, contrast: 1.25,
    ink: '#C6F000', bg: '#0B0B0C',
  };
  const controls = [
    { key: 'fontPx', min: 5, max: 16, step: 0.5, info: 'Character cell font size (px) — smaller = finer/denser ASCII grid.' },
    { key: 'lineHeightMult', min: 0.8, max: 1.4, step: 0.02, info: 'Row height as a multiple of fontPx.' },
    { key: 'gap', min: 0, max: 8, step: 0.5, info: 'Extra spacing (px) added between character cells, both horizontally and vertically.' },
    { key: 'levels', min: 6, max: 60, step: 1, info: 'Number of distinct brightness levels (characters) in the ramp. Fewer = flat areas collapse onto one character (N) more readily.' },
    { key: 'contrast', min: 0.5, max: 2.5, step: 0.05, info: 'Boosts tonal separation around midtones so shapes/edges read more clearly in text form.' },
    { key: 'ink', color: true, info: 'Text color.' },
    { key: 'bg', color: true, info: 'Text layer background (shows through empty/space cells).' },
  ];

  const el = document.createElement('section'); el.id = 'sec-ascii-video';
  const frame = document.createElement('div'); frame.className = 'av-frame';
  const video = document.createElement('video'); video.className = 'av-video';
  video.src = VIDEO_SRC; video.muted = true; video.loop = true; video.playsInline = true; video.autoplay = true;
  // DOM 텍스트 대신 canvas에 직접 좌표를 찍어 그림 — asciiReveal.js와 같은 이유(모노스페이스
  // 서브픽셀 반올림으로 생기는 글자 사이 미세한 틈 방지).
  const textCanvas = document.createElement('canvas'); textCanvas.className = 'av-text-canvas';
  const tx = textCanvas.getContext('2d');
  const btn = document.createElement('button'); btn.className = 'av-toggle'; btn.textContent = 'Aa → Letters';
  frame.append(video, textCanvas, btn);
  el.appendChild(frame);

  const probe = document.createElement('canvas').getContext('2d');
  const tiny = document.createElement('canvas');
  const tctx = tiny.getContext('2d', { willReadFrequently: true });

  let ready = false, mode = 'video';

  // chW/chH = 셀 "간격"(pitch) — asciiReveal.js와 동일한 방식(gap만큼 간격을 더 벌림).
  function cellSize() {
    probe.font = `${params.fontPx}px Menlo, 'Courier New', monospace`;
    const glyphW = probe.measureText('0').width || params.fontPx * 0.6;
    const chW = glyphW + params.gap;
    const chH = params.fontPx * params.lineHeightMult + params.gap;
    return { chW, chH };
  }

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

  // object-fit: cover와 동일한 크롭 — 크롭 비율은 항상 실제 프레임 픽셀 비율(aw:ah)로 계산.
  // (asciiReveal.js의 drawCover와 같은 이유로, 그리드 셀 개수 비율로 크롭하면 화면이 늘어져 보임)
  function drawCover(ctx, dw, dh, aw, ah) {
    const iw = video.videoWidth, ih = video.videoHeight;
    if (!iw || !ih) return;
    const scale = Math.max(aw / iw, ah / ih);
    const sw = aw / scale, sh = ah / scale;
    ctx.drawImage(video, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, dw, dh);
  }

  // 매 프레임: 지금 재생 중인 비디오 화면을 다시 샘플링해서 그 즉시 문자로 찍음(라이브 필터).
  function paintFrame() {
    const rect = frame.getBoundingClientRect();
    if (!rect.width || !rect.height || !video.videoWidth) return;
    const { chW, chH } = cellSize();
    const ramp = getRamp(params.fontPx, params.levels);
    const w = Math.max(1, Math.round(rect.width / chW)), h = Math.max(1, Math.round(rect.height / chH));
    tiny.width = w; tiny.height = h;
    drawCover(tctx, w, h, rect.width, rect.height);
    const { data } = tctx.getImageData(0, 0, w, h);

    tx.fillStyle = params.bg; tx.fillRect(0, 0, rect.width, rect.height);
    tx.fillStyle = params.ink;
    tx.font = `${params.fontPx}px Menlo, 'Courier New', monospace`;
    tx.textBaseline = 'top';
    for (let y = 0; y < h; y++) {
      const py = y * chH;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        // 표준 휘도(luma) 가중치(BT.601) — 어두운 픽셀일수록 ramp 앞쪽(촘촘한 문자).
        const L = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const Ladj = clamp01((L / 255 - 0.5) * params.contrast + 0.5) * 255;
        const ch = ramp[Math.min(ramp.length - 1, Math.floor((Ladj / 255) * ramp.length))];
        if (ch === ' ') continue;   // 배경이 이미 채워져 있으니 스페이스는 그릴 필요 없음
        tx.fillText(ch, x * chW, py);
      }
    }
  }

  function enterTextMode() {
    resizeTextCanvas();
    mode = 'text';
    video.style.opacity = '0'; textCanvas.style.opacity = '1';
    btn.classList.add('on'); btn.textContent = 'Aa → Video';
  }
  function enterVideoMode() {
    mode = 'video';
    video.style.opacity = '1'; textCanvas.style.opacity = '0';
    btn.classList.remove('on'); btn.textContent = 'Aa → Letters';
  }

  btn.addEventListener('click', () => { if (!ready) return; mode === 'video' ? enterTextMode() : enterVideoMode(); });

  const onResize = () => { if (mode === 'text') resizeTextCanvas(); };
  addEventListener('resize', onResize);

  video.addEventListener('loadeddata', () => { ready = true; });
  video.play?.().catch(() => {});   // 자동재생 정책 대비 — 실패해도 조용히 무시(버튼 클릭 시 이미 재생 중이면 그대로 씀)

  return {
    id: 'ascii-video', label: 'ascii video', hint: 'click the button to turn the video into live text', el, params, controls,
    onEnter() { video.play?.().catch(() => {}); },
    onLeave() {},
    render() {
      if (mode !== 'text') return;
      paintFrame();
    },
  };
}
