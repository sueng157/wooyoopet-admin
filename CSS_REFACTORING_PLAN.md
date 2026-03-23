# 🔧 CSS 리팩터링 계획서 (확정본)

**프로젝트**: 우유펫 관리자 대시보드  
**대상**: 14개 CSS (3,453줄), 42개 HTML  
**작성일**: 2026-03-23  
**상태**: Phase 1 완료 ✅ / Phase 2 완료 ✅ / Phase 3 완료 ✅ / Phase 4 완료 ✅ / Phase 5~6 대기

---

## 📊 현황 분석

| 항목 | 수치 |
|------|------|
| CSS 파일 수 | 14개 |
| 총 CSS 라인 수 | 3,453줄 → **3,080줄** (Phase 1~4 완료 후, -10.8%) |
| 배지 클래스 (CSS 정의) | 120개 → **7개** (+ 대시보드 전용 5개) |
| 배지 클래스 (HTML 실제 사용) | 109개 → **7색 클래스로 통합 완료** |
| CSS에만 있고 HTML 미사용 배지 | 11개 → **badge--settlement 삭제, 나머지 10개 7색 변환 후 유지** |
| 배지 색상 조합 | 실질 5가지 + 비표준 3가지 → **7가지 통일** |
| HTML 내 배지 사용 총 횟수 | **500회** (30개 HTML 파일) — 전수 치환 완료 |
| 중복 정의 클래스 | 배지 8종 + 모달 7종 = 15종 → **0종** |
| 빈 CSS 파일 | 2개 (`members.css`, `kindergartens.css`) |
| 폼 컴포넌트 중복 세트 | 2세트 → **1세트 (`form-*`)** Phase 4 완료 ✅ |

---

## 작업 1: 7색 배지 시스템 도입 (방법 B — HTML+CSS 전면 수정)

### 1-1. 신규 색상 체계

`:root`에 배지 전용 CSS 변수 추가:

| 색상명 | 변수명 (fg/bg) | 글자색 | 배경색 | 용도 |
|--------|---------------|--------|--------|------|
| 🔵 **blue** | `--badge-blue-*` | `#339DEE` | `rgba(51,157,238, 0.10)` | 메인 강조, 진행중, 신선도 |
| 🟢 **green** | `--badge-green-*` | `#2ECC71` | `rgba(46,204,113, 0.10)` | 완료, 정상, 승인, 활성 |
| 🟡 **orange** | `--badge-orange-*` | `#F5A623` | `rgba(245,166,35, 0.10)` | 대기, 경고, 심사중 |
| 🔴 **red** | `--badge-red-*` | `#E05A3A` | `rgba(224,90,58, 0.10)` | 실패, 거절, 위험, 정지 |
| ⚪ **gray** | `--badge-gray-*` | `#8C9AA5` | `rgba(0,0,0, 0.04)` | 비활성, 미완료, 해당없음 |
| 🟤 **brown** | `--badge-brown-*` | `#7B4F32` | `rgba(123,79,50, 0.10)` | 보호자 관련 |
| 🩷 **pink** | `--badge-pink-*` | `#FF4F81` | `rgba(255,79,129, 0.10)` | 유치원 관련 |

> 기존 `accent(#4294FF)` → `blue(#339DEE)`로 통합  
> 모바일 앱 실제 컬러 반영: 메인(`#339DEE`), 보호자(`#7B4F32`), 유치원(`#FF4F81`)

### 1-2. CSS 변경 — 120개 시맨틱 배지 → 7개 색상 클래스

**Before** (현재):
```css
/* 120줄 — 같은 색을 각각 정의 */
.badge--normal    { background: rgba(46,204,113,0.10); color: #2ECC71; }
.badge--paid      { background: rgba(46,204,113,0.10); color: #2ECC71; }
.badge--verified  { background: rgba(46,204,113,0.10); color: #2ECC71; }
/* ... 117개 더 ... */
```

