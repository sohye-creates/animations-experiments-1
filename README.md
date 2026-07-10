# wks-animations — 프로젝트 노트

이 문서는 지금까지 나눈 아키텍처 논의(워드프레스 커스텀 템플릿으로 어떻게 옮길지, 폴더 구조,
JS 구성, 성능 계획)를 정리한 것. 채팅이 사라져도 이 파일만 보면 맥락을 이어갈 수 있도록 작성함.

## 지금 이 repo는 무엇인가

**프로토타입 샌드박스.** 워드프레스도 PHP도 없는 순수 HTML/JS/CSS. 각 애니메이션 섹션을
독립적으로 빠르게 만들고 튜닝하기 위한 놀이터이고, 최종적으로는 **회사의 워드프레스 커스텀
페이지 템플릿**으로 옮겨갈 것을 전제로 짜여 있음(그래서 처음부터 PHP가 아니라 HTML로 시작함 —
JS 엔진 레이어는 템플릿 엔진이 뭔지 몰라도 되게 하기 위해서).

## 현재 아키텍처 (as-is)

- **빌드 도구 없음.** `index.html`의 `<script type="importmap">`으로 `three`/`lenis`/`lil-gui`를
  esm.sh CDN에서 직접 resolve. `js/main.js`가 진입점, `type="module"`.
- **섹션 패턴**: `js/sections/*.js` 각 파일이 `export function createXxx()`를 내보내고,
  아래 shape을 리턴함:
  ```js
  { id, label, hint, el, params, controls, onEnter?, onLeave?, render(now, s) {...} }
  ```
  `main.js`가 이 섹션들을 배열로 모아 스크롤 위치 기준으로 "지금 활성 섹션"을 판정하고,
  **그 섹션의 `render()`만 호출**함(다른 섹션은 안 그림 — 이미 성능상 중요한 습관).
- **렌더링**: three.js. 화면 전체를 덮는 `PlaneGeometry(2,2)` + `RawShaderMaterial`
  (직접 작성한 GLSL) 조합이 거의 모든 섹션의 기본형. 원래는 ogl을 썼는데, 사용자가 ogl
  코드를 읽고 고치기 어려워해서 three.js로 전량 이전함(2026-07, 14개 파일). GLSL 셰이더
  코드 자체는 한 글자도 안 바뀜 — JS 쪽 래퍼 API만 바뀐 것(`Program`→`RawShaderMaterial`,
  `Mesh/Plane`→`THREE.Mesh/PlaneGeometry`, `Transform`→`THREE.Scene` 등).
- **스크롤**: Lenis, 지금은 자체 `requestAnimationFrame` 루프에서 `lenis.raf(now)` 호출.
  → **바뀔 계획**: 아래 "GSAP ticker" 섹션 참고.
- **디자이너 패널**: `lil-gui`. 섹션의 `params`(라이브 값) + `controls`(슬라이더/컬러피커
  메타데이터) 배열을 `main.js`가 자동으로 패널 폴더에 바인딩. 색은 항상 hex 문자열
  (`THREE.Color`가 hex 문자열을 직접 받음).
- **하나의 공유 캔버스**: `core.js`가 렌더러/카메라를 한 번만 만들고 모든 섹션이 공유.
  DOM 오버레이가 필요한 경우(`videoReveal.js`의 `<video>`, `heroPixels.js`의 자체
  Canvas2D)는 `document.body`에 별도 엘리먼트를 붙이고 `onEnter`/`onLeave`로
  보이기/숨기기 토글하는 패턴을 씀.

### 지금 있는 섹션 인벤토리

| 파일 | 용도 |
|---|---|
| `eye.js` | 하프톤 눈 + 커서 추적 눈동자 |
| `logo.js` | 반분할 로고 픽셀 크로스페이드 |
| `pixel.js` | 문장 단위 픽셀 리빌 텍스트 |
| `transition.js` | 픽셀 커튼 페이지 전환 |
| `drape.js` | 스크롤에 접히는 천 갤러리 |
| `pattern.js` | 커서 주변 브랜드 도형 채우기 |
| `cursor.js` | 커서 따라다니는 View/More 버튼(데모) |
| `list.js` | 방향 인식 hover 리스트 (News & Insights) |
| `heroPixels.js` | **flow의 hero 자리** — 원형 텍스트 링에서 파티클이 흘러 키홀로. Canvas2D(three.js 아님, 의도적) |
| `videoReveal.js` | drape 다음, 비디오가 풀스크린으로 커지며 귀 그래픽 등장 |
| `whiteOut.js` | 비디오가 픽셀 커튼과 함께 하양으로 dissolve |
| `hero.js` | (보존용, 현재 미사용) 옛 WebGL 버전 hero — heroPixels로 대체됨 |
| `coming.js` | (보존용, 현재 미사용) "warp text" 섹션 |

