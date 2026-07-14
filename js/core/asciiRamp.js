// 이미지/비디오 → 문자 변환에 쓰는 "밝기 → 문자" 램프를 만드는 공용 유틸.
// asciiReveal.js(이미지)와 asciiVideo.js(비디오)가 똑같이 씀 — 여기 한 곳만 손보면 둘 다 반영됨.
export const clamp01 = v => Math.min(1, Math.max(0, v));

// 예전엔 램프 순서를 눈대중으로 정했더니 글자별 실제 잉크량이 밝기 순서와 안 맞아 그레디언트가
// 울퉁불퉁해지고(같은 밝기인데 형태가 다른 글자가 섞임) 이미지의 실루엣/형태가 뭉개져 보였음.
// 그래서 후보 글자들을 실제로 작은 canvas에 그려 "잉크 커버리지(흰 픽셀 비율)"를 직접 측정해
// 밝기 순으로 정렬 — 실제 렌더된 형태 기준이라 그레디언트가 매끈해지고 원본 형태가 더 잘 살아남음.
const GLYPH_POOL = Array.from(new Set(
  " .'`^,:;!ilI|\\/()1{}[]?-_+~<>trfjxvunzcXYNJUCLQ0OZmwqpdbkhao*#MW&8%B@$0123456789"
));
const rampCache = new Map();
function measureGlyphDensity(ch, fontStr) {
  const size = 32;
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.fillStyle = '#000'; cx.fillRect(0, 0, size, size);
  cx.fillStyle = '#fff'; cx.font = fontStr; cx.textBaseline = 'middle'; cx.textAlign = 'center';
  cx.fillText(ch, size / 2, size / 2 + size * 0.06);
  const data = cx.getImageData(0, 0, size, size).data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += data[i];
  return sum / (data.length / 4) / 255;
}

// 문자 크기(fontPx)/레벨 수(levels)가 바뀌면 다시 측정해야 하므로 그 조합으로 캐시.
export function getRamp(fontPx, levels) {
  const key = Math.round(fontPx * 10) + '_' + levels;
  let ramp = rampCache.get(key);
  if (ramp) return ramp;
  const fontStr = `${fontPx * 3}px Menlo, 'Courier New', monospace`;
  const scored = GLYPH_POOL.map(ch => ({ ch, d: measureGlyphDensity(ch, fontStr) }));
  scored.sort((a, b) => b.d - a.d);   // 인덱스 0 = 잉크 제일 많음(가장 어두운 픽셀에 매핑)
  const chars = scored.map(s => s.ch);
  // 가장 진한(배경을 채우는) 자리는 항상 'N'이 오도록 — 측정상 1위였던 글자와 자리를 바꿈.
  const nIdx = chars.indexOf('N');
  if (nIdx > 0) [chars[0], chars[nIdx]] = [chars[nIdx], chars[0]];
  // 후보 글자 수(~85개) 그대로 램프로 쓰면 문자 하나당 밝기 구간이 너무 좁아져서(255/85≈3),
  // 완전한 검정이 아닌 "거의 어두운" 배경(예: 아주 짙은 회색)이 N 대신 그 옆 문자로 새버림.
  // levels개의 대표 문자만 골라 각 문자가 더 넓은 밝기 구간을 담당하게 함 — 그래야 어두운
  // 배경 전체가 안정적으로 맨 앞 문자(N) 하나로 뭉침.
  const n = Math.max(2, Math.min(levels, chars.length));
  const bucketed = Array.from({ length: n }, (_, i) => chars[Math.round(i * (chars.length - 1) / (n - 1))]);
  ramp = bucketed.join('');
  rampCache.set(key, ramp);
  return ramp;
}