**After** (리팩터링 후):
```css
/* 7줄 — 색상 클래스만 정의 */
.badge--c-blue   { background: var(--badge-blue-bg);   color: var(--badge-blue-fg); }
.badge--c-green  { background: var(--badge-green-bg);  color: var(--badge-green-fg); }
.badge--c-orange { background: var(--badge-orange-bg); color: var(--badge-orange-fg); }
.badge--c-red    { background: var(--badge-red-bg);    color: var(--badge-red-fg); }
.badge--c-gray   { background: var(--badge-gray-bg);   color: var(--badge-gray-fg); }
.badge--c-brown  { background: var(--badge-brown-bg);  color: var(--badge-brown-fg); }
.badge--c-pink   { background: var(--badge-pink-bg);   color: var(--badge-pink-fg); }
```

### 1-3. HTML 변경 — 30개 파일, 500회 치환

**Before**:
```html
<span class="badge badge--normal">정상</span>
<span class="badge badge--guardian">보호자</span>
<span class="badge badge--kindergarten">유치원</span>
```

**After**:
```html
<span class="badge badge--c-green">정상</span>
<span class="badge badge--c-brown">보호자</span>
<span class="badge badge--c-pink">유치원</span>
```

### 1-4. 전체 배지 매핑표

#### 🔵 blue → `badge--c-blue`

| 기존 클래스 | 라벨 | HTML 사용수 |
|------------|------|------------|
| `badge--res-confirmed` | 예약확정 | 7 |
| `badge--res-ongoing` | 돌봄진행중 | 3 |
| `badge--registering` | 등록중 | 5 |
| `badge--required` | 필수 | 5 |
| `badge--rep-yes` | 대표 | 5 |
| `badge--primary-pet` | 대표반려동물 | 1 |
| `badge--pickup-yes` | 픽업있음 | 4 |
| `badge--rpt-processing` | 처리중 | 2 |
| `badge--male` | 수컷 | 7 |
| `badge--satis-good` | 좋았어요 | 8 |
| `badge--stg-opinion` | 의견제출 | 7 |
| `badge--stg-super` | 최고관리자 | 1 |
| `badge--stl-care` | 돌봄 | 7 |
| `badge--cnt-scheduled` | 예정 | 1 |
| `badge--reservation` | 예약 (대시보드) | 1 |
| `badge--signup` | 가입 (대시보드) | 1 |

#### 🟢 green → `badge--c-green`

| 기존 클래스 | 라벨 | HTML 사용수 |
|------------|------|------------|
| `badge--normal` | 정상 | 12 |
| `badge--verified` | 인증완료 | 13 |
| `badge--done` | 완료 | 16 |
| `badge--completed` | 이수완료 | 26 |
| `badge--paid` | 결제완료 | 3 |
| `badge--pay-completed` | 결제완료 | 9 |
| `badge--open` | 영업중 | 10 |
| `badge--neutered` | 중성화 | 6 |
| `badge--vaccinated` | 접종완료 | 7 |
| `badge--approved` | 승인 | 4 |
| `badge--registered` | 등록완료 | 11 |
| `badge--res-completed` | 돌봄완료 | 7 |
| `badge--satis-best` | 최고예요 | 10 |
| `badge--pledge-yes` | 서약완료 | 3 |
| `badge--cnt-exposing` | 노출중 | 1 |
| `badge--cnt-public` | 공개 | 14 |
| `badge--chat-active` | 활성 | 7 |
| `badge--rpt-completed` | 처리완료 | 2 |
| `badge--stg-active` | 활성 | 6 |
| `badge--stg-checked` | 확인 | 6 |
| `badge--stg-normal` | 일반관리자 | 4 |
| `badge--stl-completed` | 정산완료 | 4 |
| `badge--checkout-confirmed` | 하원확인 | 1 |
| `badge--refund-complete` | 환불완료 | 7 |
| `badge--version-current` | 현재버전 | 4 |
| `badge--version-match` | 버전일치 | 2 |
| `badge--payment` | 결제 (대시보드) | 1 |
| ~~`badge--settlement`~~ | ~~정산 (대시보드)~~ | ~~삭제 완료~~ |
| `badge--claim-accepted` | 소명수락 | 0 (미사용) |
| `badge--review-visible` | 노출 | 0 (미사용) |

