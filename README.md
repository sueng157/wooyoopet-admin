# 우유펫(WOOYOOPET) 관리자 대시보드

반려동물 돌봄 플랫폼 **우유펫**의 관리자 백오피스 대시보드입니다.  
소비자 서비스는 React Native 모바일 앱(프론트엔드)으로 별도 운영되며, 이 저장소는 **관리자용 백엔드 관리 도구**입니다. Supabase DB를 공유하며, 모바일 앱과의 연동은 Phase 5에서 진행 예정입니다.  
**백엔드 구축 Phase 1~3 완료** (DB 스키마·인증·API 연결), **DB 연결 보완 및 UI 개선 완료** (PR #59~#112). 설정·대시보드는 모바일앱 백엔드 연결 후 후속진행 예정.  
총 **HTML 43개**, **CSS 15개** (common + components + 메뉴별 12개 + login), **JS 17개** (공통 5개 + 페이지전용 12개, 총 13,068줄).  
**CSS 리팩터링 Phase 1~6 전체 완료** — 7색 배지 시스템, 공통 컴포넌트 통합, 색상 변수 체계 확립 (총 3,430줄).  
**UI 일관성 통일 완료** — 다운로드 버튼·테이블 링크/헤더 "상세" 통일, 상세 페이지 breadcrumb(`대메뉴 › 탭 › 상세`) + 뒤로가기(`← 탭이름 목록으로`) 전면 통일 (PR #37).  
**JavaScript UI 구현 완료** — 인라인 JS 전면 제거, 외부 JS + `data-*` 속성 방식으로 전환. 모달 시스템(57개), 마스킹 토글(17개), 탭 전환(18탭), 체크박스·정렬·검증·카운터, 교육관리 동적 항목, 설정 규칙 추가/삭제. 42페이지 JS 에러 0건 (PR #39~#42).

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
| 10 | 콘텐츠관리 | `contents.html` | `content-banner-detail.html`, `content-banner-create.html`, `content-notice-detail.html`, `content-notice-create.html`, `content-faq-detail.html`, `content-faq-create.html`, `content-terms-detail.html`, `content-terms-create.html`, `content-terms-version-create.html` | ✅ |
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
│   ├── settings.css        # 설정 전용 폼/인풋/셀렉트
│   └── login.css           # 로그인 전용
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
├── content-terms-version-create.html
├── settings.html
├── setting-admin-detail.html
├── setting-admin-create.html
├── setting-feedback-detail.html
├── login.html
├── js/
│   ├── supabase-client.js   # Supabase 클라이언트 초기화
│   ├── auth.js              # 인증·세션·권한 관리
│   ├── common.js            # 모달 시스템, 마스킹 토글, 소개글 토글, textarea→버튼 활성화
│   ├── components.js        # 탭 전환, 전체선택 체크박스, 순서 화살표, 버전 검증, 글자수 카운터
│   ├── api.js               # Supabase CRUD 래퍼, 포매터, 배지, 페이지네이션, 엑셀
│   ├── dashboard.js         # 대시보드 전용
│   ├── members.js           # 회원관리 전용
│   ├── kindergartens.js     # 유치원관리 전용
│   ├── pets.js              # 반려동물관리 전용
│   ├── reservations.js      # 돌봄예약관리 전용
│   ├── payments.js          # 결제관리 전용
│   ├── settlements.js       # 정산관리 전용
│   ├── chats.js             # 채팅관리 전용
│   ├── reviews.js           # 후기관리 전용
│   ├── educations.js        # 교육관리 전용
│   ├── contents.js          # 콘텐츠관리 전용
│   └── settings.js          # 설정 전용
├── full_spec_with_tables.md   # 전체 기능 명세서
├── CSS_REFACTORING_PLAN.md    # CSS 리팩터링 계획서 (Phase 1~6 전체 완료)
├── HANDOVER.md                # 개발 인수인계서 (CSS/JS 구조, 규칙, 작업 프로세스)
├── TECH_DECISION.md           # 기술 의사결정 문서 (Phase 1~6 로드맵)
├── sql/                       # SQL 스크립트 (스키마 조회, 테스트 데이터, Auth 설정)
└── README.md
```

---

## CSS 아키텍처

```
common.css → components.css → [페이지전용].css
```

- **common.css** (399줄): CSS 변수(:root), 리셋, 사이드바/헤더 레이아웃, Pretendard 폰트
- **components.css** (1,352줄): 모든 목록+상세 페이지에서 재사용하는 UI 컴포넌트 (필터바, 데이터테이블, 7색 배지, 모달, 폼 form-*, 페이지네이션, 상세카드, 통계카드, order-arrows, 서류확인 모달 등)
- **페이지전용 CSS** (12개 + login.css): 해당 메뉴에서만 필요한 추가 스타일

총 **3,527줄**. 자세한 CSS 구조, HTML 작성 패턴, 협의된 규칙은 `HANDOVER.md` 참조.

---

## JavaScript 아키텍처

```
supabase-js CDN → supabase-client.js → auth.js → common.js → components.js → api.js → [페이지전용].js
```

- **supabase-client.js** (20줄): Supabase CDN 클라이언트 초기화
- **auth.js** (365줄): 로그인/로그아웃, 세션 체크, 사이드바·헤더 프로필, 메뉴 접근 권한 제어
- **common.js** (141줄): 모달 시스템(열기/닫기/ESC/오버레이), 마스킹 토글, 소개글 더보기/접기, textarea→버튼 활성화
- **components.js** (231줄): 탭 전환(`data-tab-target`), 전체선택 체크박스, 순서 화살표(▲/▼), 버전 검증(`x.x.x`), 글자수 카운터, URL 해시 탭 복원
- **api.js** (842줄): Supabase CRUD 래퍼, 포매터, 배지, 페이지네이션, 엑셀, 감사로그, 마스킹, 권한
- **페이지전용 JS** (12개): dashboard(244), members(818), kindergartens(1,006), pets(516), reservations(523), payments(725), settlements(821), chats(974), reviews(679), educations(2,151), contents(2,482), settings(504)

총 **13,068줄** (17 JS 파일). 인라인 JS 0건 — 모든 인터랙션은 외부 JS + `data-*` 속성으로 처리.

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

---

## 현재 진행 상황 및 다음 단계

### 완료된 작업
1. **HTML/CSS 정적 UI** — 42페이지, 15 CSS (PR #1~#27)
2. **CSS 리팩터링** — Phase 1~6 완료 (PR #30~#35)
3. **문서 동기화** — README·스펙 리팩터링 결과 반영 (PR #36)
4. **UI 일관성 통일** — 다운로드 버튼·breadcrumb·뒤로가기 통일 (PR #37)
5. **JavaScript UI 인터랙션** — 4개 JS 파일, 621줄, 인라인 JS 0건 (PR #39~#42)
6. **백엔드 구축 Phase 1~3** — DB 스키마·인증·API 연결, 17 JS 8,364줄 (PR #48~#57)

### 완료
7. **DB 연결 보완 및 UI 개선** — 전체 페이지 DB 연결 오류 수정 + UI 개선 (PR #59~#112)
   - ✅ 회원관리~콘텐츠관리: 작업 완료
   - ⬜ 설정, 대시보드: 모바일앱 백엔드 연결 후 후속진행 예정

### 다음 단계
8. **Phase 4: 호스팅 전환** — Cloudflare Pages + 커스텀 도메인
9. **Phase 5: 모바일 앱 백엔드 전환** — React Native 앱 Supabase 연동
10. **Phase 6: 기존 서버 해지** — 카페24·스마일서브 해지
