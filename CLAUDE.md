# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 브랜치 전략

- 모든 작업은 `develop` 브랜치에서 진행하고 커밋/푸시한다.
- `main` 브랜치는 배포용이므로 절대 수정하지 않는다.
- `develop → main` PR은 사용자가 직접 수행한다. Claude Code는 이 PR을 생성하지 않는다.

---

## 로컬 개발 서버

빌드 도구 없음. 정적 파일 서버로 실행한다.

```bash
python3 -m http.server 8080
# http://localhost:8080/index.html
```

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| Frontend | Vanilla HTML / CSS / JavaScript (프레임워크 없음) |
| Database | Supabase (PostgreSQL) + RLS 79개 정책 |
| Auth | Supabase Auth (JWT) |
| Storage | Supabase Storage (banner-images, notice-attachments, education-images) |
| Edge Functions | Supabase Edge Functions 7개 (결제, 채팅, 예약, 돌봄, 푸시, 스케줄러) |
| 배포 | Cloudflare Pages — `main` 브랜치 push 시 자동 배포 → `admin.wooyoopet.com` |

---

## 아키텍처

### JS 파일 의존 순서

```
supabase-client.js   ← Supabase 클라이언트 초기화
  auth.js            ← 로그인/로그아웃, 세션, 권한 제어
    common.js        ← 모달, 마스킹 토글, 텍스트 펼침
      components.js  ← 탭 전환, 체크박스, URL 해시 복원
        api.js       ← CRUD 래퍼, 배지, 페이지네이션, Excel, 감사 로그
          [페이지].js ← 메뉴별 페이지 로직
```

- **인라인 JS 금지** — 모든 동작은 `data-*` 속성 + 외부 JS 파일로 처리한다.
- RPC 호출(`supabase.rpc(...)`)로 복잡한 쿼리 처리. 66개 RPC 매핑 완료.

### CSS 파일 구조

```
common.css      ← 변수, 리셋, 레이아웃, Pretendard 폰트
components.css  ← 재사용 컴포넌트 (필터, 테이블, 배지, 모달, 페이지네이션 등)
[페이지].css    ← 메뉴별 전용 스타일 (12개)
```

**7색 배지 시스템** (`components.css`): 파란색 진행중, 초록 완료, 주황 대기, 빨간 실패/거절, 회색 미완료, 갈색 보호자, 핑크 유치원.

---

## 주요 규칙 및 패턴

### HTML 패턴
- 사이드바: HTML 파일 전체(43개)에 동일하게 유지해야 한다. 메뉴 구조 변경 시 전체 동기화 필수.
- 목록 ID 표시: `id.slice(0, 8)` (앞 8자리 단축)
- 뒤로가기: `← [탭명] 목록으로` 패턴

### 데이터 마스킹
- 전화번호: `010-****-1234` + `[전체보기]` 토글 (`common.js`)
- 주민등록번호: 뒤 6자리 마스킹 (`maskSsn` 함수, `settlements.js`)
- 주소: 마스킹/해제 토글

### 권한 모델
- 11개 권한 컬럼 (`perm_members`, `perm_kindergartens` 등)
- 값: `'조회만'` / `'조회+수정'` / `'접근불가'`
- 역할: `'최고관리자'` / `'일반관리자'` / `'조회전용'`
- 접근 불가 메뉴는 사이드바에서 숨김; 직접 URL 접근 시 대시보드로 리디렉트

### Storage 파일 정리
고아 파일(업로드 후 저장 안 됨) 삭제는 `beforeunload`/`pagehide` 이벤트로 처리. 비동기라 보장되지 않음.

---

## 주요 참조 문서

| 파일 | 용도 |
|------|------|
| `HANDOVER.md` | 개발 규칙, CSS/JS 구조, SQL 마이그레이션 절차 상세 |
| `full_spec_with_tables.md` | 전체 12개 메뉴 기능 명세 |
| `MIGRATION_PLAN.md` | Phase 5 앱 백엔드 마이그레이션 설계 |
| `APP_MIGRATION_GUIDE.md` | 66개 Before/After API 코드 예시 |
| `DB_MAPPING_REFERENCE.md` | MariaDB ↔ Supabase 테이블/컬럼 대조표 |

---

## 현재 단계

- Phase 1~4: 완료 (관리자 대시보드 전체 배포)
- Phase 5 Step 1~4: 완료 (RPC 66개 + Edge Functions 7개 구현·배포)
- Phase 5 Step 5: 미완료 (통합 테스트 + 레거시 서버 전환)
