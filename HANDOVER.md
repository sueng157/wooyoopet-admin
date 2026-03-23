# 우유펫 관리자 대시보드 — 인수인계서

## 1. 프로젝트 개요

- **프로젝트**: 우유펫(WOOYOOPET) 반려동물 돌봄 플랫폼의 **관리자 백오피스 대시보드**
- **현재 단계**: HTML + CSS 정적 UI만 먼저 구현 (JavaScript/백엔드 연동은 이후 작업)
- **저장소**: `https://github.com/sueng157/20260316-Wooyoopet-Backend-wfgwaehjk.git`
- **브랜치 전략**: `main` (머지용) / `genspark_ai_developer` (작업용)
- **스펙 문서**: `full_spec_with_tables.md` (루트에 위치, 대메뉴 0~11번 전체 명세)

---

## 2. 대메뉴 구조 및 진행 상황

| # | 대메뉴 | 상태 | 파일 | PR |
|---|--------|------|------|----|
| 0 | 대시보드 | ✅ 완료 | `index.html`, `css/dashboard.css` | 초기커밋 |
| 1 | 회원관리 | ✅ 완료 | `members.html`, `member-detail.html`, `css/members.css` | #1 |
| 2 | 유치원관리 | ✅ 완료 | `kindergartens.html`, `kindergarten-detail.html`, `css/kindergartens.css` | #1 |
| 3 | 반려동물관리 | ✅ 완료 | `pets.html`, `pet-detail.html`, `css/pets.css` | #4 |
| 4 | 돌봄예약관리 | ✅ 완료 | `reservations.html`, `reservation-detail.html`, `css/reservations.css` | #5 |
| 5 | 결제관리 | ✅ 완료 | `payments.html`, `payment-detail.html`, `refund-detail.html`, `css/payments.css` | #10 |
| 6 | 정산관리 | ✅ 완료 | `settlements.html`, `settlement-info-detail.html`, `settlement-detail.html`, `css/settlements.css` | #11 |
| 7 | 채팅관리 | ✅ 완료 | `chats.html`, `chat-detail.html`, `report-detail.html`, `css/chats.css` | #13 |
| 8 | 후기관리 | ✅ 완료 | `reviews.html`, `review-detail.html`, `review-kg-detail.html`, `css/reviews.css` | #16 |
| 9 | 교육관리 | ✅ 완료 | `educations.html`, `education-detail.html`, `education-create.html`, `education-checklist-detail.html`, `education-checklist-create.html`, `education-pledge-detail.html`, `education-pledge-create.html`, `education-status-detail.html`, `css/educations.css` | #19 |
| 10 | 콘텐츠관리 | ✅ 완료 | `contents.html`, `content-banner-detail.html`, `content-banner-create.html`, `content-notice-detail.html`, `content-notice-create.html`, `content-faq-detail.html`, `content-faq-create.html`, `content-terms-detail.html`, `content-terms-create.html`, `css/contents.css` | #24 |
| 11 | 설정 | ✅ 완료 | `settings.html`, `setting-admin-detail.html`, `setting-admin-create.html`, `setting-feedback-detail.html`, `css/settings.css` | #26 |

> 문서 동기화 PR: #12 (정산관리 스펙 반영), #14 (채팅관리 스펙 반영), #20 (후기+교육 완료 반영), #21 (노쇼 제재 보호자/유치원 분리), #27 (결제관리 사이드바 링크 수정)

---

## 3. CSS 아키텍처 (핵심 — 반드시 준수)

### 3-1. 계층 구조

```
common.css          → 전역 변수, 리셋, 레이아웃(sidebar/main/header), 폰트
  ↓
components.css      → 재사용 UI 컴포넌트 (필터바, 테이블, 배지, 페이지네이션, 상세카드, info-grid, mini-table, 갤러리, 탭바 등)
  ↓
[페이지전용].css     → 해당 메뉴에만 필요한 추가 배지/스타일
```