`main.js`는 위 개별 섹션들을 데모용으로 나열한 뒤, **끝에 flow 시퀀스**(hero-pixels → pixel
→ transition → drape → video-reveal → white-out, "client 섹션 직전까지")를 별도 인스턴스로
이어붙임 — 기존 데모 섹션들은 안 건드리고 재사용(`createPixel()` 등을 두 번째로 호출해서
`.id`/`.label`/`.el.id`만 다르게 재부여).

## 목표 아키텍처: 워드프레스 커스텀 템플릿

**참고 컨벤션**: 회사의 luray-wood 프로젝트(`w64-base` 테마)의 실제 구조를 참고함. 단, 그
테마 인스턴스 자체를 재사용하는 게 아니라 **같은 컨벤션으로 새 테마를 처음부터 만드는 것**.

### 빌드 도구: gulp + esbuild

w64-base는 gulp로 PostCSS 컴파일 + 완성된 JS 파일 하나를 minify만 함 — **ES 모듈 `import`
그래프를 번들링하는 건 안 함**(전역 스크립트 방식이라 애초에 필요 없었음). 우리는 12개+
파일이 서로 `import`하고 `three`를 `import`하는 진짜 ESM 그래프라서 plain gulp로는 부족함.

→ **결론**: gulp는 그대로 익숙한 커맨드로 유지하고, JS 태스크만 `gulp-esbuild`로 바꿔서
esbuild가 import 그래프를 하나의 classic IIFE 스크립트로 번들링하게 함. 산출물은 결국
w64-base의 `theme.js`/`block.js`와 똑같은 모양(전역 스크립트, `type=module` 아님)이라
`wp_enqueue_script` 의존성 배열 패턴을 그대로 재사용 가능.

three.js는 ESM 빌드만 배포되고 UMD/전역 빌드가 없어서(ogl도 마찬가지였음), w64-base처럼
`assets/js/vendor/`에 다운받아 `<script>` 태그로 붙이는 방식이 원천적으로 불가능함 —
반드시 esbuild 같은 번들러를 거쳐야 함. (GSAP/Swiper처럼 UMD 빌드가 있는 라이브러리는
계속 vendor 폴더 방식으로 가능.)

### 폴더 구조 (w64-base 컨벤션 그대로)

```
template-parts/
  content/<name>/    block.php + block.pcss + block.css + block.js + block.json
  blocks/<name>/      (위와 동일 세트 — 재사용 가능한 ACF 블록)
  layout/<name>/      header, footer 등
src/
  css/abstracts/      variables.pcss (색/폰트 토큰)
  css/base/           reset, typography, global, animations
  css/components/      버튼 등 공용 컴포넌트
  js/                  공유 엔진 모듈(아래 "공유 모듈" 섹션)
assets/
  js/vendor/           GSAP, Lenis 등 UMD 빌드 다운로드본
  js/                  esbuild 산출물(번들된 theme.js)
acf-json/              ACF 필드 그룹 정의(버전관리됨)
```

각 `block.php`는 `file_get_contents(__DIR__.'/block.css')`로 자기 스타일을 인라인 삽입함
(어디서 렌더링되든 별도 HTTP 요청 없이 항상 스타일이 적용됨).

### 콘텐츠 2단 구조 — Tier 1(고정 시퀀스) vs Tier 2(모듈형)

지금 flow 시퀀스(hero-pixels~white-out)처럼 **순서가 절대 바뀌면 안 되고 섹션 간 전환이
서로를 알아야 하는 연출**은 Gutenberg 블록 에디터를 아예 안 씀:

- **Tier 1 — 고정 인트로**: ACF **Options Page**(블록 에디터 아님, 그냥 관리자 설정
  화면) 하나에 헤드라인 텍스트, 비디오 파일 같은 필드 몇 개만 둠. 순서·전환 타이밍은
  코드에 고정. 에디터가 순서를 바꿀 수 있는 여지 자체를 없애는 게 목적.
- **Tier 2 — 모듈형 콘텐츠**: Client/Partners(로고 repeater 필드를 가진 일반 ACF 블록),
  News(CPT로 만들고 "최신 N개" 쿼리 블록 하나) — 여긴 재배치·반복 추가가 자연스러운
  것들이라 진짜 Gutenberg 블록으로.

이 구분이 필요한 이유: 스크롤 진행도 기반 타이밍(예: `transition.js`의
`curtainEnd: 0.7, contentStart: 0.82`)은 **총 스크롤 높이가 예측 가능해야** 의미가 있음.
콘텐츠가 에디터 입력에 따라 들쭉날쭉해지면 이 숫자들이 매번 어긋남. 다행히 이 사이트는
회사 자체 사이트라 내용이 자주/크게 바뀌지 않으므로, 대부분 섹션 높이는 CSS에 **고정값**으로
박아두면 됨. 리스트형(drape의 프로젝트 개수, news 아이템 수)만 "개수 → 높이" 공식으로
계산(런타임에 다시 측정하는 게 아니라, 알고 있는 개수로 즉시 계산).