#### 🟡 orange → `badge--c-orange`

| 기존 클래스 | 라벨 | HTML 사용수 |
|------------|------|------------|
| `badge--reviewing` | 심사중 | 5 |
| `badge--res-pending` | 수락대기 | 3 |
| `badge--submitted` | 제출 | 2 |
| `badge--in-progress` | 진행중 | 6 |
| `badge--refunded` | 환불완료 | 1 |
| `badge--vacation` | 휴무 | 2 |
| `badge--size-m` | 중형 | 2 |
| `badge--stl-scheduled` | 정산예정 | 4 |
| `badge--stl-penalty` | 위약금 | 2 |
| `badge--stg-unchecked` | 미확인 | 5 |
| `badge--claim-received` | 소명접수 | 2 |
| `badge--rpt-received` | 신고접수 | 4 |
| `badge--guardian-only-yes` | 보호자전용 | 5 |
| `badge--warning` | 경고 | 1 |
| `badge--cancel` | 취소 (대시보드) | 1 |
| `badge--refund-processing` | 환불처리중 | 2 |
| `badge--checkout-pending` | 하원대기 | 0 (미사용) |

#### 🔴 red → `badge--c-red`

| 기존 클래스 | 라벨 | HTML 사용수 |
|------------|------|------------|
| `badge--suspended` | 정지 | 5 |
| `badge--cancelled` | 취소 | 1 |
| `badge--noshow` | 노쇼 | 2 |
| `badge--res-noshow` | 노쇼 | 1 |
| `badge--res-rejected` | 거절 | 1 |
| `badge--pay-cancelled` | 결제취소 | 2 |
| `badge--reg-failed` | 등록실패 | 3 |
| `badge--pledge-no` | 미서약 | 4 |
| `badge--female` | 암컷 | 2 |
| `badge--satis-bad` | 아쉬워요 | 5 |
| `badge--size-l` | 대형 | 2 |
| `badge--cnt-required` | 필수 | 5 |
| `badge--stl-hold` | 보류 | 1 |
| `badge--claim-rejected` | 소명거절 | 1 |
| `badge--report` | 신고 (대시보드) | 1 |
| `badge--refund-failed` | 환불실패 | 1 |
| `badge--cancel-requester-admin` | 관리자취소 | 1 |
| `badge--version-mismatch` | 버전불일치 | 0 (미사용) |
| `badge--permanent` | 영구제재 | 0 (미사용) |
| `badge--rejected` | 거절 | 0 (미사용) |
| `badge--review-hidden` | 숨김 | 0 (미사용) |

#### ⚪ gray → `badge--c-gray`

| 기존 클래스 | 라벨 | HTML 사용수 |
|------------|------|------------|
| `badge--withdrawn` | 탈퇴 | 1 |
| `badge--unverified` | 미인증 | 2 |
| `badge--notdone` | 미완료 | 1 |
| `badge--optional` | 선택 | 2 |
| `badge--not-neutered` | 미중성화 | 3 |
| `badge--not-vaccinated` | 미접종 | 2 |
| `badge--not-started` | 미시작 | 8 |
| `badge--drafting` | 작성중 | 2 |
| `badge--unregistered` | 미등록 | 4 |
| `badge--rep-no` | 비대표 | 3 |
| `badge--pickup-no` | 픽업없음 | 5 |
| `badge--guardian-only-no` | 전체공개 | 9 |
| `badge--res-cancel-g` | 보호자취소 | 2 |
| `badge--res-cancel-k` | 유치원취소 | 1 |
| `badge--cnt-ended` | 종료 | 2 |
| `badge--cnt-optional` | 선택 | 2 |
| `badge--cnt-private` | 비공개 | 3 |
| `badge--cnt-target-all` | 전체 | 5 |
| `badge--chat-inactive` | 비활성 | 2 |
| `badge--rpt-dismissed` | 기각 | 2 |
| `badge--stg-inactive` | 비활성 | 2 |
| `badge--stg-viewer` | 조회전용 | 3 |
| `badge--stg-withdrawal` | 탈퇴사유 | 4 |
| `badge--version-old` | 이전버전 | 3 |
| `badge--actor-system` | 시스템 | 4 |
| `badge--no-sanction` | 제재없음 | 0 (미사용) |
| `badge--actor-admin` | 관리자 | 0 (미사용) |

