# 우유펫(WOOYOOPET) 관리자 대시보드

반려동물 돌봄 플랫폼 **우유펫**의 관리자 백오피스 대시보드입니다.  
현재 HTML + CSS 정적 UI를 구현하는 단계이며, JavaScript/백엔드 연동은 이후 작업입니다.

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
| 5 | 결제관리 | — | — | ⬜ |
| 6 | 정산관리 | — | — | ⬜ |
| 7 | 채팅관리 | — | — | ⬜ |
| 8 | 후기관리 | — | — | ⬜ |
| 9 | 교육관리 | — | — | ⬜ |
| 10 | 콘텐츠관리 | — | — | ⬜ |
| 11 | 설정 | — | — | ⬜ |

---

## 프로젝트 구조

```
webapp/
├── css/
│   ├── common.css          # 전역 변수, 리셋, 레이아웃, 폰트
│   ├── components.css      # 공통 UI 컴포넌트 (필터바, 테이블, 배지, 페이지네이션 등)
│   ├── dashboard.css       # 대시보드 전용
│   ├── members.css         # 회원관리 전용 (현재 주석만)
│   ├── kindergartens.css   # 유치원관리 전용 (현재 주석만)
│   ├── pets.css            # 반려동물관리 전용 배지
│   └── reservations.css    # 돌봄예약관리 전용 배지/모달
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
├── full_spec_with_tables.md   # 전체 기능 명세서
├── HANDOVER.md                # 개발 인수인계서 (CSS 구조, 규칙, 작업 프로세스)
└── README.md
```

---

## CSS 아키텍처

```
common.css → components.css → [페이지전용].css
```

- **common.css**: CSS 변수, 리셋, 사이드바/헤더 레이아웃, Pretendard 폰트
- **components.css**: 모든 목록+상세 페이지에서 재사용하는 UI 컴포넌트
- **페이지전용 CSS**: 해당 메뉴에서만 필요한 추가 배지/스타일

자세한 CSS 구조, HTML 작성 패턴, 협의된 규칙은 `HANDOVER.md` 참조.

---

## 디자인 시스템

- **폰트**: Pretendard
- **Primary**: `#339DEE` / **Accent**: `#4294FF`
- **Success**: `#2ECC71` / **Warning**: `#F5A623` / **Danger**: `#E05A3A`
- **카드 라운딩**: 14px / **배지 라운딩**: 6px

---

## 브랜치 전략

- `main` — 머지 대상 (안정 브랜치)
- `genspark_ai_developer` — 작업 브랜치 (PR 후 main에 머지)
