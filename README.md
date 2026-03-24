# 우유펫(WOOYOOPET) 관리자 대시보드

반려동물 돌봄 플랫폼 **우유펫**의 관리자 백오피스 대시보드입니다.  
**전 메뉴(0~11번) HTML + CSS 정적 UI 구현이 완료**되었으며, JavaScript/백엔드 연동은 이후 작업입니다.  
총 **HTML 42개**, **CSS 14개** (common + components + 메뉴별 12개).  
**CSS 리팩터링 Phase 1~6 전체 완료** — 3,453줄 → 2,998줄 (-13.2%), 7색 배지 시스템, 공통 컴포넌트 통합, 색상 변수 체계 확립.  
**UI 일관성 통일 완료** — 다운로드 버튼·테이블 링크/헤더 "상세" 통일, 상세 페이지 breadcrumb(`대메뉴 › 탭 › 상세`) + 뒤로가기(`← 탭이름 목록으로`) 전면 통일 (PR #37).

---

## 실행 방법

```bash
cd /home/user/webapp
python3 -m http.server 8080
```

브라우저에서 `http://localhost:8080/index.html` 접속.

---

## 대메뉴 구조 (총 12개)

| # | 메뉴 | 목록 | 상세 | 상태 |
|---|------|------|------|------|
| 0 | 대시보드 | `index.html` | — | ✅ |
| 1 | 회원관리 | `members.html` | `member-detail.html` | ✅ |
| 2 | 유치원관리 | `kindergartens.html` | `kindergarten-detail.html` | ✅ |
| 3 | 반려동물관리 | `pets.html` | `pet-detail.html` | ✅ |
| 4 | 돌봄예약관리 | `reservations.html` | `reservation-detail.html` | ✅ |
| 5 | 결제관리 | `payments.html` | `payment-detail.html`, `refund-detail.html` | ✅ |
| 6 | 정산관리 | `settlements.html` | `settlement-info-detail.html`, `settlement-detail.html` | ✅ |
| 7 | 채팅관리 | `chats.html` | `chat-detail.html`, `report-detail.html` | ✅ |
| 8 | 후기관리 | `reviews.html` | `review-detail.html`, `review-kg-detail.html` | ✅ |
| 9 | 교육관리 | `educations.html` | `education-detail.html`, `education-create.html`, `education-checklist-detail.html`, `education-checklist-create.html`, `education-pledge-detail.html`, `education-pledge-create.html`, `education-status-detail.html` | ✅ |
| 10 | 콘텐츠관리 | `contents.html` | `content-banner-detail.html`, `content-banner-create.html`, `content-notice-detail.html`, `content-notice-create.html`, `content-faq-detail.html`, `content-faq-create.html`, `content-terms-detail.html`, `content-terms-create.html` | ✅ |
| 11 | 설정 | `settings.html` | `setting-admin-detail.html`, `setting-admin-create.html`, `setting-feedback-detail.html` | ✅ |

---

## 프로젝트 구조

```
webapp/
├── css/
│   ├── common.css          # 전역 변수, 리셋, 레이아웃, 폰트
│   ├── components.css      # 공통 UI 컴포넌트 (필터바, 테이블, 7색 배지, 모달 변형, 페이지네이션 등)
│   ├── dashboard.css       # 대시보드 전용
│   ├── members.css         # 회원관리 전용 (현재 주석만)
│   ├── kindergartens.css   # 유치원관리 전용 (현재 주석만)
│   ├── pets.css            # 반려동물관리 전용
│   ├── reservations.css    # 돌봄예약관리 전용
│   ├── payments.css        # 결제관리 전용
│   ├── settlements.css     # 정산관리 전용 버튼/요약
│   ├── chats.css           # 채팅관리 전용 말풍선 UI
│   ├── reviews.css         # 후기관리 전용 태그
│   ├── educations.css      # 교육관리 전용 이미지/퀴즈/토글/체크리스트/서약서
│   ├── contents.css        # 콘텐츠관리 전용 카테고리/폼/이미지 프리뷰
│   └── settings.css        # 설정 전용 폼/인풋/셀렉트
├── assets/
│   └── images/
│       └── logo.png
├── index.html
├── members.html
├── member-detail.html
├── kindergartens.html
├── kindergarten-detail.html
├── pets.html
├── pet-detail.html
├── reservations.html
├── reservation-detail.html
├── payments.html
├── payment-detail.html
├── refund-detail.html
├── settlements.html
├── settlement-info-detail.html
├── settlement-detail.html
├── chats.html
├── chat-detail.html
├── report-detail.html
├── reviews.html
├── review-detail.html
├── review-kg-detail.html
├── educations.html
├── education-detail.html
├── education-create.html
├── education-checklist-detail.html
├── education-checklist-create.html
├── education-pledge-detail.html
├── education-pledge-create.html
├── education-status-detail.html
├── contents.html
├── content-banner-detail.html
├── content-banner-create.html
├── content-notice-detail.html
├── content-notice-create.html
├── content-faq-detail.html
├── content-faq-create.html
├── content-terms-detail.html
├── content-terms-create.html
├── settings.html
├── setting-admin-detail.html
├── setting-admin-create.html
├── setting-feedback-detail.html
├── full_spec_with_tables.md   # 전체 기능 명세서
├── CSS_REFACTORING_PLAN.md    # CSS 리팩터링 계획서 (Phase 1~6 전체 완료)
├── HANDOVER.md                # 개발 인수인계서 (CSS 구조, 규칙, 작업 프로세스)
└── README.md
```

---

## CSS 아키텍처

```
common.css → components.css → [페이지전용].css
```

- **common.css** (399줄): CSS 변수(:root), 리셋, 사이드바/헤더 레이아웃, Pretendard 폰트
- **components.css** (1,238줄): 모든 목록+상세 페이지에서 재사용하는 UI 컴포넌트 (필터바, 데이터테이블, 7색 배지, 모달, 폼 form-*, 페이지네이션, 상세카드, 통계카드, order-arrows 등)
- **페이지전용 CSS** (12개): 해당 메뉴에서만 필요한 추가 스타일

총 **2,998줄** (리팩터링 전 3,453줄 대비 -13.2%). 자세한 CSS 구조, HTML 작성 패턴, 협의된 규칙은 `HANDOVER.md` 참조.

---

## 디자인 시스템

- **폰트**: Pretendard
- **Primary**: `#339DEE` / **Accent**: `#4294FF`
- **Success**: `#2ECC71` / **Warning**: `#F5A623` / **Danger**: `#E05A3A`
- **카드 라운딩**: 14px / **배지 라운딩**: 20px (`--radius-badge`)

### 7색 배지 시스템

| 색상 | 코드 | CSS 클래스 | 용도 |
|------|------|-----------|------|
| blue | `#339DEE` | `badge--c-blue` | 주요, 정보, 진행중 |
| green | `#2ECC71` | `badge--c-green` | 완료, 정상, 활성, 승인 |
| orange | `#F5A623` | `badge--c-orange` | 대기, 경고, 심사중 |
| red | `#E05A3A` | `badge--c-red` | 실패, 거절, 위험, 정지 |
| gray | `#8C9AA5` | `badge--c-gray` | 비활성, 미완료, 해당없음 |
| brown | `#7B4F32` | `badge--c-brown` | 보호자 역할 |
| pink | `#FF4F81` | `badge--c-pink` | 유치원 역할 |

> 모바일 앱 실제 컬러 반영: 메인(`#339DEE`), 보호자(`#7B4F32`), 유치원(`#FF4F81`)

---

## 브랜치 전략

- `main` — 머지 대상 (안정 브랜치)
- `genspark_ai_developer` — 작업 브랜치 (PR 후 main에 머지)