#### 🟤 brown → `badge--c-brown` (보호자)

| 기존 클래스 | 라벨 | HTML 사용수 |
|------------|------|------------|
| `badge--guardian` | 보호자 | 28 |
| `badge--cnt-target-guardian` | 대상:보호자 | 2 |
| `badge--cancel-requester-guardian` | 취소요청:보호자 | 6 |
| `badge--actor-guardian` | 행위자:보호자 | 0 (미사용) |

#### 🩷 pink → `badge--c-pink` (유치원)

| 기존 클래스 | 라벨 | HTML 사용수 |
|------------|------|------------|
| `badge--kindergarten` | 유치원 | 21 |
| `badge--cnt-target-kg` | 대상:유치원 | 2 |
| `badge--cancel-requester-kindergarten` | 취소요청:유치원 | 2 |
| `badge--actor-kindergarten` | 행위자:유치원 | 3 |

### 1-5. 미사용 배지 처리 (CSS 정의만 있고 HTML 미사용 11개)

| 배지 | 색상 | 조치 | 사유 |
|------|------|------|------|
| `badge--settlement` | green | ✅ **삭제 완료** | 대시보드에서 미사용 확인 (Phase 2에서 삭제) |
| 나머지 10개 | 각색 | **유지 (7색 클래스로 변환됨)** | JS/백엔드 동적 렌더링 가능성 |

### 1-6. `.badge` 기본 클래스 이중 정의 해소

| 파일 | font-size | 조치 |
|------|-----------|------|
| `common.css` | 12px | badge 섹션 전체 삭제 (대시보드 배지 6개 포함) |
| `components.css` | 11px | 유일한 정의로 유지 |

대시보드 배지 5개(`badge--reservation` 등)는 `common.css`에 시맨틱 이름 유지 + `--badge-*` CSS 변수 사용으로 변경. `badge--settlement`은 삭제. HTML(`index.html`)에서는 7색 클래스(`badge--c-blue` 등)로 변환 완료.
> ⚠️ common.css의 시맨틱 정의 5개는 현재 HTML에서 미참조 상태(죽은 코드). Phase 6에서 정리 예정.

### 1-7. 신선도, 채팅 말풍선 색상 변경

| 대상 | 현재 | 변경 후 |
|------|------|---------|
| `.freshness--good` | `#2ECC71` | **변경 안 함 (유지)** — 신선도는 긍정/부정 의미이므로 green 유지가 적합 |
| `.chat-bubble--guardian` 배경 | `rgba(51,157,238, 0.10)` | `rgba(123,79,50, 0.10)` (brown) |
| `.chat-bubble--kindergarten` 배경 | `rgba(245,166,35, 0.10)` | `rgba(255,79,129, 0.10)` (pink) |

### 1-8. 작업량 요약

| 항목 | 계획 | 실측 |
|------|------|------|
| CSS 파일 수정 | 10개 | 11개 |
| HTML 파일 수정 | 30개 | 37개 |
| 배지 클래스 치환 | 500회 | 500회 |
| 파일 총 변경 | — | **50개** (CSS 11 + HTML 37 + 문서 2) |
| CSS 줄 변화 | ~-135줄 | **-205줄** (3,453 → 3,248) |
| PR | — | **#30** (머지 완료) |

