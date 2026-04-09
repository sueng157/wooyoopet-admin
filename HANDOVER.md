# 우유펫 관리자 대시보드 — 인수인계서

## 1. 프로젝트 개요

### 1-1. 서비스 전체 구조

우유펫(WOOYOOPET)은 반려동물 돌봄 플랫폼으로, 서비스는 3개 파트로 구성됩니다.

| 파트 | 기술 스택 | 상태 | 담당 |
|------|----------|------|------|
| **모바일 앱** (프론트엔드) | React Native | 개발 완료, 기존 DB 연결 중 | 외부 프론트엔드 개발자 |
| **관리자 페이지** (백엔드 관리 도구) | HTML/CSS/JS + Supabase API | Phase 1~3 완료, Phase 4 예정 | 본 저장소 (AI 코딩으로 작업) |
| **DB** | Supabase (PostgreSQL) | Phase 1 스키마+데이터 완료, RLS 적용 | 본인이 스키마 설계 후 구성 |

### 1-2. 작업 로드맵

```
[완료] 관리자 페이지 HTML/CSS 정적 UI (42페이지, 15 CSS)
[완료] CSS 리팩터링 Phase 1~6 + UI 일관성 통일
[완료] JavaScript UI 구현 (4파일 621줄, 인라인 JS 0건, PR #39~#42)
[완료] 백엔드 구축(Phase 1,2,3 완료)(PR #48~#57)
  ↓
[완료] DB 연결 보완 및 UI 개선 (PR #59~#112)
  - 회원관리~콘텐츠관리 : 작업 완료
  - 설정, 대시보드 : 모바일앱 백엔드 연결 후 후속진행 예정
  ↓
[예정] 호스팅 전환·모바일앱 백엔드·기존 서버 정리
  - Phase 4,5,6 (DB 연결 보완 및 UI 개선 후 진행예정)
```

> 세부 로드맵 (Phase 1~6)은 본 문서 **섹션 9 "백엔드 로드맵 및 진행 현황"** 참조.
> Phase 정의 및 기술적 배경은 `TECH_DECISION.md` **섹션 6 "단계별 로드맵"** 참조.

### 1-3. 저장소 정보

