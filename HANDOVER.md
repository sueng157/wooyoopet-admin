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
| 5 | 결제관리 | ✅ 완료 | `payments.html`, `payment-detail.html`, `refund-detail.html`, `css/payments.css` | #6 |
| 6 | 정산관리 | ⬜ 미착수 | — | — |
| 7 | 채팅관리 | ⬜ 미착수 | — | — |
| 8 | 후기관리 | ⬜ 미착수 | — | — |
| 9 | 교육관리 | ⬜ 미착수 | — | — |
| 10 | 콘텐츠관리 | ⬜ 미착수 | — | — |
| 11 | 설정 | ⬜ 미착수 | — | — |

> PR #2 = CSS 리팩터링 (members.css/kindergartens.css → components.css 분리), PR #3 = CSS 구조 리팩터링

---

## 3. CSS 아키텍처 (핵심 — 반드시 준수)

### 3-1. 계층 구조

```
common.css          → 전역 변수, 리셋, 레이아웃(sidebar/main/header), 폰트
  ↓
components.css      → 재사용 UI 컴포넌트 (필터바, 테이블, 배지, 페이지네이션, 상세카드, info-grid, mini-table, 갤러리 등)
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

> **중요**: reservations는 pets.css의 예약상태 배지(badge--res-*)를 재사용하므로 pets.css를 함께 로드함

### 3-3. 페이지전용 CSS 원칙

- `components.css`에 이미 정의된 스타일은 절대 중복 작성 금지
- 페이지전용 CSS에는 **해당 메뉴에서만 쓰는 배지/스타일만** 작성
- 리팩터링 후 `members.css`와 `kindergartens.css`는 주석 6줄만 남아있음 (모두 components.css로 이전됨)

### 3-4. CSS Variables (common.css :root)

```css
--primary: #339DEE;
--accent: #4294FF;
--gradient: linear-gradient(135deg, #339DEE, #4294FF);
--success: #2ECC71;
--warning: #F5A623;
--coral: #E05A3A;
--surface-base: #f8f9fa;
--surface-card: #ffffff;
--surface-sidebar: #f3f4f5;
--text-primary: #1a1a1a;
--text-secondary: #4a5568;
--text-weak: #8C9AA5;
--radius-card: 14px;
--radius-sm: 8px;
--radius-badge: 6px;
--shadow-card: 0 2px 12px rgba(0,0,0,0.04);
--font-family: 'Pretendard', sans-serif;
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

### 4-2. 사이드바 메뉴 (전체)

현재 링크가 연결된 항목과 아직 `#`인 항목:

```html
<a href="index.html" class="sidebar__menu-item">대시보드</a>
<a href="members.html" class="sidebar__menu-item">회원관리</a>
<a href="kindergartens.html" class="sidebar__menu-item">유치원관리</a>
<a href="pets.html" class="sidebar__menu-item">반려동물관리</a>
<a href="reservations.html" class="sidebar__menu-item active">돌봄예약관리</a>
<a href="payments.html" class="sidebar__menu-item">결제관리</a>    ← 5번 연결완료
<!-- 6번부터 미연결 -->
<a href="#" class="sidebar__menu-item">정산관리</a>
<a href="#" class="sidebar__menu-item">채팅관리</a>
<a href="#" class="sidebar__menu-item">후기관리</a>
<a href="#" class="sidebar__menu-item">교육관리</a>
<a href="#" class="sidebar__menu-item">콘텐츠관리</a>
<a href="#" class="sidebar__menu-item">설정</a>
```

> **새 대메뉴 작업 시**: 해당 메뉴의 `href="#"`을 실제 파일명으로 변경 + `active` 클래스 부여, 그리고 **기존 모든 HTML 파일**의 사이드바도 동일하게 업데이트할 것.

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

> 모달 클래스: `modal__btn--delete`(빨강), `modal__btn--confirm-danger`(빨강), `modal__btn--confirm-warning`(주황)
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

### 5-2. JavaScript 관련

- **현재 JS는 최소한만 사용**: 모달 열기/닫기, textarea oninput 활성화 정도의 인라인 JS만
- `member-detail.html`과 `kindergarten-detail.html`에는 `toggleMask()` JS가 `<script>` 태그로 들어있음 (이전 작업에서 추가됨)
- `pet-detail.html`과 `reservation-detail.html`에는 해당 JS가 **없음** → 이 불일치는 **현재 상태 그대로 유지**하기로 결정됨

### 5-3. 환불 프로세스 (결제관리·돌봄예약관리 공통)

```
취소 요청 → 위약금 비율 산정(100%/50%/0%) → 위약금 > 0원이면 보호자 위약금 결제 → 기존 결제금액 전액 취소(환불)
```

- 환불 정보 항목: 취소 요청자, 취소 일시, **위약금 비율**, **위약금 결제금액**, **기존 결제 취소(환불) 금액**, 환불 처리 상태, 환불 상세 링크

### 5-4. 배지 컬러 체계

| 의미 | 색상 | 예시 클래스 |
|------|------|-----------|
| 긍정/완료/활성 | green `#2ECC71` | badge--done, badge--open, badge--neutered |
| 대기/진행중/경고 | orange `#F5A623` | badge--res-pending, badge--reviewing, badge--warning |
| 주요/정보 | blue `#339DEE` | badge--guardian, badge--res-confirmed, badge--primary |
| 부정/실패/위험 | red `#E05A3A` | badge--res-rejected, badge--res-noshow, badge--suspended |
| 비활성/해당없음 | gray `#8C9AA5` | badge--withdrawn, badge--not-neutered, badge--res-cancel-g |

### 5-5. 파일 크기 참고

```
css/common.css          397줄  (전역변수, 리셋, 레이아웃)
css/components.css      822줄  (공통 UI 컴포넌트)
css/dashboard.css       273줄  (대시보드 전용)
css/members.css           6줄  (주석만, 모두 components.css로 이전)
css/kindergartens.css     6줄  (주석만, 모두 components.css로 이전)
css/pets.css            191줄  (반려동물+예약상태 배지)
css/reservations.css    121줄  (돌봄예약 전용 배지/모달)
css/payments.css         43줄  (결제관리 전용 스타일)
```

> **components.css 업데이트**: `.tab-bar`, `.tab-bar__item`, `.tab-content` 탭바 컴포넌트 추가 (결제관리부터 사용, 정산/후기 등에서도 재사용 예정)

---

## 6. 작업 프로세스 (매 대메뉴마다 반복)

1. **UX/UI 디자인 초안**을 마크다운으로 작성 → 사용자 검토 → 수정 → OK
2. **코딩**: `css/[페이지전용].css` + `[목록].html` + `[상세].html` 생성
3. **사이드바 링크 업데이트**: 기존 전체 HTML 파일에서 해당 메뉴의 `href="#"`을 실제 파일로 변경
4. **스크린샷 확인**: Playwright로 캡처 후 시각적 확인
5. **프리뷰 링크 제공**: 사용자가 직접 확인할 수 있도록 서비스 URL 공유
6. **커밋 → PR 생성**: `genspark_ai_developer` 브랜치에서 작업, PR은 `main`으로
7. **사용자 확인 후 머지**

---

## 7. Git 워크플로우

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

---

## 8. 완료된 작업: 5. 결제관리

### 구현 내용
- **탭 구조**: `payments.html`에 탭바(결제내역 / 환불·위약금) 구현, 인라인 JS로 탭 전환
- **결제내역 탭**: 필터바(기간·상태·검색), 15칼럼 테이블 (번호~상세), 결제상태 배지 2종(결제완료/결제취소)
- **환불/위약금 탭**: 필터바(기간·처리상태·요청자·검색), 17칼럼 테이블, 요청자/처리상태 배지 재사용
- **payment-detail.html**: 4영역 (결제 기본정보, 결제자 정보, 관련 예약, 환불 정보[조건부]), 결제취소 모달 1개
- **refund-detail.html**: 5영역 (환불 기본정보, 위약금 산정, 환불 처리 정보, 위약금 결제 정보[조건부], 관련 링크), 모달 3개 (직접 환불, 위약금 면제, 직권 취소)
- **payments.css**: 탭 전환 시 활성 콘텐츠 전용 스타일, 위약금 금액 강조 등
- **components.css**: `.tab-bar` 컴포넌트 추가 (재사용 가능)

### 환불 정보 표시 구조 (결제 상세)
| 라벨 | 값 |
|------|----|
| 환불 고유번호 | 클릭 시 환불/위약금 상세로 이동 |
| 환불 요청자 | 보호자 / 유치원 |
| 환불(기존 결제 취소) 요청일시 | |
| 환불(기존 결제 취소) 금액 | |
| 위약금 결제금액 | |
| 처리상태 | 배지 |

### 위약금 산정 표시 구조 (환불 상세)
| 라벨 | 값 |
|------|----|
| 등원 예정일시 | |
| 취소 요청일시 | |
| 등원까지 남은시간 | 시간 단위 (예: 42시간 30분) |
| 위약금 적용 규정 | 예: "24~72시간 전 취소 — 50% 환불" |
| 위약금 비율 | 강조 표시 |
| 위약금 금액 | 강조 표시 |
| 환불(기존 결제 취소) 금액 | 볼드 |

---

## 9. 다음 작업: 6. 정산관리

`full_spec_with_tables.md`의 `## 6. 정산관리` 섹션 참조.

**예상 특징**:
- 탭 구조 재사용 가능 (components.css `.tab-bar`)
- 정산 목록, 정산 상세 페이지
- 정산 관련 배지 (승인/대기/실패 등)

---

## 9. 서버 실행 방법

```bash
cd /home/user/webapp && python3 -m http.server 8080
```

> 백그라운드로 실행 중이면 `GetServiceUrl` 도구로 포트 8080의 퍼블릭 URL을 가져와서 사용자에게 공유할 것.
