# GLSL 치트시트 — 이 프로젝트 기준

일반 GLSL 튜토리얼 대신, **우리 코드에서 실제로 반복되는 패턴만** 뽑아서 정리한 문서.
목표는 "직접 셰이더를 처음부터 짜기"가 아니라 "Claude가 짠 셰이더를 읽고 어디를 어떻게
지시하면 될지 감을 잡기"임. 제대로 배우고 싶으면
[The Book of Shaders](https://thebookofshaders.com)를 참고 — 여기 나오는 개념 대부분이
그 책의 앞부분 몇 챕터와 그대로 겹침.

## 먼저: 이건 JS가 아니다

`js/sections/*.js` 안의 `VERT`/`FRAG` 문자열은 **GLSL**이라는 별개 언어. GPU 드라이버가
직접 컴파일하고 GPU에서 실행됨(JS 엔진이 CPU에서 실행하는 것과 완전히 다른 경로). `/* glsl */`
주석은 에디터 하이라이팅용 힌트일 뿐 실제 문법 아님.

## 두 종류의 셰이더

이 프로젝트 모든 섹션은 같은 짝을 씀:

- **`VERT` (vertex shader)** — 정점 하나마다 한 번 실행. 우리는 항상 화면 전체를
  덮는 사각형(`PlaneGeometry(2,2)`, 정점 4개)만 쓰기 때문에, 거의 모든 파일에서
  **완전히 똑같은 보일러플레이트**를 재사용함:
  ```glsl
  attribute vec3 position; attribute vec2 uv;
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  ```
  "정점 위치 그대로 쓰고, uv 좌표를 프래그먼트 셰이더로 넘겨준다"가 전부. drape.js처럼
  천이 접히는 효과가 있을 때만 이 부분이 복잡해짐(정점을 실제로 움직여야 하니까).

- **`FRAG` (fragment shader)** — **화면 픽셀 하나마다 한 번** 실행. 실제 그림이 그려지는
  곳. 우리가 짜는 창작 작업의 99%가 여기 있음.

## 타입

- `float` — 실수 하나.
- `vec2`, `vec3`, `vec4` — 실수 2/3/4개 묶음. 좌표(`vec2`), 색(`vec3` = r,g,b), 색+투명도
  (`vec4`)에 씀. `.x/.y`, `.r/.g/.b` 둘 다 같은 값을 다르게 부르는 것뿐(좌표든 색이든
  그냥 숫자 묶음이라서).
- `uniform` — JS에서 매 프레임 넣어주는 값(마우스 위치, 색상, 시간 등). `material.uniforms.uFoo.value = ...`로 설정하는 게 이거.
- `varying` — vertex → fragment로 전달되는 값(`vUv`가 대표적).
- `attribute` — 정점마다 다른 값(우리는 거의 `position`/`uv`만 씀).

## 핵심 "모양 만들기" 함수 4개 — 이거만 알아도 코드 절반이 읽힘

- **`step(edge, x)`** — `x < edge`면 `0`, 아니면 `1`. **딱 끊기는 경계**를 만듦.
  예: `pixel.js`의 `step(1e-4, state)` → state가 사실상 0이면 0, 조금이라도 크면 1.
- **`smoothstep(edge0, edge1, x)`** — `step`이랑 비슷한데 `edge0`~`edge1` 사이에서
  **부드럽게** 0→1로 전환. 딱딱한 경계 대신 페이드가 필요하면 이거.
- **`mix(a, b, t)`** — `t=0`이면 `a`, `t=1`이면 `b`, 그 사이는 선형 보간. **색 섞기,
  상태 전환** 어디에나 등장. `col = mix(bg, ink, ta)`면 "배경과 잉크색을 ta 비율로 섞어라".
- **`clamp(x, lo, hi)`** — 값을 `lo`~`hi` 범위로 강제로 눌러 담음.

## 유사난수: `hash()`

GLSL엔 `Math.random()` 같은 게 없어서, 좌표를 넣으면 그럴듯하게 무작위인 숫자를 뱉는
함수를 직접 만들어 씀. 모든 파일에서 이름까지 똑같이 재사용:
```glsl
float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
```
같은 `p`를 넣으면 항상 같은 결과 → "이 그리드 셀은 항상 이 모양"처럼 프레임마다
안 바뀌는 무작위성을 만들 때 씀(도트 패턴에서 원/정사각형 랜덤 선택 등).

## UV 좌표 다루기 — 거의 모든 셰이더의 첫 줄들

- `vUv`는 화면을 (0,0)~(1,1)로 표현한 좌표(왼쪽아래~오른쪽위).
- **화면 중앙 기준으로 바꾸기**: `vec2 c = vUv - 0.5;` → 이제 중앙이 (0,0), 범위 -0.5~0.5.
- **화면 비율 보정**: `c.x *= uRes.x / uRes.y;` → 화면이 정사각형이 아니어도 원이 원으로,
  정사각형이 정사각형으로 보이게. 이거 안 하면 넓은 화면에서 도형이 찌그러짐.
- **그리드/셀로 쪼개기**(하프톤 도트, 텍스트 디졸브 등에서 반복):
  ```glsl
  vec2 grid = uRes / uCell;          // 셀이 몇 개인지
  vec2 cell = floor(vUv * grid);     // 지금 픽셀이 몇 번째 셀인지(정수 좌표)
  vec2 q = fract(vUv * grid) - 0.5;  // 그 셀 "안에서의" 상대 위치, 셀 중앙이 (0,0)
  ```
  `cell`은 "어느 칸이냐"(hash에 넣어 그 칸만의 랜덤값을 얻음), `q`는 "그 칸 안에서 어디냐"
  (원/정사각형 모양을 그리는 데 씀).

## 하프톤 심볼 4종 — 이 프로젝트의 시그니처 패턴

`eye.js`, `pattern.js`, `pixel.js`, `videoReveal.js` 등 여러 파일에 반복 등장(brand
sheet의 4가지 도형: 채워진 원/정사각형, 테두리만 원/정사각형):
```glsl
float sdDiscFilled(vec2 q){ return step(length(q), 0.44); }
float sdSquareFilled(vec2 q){ return step(max(abs(q.x), abs(q.y)), 0.44); }
float sdRingOutline(vec2 q){ return step(abs(length(q) - 0.44), 0.09); }
float sdHollowSqOutline(vec2 q){ return step(abs(max(abs(q.x), abs(q.y)) - 0.44), 0.07); }
```
- `length(q)` = 중심에서의 거리 → `0.44`보다 가까우면 1(채워진 원).
- `abs(length(q) - 0.44) < 0.09` = "반지름 0.44에서 ±0.09 폭의 띠" → 링(테두리).
- 정사각형 버전은 `length` 대신 `max(abs(q.x), abs(q.y))`(체비셰프 거리) — 원이 아니라
  정사각형 모양의 "거리".

이런 식으로 수식 하나로 도형의 안/밖을 판정하는 걸 **SDF(signed distance function)**
기법이라고 부름. 우리는 항상 `q`(셀 중심 기준 좌표)에 적용.

## 실전 예시 — 방금 물어본 코드 그대로 읽어보기

`coming.js`의 fragment shader, 한 줄씩:

```glsl
vec2 uv = vUv;
vec2 c = uv - 0.5; c.x *= uRes.x / uRes.y;      // 화면 중앙 기준 + 비율 보정
vec2 mo = uMouse - 0.5; mo.x *= uRes.x / uRes.y; // 마우스 위치도 같은 좌표계로

c -= mo * uFollow;   // 텍스트 좌표를 마우스 반대 방향으로 밀어서 "마우스 쪽으로 끌리는" 느낌

float t = uTime * uSpeed;
vec2 nd = vec2(vnoise(c*uNoiseScale + t), vnoise(c*uNoiseScale + 7.3 - t)) - 0.5;
c += nd * uIdle;    // 노이즈값(-0.5~0.5)만큼 좌표를 흔들어 "저절로 꿈틀대는" 움직임

float d = length(c - mo);                 // 마우스에서 이 픽셀까지 거리
float infl = smoothstep(0.42, 0.0, d);    // 마우스에 가까울수록 1, 멀수록 0 (부드럽게)
c += normalize(c - mo + 1e-4) * infl * uRepel;  // 가까우면 마우스 반대 방향으로 밀어냄(반발)

// 여기까지가 "좌표 c를 얼마나 왜곡시킬지" 계산. 이후 이 c로 텍스트 텍스처를 샘플링.
```

핵심 아이디어: **텍스트를 직접 움직이는 게 아니라, "어느 좌표에서 텍스트를 읽어올지"를
왜곡시켜서** 움직이는 것처럼 보이게 함. 이 프로젝트 셰이더 전반에 깔린 사고방식 — 도형을
움직이는 게 아니라 좌표를 움직인다.

## 자주 보이는 관용구 정리

| 코드 | 의미 |
|---|---|
| `texture2D(tex, uv).a` | 텍스처의 알파(투명도)값만 꺼내기 — 흑백 마스크로 자주 씀 |
| `dot(c, vec3(0.299,0.587,0.114))` | RGB를 밝기(휘도) 하나의 숫자로 변환 |
| `atan(p.y, p.x)` | 좌표를 각도로(극좌표 변환 — 소용돌이, 원형 텍스트에 씀) |
| `mod(x, 2.0)` | 짝/홀 판정, 체커보드 패턴 등에 씀 |

## 어디부터 읽으면 좋을까

가장 짧고 읽기 좋은 예시부터: `js/sections/whiteOut.js`(20줄 정도, 픽셀 커튼 하나만),
그다음 `js/sections/eye.js`(하프톤+텍스처 합성), 마지막에 `js/sections/pixel.js`나
`hero.js`(가장 복잡함, 박스 배열/소용돌이 수학까지 있음).