- **프로젝트**: 우유펫 관리자 백오피스 대시보드
- **현재 단계**: Phase 1~3 완료 (PR #48~#57) → DB 연결 보완 및 UI 개선 완료 (PR #59~#112) → Phase 4 예정
- **저장소**: `https://github.com/sueng157/wooyoopet-admin.git`
- **브랜치 전략**: `main` (배포용, Cloudflare Pages 자동 배포) / `develop` (개발 완료·테스트용) / `genspark_ai_developer` (AI 작업용)
- **배포 URL**: `https://admin.wooyoopet.com` (Cloudflare Pages)
- **Pages 기본 주소**: `https://wooyoopet-admin.pages.dev`
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
| 10 | 콘텐츠관리 | ✅ 완료 | `contents.html`, `content-banner-detail.html`, `content-banner-create.html`, `content-notice-detail.html`, `content-notice-create.html`, `content-faq-detail.html`, `content-faq-create.html`, `content-terms-detail.html`, `content-terms-create.html`, `content-terms-version-create.html`, `css/contents.css` | #24 |
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
| `content-terms-version-create.html` | common → components → contents + Quill CDN CSS |
| `settings.html` | common → components → settings |
| `setting-admin-detail.html`, `setting-admin-create.html` | common → components → settings |
| `setting-feedback-detail.html` | common → components → settings |

> **중요**: reservations는 pets.css의 예약상태 배지(badge--res-*)를 재사용하므로 pets.css를 함께 로드. settlements와 chats도 모달·배지 등을 위해 pets.css + reservations.css를 함께 로드함.

### 3-2-b. HTML별 JS 참조 매핑

| HTML | JS 참조 순서 |
|------|-------------|
| 전체 43페이지 (login 제외) | supabase-js CDN → supabase-client.js → auth.js → common.js → components.js → api.js |
| `index.html` | ... → api.js → dashboard.js |
| `members.html`, `member-detail.html` | ... → api.js → members.js |
| `kindergartens.html`, `kindergarten-detail.html` | ... → api.js → kindergartens.js |
| `pets.html`, `pet-detail.html` | ... → api.js → pets.js |
| `reservations.html`, `reservation-detail.html` | ... → api.js → reservations.js |
| `payments.html`, `payment-detail.html`, `refund-detail.html` | ... → api.js → payments.js |
| `settlements.html`, `settlement-detail.html`, `settlement-info-detail.html` | ... → api.js → settlements.js |
| `chats.html`, `chat-detail.html`, `report-detail.html` | ... → api.js → chats.js |
| `reviews.html`, `review-detail.html`, `review-kg-detail.html` | ... → api.js → reviews.js |
| `education-*.html` (8개) | ... → api.js → educations.js |
| `contents.html`, `content-*.html` (10개) | ... → api.js → contents.js |
| `settings.html`, `setting-*.html` (4개) | ... → api.js → settings.js |
| 엑셀 다운로드 목록 페이지 (11개) | + SheetJS CDN (api.js 이전) |
| `login.html` | supabase-js CDN → supabase-client.js → auth.js |

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
<a href="members.html" class="sidebar__menu-item" data-perm="perm_members">회원관리</a>
<a href="kindergartens.html" class="sidebar__menu-item" data-perm="perm_kindergartens">유치원관리</a>
<a href="pets.html" class="sidebar__menu-item" data-perm="perm_pets">반려동물관리</a>
<a href="reservations.html" class="sidebar__menu-item" data-perm="perm_reservations">돌봄예약관리</a>
<a href="payments.html" class="sidebar__menu-item" data-perm="perm_payments">결제관리</a>
<a href="settlements.html" class="sidebar__menu-item" data-perm="perm_settlements">정산관리</a>
<a href="chats.html" class="sidebar__menu-item" data-perm="perm_chats">채팅관리</a>
<a href="reviews.html" class="sidebar__menu-item" data-perm="perm_reviews">후기관리</a>
<a href="educations.html" class="sidebar__menu-item" data-perm="perm_educations">교육관리</a>
<a href="contents.html" class="sidebar__menu-item" data-perm="perm_contents">콘텐츠관리</a>
<a href="settings.html" class="sidebar__menu-item" data-perm="perm_settings">설정</a>
```

> **사이드바 완료**: 전 메뉴(0~11) 모든 `href`가 실제 파일로 연결 완료. 현재 총 43개 HTML 파일에 동일 사이드바 적용. 새 페이지 추가 시 43개 파일 모두 동기화 필요.
> **권한 제어**: 대시보드를 제외한 11개 메뉴에 `data-perm` 속성 부여. `auth.js`가 관리자의 `perm_*` 값을 읽어 `접근불가`인 메뉴를 숨김 처리.

### 4-3. 목록 페이지 패턴

- `filter-bar` > `filter-row`(행 단위) > `filter-label` + `filter-input`/`filter-select`
- `result-header` > `result-header__count` + `btn-excel` (SVG 다운로드 아이콘 + "내역 다운로드" 텍스트로 전 페이지 통일, PR #37)
- `data-table-wrap data-table-wrap--scroll` > `data-table`
- `pagination`

### 4-4. 상세 페이지 패턴

- 상단 헤더: `header__title`에 breadcrumb — `대메뉴 › 탭이름 › 상세/등록` (대메뉴에 `<a href>` 링크 포함, PR #37)
- `detail-top` > `btn-back`(`← 탭이름 목록으로` 형태로 전 페이지 통일, PR #37) + `detail-actions`(버튼들)
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
    <textarea class="modal__textarea" data-enables="xxxBtn" placeholder="..."></textarea>
    <div class="modal__actions">
      <button class="modal__btn modal__btn--cancel" data-modal-close>취소</button>
      <button class="modal__btn modal__btn--delete" id="xxxBtn" disabled>실행</button>
    </div>
  </div>
</div>
```

> 모달 클래스: `modal__btn--delete`(빨강), `modal__btn--confirm-danger`(빨강), `modal__btn--confirm-warning`(주황), `modal__btn--confirm-primary`(파랑)
> 모달 타이틀 오버라이드: `modal__title--primary`(파랑), `modal__title--warning`(주황) — chats.css에 정의
> 모달 열기: `data-modal-open="모달ID"` 속성 부여 → common.js가 처리
> 모달 닫기: `data-modal-close` 속성 부여 → common.js가 처리 (오버레이 클릭·ESC도 자동 닫기)
> textarea→버튼 활성화: `data-enables="버튼ID"` 속성 → common.js가 input 이벤트로 처리

---

## 5. 협의된 규칙 및 결정사항

### 5-1. 텍스트 / 표시 규칙

| 규칙 | 내용 |
|------|------|
| 유치원명 | "유치원" 접미사 붙이지 않음 (예: "밤톨이네" O, "밤톨이네 유치원" X) |
| 연락처 마스킹 | `010-****-1234` 형식, 옆에 `[전체보기]` 버튼 → **JS 토글 구현 완료** (common.js `.masked-field__toggle`, `data-masked`/`data-raw` 속성 사용) |
| 날짜 형식 | `yyyy-mm-dd hh:mm` |
| 돌봄일시 형식 | `yyyy-mm-dd hh:mm ~ yyyy-mm-dd hh:mm (X일)` |
| 금액 | 우측정렬, 천단위 콤마 + "원" (예: `55,000원`) |
| 목록 vs 상세 이름 | 목록화면에서는 **닉네임만** 표시, 상세화면에서 **실명+닉네임** 모두 표시 (채팅관리에서 협의, 향후 다른 메뉴에도 적용 고려) |

### 5-2. JavaScript 관련

- **인라인 JS 완전 제거 완료**: 모든 인터랙션은 외부 JS 파일 + `data-*` 속성으로 처리
- JS 계층 구조: `supabase-js CDN` → `supabase-client.js` → `auth.js` → `common.js` → `components.js` → `[페이지전용].js`
- 42개 전체 페이지에 Supabase SDK + `supabase-client.js` + `auth.js` + `common.js` + `components.js` 참조 완료
- `login.html`에는 `auth.js` + 인라인 로그인 폼 스크립트 (common.js/components.js 미참조)
- 교육관리 7개 페이지에 추가로 `educations.js` 참조
- 설정 1개 페이지에 추가로 `settings.js` 참조

### 5-9. 교육관리 JS (educations.js — 구현 완료)

| 기능 | 클래스/요소 | 동작 | 대상 페이지 |
|------|-----------|------|------------|
| 퀴즈 정답 토글 | `.edu-answer-toggle` | A/B 중 하나만 `active` | education-create, education-detail |
| 체크리스트 사용 토글 | `.edu-toggle__track` | `--on` 클래스 토글 | education-checklist-detail |
| 행 추가 | `.edu-add-row__btn` | 테이블에 새 행 삽입 (체크리스트 4열/서약서 3열 자동 감지) | checklist-create/detail, pledge-create/detail |
| 행 삭제 | `.edu-delete-btn` | 부모 tr 제거 + 순서 재정렬 | checklist-detail, pledge-detail |
| 원칙 설명 추가 | `.edu-bullet-list__add` | ul에 입력 가능 li 추가 | education-create, education-detail |
| 하위 항목 추가 | `.edu-sub-items__add` | 추가 버튼 앞에 하위 항목 삽입 | pledge-create, pledge-detail |
| 하위 항목 삭제 | `.edu-sub-items__delete` | 해당 `.edu-sub-items__item` 제거 | pledge-create, pledge-detail |
| 체크리스트/서약서 보기↔편집 모드 | `#btnCheckEdit`/`#btnPledgeEdit` | 보기 모드(읽기전용) ↔ 편집 모드(인풋) 전환, 상단 버튼 토글 | checklist-detail, pledge-detail |
| 상태변경 토글 | `#btnCheckStatusChange`/`#btnPledgeStatusChange` | 미적용 ↔ 현재 적용중 전환 (단일 활성 버전 보장), 확인 모달 | checklist-detail, pledge-detail |
| 삭제 보호 | `#btnCheckDelete`/`#btnPledgeDelete` | 현재 적용중 삭제 금지 경고, 미적용만 삭제 가능 | checklist-detail, pledge-detail |
| 이미지 업로드/교체/삭제 | `bindImageUpload()` (uploadBtnId, replaceBtnId, deleteBtnId) | 파일 선택→Storage 업로드→프리뷰 표시, 교체 시 이전 파일 삭제, 삭제 시 Storage에서 제거 | education-create, education-detail |
| 고아 이미지 정리 (create) | `beforeunload` / `pagehide` | 등록하지 않고 페이지 이탈 시 업로드된 이미지 Storage 삭제 | education-create |
| 고아 이미지 정리 (detail) | `beforeunload` / `pagehide` + 취소 버튼 | 편집 모드에서 이미지 교체 후 취소/이탈 시 새 이미지 삭제, 원본 복원 | education-detail |
| 보기 모드 정답 토글 방지 | `#viewQuiz` 내 버튼 무시 | `bindUIInteractions()`에서 `btn.closest('#viewQuiz')` 체크로 보기 모드 토글 차단 | education-detail |
| display_order 자동 설정 | `bindTopicCreate()` async | Supabase에서 현재 최대 `display_order` 조회 후 +1 기본값 설정 | education-create |
| 이수현황 목록 RPC 조회 | `loadStatusList()` | search_education_completions RPC 호출, 12컬럼 테이블 렌더링, 진행률 바 | educations.html #tab-status |
| 이수현황 상세 동적 렌더링 | `loadStatusDetail()` | education_completions + kindergartens → members 조인, checklists/pledges FK 조인, 공개 교육 주제 동적 집계, topic_details JSONB 매칭, 체크리스트/서약서 최신 버전 비교 | education-status-detail.html |
| 강제 이수 처리 | `forceCompleteBtn` click | 동적 totalTopics로 completed_topics 설정, force_completed 플래그 | education-status-detail.html |
| 이수 초기화 | `resetCompletionBtn` click | topic_details 초기화, progress_rate/completed_topics 리셋 | education-status-detail.html |

### 5-10. 콘텐츠관리 규칙

| 규칙 | 내용 |
|------|------|
| 배너 이미지 크기 | 360×100px (또는 720×200px) |
| 공지사항 | 대상(전체(공통)/보호자/유치원), 상단 고정, Quill 에디터(본문 HTML 저장), 다건 첨부(10개/10MB, PDF·DOC·DOCX·HWP·JPG·JPEG·PNG), 공개상태 읽기전용 배지+모달 전환, 푸시 발송(발송완료 시 버튼 비활성), 조회수 표시 |
| FAQ | 카테고리(결제/돌봄/환불/회원/유치원), 대상(전체(공통)/보호자/유치원), Quill 에디터(답변 HTML 저장), 순서 변경(화살표 ▲▼, RPC 트랜잭션), 공개상태 읽기전용 배지+모달 전환 |
| 약관 | 필수/선택, 버전 관리(term_versions 테이블), 새 버전 등록 페이지(content-terms-version-create.html), 공개/비공개 전환 모달(공개 시 effective_date + v1 이력 자동 생성), Quill 에디터(본문 수정), 동의 회원 존재 시 삭제 불가, 삭제 시 term_versions 캐스케이드 삭제 |

### 5-17. 콘텐츠관리 배너 이미지 Storage 관리 (PR #104)

**Supabase Storage 버킷**: `banner-images`

**이미지 업로드 유틸리티 (contents.js):**
- `uploadBannerImage(file)` — `banner-images` 버킷에 `{timestamp}_{random}_{filename}` 형태로 업로드, 공개 URL 반환
- `deleteBannerImageFromStorage(url)` — URL에서 파일 경로를 추출하여 `banner-images` 버킷에서 삭제

**고아 파일(orphan) 정리 로직:**

| 케이스 | 페이지 | 처리 방식 |
|--------|--------|----------|
| 이미지 교체 | create, detail | 업로드 핸들러에서 새 파일 업로드 전 기존 URL로 `deleteBannerImageFromStorage()` 호출 |
| 등록 안 하고 이탈 | content-banner-create | `beforeunload`/`pagehide` 이벤트에서 `bannerCreateSaved` 플래그가 false이면 `bannerImageUrl` 삭제 |
| 편집 취소/이탈 | content-banner-detail | 취소 버튼: 원본 URL과 다른 새 이미지면 삭제 후 원본 복원. `beforeunload`/`pagehide`: `isEditMode`가 true이고 `bannerDetailSaved`가 false이면 원본과 다른 이미지 삭제 |
| 편집 저장 | content-banner-detail | 원본 URL과 다른 이미지로 교체 저장 시, 저장 직전에 이전 원본 이미지를 Storage에서 삭제 |

**주의사항**: 교육관리와 동일 — `beforeunload`/`pagehide`에서의 async Storage 삭제는 브라우저에 따라 완료가 보장되지 않음

### 5-18. 콘텐츠관리 배너 JS 상세 (contents.js — PR #104)

| 기능 | 함수/요소 | 동작 | 대상 페이지 |
|------|-----------|------|------------|
| 배너 상세 로드 | `loadBannerDetail()` | banners 테이블 단건 조회, 보기 모드 렌더링, 노출상태 자동 계산 | content-banner-detail |
| 보기↔편집 모드 | `toggleBannerViewEdit()` | info-grid(읽기전용) ↔ form-*(인풋) 전환, 상단 버튼 토글 | content-banner-detail |
| 상세 페이지 바인딩 | `bindBannerDetailActions()` | 수정/저장/취소/삭제/비공개 버튼 이벤트 | content-banner-detail |
| 이미지 업로드/교체/삭제 | 업로드 핸들러 | 파일 선택→Storage 업로드→프리뷰 표시, 교체 시 이전 파일 삭제, 삭제 시 Storage에서 제거 | create, detail |
| 고아 이미지 정리 | `beforeunload`/`pagehide` | 교육관리와 동일 패턴 (5-17 참조) | create, detail |
| 배너 등록 | `initBannerCreate()` | display_order 자동 설정(최대값+1), 폼 바인딩, 저장 시 banners INSERT | content-banner-create |
| 필터/검색 | `loadBannerList()` | 노출상태/표시위치 필터, 검색, 페이지네이션 | contents.html #tab-banner |
| 노출상태 자동 계산 | `calcExposureStatus()` | is_public + start_date + end_date 기반 4상태 계산 (노출중/예정/종료/비공개) | 목록, 상세 |
| 배지 렌더링 | `autoBadge()` | 노출상태 4종 + 연결유형 2종 + 표시위치 배지 | 목록, 상세 |
| 연결 유형 플레이스홀더 | 연결유형 `change` | '외부 URL' → URL 입력, '앱 내 화면' → 드롭다운 전환 | create, detail |

**배너 등록/상세 페이지 분리 구조 (PR #104):**
- `content-banner-create.html`: 등록 전용 페이지 (폼 모드만)
- `content-banner-detail.html`: 상세 전용 페이지 (보기 모드 기본, [수정] 클릭 시 편집 모드)
- 노출 상태 필드: 기본정보 블록 상단에 배치 (별도 섹션 아님)

### 5-19. 콘텐츠관리 공지사항 첨부파일 Storage 관리

**Supabase Storage 버킷**: `notice-attachments` (public)

**사전 준비 완료:**
- `notice-attachments` 버킷 생성 완료 (public)
- Storage RLS Policy 3개 설정 완료 (기존 `banner-images`와 동일 패턴):

```sql
CREATE POLICY "Allow notice-attachments uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'notice-attachments');

CREATE POLICY "Allow notice-attachments updates"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'notice-attachments');

CREATE POLICY "Allow notice-attachments deletes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'notice-attachments');
```

**첨부파일 업로드 유틸리티 (contents.js):**
- `uploadNoticeAttachment(file)` — `notice-attachments` 버킷에 `notices/{timestamp}_{random}.{ext}` 형태로 업로드, 공개 URL 반환
- `deleteNoticeAttachment(url)` — URL에서 파일 경로를 추출하여 `notice-attachments` 버킷에서 삭제
- `validateNoticeFile(file)` — 파일 유형(PDF, DOC, DOCX, HWP, JPG, JPEG, PNG) 및 용량(10MB) 검증

**다건 첨부 지원:**
- 최대 10개 파일, 각 10MB
- DB 저장: `notices.attachment_urls` (jsonb 배열)에 URL 배열로 저장
- 등록/상세 편집 모두 동일 UI 적용 (파일 목록 + 개별 삭제 + 파일 추가 버튼)

**고아 파일(orphan) 정리 로직:**

| 케이스 | 페이지 | 처리 방식 |
|--------|--------|----------|
| 등록 안 하고 이탈 | content-notice-create | `beforeunload`/`pagehide` 이벤트에서 `noticeCreateSaved` 플래그가 false이면 업로드된 모든 첨부파일 삭제 |
| 편집 중 파일 삭제 (새로 추가한 파일) | content-notice-detail | 즉시 Storage에서 삭제 |
| 편집 중 파일 삭제 (기존 파일) | content-notice-detail | `deletedAttachUrls` 배열에 추가, 저장 시 일괄 삭제 |
| 편집 취소 | content-notice-detail | 새로 추가한 파일(`addedAttachUrls`) Storage에서 삭제, 삭제 예정 목록 초기화 |
| 공지 삭제 | content-notice-detail | 모든 첨부파일 Storage에서 삭제 후 notices 레코드 삭제 |

### 5-20. 콘텐츠관리 공지사항 JS 상세 (contents.js)

| 기능 | 함수/요소 | 동작 | 대상 페이지 |
|------|-----------|------|------------|
| 공지 상세 로드 | `loadNoticeDetail()` | notices 테이블 단건 조회, 보기 모드 렌더링, 푸시/공개 상태 버튼 동적 처리 | content-notice-detail |
| 보기↔편집 모드 | `toggleMode()` | viewNoticeBasic/editNoticeBasic, viewNoticeBody/editNoticeBody 전환 | content-notice-detail |
| Quill 에디터 | 편집 모드 진입 시 생성, 취소/저장 시 파괴 | `content` 필드의 HTML을 Quill에 로드/추출 | content-notice-detail |
| 공지 등록 | `initNoticeCreate()` | Quill 즉시 초기화, 첨부파일 다건 업로드, 등록 처리 | content-notice-create |
| 첨부파일 관리 | `renderEditAttachments()` | 파일 목록 렌더링 + 개별 삭제 버튼 | create, detail |
| 푸시 발송 | `btnPushSend` 클릭 | push_sent가 true이면 disabled+발송완료 텍스트, 아니면 발송 모달 | content-notice-detail |
| 공개/비공개 전환 | `btnToggleVisibility` 클릭 | 현재 상태 반대로 전환 모달, 보기 모드에서만 변경 가능 | content-notice-detail |

**공지 등록/상세 페이지 구조:**
- `content-notice-create.html`: 등록 전용 (공개상태 비공개 뱃지 고정, Quill 에디터 즉시 초기화)
- `content-notice-detail.html`: 상세 전용 (보기 모드 기본, [수정] 클릭 시 편집 모드)
- 본문: Quill 에디터로 작성, HTML string으로 `notices.content`에 저장, 조회 시 `innerHTML`로 렌더링

### 5-21. URL 해시 기반 탭 복원 로직

**구현 위치**: `js/components.js` — DOMContentLoaded 탭 전환 리스너 바로 아래

**동작**: `contents.html#tab-notice` 등 URL 해시가 있으면 해당 탭 버튼을 자동 클릭하여 탭 활성화

**적용 페이지**: 모든 콘텐츠관리 상세/등록 페이지의 뒤로가기 링크 + 삭제/등록 후 리다이렉트
- 배너: `contents.html#tab-banner`
- 공지: `contents.html#tab-notice`
- FAQ: `contents.html#tab-faq`
- 약관: `contents.html#tab-terms`

### 5-22. 콘텐츠관리 FAQ JS 상세 (contents.js — PR #110)

| 기능 | 함수/요소 | 동작 | 대상 페이지 |
|------|-----------|------|------------|
| FAQ 상세 로드 | `loadFaqDetail()` | faqs 테이블 단건 조회, 보기 모드 렌더링, 공개상태 배지+버튼 동적 처리 | content-faq-detail |
| 보기↔편집 모드 | `toggleMode()` | viewFaqBasic/editFaqBasic 전환, Quill 에디터 생성/파괴, 상단 버튼 토글 | content-faq-detail |
| Quill 에디터 | 편집 모드 진입 시 생성, 취소/저장 시 파괴 | `answer` 필드의 HTML을 Quill에 로드/추출 | content-faq-detail |
| FAQ 등록 | `initFaqCreate()` | Quill 즉시 초기화, display_order 자동 설정(카테고리별 최대+1), 등록 처리 | content-faq-create |
| 순서 변경 (RPC) | `reorder_faq_display_order` RPC | 순서 변경 시 같은 카테고리 내 재정렬+업데이트를 단일 트랜잭션으로 실행, 실패 시 전체 롤백 | content-faq-detail |
| 삭제 (RPC) | `delete_faq_and_reorder` RPC | 삭제+뒷순서 당기기를 단일 트랜잭션으로 실행 | content-faq-detail |
| 공개/비공개 전환 | `btnToggleVisibility` 클릭 | 현재 상태 반대로 전환 모달, 보기 모드에서만 변경 가능 | content-faq-detail |
| 순서 화살표 | ▲/▼ 버튼 | 편집 모드에서 display_order ±1 조정 | content-faq-detail |

**FAQ 등록/상세 페이지 구조:**
- `content-faq-create.html`: 등록 전용 (공개상태 비공개 배지 고정, Quill 에디터 즉시 초기화, display_order 카테고리별 자동 부여)
- `content-faq-detail.html`: 상세 전용 (보기 모드 기본, [수정] 클릭 시 편집 모드)
- 답변: Quill 에디터로 작성, HTML string으로 `faqs.answer`에 저장, 조회 시 `innerHTML` + `faq-content-render ql-editor` 클래스로 렌더링
- FAQ ID: 등록 시 "자동 부여" 안내문 표시 (편집 불가)
- 필수값 검증: 질문과 답변이 비어 있으면 등록/수정 차단 (alert)
- 카테고리 내 첫 FAQ 등록 시 `display_order = 1`부터 시작

**RPC 트랜잭션 기반 순서 관리:**
- 순서 변경 저장: `reorder_faq_display_order` RPC 호출 (순서 변경+데이터 업데이트 원자성 보장, 실패 시 전체 롤백)
- 순서 미변경 저장: 기존 `api.updateRecord` 사용
- 삭제: `delete_faq_and_reorder` RPC 호출 (삭제+뒷순서 재정렬 원자성 보장)
- 이전 헬퍼 함수(`reorderFaqDisplayOrder`, `reorderAfterDelete`) 제거 → RPC로 완전 대체

### 5-23. 콘텐츠관리 약관 JS 상세 (contents.js — PR #112)

| 기능 | 함수/요소 | 동작 | 대상 페이지 |
|------|-----------|------|------------|
| 약관 상세 로드 | `loadTermsDetail()` | terms 테이블 단건 조회, 읽기전용 정보 블록(ID, 제목, 필수여부 배지, 등록일, 현재 버전, 시행일, 공개상태 배지), 버전 이력 테이블(term_versions 전체 조회), 현재 본문 표시 | content-terms-detail |
| 버전 이력 조회 | term_versions 테이블 | effective_date DESC 정렬, version_number·시행일·종료일·수정사유·보기 링크 테이블 | content-terms-detail |
| 버전 본문 모달 | versionContentModal | 대형 모달(max-width 720px)에서 이전 버전 본문 HTML 렌더링 (scrollable) | content-terms-detail |
| 본문 수정 | `#btnEditMode` | 보기→Quill 에디터 전환, [수정]→[취소][저장] 버튼 토글, terms.content만 편집 가능 | content-terms-detail |
| 공개/비공개 전환 | `#btnToggleVisibility` | toggleModal 확인 후 visibility 업데이트, 첫 공개 시 effective_date=today + v1 term_versions 자동 생성 | content-terms-detail |
| 삭제 | `#btnDeleteOpen` | deleteModal 확인 후 term_versions 전건 삭제 → terms 삭제 → 목록 이동 | content-terms-detail |
| 새 버전 등록 | `#btnNewVersion` | content-terms-version-create.html?id={id}로 네비게이션 | content-terms-detail |
| 버전 등록 초기화 | `initTermsVersionCreate()` | URL에서 terms.id 수신, 읽기전용 정보 블록(ID, 제목, 필수여부, 다음 버전 자동계산, 공개상태), Quill 에디터에 기존 본문 프리로드 | content-terms-version-create |
| 버전 등록 실행 | `#btnVersionCreate` | 수정사유 필수 검증, 이전 버전 end_date 업데이트, 새 term_versions INSERT(effective_date=today), terms 업데이트(current_version+1, effective_date, content) | content-terms-version-create |

**약관 상세/버전등록 페이지 구조:**
- `content-terms-detail.html`: 상세 전용 (읽기전용 기본, [수정] 클릭 시 본문만 Quill 편집 모드)
- `content-terms-version-create.html`: 버전 등록 전용 (수정 사유 textarea + Quill 에디터로 새 본문 작성)
- 본문: Quill 에디터로 작성, HTML string으로 `terms.content`에 저장, 조회 시 `innerHTML` + `terms-content-render ql-editor` 클래스로 렌더링
- 버전 관리: `term_versions` 테이블에 이력 저장 (version_number, effective_date, end_date, change_reason, content)
- 첫 공개 시 v1 이력: terms.visibility가 '비공개'→'공개' 전환 시 v1 term_versions 레코드 자동 생성 (effective_date = today)
- 모달 4개: toggleModal(공개/비공개 전환), saveModal(수정 저장), deleteModal(삭제 확인), versionContentModal(이전 버전 본문 보기, modal--large)

### 5-11. 설정(11번 메뉴) 규칙

| 규칙 | 내용 |
|------|------|
| 탭 구조 | 앱설정 / 관리자 계정 / 의견·피드백 3개 탭 |
| 앱설정 카드 | 6개 영역 (앱버전, 서비스점검, 수수료, 환불규정, 노쇼제재, 자동처리) |
| 노쇼 제재 | 보호자(1~3회)·유치원(1~2회) 통합 1개 카드, 통합 변경 이력 테이블 |
| 자동 처리 | 하원 후 자동 완료 시간만 (노쇼 자동 판정 시간 삭제 — 노쇼는 신고 기반) |
| 서비스 점검 이력 | 4열 미니테이블 (변경일, 점검 시작일시, 점검 종료일시, 변경 사유) |
| 규칙 추가 버튼 | 자동 처리 설정에 [+ 규칙 추가] 버튼 — `settings.js`에서 동적 추가/삭제 구현 완료 |
| 앱 버전 형식 | x.x.x (Semantic Versioning), **정규식 검증 구현 완료** (components.js `data-validate="version"`, `x.x.x` 형식 실시간 검증) |
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

- **탭2 정산내역 레이아웃 순서**: 필터 바(4행: 예정일+기간버튼/필터/검색/금액+초기화·검색) → 상단 요약 영역(카드 래퍼) → 결과 헤더 → 데이터 테이블 → 페이지네이션 (협의로 확정)
- **상단 요약 2행**: 1행 5col (돌봄 결제금액, 위약금 결제금액, 유효 거래금액, 플랫폼 수수료(20%), 유치원 정산금액), 2행 5col 가운데 3칸 (정산 예정 건수/금액, 정산 완료 건수/금액, 정산 보류 건수/금액) — `get_settlement_summary` RPC로 조회
- **거래유형 컬럼**: '돌봄'/'위약금' 뱃지로 구분 (위약금 수입 컬럼 삭제, 거래유형으로 대체)
- **기간 버튼**: 전체/당월/최근 1개월/최근 1주일 — 클릭 시 날짜만 세팅, 수동 변경 시 active 해제
- **RPC 오버로드 주의**: `search_settlements`는 기존 RPC와 동일한 원래 타입 유지 패턴 사용 (text/numeric/uuid/int). 시그니처 변경 시 반드시 이전 시그니처 DROP 필수 — PostgREST는 같은 이름+다른 타입의 오버로드를 지원하지 않음
- **사업자 유형 3분류**: `개인사업자`/`법인사업자`/`비사업자` (기존 `사업자`/`개인`에서 변경, CHECK 제약 포함)
- **사업자 유형별 배지 색상**: 개인사업자(pink), 법인사업자(blue), 비사업자(brown)
- **정산정보 상세 항목 배치**: 운영자 기본정보(4항목: 성명/생년월일/핸드폰/회원번호), 사업자 정보(6항목: 유형/주민등록번호/사업자등록번호/상호명/업종·업태/이메일)
- **주민등록번호**: 비사업자만 표시 (개인사업자/법인사업자는 `—`), DB에 원본 저장 → JS에서 마스킹 후 전체보기 토글. ※ 런칭 전 암호화 저장(pgcrypto) 전환 필요
- **정산내역 상세 관련 링크**: 환불번호 컬럼 삭제 (정산 대상은 정상결제+정상예약완료 건이므로 환불 링크 불필요)

### 5-7. 채팅관리 특이사항

- **채팅내역 목록 (chats.html 탭1)**: `search_chat_rooms` RPC로 전환 (sql/29), 보호자 닉네임·유치원명 ILIKE 검색 지원. 초기화 버튼은 필터값 리셋만 수행 (다른 메뉴와 동일 패턴)
- **채팅내역 상세 (chat-detail.html)**:
  - 기본정보: 총 메시지 수 항목 삭제 → 3항목 (고유번호, 생성일, 상태)
  - 예약 목록: 컬럼명 수정 (`check_in_at` → `checkin_scheduled`, `amount` → `payments(amount)` 서브조인), 예약번호는 UUID 앞 8자 표시
  - 신고 이력: info-grid(신고 여부) + mini-table(5열) 구조로 전면 개편, FK 충돌 방지를 위해 reports → members 별도 쿼리 분리 (HANDOVER 5-14 패턴 적용)
  - DB 바인딩 정상화: `showChatDetailLoading()` → `fetchDetail` → `showChatDetailError()` 흐름 구현, 더미 HTML이 남지 않도록 로딩 플레이스홀더 + 에러 핸들링 추가
- **신고접수 목록 (chats.html 탭2)**: `search_reports` RPC(sql/30), 제재 유형 필터(`p_sanction_type`) 추가, 테이블 12컬럼 (번호/신고일시/신고자/신고자유형/피신고자/피신고자유형/신고사유/채팅방번호/처리상태/제재유형/처리일시/상세), 기간 퀵버튼(전체/당월/최근1개월/최근1주일), `processed_by_name` admin_accounts LEFT JOIN 반환
- **신고접수 상세 (report-detail.html)**:
  - 관련 채팅방: 총 메시지 수 행 삭제 → 2항목 (채팅방 번호, 마지막 메시지 일시)
  - 처리 내역: 라벨 "처리 결과"→"처리 상태", 제재 기간을 시작일/종료일 2행 분리, 처리 관리자를 admin_accounts.name으로 조인 표시, 라벨 폰트사이즈 통일 (detail-card__title h3 16px/700)
  - 처리 이력: 6열 (변경일시/이전상태/변경상태/제재유형/처리자/비고), report_logs → admin_accounts 조인, processed_by NULL이면 "시스템" 뱃지 표시
  - 모달 액션: 처리상태 변경/제재 적용/기각 처리 시 processed_by에 admin_accounts.id(uuid) 저장, report_logs INSERT 추가 (sanction_type 포함)
- **DB 마이그레이션 (sql/31)**: reports.processed_by text→uuid FK(→admin_accounts.id), report_logs.processed_by text→uuid FK, report_logs.sanction_type nullable 컬럼 추가, 기존 "최고관리자" 데이터를 admin_accounts.id로 마이그레이션, "시스템"은 NULL 처리
- **has_report 트리거** (sql/28): reports INSERT/UPDATE/DELETE 시 `chat_rooms.has_report` 자동 갱신 (접수·처리중 건 존재 여부)
- **목록화면 닉네임 표시**: 채팅내역 10컬럼 (이름 제외, 닉네임만), 신고접수 12컬럼 (이름→닉네임, 제재 유형 포함)
- **메시지 내역 말풍선 UI**: 보호자(좌측 갈색 bubble), 유치원(우측 분홍 bubble), 시스템(중앙 회색 bubble), 날짜 구분선, 닉네임·시간·읽음여부 메타 표시
- **모달**: 채팅방 강제 비활성화(1개), 처리상태 변경/제재 적용/기각 처리(3개)

### 5-8. CSS 리팩터링 방침

- CSS 리팩터링은 **모든 대메뉴 HTML 구현이 완료된 후** 한번에 수행하기로 결정
- 현재는 각 메뉴 작업 시 페이지전용 CSS에 필요한 스타일을 추가하는 방식으로 진행

### 5-12. RPC 검색 방식 가이드 (표준 구현 패턴)

**도입 배경:** 여러 테이블을 JOIN하여 필터/검색해야 하는 목록 페이지에서 Supabase 클라이언트의 `.from().select()` 방식으로는 조인 테이블 컬럼 기준 ILIKE 검색이 불가능하여, PostgreSQL RPC 함수 방식을 도입.

**현재 적용된 RPC 함수 목록:**

| RPC 함수명 | 적용 메뉴 | SQL 파일 | JOIN 구조 |
|------------|----------|---------|-----------|
| `search_reservations` | 돌봄예약관리 목록 | `sql/13_search_reservations.sql` | reservations → members, pets, kindergartens, payments |
| `search_payments` | 결제관리 > 결제내역 탭 | `sql/21_rpc_payment_type_update.sql` | payments → members, pets, kindergartens (payment_type 필터 적용) |
| `search_refunds` | 결제관리 > 환불/위약금 탭 | `sql/21_rpc_payment_type_update.sql` | refunds → members, kindergartens, reservations → pets, payments(penalty_payment) |
| `search_settlement_infos` | 정산관리 > 정산정보 탭 | `sql/23_search_settlement_infos.sql` | settlement_infos → kindergartens |
| `search_settlements` | 정산관리 > 정산내역 탭 | `sql/24_search_settlements.sql` | settlements → kindergartens, settlement_infos(LATERAL) |
| `search_chat_rooms` | 채팅관리 > 채팅내역 탭 | `sql/29_search_chat_rooms.sql` | chat_rooms → members(guardian), kindergartens, chat_room_reservations → reservations |
| `search_reports` | 채팅관리 > 신고접수 탭 | `sql/30_search_reports.sql` | reports → members(reporter, reported), admin_accounts(processed_by) |
| `search_guardian_reviews` | 후기관리 > 보호자 후기 탭 | `sql/32_search_guardian_reviews.sql` | guardian_reviews → members, kindergartens, pets(LEFT JOIN) |
| `search_kindergarten_reviews` | 후기관리 > 유치원 후기 탭 | `sql/33_search_kindergarten_reviews.sql` | kindergarten_reviews → members, kindergartens, pets(LEFT JOIN) |
| `search_education_completions` | 교육관리 > 이수현황 탭 | `sql/38_search_education_completions.sql` | education_completions → kindergartens → members (동적 total_topics, progress_rate, completion_status 계산) |

**RPC 함수 공통 구조:**
1. **파라미터 설계**: `p_date_from`, `p_date_to` (기간), `p_status` (상태 필터), `p_search_type` + `p_search_keyword` (검색 기준/키워드), `p_page` + `p_per_page` (페이지네이션). 필요에 따라 추가 필터 파라미터 포함
2. **보안**: `SECURITY DEFINER` + `is_admin()` 권한 체크 — 모바일 앱과 DB를 공유하므로 일반 사용자 호출 방어 필수
3. **반환 형식**: `json_build_object('data', COALESCE(v_rows, '[]'::json), 'count', v_total)` — `{data: [...], count: N}` 구조
4. **조인 데이터**: `json_build_object()`으로 조인 테이블 데이터를 중첩 객체로 반환 (예: `members`, `kindergartens`, `pets`)
5. **검색 매핑**: `p_search_type` 값에 따라 대상 컬럼을 `ILIKE '%' || p_search_keyword || '%'`로 매칭
6. **정렬/페이징**: `ORDER BY ... DESC LIMIT p_per_page OFFSET v_offset`

**JS 호출 패턴 (`supabase.rpc()`):**
```
// 1. 파라미터 조립 함수
function buildXxxRpcParams(page, perPage) { ... }

// 2. RPC 호출
var rpcResult = await window.__supabase.rpc('search_xxx', buildXxxRpcParams(page));

// 3. 결과 파싱 (문자열 방어)
var result = parseRpcResult(rpcResult.data);  // {data: [], count: 0}
```

**신규 메뉴 개발 가이드:** 다른 테이블의 데이터를 조인하여 검색하는 필터가 필요한 경우, RPC 함수 방식을 표준 구현 패턴으로 사용. `search_reservations` / `search_payments` / `search_refunds`의 구조를 참고하여 동일한 패턴으로 RPC 함수를 생성할 것.

### 5-14. FK 중복 테이블 조인 가이드 (Supabase PostgREST PGRST201 방지)

**문제**: 한 테이블에서 같은 테이블을 참조하는 FK가 2개 이상일 때, Supabase의 `.select()` 조인에서 어떤 FK를 사용할지 모호해져 PGRST201 에러가 발생한다.

**해당 사례:**
- `refunds` → `payments` : `payment_id`(원 결제), `penalty_payment_id`(위약금 결제) — 2개 FK 존재

**해결 방식:** 메인 쿼리의 select 절에서 FK 충돌이 발생하는 테이블 조인을 제외하고, 별도 쿼리로 분리한다.

```javascript
// ❌ 잘못된 방식 — PGRST201 에러 발생
api.fetchDetail('refunds', id, '*, payments:payment_id(...), penalty_payment:penalty_payment_id(...)');

// ✅ 올바른 방식 — 충돌 테이블은 별도 쿼리로 분리
var result = await api.fetchDetail('refunds', id, '*, members:member_id(...), ...');
var ppResult = await api.fetchDetail('payments', r.penalty_payment_id, '...');
```

**참고 코드:**
- `loadPayDetail()` (js/payments.js) — refunds 별도 쿼리 분리
- `loadRefundDetail()` (js/payments.js) — payments(원 결제), penalty_payment(위약금 결제) 별도 쿼리 분리

### 5-15. 교육관리 이미지 Storage 관리

**Supabase Storage 버킷**: `education-images`

**이미지 업로드 유틸리티 (educations.js):**
- `uploadImage(file, folder)` — `education-images` 버킷에 `{folder}/{timestamp}_{random}_{filename}` 형태로 업로드, 공개 URL 반환
- `deleteImageFromStorage(url)` — URL에서 파일 경로를 추출하여 `education-images` 버킷에서 삭제

**고아 파일(orphan) 정리 로직:**

| 케이스 | 페이지 | 처리 방식 |
|--------|--------|----------|
| 이미지 교체 | create, detail | `bindImageUpload()`에서 새 파일 업로드 전 기존 URL로 `deleteImageFromStorage()` 호출 |
| 등록 안 하고 이탈 | education-create | `beforeunload`/`pagehide` 이벤트에서 `createSaved` 플래그가 false이면 `topImageUrl`, `quizImageUrl` 삭제 |
| 편집 취소/이탈 | education-detail | 취소 버튼: 원본 URL과 다른 새 이미지면 삭제 후 원본 복원. `beforeunload`/`pagehide`: `isInEditMode`가 true이고 `detailEditSaved`가 false이면 원본과 다른 이미지 삭제 |
| 편집 저장 | education-detail | 원본 URL과 다른 이미지로 교체 저장 시, 저장 직전에 이전 원본 이미지를 Storage에서 삭제 |

**주의사항**:
- `beforeunload`/`pagehide`에서의 async Storage 삭제는 브라우저에 따라 완료가 보장되지 않음 (관리자 대시보드 특성상 실질적 문제는 낮음)
- 완벽한 정리가 필요하면 서버 측 Cron 또는 Edge Function으로 미참조 이미지를 주기적으로 정리하는 방식 권장

### 5-16. 교육관리 이수현황 상세 구현 노트

**education-status-detail.html 구조** (PR #102~#103):
- 영역 ①: 유치원 기본정보 — 유치원명, 운영자 성명, 운영자 연락처(마스킹), 유치원 고유번호(링크)
- 영역 ②: 이수 전체 요약 — stat-cards(3col: 전체 주제 수, 이수 완료 수, 진행률%) + info-grid(이수 상태 배지, 전체 이수 완료일, 체크리스트 확인 배지, 활동서약서 동의 배지)
- 영역 ③: 교육별 이수 상세 — data-table(순서/주제명/이수여부 배지/일시), topic_details JSONB ↔ education_topics 매칭
- 영역 ④: 체크리스트 확인 정보 — 확인 여부/완료일시/확인 버전(링크)/최신 버전 일치 여부
- 영역 ⑤: 서약서 동의 정보 — 동의 여부/일시/동의 버전(링크)/최신 버전 일치 여부
- 모달: 강제 이수 처리, 이수 초기화 (체크리스트 초기화 모달/버튼 삭제)

**loadStatusDetail() 구현 상세**:
- `fetchDetail('education_completions', id, '*, kindergartens:...(members:...), checklists:checklist_version_id(...), pledges:pledge_version_id(...)')` — 3단 조인
- 공개 교육 주제를 별도 쿼리로 조회하여 `totalTopics` 동적 계산
- `completionStatus` 3분기 로직: 전체 주제 이수 + 체크리스트 확인 + 서약서 동의 = '이수완료', 1건 이상 이수 = '진행중', 나머지 = '미시작'
- 체크리스트/서약서 버전 비교: FK 조인(`checklists:checklist_version_id`, `pledges:pledge_version_id`)으로 version_number 가져온 뒤, 별도 쿼리로 최신 버전 조회하여 일치/불일치 배지 렌더링
- 강제 이수 시 `completed_topics`를 동적 `totalTopics`로 설정 (하드코딩 아님)

**이수현황 목록 RPC** (`search_education_completions`, sql/38):
- 동적 total_topics (공개 교육 주제 수 실시간 카운트)
- 동적 progress_rate, completion_status 계산
- p_completion_status 필터, p_search_type('유치원명'/'운영자 성명') 검색
- 페이지네이션, json_build_object 반환

**주의사항**:
- 이수 전체 요약의 계산값과 교육별 이수 상세의 topic_details JSONB는 모바일 앱 연결 전까지 불일치할 수 있음 (현재 테스트 데이터 기준으로는 정상 동작)
- `checklist_version_id`, `pledge_version_id`가 NULL인 경우 (테스트 데이터 미입력) 버전 링크/일치 배지가 '-'로 표시됨

### 5-13. 위약금 결제 흐름 DB 반영 — Phase A 완료 (2026-03-31)

> 상세 계획서: `PAYMENT_REFACTORING_PLAN.md` 참조 (PR #82~#89)

**서비스의 환불/위약금 로직:**
- 보호자가 돌봄 예약을 취소할 때 위약금을 PG사를 통해 별도 결제하고, 기존 돌봄비 결제 건은 전액 환불하는 방식
- 위약금 결제는 돌봄비 결제와 완전히 동일한 PG 결제 프로세스를 거침 (모바일 앱에 이미 구현 완료)

**Phase A 완료 (DB 스키마 변경 + RPC 업데이트):**
1. ✅ `payments` 테이블에 `payment_type` 컬럼 추가 (`'돌봄'` / `'위약금'`, CHECK 제약)
2. ✅ `refunds` 테이블에 `penalty_payment_id` 컬럼 추가 (FK → payments.id)
3. ✅ `search_payments` RPC: `p_payment_type` 파라미터 추가 (DEFAULT `'돌봄'`), 기존 시그니처 DROP
4. ✅ `search_refunds` RPC: `penalty_payment_id`로 payments LEFT JOIN, 위약금 결제 정보 반환
5. ✅ `get_dashboard_monthly_sales` / `get_dashboard_today_stats`: 돌봄/위약금 분리 집계
6. ✅ `get_settlement_summary`: 기간 필터 추가, 기존 시그니처 DROP
7. ✅ `settlements.transaction_type`: `'돌봄결제'` → `'돌봄'` 통일, CHECK 제약 추가
8. ✅ fee 컬럼 (`care_fee`, `walk_fee`, `pickup_fee`): NOT NULL 제거, 조건부 CHECK (위약금 시 NULL 허용)
9. ✅ 검증 쿼리 23항목 통과 (payments 12건, refunds 5건, settlements 4건)

**Phase B 완료 (UI 수정, 2026-03-31 — PR #89):**
- ✅ `js/payments.js`: `buildPayRpcParams()`에 `p_payment_type:'돌봄'` 추가, 환불탭 "위약금 결제번호" 컬럼 삭제, `loadRefundDetail()`에 `penalty_payment:penalty_payment_id(...)` JOIN 추가 및 7필드 렌더링
- ✅ `payments.html`: 환불/위약금 탭 `<thead>` "위약금 결제번호" 컬럼 삭제 (14→13컬럼)
- ✅ `payment-detail.html`: 변경 없음 (돌봄 결제 전용 유지)
- ✅ `refund-detail.html`: 영역 ④ "위약금 결제 정보" 5필드→7필드 구조 변경 (결제번호·PG거래번호·승인번호·금액·결제수단·결제일시·결제상태)

**Phase C 완료 (기타 메뉴, 2026-03-31 — PR #90):**
- ✅ `js/dashboard.js`: 변경 불필요 확인 (RPC에서 돌봄/위약금 이미 분리 집계)
- ✅ `js/members.js`: 결제 집계·목록 4곳에 `payment_type='돌봄'` 필터 추가
- ✅ `js/kindergartens.js`: 주석 업데이트, 돌봄 결제 필터 추가, 위약금 조회를 `payments.payment_type='위약금'`으로 변경
- ✅ `js/reservations.js`: select 절에 `payment_type`, `penalty_payment_id` 추가, 돌봄 결제만 추출하도록 분리
- ✅ `js/settlements.js`: autoBadge 매핑 `'돌봄결제'` → `'돌봄'` (2곳)

---

## 6. 파일 크기 참고

```
css/common.css          419줄  (전역변수, 리셋, 레이아웃 + 배지 CSS 변수 16개 + 초기화 버튼)
css/components.css     1352줄  (공통 UI 컴포넌트 + 7색 배지 + 모달 변형 + 탭바 + btn-add-new + form-* 폼 컴포넌트 + order-arrows + review-tag-pill + 말줄임 + view-all-link + stat-cards--4col + data-table__checkbox + 서류확인 모달)
css/dashboard.css       273줄  (대시보드 전용)
css/members.css           6줄  (주석만)
css/kindergartens.css     6줄  (주석만)
css/pets.css             11줄  (반려동물 전용 — 후기태그·말줄임·전체보기는 components.css 사용)
css/reservations.css     73줄  (돌봄예약 전용, stat-cards--4col은 components.css 사용)
css/payments.css         30줄  (결제관리 전용, 금액 필터 인풋)
css/settlements.css      82줄  (정산관리 전용 버튼/요약, 체크박스는 components.css 사용, hover는 공통 opacity:0.8 적용)
css/chats.css           163줄  (채팅관리 전용 말풍선/텍스트, 색상은 CSS 변수 사용)
css/reviews.css          51줄  (후기관리 전용 태그, 후기태그·말줄임은 components.css 사용)
css/educations.css      473줄  (교육관리 전용 — 이미지/퀴즈/토글/체크리스트/서약서, 섹션카드·화살표는 components.css 사용)
css/contents.css        293줄  (콘텐츠관리 전용 — 카테고리(시스템색상+유치원핑크)/이미지 프리뷰/배너 사이즈 오버라이드/공지 첨부파일 리스트/Quill 에디터 리스트 오버라이드/FAQ Quill 에디터 높이·리스트/약관 에디터 높이·본문 렌더링/modal--large(720px)·modal__body-scroll/disabled 버튼, 폼·화살표·스크롤은 components.css 사용)
css/settings.css        109줄  (설정 전용 — 인풋그룹/힌트/권한셀렉트, 색상은 CSS 변수 사용, 폼은 form-* 사용)
css/login.css           194줄  (로그인 전용 — 중앙 카드 레이아웃, 패스워드 토글, 디자인 시스템 변수 활용)
총 3,580줄
```

### 6-2. JavaScript 파일 크기

```
js/supabase-client.js    20줄  (Supabase CDN 클라이언트 초기화, URL/anon-key 설정)
js/auth.js              366줄  (로그인/로그아웃, 세션 체크, 사이드바·헤더 프로필 동적 표시, 메뉴 접근 권한 제어)
js/common.js            167줄  (모달 시스템, 마스킹 토글, 소개글 토글, textarea→버튼 활성화, 필터 초기화)
js/components.js        231줄  (탭 전환, 전체선택 체크박스, 순서 화살표, 버전 검증, 글자수 카운터, URL 해시 탭 복원)
js/api.js               842줄  (Supabase CRUD 래퍼, 포매터, 배지, 페이지네이션, 엑셀, 감사로그, 마스킹, 권한)
js/dashboard.js         244줄  (통계 카드, 승인 대기, 매출 요약, 활동 로그)
js/members.js           812줄  (목록·상세, 이용정지/해제, 주소인증, 엑셀, 결제집계, 서류확인 모달)
js/kindergartens.js    1004줄  (목록·상세, 영업상태, 서브몰, 노쇼, 보호자 돌봄후기, 태그집계, 주소인증, 정산연동)
js/pets.js              516줄  (목록·상세, 삭제, 닉네임조인, 돌봄횟수집계, 태그집계(7항목고정), 크로스링크)
js/reservations.js      522줄  (목록·상세, 직권취소, 노쇼 — PR #57에서 async/await 리팩터링)
js/payments.js          725줄  (결제/환불 2탭, 결제 상세, 환불/위약금 상세, 위약금면제, search_payments·search_refunds RPC, FK 충돌 방지 별도 쿼리 분리)
js/settlements.js       819줄  (정산정보/내역 2탭, search_settlement_infos+search_settlements RPC, 기간버튼, 요약동기화, 일괄정산, 엑셀)
js/chats.js             974줄  (채팅/신고 2탭, search_chat_rooms·search_reports RPC, 채팅상세 DB 바인딩, 신고상세 DB 바인딩(admin 조인·report_logs), 비활성화, 제재/기각, 처리이력 로드)
js/reviews.js           679줄  (보호자/유치원 2탭, search_guardian_reviews·search_kindergarten_reviews RPC, 기간퀵버튼(전체/당월/1개월/1주일), 숨김/해제)
js/educations.js       2151줄  (교육 주제 CRUD + 이미지 Storage 관리 + 고아파일 정리 + 체크리스트/서약서 보기·편집·상태변경·삭제 + 이수현황 목록(RPC)+상세(동적 렌더링), 버전관리)
js/contents.js         2482줄  (배너/공지/FAQ/약관 4탭, 배너 Storage 관리+고아정리+보기/편집 모드, 공지사항 Quill 에디터+다건 첨부파일(10개/10MB)+보기/편집 모드+Storage 관리+고아정리, FAQ 등록/상세(Quill 에디터+보기/편집 모드+RPC 순서관리+삭제), 약관 상세(읽기전용+버전 이력+Quill 편집+공개/비공개 전환+삭제)+버전등록(수정사유+Quill+terms 업데이트), 푸시발송)
js/settings.js          504줄  (앱설정6카드, 관리자CRUD, 피드백, 규칙 추가/삭제)
총 13,068줄  (Phase 3 완료 + DB 연결 보완·UI 개선 기준)
```

---

## 7. 작업 프로세스 (매 대메뉴마다 반복)

1. **스펙 확인**: `full_spec_with_tables.md` 해당 섹션 읽기
2. **UX/UI 디자인 초안**을 마크다운으로 작성 → 사용자 검토 → 수정 → OK
3. **코딩**: `css/[페이지전용].css` + `[목록].html` + `[상세].html` 생성
4. **사이드바 링크 업데이트**: 기존 전체 HTML 파일(현재 42개)의 사이드바를 동기화
5. **콘솔 검증**: Playwright로 JS 오류 없는지 확인
6. **프리뷰 링크 제공**: 사용자가 직접 확인할 수 있도록 서비스 URL 공유
7. **커밋 → PR 생성**: `genspark_ai_developer` 브랜치에서 작업, PR은 `develop`으로
8. **사용자 확인 후 머지** (develop에 머지 — 배포 안 됨)

> **배포 흐름**: 사용자가 `develop → main` PR을 직접 만들어 머지할 때만 Cloudflare Pages 자동 배포가 실행됩니다.
9. **스펙 동기화**: 협의로 변경/추가된 내용을 `full_spec_with_tables.md`, `README.md`에 반영 → 별도 PR

---

## 8. Git 워크플로우

```bash
# 1. develop 동기화
git checkout develop && git pull origin develop

# 2. 작업 브랜치 전환 + develop 기반 리베이스
git checkout genspark_ai_developer && git rebase origin/develop

# 3. 작업 후 커밋
git add [files] && git commit -m "feat(xxx): 설명"

# 4. PR 전 동기화 확인
git fetch origin develop && git rebase origin/develop

# 5. 커밋이 여러 개면 스쿼시
git reset --soft HEAD~N && git commit -m "종합 메시지"

# 6. 푸시 + PR 생성 (develop으로)
git push -f origin genspark_ai_developer
gh pr create --base develop --head genspark_ai_developer --title "..." --body "..."

# 7. 배포 (사용자가 직접 수행)
# develop → main PR 생성 & 머지 → Cloudflare Pages 자동 배포
```

> **인증 실패 시**: `setup_github_environment` 도구 실행 후 재시도

---

## 9. 백엔드 로드맵 및 진행 현황

HTML/CSS/JS 프론트엔드 UI 구현이 모두 완료되었습니다 (43페이지, 15 CSS, 17 JS).
**백엔드 구축 Phase 1~3 완료** 후, **DB 연결 보완 및 UI 개선** 작업이 완료되었습니다 (PR #59~#112).
설정·대시보드는 모바일앱 백엔드 연결 후 후속진행 예정입니다.
Phase 4 (호스팅 전환)는 DB 연결 보완 및 UI 개선 완료 후 진행 예정입니다.

> 각 Phase의 기술적 배경·선택 이유는 `TECH_DECISION.md` 참조.

### Supabase 프로젝트

- **리전**: ap-northeast-2 (서울)
- **접속정보**: 보안상 저장소에 미포함 — 매 채팅 세션에서 직접 제공

---

### Phase 1: 기반 구축

| 순서 | 작업 | 상태 | 비고 |
|------|------|------|------|
| 1-1 | Supabase 프로젝트 생성 | ✅ 완료 | 서울 리전, 프로젝트 생성 완료 |
| 1-2 | DB 스키마 설계 | ✅ 완료 | `full_spec_with_tables.md` 기반, SQL 1~8로 실행 |
| 1-3 | DB 테이블 생성 | ✅ 완료 | SQL 1~8: Supabase SQL Editor에서 직접 실행·적용 완료 |
| 1-4 | RLS 정책 설정 | ✅ 완료 | SQL 1~8에 포함, 역할별 접근 권한 설정 완료 |
| 1-4+ | 컬럼명 리네이밍 | ✅ 완료 | SQL 9: 7개 테이블 약 30개 컬럼 prefix 기반 네이밍으로 변경 |
| 1-5 | 테스트 데이터 삽입 | ✅ 완료 | SQL 10: 스키마 조회 후 재작성, Supabase에서 실행 완료 (PR #48) |

**Phase 1 참고사항**:
- SQL 1~9는 Supabase SQL Editor에서 직접 실행하여 **DB에 이미 적용 완료** (로컬 파일 미보관)
- SQL 10 (테스트 데이터)은 `sql/10_test_data.sql`로 저장소에 보관 (PR #48)
- 스키마 조회 스크립트: `sql/00_schema_query.sql` (컬럼 정보, CHECK 제약조건, FK 제약조건)
- 테스트 데이터 현황 (40개 INSERT, 전체 CHECK/FK 제약조건 준수):

| 테이블 | 건수 | 비고 |
|--------|------|------|
| members | 8 | 보호자 5 + 유치원 운영자 3 |
| kindergartens | 3 | 영업중 2 + 방학중 1 |
| pets | 8 | 보호자 5 + 유치원 상주 3 |
| reservations | 11 | 9개 상태 모두 포함 (관리자취소 추가) |
| payments | 11 | 결제완료 7 + 결제취소 4 (care_fee + walk_fee + pickup_fee = amount) |
| refunds | 5 | 환불완료 4 + 환불대기 1 |
| settlement_infos | 3 | 완료 2 + 미등록 1 |
| settlements | 4 | 완료 2 + 예정 1 + 보류 1 |
| admin_accounts | 3 | 최고관리자 + 일반관리자 + 조회전용 |
| chat_rooms | 6 | 활성 5 + 비활성 1 |
| education_topics | 3 | 공개 3, 퀴즈 별도 테이블 |
| 기타 27개 | 다수 | 메시지, 후기, 신고, 로그 등 |

- **DB ID 체계**: 모든 PK는 uuid 타입, 테스트 데이터는 고정 uuid 사용
  - members: `d0d0d0d0-0001-4000-a000-~0008`
  - kindergartens: `b0b0b0b0-0001~0003`
  - pets: `c0c0c0c0-0001~0008`
  - reservations: `e0e0e0e0-0001~0011`
  - payments: `f0f0f0f0-0001~0011`
  - admin_accounts: `a0a0a0a0-0001~0003`
- **DB 스키마와 기존 스펙 차이점** (Phase 1 작업 중 확인):
  - `payments`에 금액 내역 컬럼 3개 추가: `care_fee`(돌봄비), `walk_fee`(산책비), `pickup_fee`(픽업/드랍비) — `amount = care_fee + walk_fee + pickup_fee` (의미상 관계, 제약조건 없음)
  - `education_topics`에 퀴즈 컬럼 없음 → 별도 `education_quizzes` 테이블 존재
  - `education_completions`는 유치원별 1건 (topic_details jsonb로 개별 이수 추적)
  - `chat_rooms`에 예약 연결 없음 → 별도 `chat_room_reservations` 중간 테이블 존재
  - `reports`에 reporter_type/reported_type 컬럼 존재 (보호자/유치원 구분)
  - `member_term_agreements`는 term_id FK 없이 term_title 텍스트로 저장
  - `admin_accounts`의 권한은 JSON이 아닌 `perm_*` 개별 컬럼 11개
  - `noshow_records`의 역할 구분 컬럼명은 `role` (noshow_type이 아님)
  - `kindergartens`에 가격 컬럼 12개 직접 포함 (별도 pricing 테이블 없음)

---

### Phase 2: 관리자 인증 ✅ 완료

| 순서 | 작업 | 상태 | 비고 |
|------|------|------|------|
| 2-1 | Supabase Auth 설정 | ✅ 완료 | Auth 사용자 3명 생성, SECURITY DEFINER RLS 패턴 (PR #50) |
| 2-2 | 로그인 페이지 구현 | ✅ 완료 | login.html + css/login.css, 비밀번호 표시/숨기기 토글 (PR #50) |
| 2-3 | 세션 관리 | ✅ 완료 | Supabase JWT 자동 관리, sessionStorage 캐시 (PR #50) |
| 2-4 | 권한 체크 | ✅ 완료 | 42개 페이지 data-perm 속성 + 메뉴 숨김/페이지 차단 (PR #51) |

**Phase 2 신규 파일**:

| 파일 | 설명 |
|------|------|
| `login.html` | 로그인 페이지 (이메일/비밀번호 입력, 비밀번호 토글, 에러 표시) |
| `css/login.css` | 로그인 페이지 전용 CSS (디자인 시스템 변수 활용) |
| `js/supabase-client.js` | Supabase CDN 클라이언트 초기화 (~20줄) |
| `js/auth.js` | 인증·세션·권한 관리 핵심 로직 (~360줄) |
| `sql/11_auth_setup.sql` | Auth 설정 SQL (이메일 업데이트, auth_user_id 연결, RLS 정책) |
| `sql/11_auth_setup_patch.sql` | RLS 순환 참조 패치 (SECURITY DEFINER 헬퍼 함수) |

**Phase 2 구현 상세**:
- **테스트 관리자 계정**: Supabase Auth에 3명 등록
  - `shkwon@wooyoopet.com` / `admin1234!` — 최고관리자, 활성
  - `kmhwang@wooyoopet.com` / `admin1234!` — 일반관리자, 활성
  - `dev@wooyoopet.com` / `admin1234!` — 조회전용, 비활성
- **RLS 패턴**: `is_admin()` / `is_superadmin()` SECURITY DEFINER 함수로 순환 참조 해소
- **인증 흐름**: login.html → `signInWithPassword` → admin_accounts 조회 → 비활성 체크 → 로그인 로그 기록 → index.html 리다이렉트
- **세션 관리**: Supabase JS SDK가 localStorage에 JWT 자동 관리, admin 정보는 sessionStorage에 캐시
- **권한 제어**: 사이드바 `data-perm` 속성 기반 메뉴 숨김 + PAGE_PERM_MAP 기반 페이지 접근 차단
- **비활성 계정**: "비활성화된 계정입니다. 관리자에게 문의하세요." 메시지 표시
- **비밀번호 분실**: Supabase Dashboard > Authentication > Users에서 직접 리셋 (프로젝트 오너만 접근 가능)
- **권한 컬럼**: `perm_*` 개별 컬럼 11개 — `perm_members`, `perm_kindergartens`, `perm_pets`, `perm_reservations`, `perm_payments`, `perm_settlements`, `perm_chats`, `perm_reviews`, `perm_educations`, `perm_contents`, `perm_settings`
- **권한 값**: `'조회만'`, `'조회+수정'`, `'접근불가'`
- **관리자 role**: `'최고관리자'`, `'일반관리자'`, `'조회전용'`
- **관리자 status**: `'활성'`, `'비활성'`
- Supabase 접속정보는 보안상 저장소 미포함 — 채팅 세션에서 직접 제공 필요

---

### Phase 3: 관리자 페이지 ↔ API 연결 ✅ 완료

| 순서 | 작업 | 상태 | 비고 |
|------|------|------|------|
| 3-1 | Supabase 클라이언트 설정 | ✅ 완료 | Phase 2에서 supabase-js CDN + supabase-client.js 구현 완료 |
| 3-2 | 대시보드 연동 (0번) | ✅ 완료 | PR #52 — 통계 카드, 승인 대기, 매출 요약, 활동 로그, 카드 클릭 네비게이션 |
| 3-3 | 회원관리 연동 (1번) | ✅ 완료 | PR #53 — 목록(필터·검색·페이지네이션), 상세(12영역), 이용정지/해제, 주소인증 |
| 3-4 | 유치원관리 연동 (2번) | ✅ 완료 | PR #53 — 목록+상세(13영역), 영업상태, 서브몰, 노쇼, 크로스링크, 보호자 돌봄후기, 태그집계 |
| 3-5 | 반려동물관리 연동 (3번) | ✅ 완료 | PR #53 — 목록+상세(5영역), 삭제, 태그집계, 크로스링크 |
| 3-6 | 돌봄예약관리 연동 (4번) | ✅ 완료 | PR #54 — 목록(9상태필터), 상세(8영역), 직권취소, 노쇼 |
| 3-7 | 결제관리 연동 (5번) | ✅ 완료 | PR #54 — 결제/환불 2탭, 결제상세, 환불상세, 위약금면제 |
| 3-8 | 정산관리 연동 (6번) | ✅ 완료 | PR #54 — 정산정보/내역 2탭, 이니시스, 보류/해제 |
| 3-9 | 채팅관리 연동 (7번) | ✅ 완료 | PR #54 — 채팅/신고 2탭, 비활성화, 제재/기각 |
| 3-10 | 후기관리 연동 (8번) | ✅ 완료 | PR #56 — 보호자/유치원 2탭, 숨김/해제 |
| 3-11 | 교육관리 연동 (9번) | ✅ 완료 | PR #56 — 주제/체크리스트/이수현황 3탭, 버전관리, 강제이수 |
| 3-12 | 콘텐츠관리 연동 (10번) | ✅ 완료 | PR #56 — 배너/공지/FAQ/약관 4탭, 푸시발송, 버전발행 |
| 3-13 | 설정 연동 (11번) | ✅ 완료 | PR #56 — 앱설정6카드, 관리자CRUD, 피드백확인/메모 |
| 3-14 | 공통 기능 연동 | ✅ 완료 | PR #56 — 엑셀11모듈, 감사로그49건, 마스킹9모듈, 권한11모듈 |
| 3-15 | 통합 테스트 & 버그 수정 | ✅ 완료 | PR #57 — 날짜필터·필드매핑·에러핸들링 전면 수정 (아래 상세) |

**Phase 3 산출물 요약:**
- 신규 JS 10개: api.js, dashboard.js, members.js, kindergartens.js, pets.js, reservations.js, payments.js, chats.js, reviews.js, contents.js
- 확장 JS 3개: educations.js, settings.js, settlements.js
- 수정 HTML 42개: DOM ID 추가, script 태그 추가, SheetJS CDN 추가
- 신규 SQL 1개: sql/12_phase3_functions.sql (대시보드 RPC 4개)

**PR #57 통합 테스트 버그 수정 상세:**

돌봄예약·후기·환불 3개 섹션에서 데이터가 표시되지 않는 문제를 추적·해결했습니다.

| 문제 | 근본 원인 | 해결 | 영향 파일 |
|------|----------|------|-----------|
| 돌봄예약 목록 0건 | HTML 날짜필터 기본값 `2025-12-31` 하드코딩 → 2026 데이터 필터링됨 | `2026-12-31`로 변경 + JS 자동 보정 | reservations.html, js/reservations.js |
| 후기 2탭 모두 0건 | 동일 날짜필터 문제 | 양쪽 탭 날짜 수정 + JS 자동 보정 | reviews.html, js/reviews.js |
| 반려동물 날짜 필터 | 동일 패턴 | 기본값 수정 | pets.html |
| JS-DB 필드명 불일치 | `size_category`→`size_class`, `cancelled_at`→`requested_at` 등 | select 문 DB 컬럼명으로 전면 교체 | js/reservations.js, js/payments.js |
| FK 힌트 불필요 | `payments!reservation_id(...)` 문법 | `payments(...)` 단순화 | js/reservations.js, js/payments.js |
| 에러 삼킴 (silent catch) | `.catch()` 블록이 에러 로깅 없이 삼켜 디버깅 불가 | `async/await` + `try/catch` + `console.error` | js/reservations.js, js/reviews.js |
| null 참조 크래시 | `resultCount`·`pagination` DOM null 접근 | null-safe 가드 추가 | js/reservations.js |
| renderPagination 인자 오류 | 4인자 호출 → 실제 5인자 시그니처 | `(el, page, count, perPage, callback)` 수정 | js/reservations.js, js/reviews.js |

> **핵심 교훈**: `payments.html`만 정상 작동한 이유는 결제 페이지의 날짜 기본값이 `2026-03-17`로 설정되어 있었기 때문. 나머지 3개 페이지는 `2025-12-31`로 남아 있어 전부 필터링됨.

---

### DB 연결 보완 및 UI 개선 (Phase 3 이후, 진행중)

Phase 3 완료 후 전체 페이지의 DB 연결 오류 수정 및 UI 개선 작업을 진행중입니다.

| PR | 대상 메뉴 | 주요 변경 내용 |
|----|----------|---------------|
| #59 | 유치원관리 | 상세 페이지 4버튼 추가 (영업상태, 주소인증, 서류확인, 서브몰 재등록), 정산관리 필터 연동 |
| #60 | 반려동물관리 | DB 스키마 컬럼명 불일치 수정 (`size_category` → `size_class` 등) |
| #61 | 회원관리, 유치원관리 | 주소 마스킹 처리, 서류확인 모달 추가 (components.css +82줄) |
| #62 | 회원관리 | 목록 페이지 결제건수/금액 실시간 집계 (payments 테이블 조인) |
| #63 | 유치원관리 | 목록 컬럼명 변경(위치→유치원 주소), 상세 블록번호 삭제, 보호자 돌봄후기 블록·태그집계 블록 신설, 가격표/태그집계 테이블 가로폭 최적화 |
| #65 | 반려동물관리 | 목록: 필터 라벨(기간→등록일, 분류→필터), 검색 드롭다운(반려동물이름·견종만), 테이블 헤더(보호자 닉네임), 닉네임 조인, 돌봄횟수 집계(reservations 돌봄완료 COUNT), 나이 만나이(N살), 중성화·예방접종 배지 green/gray, 엑셀 반영 |
| #66 | 반려동물관리 | 상세: 돌봄후기 테이블에 등원일·후기상태(공개/숨김) 컬럼 추가(7→9열), 태그집계 stat-cards→mini-table 구조 변경(7개 고정 항목, 긍정/부정 건수) |
| #70 | 돌봄예약관리 | 목록 UI 개선 (기간유형 드롭다운, 크기 필터, 검색 옵션 변경, 헤더 닉네임), RPC `search_reservations` 연동, 엑셀 결제금액 포함 |
| #72 | 반려동물관리 (DB) | `set_pet_size_class` 트리거 추가 (weight 기반 size_class 자동 계산) |
| #75 | 결제관리 (DB) | payments 테이블에 금액 내역 컬럼 3개 추가 (`care_fee`, `walk_fee`, `pickup_fee`) |
| #76 | 돌봄예약관리 | 상세 UI 개선: 등원/하원 예정+실제 나란히, 금액 상세를 결제 정보에 통합, 보호자/유치원 연락처 마스킹, 반려동물 성별/크기 뱃지, ID 링크 축약, renderMaskedField 래퍼 수정 |
| #77 | 돌봄예약관리 (DB+UI) | 예약 상태 '관리자취소' 추가 (CHECK 제약조건 9개 상태), 환불 블록 노출 조건 수정 (취소/거절 계열만 표시), 필터 드롭다운/뱃지/테스트 데이터 반영 |
| #79 | 결제관리 | 결제내역 탭 필터 4행 구조(결제일/결제수단·상태/검색/결제금액+초기화), 테이블 15→13컬럼(결제번호·보호자 닉네임 추가, 승인번호·카드사·카드번호 삭제), `search_payments` RPC 연동, 초기화 버튼 공통 컴포넌트(`btn-reset`→common.css, `__resetFilters`→common.js), payments status CHECK 제약 변경(결제완료/결제취소) |
| — | 결제관리 | 환불/위약금 탭: 필터 3행 변경(요청일/필터(처리상태+요청자)/검색+초기화), 테이블 17→14컬럼(위약금 결제번호·보호자 닉네임·연락처 추가, 환불비율·위약금비율·남은시간·예약번호 삭제), `search_refunds` RPC 신규 생성 및 연동, 더미 데이터 제거→RPC 렌더링, 엑셀 다운로드 RPC 전환 |
| #92 | 결제관리 | 결제 상세 데이터 바인딩: payments.id·pg_transaction_id·approval_number 바인딩, mapPaymentMethod() 결제수단 매핑, 회원·예약·환불 ID 링크, refunds 조인 분리(PGRST201 방지), renderMaskedField 인자 수정, showDetailError() 에러 핸들링, 디버그 로그 추가 |
| #93 | 결제관리 | 환불/위약금 상세 리팩터링: 블록 순서 재배열(환불 기본정보→위약금 결제 정보→위약금 산정→환불 처리 정보→관련 링크), 기본정보에 예약번호·보호자 닉네임·반려동물·유치원 링크 추가, FK 충돌 방지 위해 payments·penalty_payment 별도 쿼리 분리, mapPaymentMethod() 적용, 더미 데이터 제거→로딩 플레이스홀더, async/await+showRefundDetailError() 에러 핸들링, HANDOVER.md 5-14 FK 조인 가이드 추가 |
| #95 | 정산관리 | 정산정보 탭: search_settlement_infos RPC 연동(sql/23), 필터(이니시스 등록상태/사업자여부/검색), 엑셀 다운로드, 유치원 필터 배너. 정산내역 탭: search_settlements RPC 신규(sql/24), 5행 필터→4행 컴팩트화, 기간 버튼, 금액 범위 필터, get_settlement_summary 요약(sql/25, 11항목), 일괄 정산완료, 요약 카드 래퍼 디자인 개선(2행 5col 가운데 정렬), 엑셀 다운로드 |
| #96 | 정산관리 | 사업자 유형 3분류 변경(개인사업자/법인사업자/비사업자, CHECK 제약, sql/26), 정산정보 상세 항목 재배치(주민등록번호·이메일 → 사업자 정보로 이동), 주민등록번호 원본 저장+JS 마스킹 토글(maskSsn, sql/27), 정산내역 상세 환불번호 컬럼 삭제, 스펙 문서 반영 |
| #97 | 채팅관리 | 채팅내역 목록: `search_chat_rooms` RPC 전환(sql/29), 보호자 닉네임·유치원명 ILIKE 검색 지원, 초기화 버튼 필터값 리셋만, 엑셀 다운로드 RPC 전환. 채팅내역 상세: 총 메시지 수 삭제, 예약번호 UUID 앞 8자 표시, 컬럼명 보정(checkin_scheduled, payments(amount)), 신고이력 전면 개편(info-grid+mini-table, reports→members 별도 쿼리), DB 바인딩 정상화(로딩 플레이스홀더+에러 핸들링), has_report 트리거(sql/28) |
| #98 | 채팅관리 | 신고접수 목록: `search_reports` RPC에 `p_sanction_type` 필터 추가(sql/30), 테이블 11→12컬럼(제재 유형), 필터 드롭다운 추가. 신고접수 상세: 총 메시지 수 삭제, 처리내역 블록 재구성(처리상태/제재유형/시작일/종료일/사유/관리자명), 처리이력 6열(제재유형 컬럼 추가), processed_by admin_accounts.name 조인, 라벨 폰트사이즈 통일. DB 마이그레이션(sql/31): reports·report_logs.processed_by text→uuid FK, report_logs.sanction_type 추가, "최고관리자"→admin_accounts.id 마이그레이션. 모달 액션: processed_by uuid 저장, report_logs INSERT 추가 |
| #100~#101 | 교육관리 | 체크리스트/서약서 탭 전면 개편: apply_status '이전 버전'→'미적용' 변경(sql/36, CHECK 제약 DROP→UPDATE→ADD), 버전관리 UI 개편(보기/편집 모드 분리, [상태변경][수정][삭제] 버튼, 상태변경 토글(단일 활성 버전), 삭제 보호(적용중 삭제 금지)), drag-handle 제거, 서약서 3depth 구조 도입(content+description+sub_items, sql/37 pledge_items.description 추가), 생성 시 미적용 상태 기본값, autoBadge '미적용' 매핑 추가, created_by FK 마이그레이션(sql/35) |
| #102 | 교육관리 | 이수현황 탭: `search_education_completions` RPC 신규(sql/38, 동적 total_topics·progress_rate·completion_status, 필터+검색+페이지네이션), #tab-status 필터바 재설계(상태 드롭다운+검색 드롭다운+입력+초기화/검색 버튼), 12컬럼 테이블(진행률 바, 체크리스트/서약서 배지), 엑셀 다운로드(연락처 마스킹), `var` 중복 선언 제거. 이수현황 상세(education-status-detail.html): 기본정보·요약·주제·체크리스트·서약 5영역 동적 렌더링, `loadStatusDetail()` 전면 개편(kindergartens→members 조인, 공개 주제 동적 집계, topic_details JSONB 매칭, 체크리스트/서약서 버전 비교), 체크리스트 확인 초기화 버튼/모달 삭제, 강제 이수 동적 totalTopics 적용, 더미 HTML 제거 |
| #103 | 교육관리 | 이수현황 상세 3건 수정: (1) 이수 전체 요약에 체크리스트 확인/활동서약서 동의 배지 2행 추가, (2) fetchDetail 조인에 checklists:checklist_version_id + pledges:pledge_version_id 추가하여 version_number 조회 (기존 미존재 d.checklist_version_number 참조 수정), (3) checkVersionId/pledgeVersionId 변수 정리 (FK 조인 결과만 참조, fallback 제거) |
| #104 | 콘텐츠관리 | 배너 등록/상세 페이지 전면 재작성: 등록 페이지(content-banner-create.html)와 상세 페이지(content-banner-detail.html) 분리, 노출상태 필드를 기본정보 블록으로 이동, 보기/편집 모드 분리(educations.js 패턴 적용), 이미지 Storage 관리(`banner-images` 버킷, 업로드/교체/삭제, 고아 이미지 정리), 노출상태 자동 계산(is_public+start_date+end_date→노출중/예정/종료/비공개), display_order 자동 설정, 연결유형별 입력 전환(외부URL↔앱내화면), CSS에 `#editBannerImgPreview` 사이즈 오버라이드 추가(360×100px) |
| #106 | 콘텐츠관리 | 공지사항 탭 목록: 검색필터 3행 구조 통일(등록일+퀵버튼, 필터(대상+공개상태), 검색+초기화), 테이블 컬럼 정규화, 데이터테이블 매핑 수정 |
| #107 | 콘텐츠관리 | 공지사항 등록/상세 페이지 전면 재구성: 등록 페이지(content-notice-create.html) 2블록 구조(기본정보+본문), Quill CDN 에디터 통합, 다건 첨부파일(10개/10MB, PDF·DOC·DOCX·HWP·JPG·JPEG·PNG, `notice-attachments` 버킷), 공개상태 읽기전용 배지, 대상 드롭다운(전체(공통)/보호자/유치원). 상세 페이지(content-notice-detail.html) 보기/편집 모드 분리, 푸시 발송 상태 관리(발송완료→disabled), 공개/비공개 전환 모달, Quill 에디터 생명주기(편집 진입 시 생성, 취소 시 파괴), 첨부파일 관리(추가/삭제, 고아파일 정리), 글머리기호/번호 리스트 조회모드 표시 수정(common.css 전역 리셋 오버라이드). URL 해시 기반 탭 복원(js/components.js), 8개 HTML 뒤로가기 링크에 탭 해시 추가 |
| #99 | 후기관리 | 보호자 후기 탭: 필터바 3행 구조 개편(작성일+퀵버튼(전체/당월/지난1개월/지난1주일), 필터(만족도+이미지), 검색+초기화), 테이블 컬럼명 변경(작성일/반려동물 이름/예약상세), `search_guardian_reviews` RPC 전환(sql/32), 엑셀 다운로드 RPC 전환. 유치원 후기 탭: 동일 구조 필터바(드롭다운 2개: 만족도+보호자 전용, 이미지 기능 없음), 테이블 11컬럼(이미지 컬럼 없음), `search_kindergarten_reviews` RPC 신규(sql/33), 엑셀 다운로드 RPC 전환. JS: buildGuardianRpcParams/buildKgRpcParams, parseRpcResult, renderRow, bindPeriodButtons(양쪽 탭), 초기화 버튼 |
| #110 | 콘텐츠관리 | FAQ 등록/상세 페이지 전면 재작성: 등록 페이지(content-faq-create.html) Quill 에디터+카테고리별 display_order 자동 부여+비공개 배지, 상세 페이지(content-faq-detail.html) 보기/편집 모드+Quill+순서 화살표+공개/비공개 전환 모달, RPC 2개(reorder_faq_display_order, delete_faq_and_reorder) 트랜잭션 기반 순서관리, 필수값 검증, DB_FUNCTIONS.md FAQ 관리 섹션 추가 |
| #112 | 콘텐츠관리 | 약관 상세 페이지(content-terms-detail.html) 전면 재작성: 읽기전용 정보 블록(ID/제목/필수여부 배지/등록일/현재 버전/시행일/공개상태 배지), 버전 이력 테이블(term_versions 조회, 대형 모달 720px로 이전 버전 본문 보기), 현재 본문 블록(읽기전용 기본, [수정]→Quill 편집 모드), 공개/비공개 전환(첫 공개 시 effective_date+v1 이력 자동 생성), 삭제(term_versions 캐스케이드 삭제), 4개 모달(toggle/save/delete/versionContent). 버전 등록 페이지(content-terms-version-create.html) 신규: 읽기전용 정보+수정사유 textarea+Quill 에디터(기존 본문 프리로드), 등록 시 이전 버전 end_date 업데이트+새 term_versions INSERT+terms 업데이트. CSS에 modal--large(720px), modal__body-scroll, terms-content-render, 에디터 높이 스타일 추가. auth.js에 content-terms-version-create.html 권한 등록 |

**진행 상황:**
- ✅ 회원관리 (1번): 수정 완료
- ✅ 유치원관리 (2번): 수정 완료
- ✅ 반려동물관리 (3번): 수정 완료
- ✅ 돌봄예약관리 (4번): 수정 완료
- ✅ 결제관리 (5번): 수정 완료 (결제내역 탭, 환불/위약금 탭 목록, 결제 상세, 환불/위약금 상세, 결제 리팩터링 Phase A~C — PR #79, #81~#93)
- ✅ 정산관리 (6번): 수정 완료 (PR #95~#96)
- ✅ 채팅관리 (7번): 수정 완료 (PR #97~#98)
- ✅ 후기관리 (8번): 수정 완료 (PR #99)
- ✅ 교육관리 (9번): 수정 완료 (교육 주제, 체크리스트/서약서, 이수현황 목록+상세 — PR #100~#103, sql/35~38)
- ✅ 콘텐츠관리 (10번): 배너 탭 수정 완료 (PR #104), 공지사항 탭 수정 완료 (PR #106~#107), FAQ 탭 수정 완료 (PR #110), 약관 탭 수정 완료 (PR #112 — 상세 전면 재작성+버전등록 신규+Quill+모달 4개)
- ⬜ 설정 (11번): 모바일앱 백엔드 연결 후 후속진행 예정

---

### Phase 4: 관리자 페이지 배포 ✅ 완료

| 순서 | 작업 | 상태 | 비고 |
|------|------|------|------|
| 4-1 | Cloudflare 계정 생성 | ✅ 완료 | Pages 설정 완료 |
| 4-2 | Cloudflare Pages 배포 | ✅ 완료 | GitHub `wooyoopet-admin` 연결, `main` 브랜치 자동 배포 |
| 4-3 | SmileServ DNS에 CNAME 추가 | ✅ 완료 | `admin` → `wooyoopet-admin.pages.dev` |
| 4-4 | 커스텀 도메인 연결 | ✅ 완료 | `admin.wooyoopet.com` → Cloudflare Pages |
| 4-5 | auth.js 배포 호환성 수정 | ✅ 완료 | Cloudflare Pages URL(.html 없는 경로) 대응 (PR #114) |

**Phase 4 배포 전략 (변경됨):**
- **기존 계획**: wooyoopet.com 도메인 전체를 Cloudflare Registrar로 이전
- **변경된 계획**: 기존 서비스(wooyoopet.com, api/chat 서브도메인) 유지, `admin.wooyoopet.com` 서브도메인만 CNAME으로 Cloudflare Pages에 연결
- **네임서버**: 스마일서브(iwinv) 유지 (Cloudflare로 이전하지 않음)
- **도메인 전체 이전**: Phase 6에서 기존 서버 해지 시 진행 예정

**현재 DNS 구조:**

| 도메인 | 대상 | 용도 |
|--------|------|------|
| `wooyoopet.com` | 115.68.168.218 (SmileServ) | 메인 사이트 |
| `www.wooyoopet.com` | 115.68.168.218 (SmileServ) | 메인 사이트 |
| `api.wooyoopet.com` | 1.226.82.192 | 모바일앱 API |
| `chat.wooyoopet.com` | 1.226.82.192 | 채팅 서버 |
| `admin.wooyoopet.com` | wooyoopet-admin.pages.dev (CNAME) | 관리자 페이지 (신규) |

---

### Phase 5: 모바일 앱 백엔드 전환

| 순서 | 작업 | 상태 | 비고 |
|------|------|------|------|
| 5-1 | 앱 소스코드 수령 | ⬜ 예정 | 기존 개발자에게 최신 React Native 소스코드 수령 |
| 5-2 | API 호출부 분석 | ⬜ 예정 | 기존 PHP API 엔드포인트 매핑 |
| 5-3 | Supabase API로 교체 | ⬜ 예정 | PHP API → Supabase 자동 API 변경 |
| 5-4 | 인증 교체 | ⬜ 예정 | 기존 인증 → Supabase Auth |
| 5-5 | 채팅 교체 | ⬜ 예정 | 카페24 채팅 → Supabase Realtime |
| 5-6 | 파일 업로드 교체 | ⬜ 예정 | 기존 → Supabase Storage |
| 5-7 | 결제 연동 확인 | ⬜ 예정 | 이니시스 서브몰 결제 → Edge Functions 경유 |
| 5-8 | 통합 테스트 | ⬜ 예정 | 관리자 페이지 + 모바일 앱 동시 동작 확인 |

---

### Phase 6: 기존 서버 해지 및 정리

| 순서 | 작업 | 상태 | 비고 |
|------|------|------|------|
| 6-1 | 기존 데이터 백업 | ⬜ 예정 | MariaDB 데이터 + 서버 파일 백업 |
| 6-2 | 카페24 해지 | ⬜ 예정 | 채팅 서버 해지 (월 ₩132,000 절감) |
| 6-3 | 스마일서브 해지 | ⬜ 예정 | 메인 서버 해지 (월 ₩3,000 절감) |
| 6-4 | 도메인 DNS 전체 이전 | ⬜ 예정 | SmileServ 네임서버 → Cloudflare 이전, 기존 DNS 레코드 13개 복제 후 전환 |

---

### 프론트엔드 UI 완료 이력

| # | 단계 | 상태 | 비고 |
|---|------|------|------|
| 1 | HTML/CSS 정적 UI | ✅ 완료 | 42페이지, 14 CSS 파일 (PR #1~#27) |
| 2 | CSS 리팩터링 | ✅ 완료 | Phase 1~6 전체, 3,453줄 → 3,030줄 (PR #30~#35) |
| 3 | 문서 동기화 | ✅ 완료 | README·스펙에 리팩터링 결과 반영 (PR #36) |
| 4 | UI 일관성 통일 | ✅ 완료 | 다운로드 버튼·breadcrumb·뒤로가기 통일 (PR #37) |
| 5 | JavaScript UI 구현 | ✅ 완료 | 4파일 621줄, 인라인 JS 0건, 42페이지 0 JS에러 (PR #39~#42) |

### 백엔드 Phase 1 완료 이력

| # | 단계 | 상태 | 비고 |
|---|------|------|------|
| 1-1 | Supabase 프로젝트 생성 | ✅ 완료 | 서울 리전 |
| 1-2 | DB 스키마 설계 | ✅ 완료 | SQL 1~8 |
| 1-3 | DB 테이블 생성 | ✅ 완료 | SQL 1~8 실행 |
| 1-4 | RLS 정책 설정 | ✅ 완료 | SQL 1~8 포함 |
| 1-4+ | 컬럼명 리네이밍 | ✅ 완료 | SQL 9 |
| 1-5 | 테스트 데이터 삽입 | ✅ 완료 | SQL 10 (PR #48) |

### 백엔드 Phase 2 완료 이력

| # | 단계 | 상태 | 비고 |
|---|------|------|------|
| 2-1 | Supabase Auth 설정 | ✅ 완료 | Auth 사용자 3명, SECURITY DEFINER RLS (PR #50) |
| 2-2 | 로그인 페이지 구현 | ✅ 완료 | login.html + css/login.css (PR #50) |
| 2-3 | 세션 관리 | ✅ 완료 | JWT 자동 관리, sessionStorage 캐시 (PR #50) |
| 2-4 | 권한 체크 | ✅ 완료 | 42개 페이지 data-perm + 메뉴 숨김/페이지 차단 (PR #51) |

### 백엔드 Phase 3 완료 이력

| # | 단계 | 상태 | 비고 |
|---|------|------|------|
| 3-A | 공통 API 레이어 | ✅ 완료 | api.js 828줄 — CRUD, 포매터, 배지, 페이지네이션, 엑셀 (PR #52) |
| 3-B | 대시보드 연동 | ✅ 완료 | dashboard.js + RPC 4개 (PR #52) |
| 3-C | 회원/유치원/반려동물 | ✅ 완료 | members.js, kindergartens.js, pets.js (PR #53) |
| 3-D | 예약/결제/정산/채팅 | ✅ 완료 | reservations.js, payments.js, settlements.js, chats.js (PR #54) |
| 3-E | 후기/교육/콘텐츠/설정 | ✅ 완료 | reviews.js, educations.js, contents.js, settings.js (PR #56) |
| 3-F | 통합 테스트 & 버그 수정 | ✅ 완료 | 날짜필터·필드매핑·에러핸들링 전면 수정 19파일 (PR #57) |

---

## 10. 알려진 이슈 및 주의사항

### 10-1. 날짜 필터 하드코딩 방지

**문제 재발 패턴**: HTML `<input type="date" value="20XX-12-31">` 형태로 기본값을 하드코딩하면, 연도가 바뀔 때 데이터가 표시되지 않음.

**현재 대응**: `reservations.js`, `reviews.js`에서 `initList()` 시 end-date가 오늘보다 과거이면 자동으로 오늘 날짜로 보정하는 JS 로직 추가.

**향후 권장**: 새 페이지 추가 시 날짜 기본값을 JS에서 동적으로 설정하거나, 연말에 전체 HTML 파일의 날짜 값을 일괄 갱신할 것.

### 10-2. Supabase 쿼리 디버깅 가이드

- **RLS 정책**: 미인증 상태(anon key)로 쿼리하면 0건이 반환되지만 에러는 발생하지 않음. 반드시 로그인 후 테스트.
- **FK 조인 문법**: `payments(id, amount)` 형태로 충분. `payments!reservation_id(...)` 식의 FK 힌트는 동일 테이블에 FK가 2개 이상일 때만 필요.
- **에러 핸들링 필수**: `.catch()` 블록에 반드시 `console.error` 포함. silent catch는 디버깅을 극도로 어렵게 만듦.
- **필드명 확인**: JS 코드의 컬럼명과 실제 DB 스키마(`sql/00_schema_query.sql`)가 일치하는지 반드시 대조. Phase 1-4+에서 30개 컬럼을 리네이밍했으므로 불일치 가능성 있음.

### 10-3. api.js 주요 함수 시그니처 참고

```javascript
// 목록 조회 (서버사이드 페이지네이션)
api.fetchList(table, {
  select: '*, members:member_id(name)',  // Supabase select (조인 포함)
  filters: [{ column, op, value }],       // AND 필터 배열
  search: { column, value },              // 단일 컬럼 ilike 검색
  orFilters: ['col1.ilike.%val%,...'],     // OR 검색 문자열 배열
  orderBy: 'created_at',                  // 정렬 컬럼 (또는 order: { column, ascending })
  ascending: false,                       // 정렬 방향
  page: 1, perPage: 20                    // 페이지네이션
})

// 페이지네이션 렌더
api.renderPagination(el, currentPage, totalCount, perPage, callback)

// 배지 렌더 (STATUS_BADGE_MAP 기반 자동 색상)
api.autoBadge(text, customMap)  // customMap 우선 적용, 없으면 STATUS_BADGE_MAP, 없으면 gray
```

### 10-4. 현재 미검증 항목 (Phase 4 이전 확인 권장)

| 항목 | 설명 | 우선순위 |
|------|------|----------|
| 실제 데이터 환경 테스트 | 테스트 데이터 8~10건 환경에서만 검증됨. 수백 건 이상의 페이지네이션 동작 미확인 | 중 |
| 조인 테이블 검색 | ✅ 해결됨 — `search_reservations` RPC (PR #70) + `search_payments` RPC (PR #79)로 통합 검색 구현 | - |
| autoBadge 커스텀 색상 | ✅ 해결됨 — `autoBadge(text, customMap)` 두 번째 인자 지원 추가 + `set_pet_size_class` 트리거로 DB 데이터 정정 (PR #70, #72, #76) | - |
| 동시 접속 세션 | 2명 이상 관리자가 동시 수정 시 충돌 처리 없음 | 낮 |

---

## 11. 서버 실행 방법

```bash
cd /home/user/webapp && python3 -m http.server 8080
```

> 백그라운드로 실행 중이면 `GetServiceUrl` 도구로 포트 8080의 퍼블릭 URL을 가져와서 사용자에게 공유할 것.