### 3-2. HTML별 CSS 참조 매핑

| HTML | CSS 참조 순서 |
|------|--------------|
| `index.html` | common → dashboard |
| `members.html`, `member-detail.html` | common → components → members |
| `kindergartens.html`, `kindergarten-detail.html` | common → components → kindergartens |
| `pets.html`, `pet-detail.html` | common → components → pets |
| `reservations.html`, `reservation-detail.html` | common → components → pets → reservations |
| `payments.html`, `payment-detail.html`, `refund-detail.html` | common → components → pets → reservations → payments |
| `settlements.html`, `settlement-info-detail.html`, `settlement-detail.html` | common → components → pets → reservations → settlements |
| `chats.html`, `chat-detail.html`, `report-detail.html` | common → components → pets → reservations → chats |
| `reviews.html`, `review-detail.html`, `review-kg-detail.html` | common → components → reviews |
| `educations.html`, `education-detail.html`, `education-create.html` | common → components → educations |
| `education-checklist-detail.html`, `education-checklist-create.html` | common → components → educations |
| `education-pledge-detail.html`, `education-pledge-create.html` | common → components → educations |
| `education-status-detail.html` | common → components → educations |
| `contents.html`, `content-banner-detail.html`, `content-banner-create.html` | common → components → contents |
| `content-notice-detail.html`, `content-notice-create.html` | common → components → contents |
| `content-faq-detail.html`, `content-faq-create.html` | common → components → contents |
| `content-terms-detail.html`, `content-terms-create.html` | common → components → contents |
| `settings.html` | common → components → settings |
| `setting-admin-detail.html`, `setting-admin-create.html` | common → components → settings |
| `setting-feedback-detail.html` | common → components → settings |

> **중요**: reservations는 pets.css의 예약상태 배지(badge--res-*)를 재사용하므로 pets.css를 함께 로드. settlements와 chats도 모달·배지 등을 위해 pets.css + reservations.css를 함께 로드함.

### 3-3. 페이지전용 CSS 원칙