### 데이터 흐름: ACF → PHP → JS

지금은 콘텐츠가 JS에 하드코딩돼 있음(`pixel.js`의 `WORDS` 배열, `hero.js`의 원형 텍스트
문구 등). 워드프레스로 옮길 때 이걸 분리해야 함 — "엔진(어떻게 그릴지)"과 "콘텐츠(뭘
그릴지)"를 나누는 게 핵심 원칙. w64-base에 이미 두 가지 패턴이 있고 둘 다 씀:

- **`data-*` 속성**: 단순 플래그/짧은 값(`document.body.dataset.headerTheme`처럼).
- **`wp_localize_script`**: 복잡하거나 중첩된 데이터(리스트, 반복 필드)를 전역 JS
  객체로 통째로 넘김.

### GSAP ticker + Lenis — "하나의 시계"

w64-base의 `theme.js`가 쓰는 패턴, 우리도 그대로 가져가기로 함:

```js
gsap.registerPlugin(ScrollTrigger); // ScrollTrigger를 실제로 쓸 때만
const lenis = new Lenis({ autoRaf: false, lerp: 0.08, smoothWheel: true });
gsap.ticker.add((time) => lenis.raf(time * 1000)); // GSAP 시계에 Lenis를 얹음
gsap.ticker.lagSmoothing(0); // 탭 백그라운드 복귀 시 시간 뭉개기 보정 끄기(Lenis와 상충)
lenis.on('scroll', ScrollTrigger.update); // Lenis는 가짜 스크롤이라 ScrollTrigger에 수동 알림
```

**우리 쪽에서 바꿔야 할 것**: `main.js`의 자체 `requestAnimationFrame(loop)` 재귀 호출을
없애고 `gsap.ticker.add(loop)`로 한 번만 등록 — three.js 렌더링도 Lenis 스크롤도 같은
GSAP 시계 위에서 돌게. (⚠️ 아직 코드에 적용 안 함 — 논의만 된 상태. 지금 `core.js`는
여전히 자체 Lenis 인스턴스를 직접 `autoRaf` 기본값으로 만들고 있음.)

중요: 이건 luray-wood(w64-base)의 **살아있는 `window.lenis`를 공유하자는 게 아님** — 우리
새 테마 안에서 독립적으로 같은 패턴으로 새로 만드는 것. 별개의 사이트, 별개의 인스턴스.

## 성능 계획

### ESM 자체는 성능과 무관함 — 중요한 구분

ESM(모듈)은 **개발 편의/유지보수 도구**이지 그 자체로 런타임이 빨라지진 않음. 성능은
"코드가 언제 로드되는가"와 "매 프레임 뭘 하는가"에서 결정됨. 다만 ESM이 있어야만 가능한
두 가지 기법이 실제 성능에 기여함:

1. **코드 스플리팅 / 지연 로딩** — 아래 상세.
2. **트리셰이킹** — 번들러가 안 쓰는 export를 걸러내 최종 산출물을 줄임.

### 섹션별 지연 로딩 (계획, 미구현)

지금 `main.js`는 12개+ 섹션을 페이지 로드 즉시 static import로 전부 받아옴. 계획:

```js
const manifest = [
  { id: 'eye', label: 'eye', height: '100vh',
    load: () => import('./sections/eye.js').then(m => m.createEye()) },
  // ...
];
```

- `import()`를 함수 안에 넣으면 **실제로 호출되기 전까지 fetch/파싱이 안 일어남**.
- `IntersectionObserver`(큰 `rootMargin`, 예: `150% 0px`)로 "화면에 닿기 전에 미리"
  트리거 → 사용자가 실제로 도착했을 땐 이미 로드 완료.
- **placeholder div가 높이를 미리 예약**해야 함(안 그러면 로드될 때 페이지가 출렁이고
  Lenis 스크롤 높이 계산이 불안정해짐) — 값은 지금 `styles.css`에 있는 고정 `vh`/px
  값을 그대로 사용.
- **첫 화면에 보이는 섹션(예: eye.js)은 지연 로딩 대상에서 제외** — static import 유지.
  안 그러면 첫 페인트가 빈 화면이 됨.
- 리사이즈는 대부분 걱정 없음: `vh` 기반 높이는 CSS가 공짜로 재계산함. 콘텐츠
  개수 기반 높이(drape)만 "개수→높이" 공식으로 계산.