---

## 작업 2: 중복 모달 스타일 → `components.css` 승격

### 2-1. 대상 클래스

| 클래스 | 중복 파일 수 | 파일 목록 |
|--------|------------|-----------|
| `.modal__btn--confirm-primary` | 5곳 | payments, chats, reviews, educations, contents |
| `.modal__btn--confirm-warning` | 2곳 | reservations, contents |
| `.modal__btn--confirm-danger` | 1곳 | reservations (공통 패턴이므로 승격) |
| `.modal__title--primary` | 4곳 | payments, chats, reviews, settings |
| `.modal__title--warning` | 3곳 | payments, chats, settings |
| `.modal__select` | 1곳 | reservations (범용이므로 승격) |
| `.modal__warning` | 1곳 | reservations (범용이므로 승격) |

### 2-2. 작업 내용

- `components.css` 모달 섹션 끝에 위 7개 클래스 1회 정의
- 각 페이지 CSS에서 해당 정의 삭제

### 2-3. 작업량

| 항목 | 수량 |
|------|------|
| 항목 | 계획 | 실측 |
|------|------|------|
| CSS 파일 수정 | 6개 | 8개 (+ components.css 추가, settings.css 추가) |
| HTML 파일 수정 | 0개 | 0개 |
| CSS 줄 삭제 | ~55줄 | 86줄 |
| CSS 줄 추가 | ~25줄 | — (net -86줄) |
| CSS 줄 변화 | — | 3,248줄 → 3,162줄 (-2.6%) |

### 2-4. 실행 결과 (Phase 3 완료 — PR #31)

| 항목 | 결과 |
|------|------|
| 추가 | components.css에 7개 모달 클래스 + `:disabled` 상태 일괄 정의 |
| 삭제 | 7개 파일에서 중복 모달 정의 제거 (chats, contents, educations, payments, reviews, settings, reservations) |
| 하드코딩 치환 | `#E05A3A` → `var(--danger)`, `#F5A623` → `var(--warning)` (components.css 내 5곳) |
| 통일 결정 | `:hover`는 부모 `.modal__btn`에서 상속 (별도 정의 안 함), `:disabled`는 각 confirm 버튼에 정의 |
| font-weight | 부모 `.modal__btn`의 700으로 통일 (contents.css에서 600이었던 것 수정) |
| HTML 변경 | 0개 |
| PR | #31 (머지 완료) |

---

## 작업 3: 폼 컴포넌트 통합 (`cnt-*` / `stg-*` → `form-*`)

### 3-1. 통합 대상

| 현재 (contents.css) | 현재 (settings.css) | 통합 후 (components.css) |
|--------------------|--------------------|------------------------|
| `.cnt-input` | `.stg-input` | `.form-input` |
| `.cnt-input--short` | `.stg-input--short` | `.form-input--short` |
| — | `.stg-input--xs` | `.form-input--xs` |
| — | `.stg-input--date` | `.form-input--date` |
| — | `.stg-input--time` | `.form-input--time` |
| `.cnt-select` | `.stg-select` | `.form-select` |
| `.cnt-radio` | `.stg-radio` | `.form-radio` |
| `.cnt-checkbox` | — | `.form-checkbox` |
| `.cnt-textarea` | `.stg-textarea` | `.form-textarea` |
| `.cnt-textarea--tall` | `.stg-textarea--tall` | `.form-textarea--tall` |
| — | `.stg-textarea--short` | `.form-textarea--short` |

### 3-2. 페이지 전용으로 유지하는 클래스

**settings.css에 남는 것**:
`stg-input-group`, `stg-input-suffix`, `stg-hint`, `stg-fixed-text`, `stg-save-row`, `stg-preview-cell`, `stg-login-success`, `stg-login-fail`, `stg-permission-select`, `stg-datetime-group`, `stg-memo-actions`