- `components.css`에 이미 정의된 스타일은 절대 중복 작성 금지
- 페이지전용 CSS에는 **해당 메뉴에서만 쓰는 배지/스타일만** 작성
- 리팩터링 후 `members.css`와 `kindergartens.css`는 주석 6줄만 남아있음 (모두 components.css로 이전됨)
- `btn-add-new`(새 등록 버튼)와 `result-header__actions`는 `components.css`에 공통 정의 (PR #24에서 `educations.css` → `components.css`로 이동)

### 3-4. CSS Variables (common.css :root)

```css
--primary: #339DEE;
--accent: #4294FF;
--gradient: linear-gradient(135deg, #339DEE, #4294FF);
--success: #2ECC71;
--warning: #F5A623;
--danger: #E05A3A;
--surface-base: #f8f9fa;
--surface-card: #ffffff;
--surface-sidebar: #f3f4f5;
--text-primary: #1a1a1a;
--text-secondary: #4a5568;
--text-weak: #8C9AA5;
--radius-card: 14px;
--radius-sm: 8px;
--radius-badge: 20px;
--shadow-card: 0 2px 12px rgba(0,0,0,0.04);
--font-family: 'Pretendard', sans-serif;

/* 배지 전용 변수 (Phase 1에서 추가) */
--badge-blue-fg/bg, --badge-green-fg/bg, --badge-orange-fg/bg,
--badge-red-fg/bg, --badge-gray-fg/bg, --badge-brown-fg/bg, --badge-pink-fg/bg
```

---

## 4. HTML 작성 패턴 (모든 페이지 공통)

### 4-1. 기본 골격

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>우유펫 관리자 — [메뉴명]</title>
  <link rel="stylesheet" href="css/common.css">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/[페이지전용].css">
</head>
<body>
<div class="layout">
  <aside class="sidebar">...</aside>
  <div class="main">
    <header class="header">...</header>
    <div class="content">
      <!-- 목록: filter-bar → result-header → data-table-wrap → pagination -->
      <!-- 상세: detail-top → detail-card(s) -->
    </div>
  </div>
</div>
<!-- 모달은 </div class="layout"> 밖에 배치 -->
</body>
</html>
```

### 4-2. 사이드바 메뉴 (현재 상태)

```html
<a href="index.html" class="sidebar__menu-item">대시보드</a>
<a href="members.html" class="sidebar__menu-item">회원관리</a>
<a href="kindergartens.html" class="sidebar__menu-item">유치원관리</a>
<a href="pets.html" class="sidebar__menu-item">반려동물관리</a>
<a href="reservations.html" class="sidebar__menu-item">돌봄예약관리</a>
<a href="payments.html" class="sidebar__menu-item">결제관리</a>
<a href="settlements.html" class="sidebar__menu-item">정산관리</a>
<a href="chats.html" class="sidebar__menu-item">채팅관리</a>
<a href="reviews.html" class="sidebar__menu-item">후기관리</a>
<a href="educations.html" class="sidebar__menu-item">교육관리</a>
<a href="contents.html" class="sidebar__menu-item">콘텐츠관리</a>
<a href="settings.html" class="sidebar__menu-item">설정</a>
```

> **사이드바 완료**: 전 메뉴(0~11) 모든 `href`가 실제 파일로 연결 완료. 현재 총 42개 HTML 파일에 동일 사이드바 적용. 새 페이지 추가 시 42개 파일 모두 동기화 필요.

### 4-3. 목록 페이지 패턴

- `filter-bar` > `filter-row`(행 단위) > `filter-label` + `filter-input`/`filter-select`
- `result-header` > `result-header__count` + `btn-excel`
- `data-table-wrap data-table-wrap--scroll` > `data-table`
- `pagination`

### 4-4. 상세 페이지 패턴

- `detail-top` > `btn-back` + `detail-actions`(버튼들)
- `detail-card` > `detail-card__header` > `detail-card__title`
- `info-grid` > `info-grid__label` + `info-grid__value`
- 조건부 영역: `detail-card conditional-section` + `conditional-section__badge`
- 내부 테이블: `mini-table`
- 통계 카드: `stat-cards` (5col) / `stat-cards--3col` / `stat-cards--4col`

### 4-5. 모달 패턴

```html
<div class="modal-overlay" id="xxxModal">
  <div class="modal">
    <div class="modal__title">제목</div>
    <div class="modal__message">설명</div>  <!-- 또는 modal__warning (빨간배경) -->
    <div class="modal__label">라벨 <span>*</span></div>
    <textarea class="modal__textarea" id="xxxReason" placeholder="..." oninput="..."></textarea>
    <div class="modal__actions">
      <button class="modal__btn modal__btn--cancel" onclick="...classList.remove('active')">취소</button>
      <button class="modal__btn modal__btn--delete" id="xxxBtn" disabled>실행</button>
    </div>
  </div>
</div>
```

> 모달 클래스: `modal__btn--delete`(빨강), `modal__btn--confirm-danger`(빨강), `modal__btn--confirm-warning`(주황), `modal__btn--confirm-primary`(파랑)
> 모달 타이틀 오버라이드: `modal__title--primary`(파랑), `modal__title--warning`(주황) — chats.css에 정의
> 모달 열기: `onclick="document.getElementById('xxxModal').classList.add('active')"`
> 모달 닫기: `onclick="document.getElementById('xxxModal').classList.remove('active')"`

---

## 5. 협의된 규칙 및 결정사항

### 5-1. 텍스트 / 표시 규칙

| 규칙 | 내용 |
|------|------|
| 유치원명 | "유치원" 접미사 붙이지 않음 (예: "밤톨이네" O, "밤톨이네 유치원" X) |
| 연락처 마스킹 | `010-****-1234` 형식, 옆에 `[전체보기]` 버튼 있으나 **JS 기능 없음** (현재 정적 UI만) |
| 날짜 형식 | `yyyy-mm-dd hh:mm` |
| 돌봄일시 형식 | `yyyy-mm-dd hh:mm ~ yyyy-mm-dd hh:mm (X일)` |
| 금액 | 우측정렬, 천단위 콤마 + "원" (예: `55,000원`) |
| 목록 vs 상세 이름 | 목록화면에서는 **닉네임만** 표시, 상세화면에서 **실명+닉네임** 모두 표시 (채팅관리에서 협의, 향후 다른 메뉴에도 적용 고려) |

### 5-2. JavaScript 관련

- **현재 JS는 최소한만 사용**: 모달 열기/닫기, textarea oninput 활성화, 탭 전환 정도의 인라인 JS만
- `member-detail.html`과 `kindergarten-detail.html`에는 `toggleMask()` JS가 `<script>` 태그로 들어있음 (이전 작업에서 추가됨)
- `pet-detail.html`과 `reservation-detail.html`에는 해당 JS가 **없음** → 이 불일치는 **현재 상태 그대로 유지**하기로 결정됨
- 탭 전환 스크립트는 `switchTab(tabId)` 함수로 통일 (`payments.html`, `settlements.html`, `chats.html`, `educations.html`에서 사용)

### 5-9. 교육관리 JS 작업 예정 사항

- **퀴즈 정답 토글 버튼** (`edu-answer-toggle`): 현재 HTML/CSS로 겉모양(비활성/활성 상태)만 구현됨. JS 작업 시 아래 기능 구현 필요:
  - 선택지 A/B 각각의 `정답` 버튼 클릭 시 해당 버튼에 `active` 클래스 추가
  - 동시에 상대편 버튼의 `active` 클래스 제거 (한 번에 하나만 활성화)
  - 대상 페이지: `education-detail.html`, `education-create.html`

### 5-10. 콘텐츠관리 규칙

| 규칙 | 내용 |
|------|------|
| 배너 이미지 크기 | 360×100px (또는 720×200px) |
| 공지사항 | 대상(전체/보호자/유치원), 상단 고정, 푸시 알림 발송 기능 |
| FAQ | 카테고리(결제/돌봄/환불/회원/유치원), 순서 변경 |
| 약관 | 필수/선택, 버전 관리, 새 버전 발행, 동의 회원 존재 시 삭제 불가 |

### 5-11. 설정(11번 메뉴) 규칙

| 규칙 | 내용 |
|------|------|
| 탭 구조 | 앱설정 / 관리자 계정 / 의견·피드백 3개 탭 |
| 앱설정 카드 | 6개 영역 (앱버전, 서비스점검, 수수료, 환불규정, 노쇼제재, 자동처리) |
| 노쇼 제재 | 보호자(1~3회)·유치원(1~2회) 통합 1개 카드, 통합 변경 이력 테이블 |
| 자동 처리 | 하원 후 자동 완료 시간만 (노쇼 자동 판정 시간 삭제 — 노쇼는 신고 기반) |
| 서비스 점검 이력 | 4열 미니테이블 (변경일, 점검 시작일시, 점검 종료일시, 변경 사유) |
| 규칙 추가 버튼 | 자동 처리 설정에 [+ 규칙 추가] 버튼 배치 (JS 작업 시 동적 규칙 추가) |
| 앱 버전 형식 | x.x.x (Semantic Versioning), 텍스트 입력 → JS 작업 시 정규식 검증 예정 |
| 최소 지원 버전 힌트 | “※ 이 버전 미만 사용자에게 강제 업데이트 안내” 텍스트 표시 |
| 관리자 계정 | 목록(10열) + 상세/수정 + 신규등록, 권한 11개 메뉴별 설정 |
| 피드백 상세 | 의견내용/탈퇴정보 카드 동시 표시 (JS 연동 시 type에 따라 토글) |
| 모달 | 앱설정 저장 6개, 관리자 저장/비밀번호초기화/비활성화/삭제/삭제금지 5개, 피드백 확인/메모 2개 |

### 5-3. 환불 프로세스 (결제관리·돌봄예약관리 공통)

```
취소 요청 → 위약금 비율 산정(100%/50%/0%) → 위약금 > 0원이면 보호자 위약금 결제 → 기존 결제금액 전액 취소(환불)
```

- 환불 정보 항목: 취소 요청자, 취소 일시, **위약금 비율**, **위약금 결제금액**, **기존 결제 취소(환불) 금액**, 환불 처리 상태, 환불 상세 링크

### 5-4. 뱃지 vs 텍스트 구분 규칙

- **뱃지(badge)**: 상태/유형 식별이 중요하고 빠른 시각적 스캐닝이 필요한 항목에 사용
- **색상 텍스트**: 보조 정보나 단순 예/아니오 표시에 사용
- 예: 채팅관리에서 신고 여부(색상 텍스트), 제재 유형(색상 텍스트) vs 채팅방 상태(뱃지), 처리상태(뱃지)
- 뱃지가 과도하게 많아지지 않도록 주의 (채팅관리: 신규 6종 + 재사용 2종 = 총 8종)

### 5-5. 배지 컬러 체계 (7색 시스템)

| 의미 | 색상 | CSS 클래스 | 변수 |
|------|------|-----------|------|
| 긍정/완료/활성 | green `#2ECC71` | `badge--c-green` | `--badge-green-fg/bg` |
| 대기/진행중/경고 | orange `#F5A623` | `badge--c-orange` | `--badge-orange-fg/bg` |
| 주요/정보 | blue `#339DEE` | `badge--c-blue` | `--badge-blue-fg/bg` |
| 부정/실패/위험 | red `#E05A3A` | `badge--c-red` | `--badge-red-fg/bg` |
| 비활성/해당없음 | gray `#8C9AA5` | `badge--c-gray` | `--badge-gray-fg/bg` |
| 보호자 역할 | brown `#7B4F32` | `badge--c-brown` | `--badge-brown-fg/bg` |
| 유치원 역할 | pink `#FF4F81` | `badge--c-pink` | `--badge-pink-fg/bg` |

> 기존 120개 시맨틱 배지 클래스는 7색 시스템으로 통합됨 (Phase 2 리팩터링)

### 5-6. 정산관리 특이사항

- **탭2 정산내역 레이아웃 순서**: 필터 바 → 상단 요약 영역 → 결과 헤더 → 데이터 테이블 → 페이지네이션 (협의로 확정)
- **상단 요약 10항목**: 조회 기간, 돌봄 결제금액, 위약금 결제금액, 유효 거래금액, 플랫폼 수수료(20%), 유치원 정산금액, 정산 예정 건수/금액, 정산 완료 건수/금액
- **거래유형 컬럼**: '돌봄결제'/'위약금' 뱃지로 구분 (위약금 수입 컬럼 삭제, 거래유형으로 대체)

### 5-7. 채팅관리 특이사항

- **목록화면 닉네임 표시**: 채팅내역 12컬럼 (이름 제외, 닉네임만), 신고접수 11컬럼 (이름→닉네임)
- **메시지 내역 말풍선 UI**: 보호자(좌측 갈색 bubble), 유치원(우측 분홍 bubble), 시스템(중앙 회색 bubble), 날짜 구분선, 닉네임·시간·읽음여부 메타 표시
- **모달**: 채팅방 강제 비활성화(1개), 처리상태 변경/제재 적용/기각 처리(3개)

### 5-8. CSS 리팩터링 방침

- CSS 리팩터링은 **모든 대메뉴 HTML 구현이 완료된 후** 한번에 수행하기로 결정
- 현재는 각 메뉴 작업 시 페이지전용 CSS에 필요한 스타일을 추가하는 방식으로 진행

---

## 6. 파일 크기 참고

```
css/common.css          407줄  (전역변수, 리셋, 레이아웃 + 배지 CSS 변수 16개 + 대시보드 전용 배지 5개)
css/components.css     1028줄  (공통 UI 컴포넌트 + 7색 배지 + 모달 변형 + 탭바 + btn-add-new)
css/dashboard.css       273줄  (대시보드 전용)
css/members.css           6줄  (주석만)
css/kindergartens.css     6줄  (주석만)
css/pets.css             47줄  (반려동물 전용)
css/reservations.css     31줄  (돌봄예약 전용)
css/payments.css         25줄  (결제관리 전용)
css/settlements.css      98줄  (정산관리 전용 버튼/요약)
css/chats.css           171줄  (채팅관리 전용 말풍선/텍스트)
css/reviews.css          71줄  (후기관리 전용 태그)
css/educations.css      516줄  (교육관리 전용 — 이미지/퀴즈/토글/체크리스트/서약서)
css/contents.css        264줄  (콘텐츠관리 전용 — 카테고리/폼/이미지 프리뷰)
css/settings.css        219줄  (설정 전용 — 폼/인풋/셀렉트)
총 3,162줄 (리팩터링 전 3,453줄 대비 -8.4%)
```

---

## 7. 작업 프로세스 (매 대메뉴마다 반복)

1. **스펙 확인**: `full_spec_with_tables.md` 해당 섹션 읽기
2. **UX/UI 디자인 초안**을 마크다운으로 작성 → 사용자 검토 → 수정 → OK
3. **코딩**: `css/[페이지전용].css` + `[목록].html` + `[상세].html` 생성
4. **사이드바 링크 업데이트**: 기존 전체 HTML 파일(현재 42개)의 사이드바를 동기화
5. **콘솔 검증**: Playwright로 JS 오류 없는지 확인
6. **프리뷰 링크 제공**: 사용자가 직접 확인할 수 있도록 서비스 URL 공유
7. **커밋 → PR 생성**: `genspark_ai_developer` 브랜치에서 작업, PR은 `main`으로
8. **사용자 확인 후 머지**
9. **스펙 동기화**: 협의로 변경/추가된 내용을 `full_spec_with_tables.md`, `README.md`에 반영 → 별도 PR

---

## 8. Git 워크플로우

```bash
# 1. main 동기화
git checkout main && git pull origin main

# 2. 작업 브랜치 전환 + main 기반 리베이스
git checkout genspark_ai_developer && git rebase origin/main

# 3. 작업 후 커밋
git add [files] && git commit -m "feat(xxx): 설명"

# 4. PR 전 동기화 확인
git fetch origin main && git rebase origin/main

# 5. 커밋이 여러 개면 스쿼시
git reset --soft HEAD~N && git commit -m "종합 메시지"

# 6. 푸시 + PR 생성
git push -f origin genspark_ai_developer
gh pr create --base main --head genspark_ai_developer --title "..." --body "..."
```

> **인증 실패 시**: `setup_github_environment` 도구 실행 후 재시도

---

## 9. 다음 작업

전체 HTML/CSS 정적 UI 구현이 완료되었습니다 (메뉴 0~11번, HTML 42개, CSS 14개).

**다음 단계 옵션**:
1. **CSS 리팩터링 Phase 4~6** — Phase 1~3 완료 (PR #30, #31). 잔여: 폼 통합, 컴포넌트 승격, 정리 (`CSS_REFACTORING_PLAN.md` 참조)
2. **JavaScript 구현** — 모달 동작, 폼 검증, 탭 전환, API 호출, 데이터 바인딩
3. **백엔드 연동** — API 서버 구축, CRUD 구현, 인증/권한 처리
4. **디자인 QA** — 전체 페이지 크로스체크, 일관성 검증

---

## 10. 서버 실행 방법

```bash
cd /home/user/webapp && python3 -m http.server 8080
```

> 백그라운드로 실행 중이면 `GetServiceUrl` 도구로 포트 8080의 퍼블릭 URL을 가져와서 사용자에게 공유할 것.
