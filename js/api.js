/**
 * 우유펫 관리자 대시보드 — 공통 API 레이어
 *
 * 로드 순서: supabase-js CDN → supabase-client.js → auth.js → common.js → components.js → api.js → [페이지전용].js
 *
 * 기능:
 *  - Supabase CRUD 래퍼 (목록 조회, 상세 조회, 수정, 생성, 삭제, RPC)
 *  - 표시 포맷터 (날짜, 금액, 마스킹)
 *  - 배지 렌더러 (7색 시스템)
 *  - 페이지네이션 렌더러 (서버 사이드)
 *  - 엑셀 내보내기 (SheetJS)
 *  - 감사 로그 기록
 *  - 권한 체크 (조회만 / 조회+수정)
 *  - URL 파라미터 유틸리티
 */
(function () {
  'use strict';

  var sb = window.__supabase;
  if (!sb) {
    console.error('[api] Supabase 클라이언트가 초기화되지 않았습니다.');
    return;
  }

  // ──────────────────────────────────────────
  // 1. CRUD 래퍼
  // ──────────────────────────────────────────

  /**
   * 목록 조회 (필터·검색·정렬·페이지네이션)
   * @param {string} table - 테이블명
   * @param {object} options
   * @param {string} [options.select='*'] - 셀렉트 컬럼 (조인 포함 가능)
   * @param {Array} [options.filters=[]] - [{ column, op, value }] (op: 'eq','neq','like','ilike','gte','lte','in','is')
   * @param {string} [options.search] - ilike 검색 값 (%포함)
   * @param {string} [options.searchColumn] - 검색 대상 컬럼
   * @param {Array}  [options.orFilters] - or 조건 문자열 배열 (Supabase or 포맷)
   * @param {string} [options.orderBy='created_at'] - 정렬 기준
   * @param {boolean} [options.ascending=false] - 오름차순 여부
   * @param {number} [options.page=1] - 현재 페이지
   * @param {number} [options.perPage=20] - 페이지당 건수
   * @returns {Promise<{data: Array, count: number, error: object}>}
   */
  async function fetchList(table, options) {
    var opts = options || {};
    var select = opts.select || '*';
    var filters = opts.filters || [];
    // order 파라미터: string(orderBy) 또는 object({ column, ascending }) 모두 지원
    var orderBy = opts.orderBy || (opts.order && opts.order.column) || 'created_at';
    var ascending = opts.ascending !== undefined ? opts.ascending === true : !!(opts.order && opts.order.ascending);
    var page = opts.page || 1;
    var perPage = opts.perPage || 20;
    var from = (page - 1) * perPage;
    var to = from + perPage - 1;

    var query = sb.from(table).select(select, { count: 'exact' });

    // 필터 적용
    for (var i = 0; i < filters.length; i++) {
      var f = filters[i];
      if (f.value === undefined || f.value === null || f.value === '') continue;
      switch (f.op) {
        case 'eq':    query = query.eq(f.column, f.value); break;
        case 'neq':   query = query.neq(f.column, f.value); break;
        case 'like':  query = query.like(f.column, f.value); break;
        case 'ilike': query = query.ilike(f.column, f.value); break;
        case 'gte':   query = query.gte(f.column, f.value); break;
        case 'lte':   query = query.lte(f.column, f.value); break;
        case 'gt':    query = query.gt(f.column, f.value); break;
        case 'lt':    query = query.lt(f.column, f.value); break;
        case 'in':    query = query.in(f.column, f.value); break;
        case 'is':    query = query.is(f.column, f.value); break;
        default:      query = query.eq(f.column, f.value);
      }
    }

    // 단일 컬럼 검색 (search: { column, value })
    if (opts.search && opts.search.column && opts.search.value) {
      query = query.ilike(opts.search.column, '%' + opts.search.value + '%');
    }

    // OR 검색 (여러 컬럼 검색)
    if (opts.orFilters && opts.orFilters.length > 0) {
      query = query.or(opts.orFilters.join(','));
    }

    // 정렬 + 페이지네이션
    query = query.order(orderBy, { ascending: ascending }).range(from, to);

    var result = await query;
    return {
      data: result.data || [],
      count: result.count || 0,
      error: result.error
    };
  }

  /**
   * 전체 목록 조회 (엑셀 다운로드 등 — 페이지네이션 없음, 최대 10000건)
   */
  async function fetchAll(table, options) {
    var opts = options || {};
    var select = opts.select || '*';
    var filters = opts.filters || [];
    // order 파라미터: string(orderBy) 또는 object({ column, ascending }) 모두 지원
    var orderBy = opts.orderBy || (opts.order && opts.order.column) || 'created_at';
    var ascending = opts.ascending !== undefined ? opts.ascending === true : !!(opts.order && opts.order.ascending);

    var query = sb.from(table).select(select);

    for (var i = 0; i < filters.length; i++) {
      var f = filters[i];
      if (f.value === undefined || f.value === null || f.value === '') continue;
      switch (f.op) {
        case 'eq':    query = query.eq(f.column, f.value); break;
        case 'neq':   query = query.neq(f.column, f.value); break;
        case 'like':  query = query.like(f.column, f.value); break;
        case 'ilike': query = query.ilike(f.column, f.value); break;
        case 'gte':   query = query.gte(f.column, f.value); break;
        case 'lte':   query = query.lte(f.column, f.value); break;
        case 'in':    query = query.in(f.column, f.value); break;
        case 'is':    query = query.is(f.column, f.value); break;
        default:      query = query.eq(f.column, f.value);
      }
    }

    // 단일 컬럼 검색
    if (opts.search && opts.search.column && opts.search.value) {
      query = query.ilike(opts.search.column, '%' + opts.search.value + '%');
    }

    if (opts.orFilters && opts.orFilters.length > 0) {
      query = query.or(opts.orFilters.join(','));
    }

    query = query.order(orderBy, { ascending: ascending }).limit(10000);

    var result = await query;
    return { data: result.data || [], error: result.error };
  }

  /**
   * 단일 레코드 조회
   */
  async function fetchDetail(table, id, select) {
    var result = await sb.from(table).select(select || '*').eq('id', id).single();
    return { data: result.data, error: result.error };
  }

  /**
   * 레코드 수정
   */
  async function updateRecord(table, id, data) {
    var result = await sb.from(table).update(data).eq('id', id).select();
    return { data: result.data, error: result.error };
  }

  /**
   * 레코드 생성
   */
  async function insertRecord(table, data) {
    var result = await sb.from(table).insert(data).select();
    return { data: result.data, error: result.error };
  }

  /**
   * 레코드 삭제
   */
  async function deleteRecord(table, id) {
    var result = await sb.from(table).delete().eq('id', id);
    return { data: result.data, error: result.error };
  }

  /**
   * RPC 호출 (DB Function)
   */
  async function callRpc(fnName, params) {
    var result = await sb.rpc(fnName, params || {});
    return { data: result.data, error: result.error };
  }

  // ──────────────────────────────────────────
  // 2. 표시 포맷터
  // ──────────────────────────────────────────

  /**
   * 날짜 포맷 — "yyyy-mm-dd hh:mm"
   * @param {string|Date} dt
   * @param {boolean} [dateOnly=false] — true이면 시간 제외
   * @returns {string}
   */
  function formatDate(dt, dateOnly) {
    if (!dt) return '-';
    var d = new Date(dt);
    if (isNaN(d.getTime())) return '-';
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    if (dateOnly) return yyyy + '-' + mm + '-' + dd;
    var hh = String(d.getHours()).padStart(2, '0');
    var mi = String(d.getMinutes()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd + ' ' + hh + ':' + mi;
  }

  /**
   * 생년월일 → 목록용 yymmdd
   */
  function formatBirthShort(dt) {
    if (!dt) return '-';
    var d = new Date(dt);
    if (isNaN(d.getTime())) return '-';
    var yy = String(d.getFullYear()).slice(2);
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return yy + mm + dd;
  }

  /**
   * 생년월일 → 나이 (만 나이)
   */
  function calcAge(birthDate) {
    if (!birthDate) return '-';
    var birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return '-';
    var today = new Date();
    var age = today.getFullYear() - birth.getFullYear();
    var m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  }

  /**
   * 반려동물 나이 (만 나이 — "N살")
   */
  function calcPetAge(birthDate) {
    if (!birthDate) return '-';
    var birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return '-';
    var today = new Date();
    var age = today.getFullYear() - birth.getFullYear();
    var m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    if (age < 1) return '1살 미만';
    return age + '살';
  }

  /**
   * 금액 포맷 — 천단위 콤마 + "원"
   */
  function formatMoney(n, withUnit) {
    if (n === null || n === undefined) return '-';
    var num = Number(n);
    if (isNaN(num)) return '-';
    var formatted = num.toLocaleString('ko-KR');
    return withUnit !== false ? formatted + '원' : formatted;
  }

  /**
   * 금액 포맷 — 숫자만 (콤마, 단위 없음)
   */
  function formatNumber(n) {
    if (n === null || n === undefined) return '-';
    var num = Number(n);
    if (isNaN(num)) return '-';
    return num.toLocaleString('ko-KR');
  }

  /**
   * 휴대폰번호 마스킹 — "010-****-1234"
   */
  function maskPhone(phone) {
    if (!phone) return '-';
    var cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.length === 11) {
      return cleaned.slice(0, 3) + '-****-' + cleaned.slice(7);
    }
    if (cleaned.length === 10) {
      return cleaned.slice(0, 3) + '-***-' + cleaned.slice(6);
    }
    return phone; // 형식이 다르면 원본 반환
  }

  /**
   * 휴대폰번호 포맷 (전체 표시) — "010-1234-5678"
   */
  function formatPhone(phone) {
    if (!phone) return '-';
    var cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.length === 11) {
      return cleaned.slice(0, 3) + '-' + cleaned.slice(3, 7) + '-' + cleaned.slice(7);
    }
    if (cleaned.length === 10) {
      return cleaned.slice(0, 3) + '-' + cleaned.slice(3, 6) + '-' + cleaned.slice(6);
    }
    return phone;
  }

  /**
   * 계좌번호 마스킹 — 앞4자리 + *** + 뒤2자리
   */
  function maskAccount(account) {
    if (!account) return '-';
    var cleaned = account.replace(/[^0-9]/g, '');
    if (cleaned.length < 6) return account;
    return cleaned.slice(0, 4) + '***' + cleaned.slice(-2);
  }

  /**
   * 호수 마스킹 — 숫자 부분만 *로 치환, 나머지 문자(호 등)는 유지
   * 예: "301" → "***", "301호" → "***호", "B동 301호" → "B동 ***호"
   */
  function maskHo(ho) {
    if (!ho) return '-';
    return String(ho).replace(/[0-9]/g, '*');
  }

  /**
   * 돌봄일시 포맷 — "yyyy-mm-dd hh:mm ~ yyyy-mm-dd hh:mm (X일)"
   */
  function formatCareRange(checkin, checkout) {
    if (!checkin || !checkout) return '-';
    var start = new Date(checkin);
    var end = new Date(checkout);
    var days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    if (days < 1) days = 1;
    return formatDate(checkin) + ' ~ ' + formatDate(checkout) + ' (' + days + '일)';
  }

  /**
   * 오늘 날짜 문자열 (yyyy-mm-dd)
   */
  function getToday() {
    return formatDate(new Date(), true);
  }

  /**
   * 이번 달 첫째 날 (yyyy-mm-dd)
   */
  function getMonthStart() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
  }

  /**
   * 지난 달 첫째 날/마지막 날
   */
  function getLastMonthRange() {
    var d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    var start = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
    var end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    var endStr = end.getFullYear() + '-' + String(end.getMonth() + 1).padStart(2, '0') + '-' + String(end.getDate()).padStart(2, '0');
    return { start: start, end: endStr };
  }

  /**
   * 요일 한글
   */
  function getDayName(dt) {
    var days = ['일', '월', '화', '수', '목', '금', '토'];
    var d = dt ? new Date(dt) : new Date();
    return days[d.getDay()];
  }

  // ──────────────────────────────────────────
  // 3. 배지 렌더러 (7색 시스템)
  // ──────────────────────────────────────────

  /**
   * 배지 HTML 생성
   * @param {string} text - 배지 텍스트
   * @param {string} color - 색상 키워드: 'green','orange','blue','red','gray','brown','pink'
   * @returns {string} HTML 문자열
   */
  function renderBadge(text, color) {
    if (!text) return '-';
    return '<span class="badge badge--c-' + (color || 'gray') + '">' + escapeHtml(text) + '</span>';
  }

  /**
   * 상태값에 따른 자동 배지 매핑
   */
  var STATUS_BADGE_MAP = {
    // 반려동물 중성화·예방접종
    '했어요': 'green', '안 했어요': 'gray',
    // 회원 상태
    '정상': 'green', '이용정지': 'red', '탈퇴': 'gray',
    // 주소 인증 상태
    '미인증': 'gray', '심사중': 'orange', '인증완료': 'green',
    // 본인인증
    '완료': 'green', '미완료': 'gray',
    // 모드
    '보호자': 'brown', '유치원': 'pink',
    // 유치원 영업 상태
    '영업중': 'green', '방학중': 'gray',
    // 예약 상태
    '수락대기': 'orange', '예약확정': 'blue', '돌봄진행중': 'blue',
    '돌봄완료': 'green', '보호자취소': 'gray', '유치원취소': 'gray',
    '유치원거절': 'red', '노쇼': 'red', '관리자취소': 'red',
    // 결제 상태
    '결제완료': 'green', '취소완료': 'gray', '부분취소': 'orange',
    // 환불 상태
    '환불대기': 'orange', '환불완료': 'green', '환불실패': 'red',
    // 정산 상태
    '정산예정': 'blue', '정산완료': 'green', '정산보류': 'red',
    // 정산정보
    '작성중': 'gray', '제출됨': 'orange', '승인': 'green', '거절': 'red',
    // 이니시스
    '미등록': 'gray', '등록요청중': 'orange', '등록완료': 'green', '등록실패': 'red',
    // 채팅
    '활성': 'green', '비활성': 'gray',
    // 신고 처리상태
    '접수': 'orange', '처리중': 'blue', '처리완료': 'green', '기각': 'gray',
    // 교육이수
    '미시작': 'gray', '진행중': 'orange', '이수완료': 'green',
    // 콘텐츠
    '공개': 'green', '비공개': 'gray', '노출중': 'green', '예정': 'blue', '종료': 'gray',
    // 후기
    '최고예요!': 'green', '좋았어요': 'blue', '아쉬워요': 'orange',
    // 거래유형
    '돌봄결제': 'blue', '위약금': 'red',
    // 노쇼 제재
    '제재없음': 'gray', '7일 예약제한': 'orange', '1개월 예약제한': 'red',
    '영구 정지(탈퇴)': 'red', '경고(신선도하락)': 'orange',
    '영구 정지(파트너 자격 박탈)': 'red',
    // 소명
    '미소명': 'gray', '소명접수': 'orange', '소명인정': 'green', '소명거부': 'red',
    // 피드백 유형
    '의견제출': 'blue', '탈퇴사유': 'gray',
    // 관리자 역할
    '최고관리자': 'blue', '일반관리자': 'green', '조회전용': 'gray',
    // 관리자 상태
    '활성': 'green', '비활성': 'gray',
    // 위약금 결제 상태
    '미결제': 'gray', '결제실패': 'red',
    // 체크리스트/서약서 적용상태
    '현재 적용중': 'green', '미적용': 'gray',
    // 반려동물 성별
    '수컷': 'blue', '암컷': 'red',
    // 반려동물 크기
    '소형': 'green', '중형': 'orange', '대형': 'red'
  };

  /**
   * 상태값으로 자동 배지 생성
   * @param {string} text - 상태 텍스트
   * @param {object} [customMap] - 커스텀 색상 맵 (우선 적용)
   */
  function autoBadge(text, customMap) {
    if (!text) return '-';
    var color = (customMap && customMap[text]) || STATUS_BADGE_MAP[text] || 'gray';
    return renderBadge(text, color);
  }

  // ──────────────────────────────────────────
  // 4. 페이지네이션 렌더러
  // ──────────────────────────────────────────

  /**
   * 페이지네이션 HTML 생성 + 이벤트 바인딩
   * @param {HTMLElement} container - .pagination 요소
   * @param {number} currentPage - 현재 페이지 (1-based)
   * @param {number} totalCount - 전체 데이터 건수
   * @param {number} perPage - 페이지당 건수
   * @param {function} onPageChange - 페이지 변경 콜백 (pageNumber)
   */
  function renderPagination(container, currentPage, totalCount, perPage, onPageChange) {
    if (!container) return;
    var totalPages = Math.ceil(totalCount / perPage);
    if (totalPages < 1) totalPages = 1;

    var html = '';

    // 이전 버튼
    html += '<button class="pagination__btn pagination__btn--arrow"' +
            (currentPage <= 1 ? ' disabled' : ' data-page="' + (currentPage - 1) + '"') +
            '>\u25C0</button>';

    // 페이지 번호 계산 (최대 5개 표시)
    var startPage, endPage;
    if (totalPages <= 5) {
      startPage = 1;
      endPage = totalPages;
    } else {
      startPage = Math.max(1, currentPage - 2);
      endPage = Math.min(totalPages, startPage + 4);
      if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);
    }

    // 첫 페이지
    if (startPage > 1) {
      html += '<button class="pagination__btn" data-page="1">1</button>';
      if (startPage > 2) html += '<button class="pagination__btn" disabled>...</button>';
    }

    // 페이지 번호
    for (var p = startPage; p <= endPage; p++) {
      html += '<button class="pagination__btn' + (p === currentPage ? ' active' : '') +
              '" data-page="' + p + '">' + p + '</button>';
    }

    // 마지막 페이지
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) html += '<button class="pagination__btn" disabled>...</button>';
      html += '<button class="pagination__btn" data-page="' + totalPages + '">' + totalPages + '</button>';
    }

    // 다음 버튼
    html += '<button class="pagination__btn pagination__btn--arrow"' +
            (currentPage >= totalPages ? ' disabled' : ' data-page="' + (currentPage + 1) + '"') +
            '>\u25B6</button>';

    container.innerHTML = html;

    // 이벤트 바인딩
    container.querySelectorAll('[data-page]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var page = parseInt(this.getAttribute('data-page'), 10);
        if (page && onPageChange) onPageChange(page);
      });
    });
  }

  // ──────────────────────────────────────────
  // 5. 로딩 상태
  // ──────────────────────────────────────────

  /**
   * 테이블 tbody에 로딩 메시지 표시
   */
  function showTableLoading(tbody, colSpan) {
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="' + (colSpan || 10) + '" style="text-align:center;padding:40px 0;color:var(--text-weak);">데이터를 불러오는 중입니다.</td></tr>';
  }

  /**
   * 테이블 tbody에 데이터 없음 메시지 표시
   */
  function showTableEmpty(tbody, colSpan, message) {
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="' + (colSpan || 10) + '" style="text-align:center;padding:40px 0;color:var(--text-weak);">' + (message || '데이터가 없습니다.') + '</td></tr>';
  }

  /**
   * 요소에 로딩 텍스트 표시
   */
  function showLoading(el) {
    if (!el) return;
    el.textContent = '불러오는 중...';
  }

  // ──────────────────────────────────────────
  // 6. 엑셀 내보내기
  // ──────────────────────────────────────────

  /**
   * 엑셀 파일 다운로드 (SheetJS 사용)
   * @param {Array} rows - 데이터 배열 [{header1: value1, ...}, ...]
   * @param {Array} headers - [{ key: 'fieldName', label: '표시이름' }, ...]
   * @param {string} filename - 파일명 (확장자 제외)
   */
  function exportExcel(rows, headers, filename) {
    if (typeof XLSX === 'undefined') {
      alert('엑셀 다운로드 라이브러리가 로드되지 않았습니다.');
      return;
    }
    if (!rows || rows.length === 0) {
      alert('다운로드할 데이터가 없습니다.');
      return;
    }

    // 헤더 행 생성
    var headerRow = headers.map(function (h) { return h.label; });
    var dataRows = rows.map(function (row) {
      return headers.map(function (h) {
        var val = row[h.key];
        return val !== null && val !== undefined ? val : '';
      });
    });

    var wsData = [headerRow].concat(dataRows);
    var ws = XLSX.utils.aoa_to_sheet(wsData);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    var today = getToday();
    XLSX.writeFile(wb, (filename || 'export') + '_' + today + '.xlsx');
  }

  // ──────────────────────────────────────────
  // 7. 감사 로그
  // ──────────────────────────────────────────

  /**
   * 감사 로그 기록
   * @param {string} action - 행위 (예: '상태변경', '개인정보조회', '삭제')
   * @param {string} targetType - 대상 테이블명 (예: 'members')
   * @param {string} targetId - 대상 레코드 uuid
   * @param {object} detail - 상세 정보 JSON
   */
  async function insertAuditLog(action, targetType, targetId, detail) {
    var admin = window.__auth ? window.__auth.getAdmin() : null;
    if (!admin) return;
    try {
      await sb.from('audit_logs').insert({
        admin_id: admin.id,
        admin_name: admin.name,
        action: action,
        target_type: targetType || null,
        target_id: targetId || null,
        detail: detail || {},
        ip_address: '0.0.0.0',
        created_at: new Date().toISOString()
      });
    } catch (e) {
      console.warn('[api] 감사 로그 기록 실패:', e);
    }
  }

  // ──────────────────────────────────────────
  // 8. 권한 체크
  // ──────────────────────────────────────────

  /**
   * 현재 관리자가 해당 메뉴에 수정 권한이 있는지 확인
   * @param {string} permKey - 권한 키 (예: 'perm_members')
   * @returns {boolean}
   */
  function canEdit(permKey) {
    var admin = window.__auth ? window.__auth.getAdmin() : null;
    if (!admin) return false;
    return admin[permKey] === '조회+수정';
  }

  /**
   * 수정 권한 없으면 요소 숨기기
   * @param {string} permKey - 권한 키
   * @param {string|Array} selectors - CSS 선택자(들)
   */
  function hideIfReadOnly(permKey, selectors) {
    if (canEdit(permKey)) return;
    var sels = Array.isArray(selectors) ? selectors : [selectors];
    sels.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        el.style.display = 'none';
      });
    });
  }

  // ──────────────────────────────────────────
  // 9. URL 유틸리티
  // ──────────────────────────────────────────

  /**
   * URL 쿼리파라미터 읽기
   * @param {string} key
   * @returns {string|null}
   */
  function getParam(key) {
    var params = new URLSearchParams(window.location.search);
    return params.get(key);
  }

  /**
   * URL 쿼리파라미터 여러 개 설정 (현재 URL 기반)
   * @param {object} params - { key: value, ... }
   * @returns {string} 완성된 URL
   */
  function buildUrl(basePath, params) {
    var url = basePath;
    if (params && Object.keys(params).length > 0) {
      var qs = Object.keys(params)
        .filter(function (k) { return params[k] !== null && params[k] !== undefined && params[k] !== ''; })
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
        .join('&');
      if (qs) url += '?' + qs;
    }
    return url;
  }

  // ──────────────────────────────────────────
  // 10. HTML 유틸리티
  // ──────────────────────────────────────────

  /**
   * HTML 이스케이프
   */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * 마스킹 필드 HTML 생성 (상세 페이지용)
   * @param {string} masked - 마스킹된 값
   * @param {string} raw - 원본 값
   * @param {string} targetType - 감사로그용 대상 타입
   * @param {string} targetId - 감사로그용 대상 ID
   * @param {string} fieldName - 감사로그용 필드명
   */
  /** 주민등록번호 마스킹: 앞7자리 유지 + 뒤6자리 ****** (예: 830415-2345678 → 830415-2******) */
  function maskSsn(ssn) {
    if (!ssn || ssn.length < 8) return ssn || '';
    return ssn.substring(0, ssn.length - 6) + '******';
  }

  function renderMaskedField(masked, raw, targetType, targetId, fieldName) {
    return '<span class="masked-field">' +
           '<span class="masked-field__value" data-masked="' + escapeHtml(masked) +
           '" data-raw="' + escapeHtml(raw) + '">' + escapeHtml(masked) + '</span>' +
           '<button class="masked-field__toggle" data-audit-target="' + escapeHtml(targetType) +
           '" data-audit-id="' + escapeHtml(targetId) +
           '" data-audit-field="' + escapeHtml(fieldName) + '">전체보기</button>' +
           '</span>';
  }

  /**
   * 상세 링크 HTML 생성 (목록 테이블용)
   */
  function renderDetailLink(page, id, text, className) {
    return '<a href="' + page + '?id=' + encodeURIComponent(id) + '" class="' + (className || 'data-table__link') + '">' + (text || '상세') + '</a>';
  }

  /**
   * 요소의 텍스트 내용 안전하게 설정
   */
  function setText(el, text) {
    if (!el) return;
    el.textContent = (text !== null && text !== undefined) ? text : '-';
  }

  /**
   * 요소의 innerHTML 안전하게 설정
   */
  function setHtml(el, html) {
    if (!el) return;
    // 배열 형태 [[label, value], ...] → info-grid 라벨/값 쌍 직접 삽입
    if (Array.isArray(html)) {
      var gridHtml = '';
      for (var i = 0; i < html.length; i++) {
        var item = html[i];
        if (Array.isArray(item) && item.length >= 2) {
          gridHtml += '<span class="info-grid__label">' + item[0] + '</span>';
          gridHtml += '<span class="info-grid__value">' + (item[1] !== null && item[1] !== undefined ? item[1] : '-') + '</span>';
        }
      }
      el.innerHTML = gridHtml;
      return;
    }
    el.innerHTML = (html !== null && html !== undefined) ? html : '-';
  }

  /**
   * ID로 요소 찾아서 텍스트 설정
   */
  function setTextById(id, text) {
    setText(document.getElementById(id), text);
  }

  /**
   * ID로 요소 찾아서 innerHTML 설정
   */
  function setHtmlById(id, html) {
    setHtml(document.getElementById(id), html);
  }

  // ──────────────────────────────────────────
  // 11. 전역 노출
  // ──────────────────────────────────────────

  window.__api = {
    // CRUD
    fetchList: fetchList,
    fetchAll: fetchAll,
    fetchDetail: fetchDetail,
    updateRecord: updateRecord,
    insertRecord: insertRecord,
    deleteRecord: deleteRecord,
    callRpc: callRpc,

    // 포맷터
    formatDate: formatDate,
    formatBirthShort: formatBirthShort,
    calcAge: calcAge,
    calcPetAge: calcPetAge,
    formatMoney: formatMoney,
    formatNumber: formatNumber,
    maskPhone: maskPhone,
    formatPhone: formatPhone,
    maskAccount: maskAccount,
    maskHo: maskHo,
    formatCareRange: formatCareRange,
    getToday: getToday,
    getMonthStart: getMonthStart,
    getLastMonthRange: getLastMonthRange,
    getDayName: getDayName,

    // 배지
    renderBadge: renderBadge,
    autoBadge: autoBadge,
    STATUS_BADGE_MAP: STATUS_BADGE_MAP,

    // 페이지네이션
    renderPagination: renderPagination,

    // 로딩
    showTableLoading: showTableLoading,
    showTableEmpty: showTableEmpty,
    showLoading: showLoading,

    // 엑셀
    exportExcel: exportExcel,

    // 감사 로그
    insertAuditLog: insertAuditLog,

    // 권한
    canEdit: canEdit,
    hideIfReadOnly: hideIfReadOnly,

    // URL
    getParam: getParam,
    buildUrl: buildUrl,

    // HTML 유틸
    escapeHtml: escapeHtml,
    maskSsn: maskSsn,
    renderMaskedField: renderMaskedField,
    renderDetailLink: renderDetailLink,
    setText: setText,
    setHtml: setHtml,
    setTextById: setTextById,
    setHtmlById: setHtmlById
  };

})();