**contents.css에 남는 것**:
`cnt-category` + 5종, `cnt-thumb`, `cnt-image-preview` + 변형, `cnt-image-actions`, `cnt-file-row`, `cnt-file-name`, `cnt-link-cell`, `cnt-pin-cell`, `cnt-full-width`

### 3-3. 작업량

| 항목 | 수량 |
|------|------|
| CSS 파일 수정 | 3개 (components, contents, settings) |
| HTML 파일 수정 | 12개 (content-* 8개 + setting-* 4개) |
| CSS 줄 삭제 | ~90줄 |
| CSS 줄 추가 | ~45줄 |

### 3-4. 실행 결과 (Phase 4 완료 — PR #33)

| 항목 | 계획 | 실측 |
|------|------|------|
| CSS 파일 수정 | 3개 | 3개 (components, contents, settings) |
| HTML 파일 수정 | 12개 | 12개 (content-* 8개 + setting-* 4개) |
| 클래스 치환 횟수 | — | 130회 |
| components.css | +45줄 | +118줄 (form-* 16종 + :focus + 변형 3단계) |
| contents.css | -90줄 | -90줄 (264 → 174줄) |
| settings.css | — | -110줄 (219 → 109줄) |
| CSS 줄 변화 (net) | -45줄 | **-82줄** (3,162 → 3,080줄, -2.6%) |
| textarea 높이 통합 | --short/--tall | **--short(80px)/--mid(160px)/--tall(360px)** 3단계 |
| `stg-input[readonly]` | 계획서 누락 | `form-input[readonly]`로 추가 포함 |
| PR | — | **#33** |

---

## 작업 4: 페이지 전용 → 공통 컴포넌트 승격

### 4-1. 대상

| 클래스 | 현재 위치 | 사유 | 조치 |
|--------|-----------|------|------|
| `.edu-section-card` (+`__header`, `__title`) | educations.css | `.detail-card`와 100% 동일 | 삭제, HTML에서 `detail-card` 사용 |
| `.order-arrows` (+`__btn`) | educations.css, contents.css | 2곳 중복 | `components.css` 승격 |
| `.review-tag-pill` | pets.css, reviews.css | 2곳 중복 | `components.css` 승격 |
| `.review-content` (말줄임) | pets.css, reviews.css | 2곳 중복 | `components.css`에 `.text-ellipsis-cell`로 통합 |
| `.message-preview` (말줄임) | chats.css | 위와 동일 패턴 | `.text-ellipsis-cell` 사용 |
| `.view-all-link` | pets.css | 범용 패턴 | `components.css` 승격 |
| `.stat-cards--4col` | reservations.css | `--3col`, `--5col`과 같은 패턴 | `components.css` 승격 |
| `.data-table__checkbox` | settlements.css | 범용 | `components.css` 승격 |
| `.data-table-wrap--scroll` | contents.css 중복 | 이미 `components.css`에 존재 | contents.css에서 삭제 |

### 4-2. 작업량

| 항목 | 수량 |
|------|------|
| CSS 파일 수정 | 8개 |
| HTML 파일 수정 | ~5개 (클래스명 변경 필요 시) |
| CSS 줄 삭제 | ~55줄 |
| CSS 줄 추가 | ~20줄 |

---

## 작업 5: 빈 파일 주석 유지 + 불필요 코드 정리

### 5-1. 빈 파일 (삭제하지 않음)

| 파일 | 조치 |
|------|------|
| `members.css` (6줄) | 주석 유지, 구조 일관성 보존 |
| `kindergartens.css` (6줄) | 주석 유지, 구조 일관성 보존 |

### 5-2. `common.css` 정리