- **발견한 기존 버그(미수정)**: `drape.js`의 `scroller.style.paddingBottom = innerHeight
  + 'px'`가 생성 시점에 한 번만 설정되고 리사이즈 리스너가 없음. 지연 로딩 작업할 때
  같이 고치기로 함.

### luray-wood 성능 문제 — 아직 프로파일링 안 함

luray-wood에서 성능이 제일 큰 문제였다고 했는데, **실제로 뭐가 느렸는지는 아직 확인 안
함**(폴더 구조만 참고했고 런타임 프로파일링은 안 했음). 다음에 필요하면 Lighthouse/DevTools
Performance 탭으로 실제 병목을 확인하고 그 데이터를 기반으로 우선순위를 정하기로 함 —
추측성 조언보다 실측이 먼저.

### 이미 지키고 있는 좋은 습관

- 활성 섹션만 `render()` 호출(비활성 섹션은 그리지 않음).
- `devicePixelRatio`를 2로 캡(`Math.min(2, devicePixelRatio)`).
- `heroPixels.js`: 파티클 상한(8000), 화면이 다 덮이면 시뮬레이션 스킵 등 CPU 기반
  Canvas2D라서 특별히 신경 쓴 예산 관리(GLSL/GPU 기반 섹션들은 이런 미세 관리가
  거의 필요 없었음 — GPU 병렬성 덕분).

## 공유 엔진 모듈로 뽑아낼 것들 (계획, 미구현)

지금 반복되는 패턴 3가지를 "섹션"이 아니라 "코어"로 승격시키기로 함:

1. **하프톤/픽셀화** (`core/halftone.js` + `core/symbols.js`) — `eye.js`, `pattern.js`,
   `pixel.js`, `videoReveal.js`, `transition.js`, `heroPixels.js`가 각자 따로 구현하고
   있는 4종 심볼(채워진 원/정사각형, 테두리만 원/정사각형) SDF 함수 + "셀 하나당 한 번
   판정" 패턴. 비율 상수(원 반지름 0.44, 테두리 두께 0.09/0.07 등)를 한 곳에서 관리.
2. **전역 커서** (`core/cursor.js`) — 지금 `cursor.js`는 그 섹션 안에서만 도는 데모.
   페이지 전역에서 한 번만 뜨고, `data-cursor="label"` 속성이 붙은 아무 엘리먼트에나
   반응하게. 명암 반전은 JS 색상 계산 대신 `mix-blend-mode: difference`로(배경이 뭐든
   자동 반전).
3. **부트 시퀀스** (`core/boot.js`) — GSAP ticker 기반 단일 시계, Lenis 초기화, 폰트
  로드, 매니페스트 기반 섹션 조립을 한 곳에 정리.

## 왜 three.js인가 (ogl에서 이전한 이유)

기술적으로는 지금 프로젝트 규모(화면 전체 사각형 + 커스텀 셰이더, 진짜 3D 씬 아님)엔
ogl이 더 가볍고 정확히 맞는 선택이었음. 그런데:

- 사용자가 ogl 코드를 읽고 고치기 거의 불가능하다고 느낌 — 문서/커뮤니티/튜토리얼 양이
  three.js에 압도적으로 못 미침.
- three.js는 학습 자료가 훨씬 많고, AI(Claude)도 three.js 패턴을 훨씬 많이 접해서 협업
  디버깅이 빨라짐.
- **GLSL 셰이더 코드 자체는 라이브러리와 무관**(순수 GLSL, GPU 드라이버가 컴파일) —
  그래서 마이그레이션 때 셰이더 문자열은 한 글자도 안 바뀌고 JS 래퍼 API만 바뀜.
  "본인이 못 읽고 못 고치는 도구는 기술적으로 최적이어도 실질적으로 좋은 도구가 아니다"
  라는 판단으로 전환 결정.
- 2026-07에 14개 파일(`core.js`, `text.js` + 12개 섹션) 전량 이전 완료, Playwright로
  전체 리그레션 확인(콘솔 에러 0). `index.html` import map에서 `ogl` 제거.

## 참고: GLSL은 별개의 언어

`js/sections/*.js` 안의 `VERT`/`FRAG` 템플릿 리터럴은 **JavaScript가 아니라 GLSL**
(OpenGL Shading Language) 코드임. GPU 드라이버가 직접 컴파일하는 별도 언어라서 ogl이든
three.js든 그 어떤 WebGL 래퍼를 쓰든 완전히 동일하게 통함 — 이게 왜 마이그레이션 때
셰이더 코드를 안 건드려도 됐는지의 이유. 사용자가 GLSL을 배우기로 하면 별도 문서
(`docs/glsl-notes.md`)에 이 코드베이스에서 반복되는 패턴 위주로 정리해둠.