| 삭제 대상 | 줄 수 | 사유 |
|-----------|-------|------|
| `.badge` 기본 클래스 | 8줄 | `components.css`와 이중 정의 |
| `.badge--reservation` ~ `badge--settlement` (6종) | 6줄 | `components.css`로 이동 |
| 합계 | ~14줄 | |

---

## 작업 6: 색상 변수 활용 강화

### 6-1. 하드코딩 → CSS 변수 전환

| 하드코딩 | 해당 변수 | 대상 |
|---------|----------|------|
| `#339DEE` | `var(--primary)` | 배지 외 전체 |
| `#2ECC71` | `var(--success)` | 배지 외 전체 |
| `#E05A3A` | `var(--danger)` | 배지 외 전체 |
| `#F5A623` | `var(--warning)` | 배지 외 전체 |
| `#8C9AA5` | `var(--text-weak)` | 배지 외 전체 |

> 배지 색상은 `--badge-*` 변수 사용 (작업 1에서 처리)  
> 배지 외 하드코딩은 기존 `:root` 변수로 전환

---

## 📐 작업 순서 (의존성 기반)

```
Phase 1 ▶ 작업 6: 색상 변수 정의 추가 (후속 작업의 기반) ✅ 완료
Phase 2 ▶ 작업 1: 7색 배지 시스템 (가장 규모 큼, CSS+HTML 전면 수정) ✅ 완료
Phase 3 ▶ 작업 2: 모달 스타일 통합 ✅ 완료 (PR #31)
Phase 4 ▶ 작업 3: 폼 컴포넌트 통합 ✅ 완료 (PR #33)
Phase 5 ▶ 작업 4: 페이지→공통 승격
Phase 6 ▶ 작업 5: 정리 및 검증
```

---

## 📈 예상 효과

| 항목 | Before | Phase 1~4 완료 (현재) | 전체 완료 예상 |
|------|--------|------------------------|------------------|
| 총 CSS 줄 수 | 3,453줄 | **3,080줄 (-10.8%)** | ~3,000줄 (-13.1%) |
| CSS 파일 수 | 14개 | 14개 | 14개 (빈 파일 유지) |
| 배지 색상 정의 | ~180줄 (8개 파일) | **7줄 (1개 파일)** ✅ | 동일 |
| 중복 클래스 (배지+모달) | 15종 | **0종** ✅ | 0종 |
| 폼 컴포넌트 세트 | 2세트 (cnt-*, stg-*) | **1세트 (form-*)** ✅ | 동일 |
| 배지 색상 조합 | 5+3 비표준 = 8종 | **7종 (통일)** ✅ | 동일 |
| 모바일 앱 컬러 일치 | 0색 | **3색** ✅ | 동일 |

---

## 🔄 수정 대상 파일 총정리

### CSS 파일별 작업 매트릭스

| CSS 파일 | 작업1 | 작업2 | 작업3 | 작업4 | 작업5 | 작업6 |
|----------|:-----:|:-----:|:-----:|:-----:|:-----:|:-----:|
| common.css | O | | | | O | O |
| components.css | O | O | O | O | | O |
| dashboard.css | | | | | | O |
| pets.css | O | | | O | | |
| reservations.css | O | O | | O | | |
| payments.css | | O | | | | |
| settlements.css | O | | | O | | |
| chats.css | O | O | | O | | |
| reviews.css | O | O | | O | | |
| educations.css | O | O | | O | | |
| contents.css | O | O | O | O | | |
| settings.css | O | | O | | | |
| members.css | | | | | (유지) | |
| kindergartens.css | | | | | (유지) | |

### HTML 수정 요약

| 작업 | 파일 수 | 내용 |
|------|--------|------|
| 작업 1: 배지 치환 | 30개 | `badge--OOO` → `badge--c-색상` (500회) |
| 작업 3: 폼 클래스 치환 | 12개 | `cnt-*`/`stg-*` → `form-*` |
| 작업 4: 컴포넌트 승격 | ~5개 | `edu-section-card` → `detail-card` 등 |
