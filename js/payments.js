/**
 * 우유펫 관리자 대시보드 — 결제관리 (payments.js)
 *
 * 결제내역 탭 + 환불/위약금 탭 목록 (payments.html)
 * 결제 상세 (payment-detail.html)
 * 환불/위약금 상세 (refund-detail.html)
 * 의존: api.js, auth.js, common.js
 */
(function () {
  'use strict';

  var api = window.__api;
  var auth = window.__auth;
  if (!api || !auth) return;

  var PERM_KEY = 'perm_payments';
  var PER_PAGE = 20;

  /* ══════════════════════════════════════════
     A. 목록 페이지 (payments.html)
     ══════════════════════════════════════════ */

  function isListPage() {
    return !!document.getElementById('payListBody');
  }

  /* ── A-1: 결제내역 탭 ── */
  var payDateFrom, payDateTo, payMethod, payStatus, paySearchField, paySearchInput;
  var payAmountMin, payAmountMax;
  var payBtnSearch, payBtnReset, payBtnExcel, payResultCount, payListBody, payPagination;
  var payFilterBar;
  var payPage = 1;
  var PAY_COL_COUNT = 13;

  function cachePayDom() {
    var tab = document.getElementById('tab-payment');
    if (!tab) return;
    payFilterBar = tab.querySelector('.filter-bar');
    var dates = tab.querySelectorAll('.filter-input--date');
    payDateFrom = dates[0];
    payDateTo   = dates[1];

    var selects = tab.querySelectorAll('.filter-select');
    payMethod      = selects[0]; // 결제수단
    payStatus      = selects[1]; // 결제상태
    paySearchField = selects[2]; // 검색 기준
    paySearchInput = tab.querySelector('.filter-input--search');

    var amounts = tab.querySelectorAll('.filter-input--amount');
    payAmountMin = amounts[0];
    payAmountMax = amounts[1];

    payBtnReset  = tab.querySelector('.btn-reset');
    payBtnSearch = tab.querySelector('.btn-search');
    payBtnExcel  = tab.querySelector('.btn-excel');

    payResultCount = tab.querySelector('.result-header__count strong');
    payListBody    = document.getElementById('payListBody');
    payPagination  = tab.querySelector('.pagination');
  }

  /** 조인된 객체에서 값 추출 헬퍼 */
  function jv(obj, key) { return (obj && obj[key]) ? obj[key] : ''; }

  /** RPC 파라미터 조립 */
  function buildPayRpcParams(page, perPage) {
    var params = {
      p_date_from:      (payDateFrom && payDateFrom.value) ? payDateFrom.value + 'T00:00:00' : null,
      p_date_to:        (payDateTo && payDateTo.value) ? payDateTo.value + 'T23:59:59' : null,
      p_payment_method: (payMethod && payMethod.value) ? payMethod.value : null,
      p_status:         (payStatus && payStatus.value) ? payStatus.value : null,
      p_search_type:    null,
      p_search_keyword: null,
      p_amount_min:     (payAmountMin && payAmountMin.value) ? Number(payAmountMin.value) : null,
      p_amount_max:     (payAmountMax && payAmountMax.value) ? Number(payAmountMax.value) : null,
      p_page:           page || 1,
      p_per_page:       perPage || PER_PAGE,
      p_payment_type:   '돌봄'
    };

    if (paySearchInput && paySearchInput.value.trim()) {
      params.p_search_type = paySearchField ? paySearchField.value : '보호자 닉네임';
      params.p_search_keyword = paySearchInput.value.trim();
    }

    return params;
  }

  /** RPC 결과 파싱 (문자열 방어) */
  function parsePayRpcResult(raw) {
    if (!raw) return { data: [], count: 0 };
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch (e) { return { data: [], count: 0 }; }
    }
    return raw;
  }

  function renderPayRow(r, idx, offset) {
    var no = offset + idx + 1;
    var memberNickname = jv(r.members, 'nickname');
    var memberPhone = jv(r.members, 'phone');
    var kgName = jv(r.kindergartens, 'name');
    var petName = jv(r.pets, 'name');
    var statusBadge = api.autoBadge(r.status || '', { '결제완료': 'green', '결제취소': 'red' });
    return '<tr>' +
      '<td>' + no + '</td>' +
      '<td>' + api.escapeHtml(r.id || '') + '</td>' +
      '<td>' + api.escapeHtml(r.pg_transaction_id || '') + '</td>' +
      '<td>' + api.formatDate(r.paid_at || r.created_at) + '</td>' +
      '<td>' + api.escapeHtml(memberNickname) + '</td>' +
      '<td class="masked">' + api.maskPhone(memberPhone) + '</td>' +
      '<td>' + api.escapeHtml(kgName) + '</td>' +
      '<td>' + api.escapeHtml(petName) + '</td>' +
      '<td class="text-right">' + api.formatMoney(r.amount) + '</td>' +
      '<td>' + api.escapeHtml(r.payment_method || '') + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + (r.reservation_id ? '<a href="reservation-detail.html?id=' + r.reservation_id + '" class="data-table__link">예약상세</a>' : '—') + '</td>' +
      '<td><a href="payment-detail.html?id=' + r.id + '" class="data-table__link">상세</a></td>' +
      '</tr>';
  }

  async function loadPayList(page) {
    payPage = page || 1;
    var offset = (payPage - 1) * PER_PAGE;
    api.showTableLoading(payListBody, PAY_COL_COUNT);

    try {
      var rpcResult = await window.__supabase.rpc('search_payments', buildPayRpcParams(payPage));

      if (rpcResult.error) {
        console.error('[payments] RPC error:', rpcResult.error);
        api.showTableEmpty(payListBody, PAY_COL_COUNT, '데이터 로드 실패: ' + (rpcResult.error.message || JSON.stringify(rpcResult.error)));
        return;
      }

      var result = parsePayRpcResult(rpcResult.data);
      var rows = result.data || [];
      var total = result.count || 0;

      if (payResultCount) payResultCount.textContent = api.formatNumber(total);

      if (rows.length === 0) {
        api.showTableEmpty(payListBody, PAY_COL_COUNT, '검색 결과가 없습니다.');
        if (payPagination) payPagination.innerHTML = '';
        return;
      }

      payListBody.innerHTML = rows.map(function (r, i) { return renderPayRow(r, i, offset); }).join('');
      api.renderPagination(payPagination, payPage, total, PER_PAGE, function (p) { loadPayList(p); });
    } catch (err) {
      console.error('[payments] list exception:', err);
      api.showTableEmpty(payListBody, PAY_COL_COUNT, '데이터를 불러오지 못했습니다.');
    }
  }

  function bindPayEvents() {
    if (payBtnSearch) payBtnSearch.addEventListener('click', function () { loadPayList(1); });
    if (paySearchInput) paySearchInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') loadPayList(1); });
    if (payBtnReset) payBtnReset.addEventListener('click', function () {
      if (window.__resetFilters) window.__resetFilters(payFilterBar);
    });
    if (payBtnExcel) payBtnExcel.addEventListener('click', function () {
      var params = buildPayRpcParams(1, 10000);

      window.__supabase.rpc('search_payments', params).then(function (rpcResult) {
        if (rpcResult.error) { alert('다운로드 실패'); return; }
        var result = parsePayRpcResult(rpcResult.data);
        var rows = result.data || [];
        if (rows.length === 0) { alert('다운로드할 데이터가 없습니다.'); return; }
        api.exportExcel(rows.map(function (r) {
          return {
            '결제번호': r.id || '',
            'PG거래번호': r.pg_transaction_id || '',
            '결제일시': r.paid_at || '',
            '보호자 닉네임': jv(r.members, 'nickname'),
            '보호자 연락처': jv(r.members, 'phone'),
            '유치원명': jv(r.kindergartens, 'name'),
            '반려동물명': jv(r.pets, 'name'),
            '결제금액': r.amount || 0,
            '결제수단': r.payment_method || '',
            '결제상태': r.status || ''
          };
        }), [
          { key: '결제번호', label: '결제번호' },
          { key: 'PG거래번호', label: 'PG거래번호' },
          { key: '결제일시', label: '결제일시' },
          { key: '보호자 닉네임', label: '보호자 닉네임' },
          { key: '보호자 연락처', label: '보호자 연락처' },
          { key: '유치원명', label: '유치원명' },
          { key: '반려동물명', label: '반려동물명' },
          { key: '결제금액', label: '결제금액' },
          { key: '결제수단', label: '결제수단' },
          { key: '결제상태', label: '결제상태' }
        ], '결제내역');
      });
    });
  }

  /* ── A-2: 환불/위약금 탭 ── */
  var refDateFrom, refDateTo, refStatus, refRequester, refSearchField, refSearchInput;
  var refBtnSearch, refBtnReset, refBtnExcel, refResultCount, refListBody, refPagination;
  var refFilterBar;
  var refPage = 1;

  function cacheRefDom() {
    var tab = document.getElementById('tab-refund');
    if (!tab) return;
    refFilterBar = tab.querySelector('.filter-bar');
    var dates = tab.querySelectorAll('.filter-input--date');
    refDateFrom = dates[0];
    refDateTo   = dates[1];

    var selects = tab.querySelectorAll('.filter-select');
    refStatus      = selects[0];
    refRequester   = selects[1];
    refSearchField = selects[2];
    refSearchInput = tab.querySelector('.filter-input--search');
    refBtnReset    = tab.querySelector('.btn-reset');
    refBtnSearch   = tab.querySelector('.btn-search');
    refBtnExcel    = tab.querySelector('.btn-excel');

    refResultCount = tab.querySelector('.result-header__count strong');
    refListBody    = document.getElementById('refListBody');
    refPagination  = tab.querySelector('.pagination');
  }

  /** RPC 파라미터 조립 (search_refunds) */
  function buildRefRpcParams(page, perPage) {
    var params = {
      p_date_from:      (refDateFrom && refDateFrom.value) ? refDateFrom.value + 'T00:00:00' : null,
      p_date_to:        (refDateTo && refDateTo.value) ? refDateTo.value + 'T23:59:59' : null,
      p_status:         (refStatus && refStatus.value) ? refStatus.value : null,
      p_requester:      (refRequester && refRequester.value) ? refRequester.value : null,
      p_search_type:    null,
      p_search_keyword: null,
      p_page:           page || 1,
      p_per_page:       perPage || PER_PAGE
    };

    if (refSearchInput && refSearchInput.value.trim()) {
      params.p_search_type = refSearchField ? refSearchField.value : '보호자 닉네임';
      params.p_search_keyword = refSearchInput.value.trim();
    }

    return params;
  }

  function renderRefRow(r, idx, offset) {
    var no = offset + idx + 1;
    var memberNickname = jv(r.members, 'nickname');
    var memberPhone = jv(r.members, 'phone');
    var kgName = jv(r.kindergartens, 'name');
    var petName = jv(r.pets, 'name');
    var reqBadge = api.autoBadge(r.requester || '', { '보호자': 'brown', '유치원': 'pink', '관리자': 'red' });
    var statusBadge = api.autoBadge(r.status || '', { '환불대기': 'orange', '환불완료': 'green', '환불실패': 'red' });

    return '<tr>' +
      '<td>' + no + '</td>' +
      '<td>' + api.formatDate(r.requested_at) + '</td>' +
      '<td>' + reqBadge + '</td>' +
      '<td>' + api.escapeHtml(memberNickname) + '</td>' +
      '<td class="masked">' + api.maskPhone(memberPhone) + '</td>' +
      '<td>' + api.escapeHtml(kgName) + '</td>' +
      '<td>' + api.escapeHtml(petName) + '</td>' +
      '<td class="text-right">' + api.formatMoney(r.refund_amount) + '</td>' +
      '<td class="text-right">' + api.formatMoney(r.penalty_amount) + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + (api.formatDate(r.completed_at) || '—') + '</td>' +
      '<td>' + (r.payment_id ? '<a href="payment-detail.html?id=' + r.payment_id + '" class="data-table__link">원 결제상세</a>' : '—') + '</td>' +
      '<td><a href="refund-detail.html?id=' + r.id + '" class="data-table__link">상세</a></td>' +
      '</tr>';
  }

  var REF_COL_COUNT = 13;

  async function loadRefList(page) {
    refPage = page || 1;
    var offset = (refPage - 1) * PER_PAGE;
    api.showTableLoading(refListBody, REF_COL_COUNT);

    try {
      var rpcResult = await window.__supabase.rpc('search_refunds', buildRefRpcParams(refPage));

      if (rpcResult.error) {
        console.error('[payments] refund RPC error:', rpcResult.error);
        api.showTableEmpty(refListBody, REF_COL_COUNT, '데이터 로드 실패: ' + (rpcResult.error.message || JSON.stringify(rpcResult.error)));
        return;
      }

      var result = parsePayRpcResult(rpcResult.data);
      var rows = result.data || [];
      var total = result.count || 0;

      if (refResultCount) refResultCount.textContent = api.formatNumber(total);

      if (rows.length === 0) {
        api.showTableEmpty(refListBody, REF_COL_COUNT, '검색 결과가 없습니다.');
        if (refPagination) refPagination.innerHTML = '';
        return;
      }

      refListBody.innerHTML = rows.map(function (r, i) { return renderRefRow(r, i, offset); }).join('');
      api.renderPagination(refPagination, refPage, total, PER_PAGE, function (p) { loadRefList(p); });
    } catch (err) {
      console.error('[payments] refund list exception:', err);
      api.showTableEmpty(refListBody, REF_COL_COUNT, '데이터를 불러오지 못했습니다.');
    }
  }

  function bindRefEvents() {
    if (refBtnSearch) refBtnSearch.addEventListener('click', function () { loadRefList(1); });
    if (refSearchInput) refSearchInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') loadRefList(1); });
    if (refBtnReset) refBtnReset.addEventListener('click', function () {
      if (window.__resetFilters) window.__resetFilters(refFilterBar);
    });
    if (refBtnExcel) refBtnExcel.addEventListener('click', function () {
      var params = buildRefRpcParams(1, 10000);

      window.__supabase.rpc('search_refunds', params).then(function (rpcResult) {
        if (rpcResult.error) { alert('다운로드 실패'); return; }
        var result = parsePayRpcResult(rpcResult.data);
        var rows = result.data || [];
        if (rows.length === 0) { alert('다운로드할 데이터가 없습니다.'); return; }
        api.exportExcel(rows.map(function (r) {
          return {
            '환불요청일시': r.requested_at || '',
            '요청자': r.requester || '',
            '보호자 닉네임': jv(r.members, 'nickname'),
            '보호자 연락처': jv(r.members, 'phone'),
            '유치원명': jv(r.kindergartens, 'name'),
            '반려동물 이름': jv(r.pets, 'name'),
            '환불금액': r.refund_amount || 0,
            '위약금 결제금액': r.penalty_amount || 0,
            '처리상태': r.status || '',
            '환불완료일시': r.completed_at || '',
            '원 결제번호': r.payment_id || ''
          };
        }), [
          { key: '환불요청일시', label: '환불요청일시' },
          { key: '요청자', label: '요청자' },
          { key: '보호자 닉네임', label: '보호자 닉네임' },
          { key: '보호자 연락처', label: '보호자 연락처' },
          { key: '유치원명', label: '유치원명' },
          { key: '반려동물 이름', label: '반려동물 이름' },
          { key: '환불금액', label: '환불금액' },
          { key: '위약금 결제금액', label: '위약금 결제금액' },
          { key: '처리상태', label: '처리상태' },
          { key: '환불완료일시', label: '환불완료일시' },
          { key: '원 결제번호', label: '원 결제번호' }
        ], '환불위약금');
      });
    });
  }

  function initList() {
    cachePayDom();
    cacheRefDom();
    bindPayEvents();
    bindRefEvents();
    loadPayList(1);
    loadRefList(1);
  }

  /* ── 결제수단 매핑: DB 세부 구분 → 표시용 3개 카테고리 ── */
  function mapPaymentMethod(method) {
    if (!method) return '';
    if (method === '신용카드' || method === '체크카드' || method === '간편결제') return '카드결제';
    if (method === '계좌이체') return '계좌이체';
    if (method === '가상계좌') return '가상계좌';
    return method;
  }

  /* ══════════════════════════════════════════
     B. 결제 상세 (payment-detail.html)
     ══════════════════════════════════════════ */

  function isPayDetail() {
    return !!document.getElementById('detailPayBasic');
  }

  /** 상세 페이지 에러 메시지 표시 */
  function showDetailError(msg) {
    var ids = ['detailPayBasic', 'detailPayPayer', 'detailPayReservation', 'detailPayRefund'];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = '<span style="color:var(--danger);padding:12px;">' + api.escapeHtml(msg) + '</span>';
    });
  }

  async function loadPayDetail() {
    console.log('[payments] loadPayDetail START');
    var id = api.getParam('id');
    console.log('[payments] id from URL:', id);
    if (!id) {
      console.warn('[payments] id가 URL에 없습니다. 로딩 중단.');
      showDetailError('결제 ID가 URL에 없습니다.');
      return;
    }

    try {
      // 1) payments 본 데이터 조회 (refunds 조인 제외 — PGRST201 방지)
      var paySelect = '*, members:member_id(id, name, nickname, phone), kindergartens:kindergarten_id(name), pets:pet_id(name), reservations:reservation_id(id, status, checkin_scheduled, checkout_scheduled)';
      console.log('[payments] fetching payment data...');
      var result = await api.fetchDetail('payments', id, paySelect);
      console.log('[payments] fetchDetail result:', result);

      if (result.error) {
        console.error('[payments] fetchDetail error:', result.error);
        showDetailError('데이터를 불러오지 못했습니다. (코드: ' + (result.error.code || result.error.message || 'unknown') + ')');
        return;
      }
      var r = result.data;
      if (!r) {
        console.warn('[payments] result.data is null/undefined');
        showDetailError('결제 데이터를 찾을 수 없습니다.');
        return;
      }
      console.log('[payments] payment data loaded:', r.id);

      var m = r.members || {};
      var kg = r.kindergartens || {};
      var pet = r.pets || {};
      var resv = r.reservations || {};

      // 영역 1: 결제 기본정보
      var basic = document.getElementById('detailPayBasic');
      if (basic) {
        api.setHtml(basic, [
          ['결제 고유번호', api.escapeHtml(r.id || '')],
          ['PG 거래번호', api.escapeHtml(r.pg_transaction_id || '')],
          ['승인번호', api.escapeHtml(r.approval_number || '')],
          ['결제일시', api.formatDate(r.paid_at)],
          ['결제금액', '<span class="payment-amount-highlight">' + api.formatMoney(r.amount) + '</span>'],
          ['결제수단', api.escapeHtml(mapPaymentMethod(r.payment_method))],
          ['카드사', api.escapeHtml(r.card_company || '')],
          ['카드번호', api.renderMaskedField(r.card_number || '', r.card_number || '', 'payments', r.id, 'card_number')],
          ['서브몰 ID', api.escapeHtml(r.submall_id || '')],
          ['결제상태', api.autoBadge(r.status || '', { '결제완료': 'green', '결제취소': 'red' })]
        ]);
      }

      // 영역 2: 결제자 정보
      var payer = document.getElementById('detailPayPayer');
      if (payer) {
        api.setHtml(payer, [
          ['보호자 이름', api.escapeHtml(m.name || '')],
          ['보호자 닉네임', api.escapeHtml(m.nickname || '')],
          ['보호자 연락처', api.renderMaskedField(api.maskPhone(m.phone || ''), m.phone || '', 'members', r.member_id, 'phone')],
          ['회원번호', r.member_id ? '<a href="member-detail.html?id=' + encodeURIComponent(r.member_id) + '" class="info-grid__value--link">' + api.escapeHtml(r.member_id) + '</a>' : '—']
        ]);
      }

      // 영역 3: 관련 예약 정보
      var resEl = document.getElementById('detailPayReservation');
      if (resEl) {
        api.setHtml(resEl, [
          ['예약번호', r.reservation_id ? '<a href="reservation-detail.html?id=' + encodeURIComponent(r.reservation_id) + '" class="info-grid__value--link">' + api.escapeHtml(r.reservation_id) + '</a>' : '—'],
          ['유치원명', api.escapeHtml(kg.name || '')],
          ['반려동물명', api.escapeHtml(pet.name || '')],
          ['등원 예정일시', api.formatDate(resv.checkin_scheduled)],
          ['하원 예정일시', api.formatDate(resv.checkout_scheduled)],
          ['예약 상태', api.autoBadge(resv.status || '')]
        ]);
      }

      console.log('[payments] sections 1-3 rendered. fetching refunds...');

      // 2) refunds 별도 조회 (payment_id로 직접 필터 — ambiguous embedding 완전 회피)
      var refundEl = document.getElementById('detailPayRefund');
      if (refundEl) {
        var refResult = await window.__supabase
          .from('refunds')
          .select('id, refund_amount, penalty_amount, status, requester, requested_at')
          .eq('payment_id', id)
          .limit(1);
        console.log('[payments] refund query result:', refResult);

        var ref = (refResult.data && refResult.data.length > 0) ? refResult.data[0] : null;

        if (ref) {
          refundEl.closest('.detail-card').style.display = '';
          api.setHtml(refundEl, [
            ['환불 고유번호', '<a href="refund-detail.html?id=' + encodeURIComponent(ref.id) + '" class="info-grid__value--link">' + api.escapeHtml(ref.id) + '</a>'],
            ['환불 요청자', api.autoBadge(ref.requester || '', { '보호자': 'brown', '유치원': 'pink', '관리자': 'red' })],
            ['환불 요청일시', api.formatDate(ref.requested_at)],
            ['환불 금액', '<span class="payment-amount-highlight">' + api.formatMoney(ref.refund_amount || 0) + '</span>'],
            ['위약금 결제금액', api.formatMoney(ref.penalty_amount || 0)],
            ['처리상태', api.autoBadge(ref.status || '', { '환불완료': 'green', '환불대기': 'orange', '환불실패': 'red' })]
          ]);
        } else {
          refundEl.closest('.detail-card').style.display = 'none';
        }
      }

      console.log('[payments] loadPayDetail DONE');

    } catch (err) {
      console.error('[payments] detail exception:', err);
      showDetailError('데이터를 불러오는 중 오류가 발생했습니다. (' + (err.message || err) + ')');
    }
  }

  function bindPayDetailModals() {
    var btn = document.getElementById('cancelPaymentBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        var reason = document.getElementById('cancelPaymentReason').value;
        if (!reason) return;
        var id = api.getParam('id');
        api.updateRecord('payments', id, { status: '결제취소' }).then(function () {
          api.insertAuditLog('결제취소', 'payments', id, { reason: reason });
          location.reload();
        });
      });
    }
  }

  function initPayDetail() {
    console.log('[payments] initPayDetail called');
    loadPayDetail();
    bindPayDetailModals();
    api.hideIfReadOnly(PERM_KEY);
  }

  /* ══════════════════════════════════════════
     C. 환불/위약금 상세 (refund-detail.html)
     ══════════════════════════════════════════ */

  function isRefundDetail() {
    return !!document.getElementById('detailRefBasic');
  }

  /** 환불/위약금 상세 에러 메시지 표시 */
  function showRefundDetailError(msg) {
    var ids = ['detailRefBasic', 'detailRefPenalty', 'detailRefCalc', 'detailRefProc', 'detailRefLinks'];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = '<span style="color:var(--danger);padding:12px;">' + api.escapeHtml(msg) + '</span>';
    });
  }

  async function loadRefundDetail() {
    console.log('[refund-detail] loadRefundDetail START');
    var id = api.getParam('id');
    console.log('[refund-detail] id from URL:', id);
    if (!id) {
      showRefundDetailError('환불 ID가 URL에 없습니다.');
      return;
    }

    try {
      // ── 메인 쿼리: refunds 본 데이터 (payments, penalty_payment 조인 제외 — PGRST201 방지) ──
      var refSelect = '*, members:member_id(id, nickname), kindergartens:kindergarten_id(id, name), reservations:reservation_id(id, checkin_scheduled, pets:pet_id(id, name))';
      console.log('[refund-detail] fetching refund data...');
      var result = await api.fetchDetail('refunds', id, refSelect);
      console.log('[refund-detail] fetchDetail result:', result);

      if (result.error) {
        console.error('[refund-detail] fetchDetail error:', result.error);
        showRefundDetailError('데이터를 불러오지 못했습니다. (코드: ' + (result.error.code || result.error.message || 'unknown') + ')');
        return;
      }
      var r = result.data;
      if (!r) {
        showRefundDetailError('환불 데이터를 찾을 수 없습니다.');
        return;
      }
      console.log('[refund-detail] refund data loaded:', r.id);

      var m = r.members || {};
      var kg = r.kindergartens || {};
      var resv = r.reservations || {};
      var pet = (resv && resv.pets) ? resv.pets : {};

      // ── 영역 1: 환불 기본정보 ──
      var basic = document.getElementById('detailRefBasic');
      if (basic) {
        api.setHtml(basic, [
          ['환불 고유번호', api.escapeHtml(r.id || '')],
          ['기존 예약번호', r.reservation_id ? '<a href="reservation-detail.html?id=' + encodeURIComponent(r.reservation_id) + '" class="info-grid__value--link">' + api.escapeHtml(r.reservation_id) + '</a>' : '—'],
          ['보호자 닉네임', m.id ? '<a href="member-detail.html?id=' + encodeURIComponent(m.id) + '" class="info-grid__value--link">' + api.escapeHtml(m.nickname || '') + '</a>' : api.escapeHtml(m.nickname || '—')],
          ['반려동물 이름', pet.id ? '<a href="pet-detail.html?id=' + encodeURIComponent(pet.id) + '" class="info-grid__value--link">' + api.escapeHtml(pet.name || '') + '</a>' : api.escapeHtml(pet.name || '—')],
          ['유치원명', kg.id ? '<a href="kindergarten-detail.html?id=' + encodeURIComponent(kg.id) + '" class="info-grid__value--link">' + api.escapeHtml(kg.name || '') + '</a>' : api.escapeHtml(kg.name || '—')],
          ['취소 요청일시', api.formatDate(r.requested_at)],
          ['요청자', api.autoBadge(r.requester || '', { '보호자': 'brown', '유치원': 'pink', '관리자': 'red' })],
          ['취소 사유', api.escapeHtml(r.cancel_reason || '')],
          ['처리상태', api.autoBadge(r.status || '', { '환불완료': 'green', '환불대기': 'orange', '환불실패': 'red' })],
          ['완료일시', api.formatDate(r.completed_at) || '—'],
          ['실패 사유', r.fail_reason ? api.escapeHtml(r.fail_reason) : '<span style="color:var(--text-weak);">—</span>']
        ]);
      }

      // ── 별도 쿼리 1: 위약금 결제 정보 (penalty_payment_id → payments) ──
      var penaltyEl = document.getElementById('detailRefPenalty');
      if (penaltyEl) {
        if (r.penalty_payment_id) {
          console.log('[refund-detail] fetching penalty payment:', r.penalty_payment_id);
          var ppResult = await api.fetchDetail('payments', r.penalty_payment_id, 'id, pg_transaction_id, approval_number, amount, payment_method, status, paid_at');
          console.log('[refund-detail] penalty payment result:', ppResult);
          var pp = ppResult.data;
          if (pp) {
            penaltyEl.closest('.detail-card').style.display = '';
            api.setHtml(penaltyEl, [
              ['위약금 결제번호', api.escapeHtml(pp.id || '')],
              ['PG 거래번호', api.escapeHtml(pp.pg_transaction_id || '')],
              ['승인번호', api.escapeHtml(pp.approval_number || '')],
              ['위약금 금액', '<span class="payment-amount-highlight">' + api.formatMoney(pp.amount) + '</span>'],
              ['결제수단', api.escapeHtml(mapPaymentMethod(pp.payment_method))],
              ['결제일시', api.formatDate(pp.paid_at)],
              ['결제상태', api.autoBadge(pp.status || '', { '결제완료': 'green', '결제취소': 'red' })]
            ]);
          } else {
            penaltyEl.closest('.detail-card').style.display = 'none';
          }
        } else {
          penaltyEl.closest('.detail-card').style.display = 'none';
        }
      }

      // ── 영역 3: 위약금 산정 (순서 변경: 환불금액 → 등원예정 → 취소요청 → 남은시간 → 규정 → 비율 → 금액) ──
      var calc = document.getElementById('detailRefCalc');
      if (calc) {
        calc.innerHTML =
          '<div class="info-grid info-grid--wide">' +
          '<div class="info-grid__label">환불(기존 결제 취소) 금액</div><div class="info-grid__value"><span class="payment-amount-highlight">' + api.formatMoney(r.refund_amount || 0) + '</span></div>' +
          '<div class="info-grid__label">등원 예정일시</div><div class="info-grid__value">' + api.formatDate(resv.checkin_scheduled || '') + '</div>' +
          '<div class="info-grid__label">취소 요청일시</div><div class="info-grid__value">' + api.formatDate(r.requested_at) + '</div>' +
          '<div class="info-grid__label">등원까지 남은시간</div><div class="info-grid__value" style="font-weight:700;">' + (r.hours_before_checkin != null ? r.hours_before_checkin + '시간' : '—') + '</div>' +
          '<div class="info-grid__label">위약금 적용 규정</div><div class="info-grid__value">' + api.escapeHtml(r.applied_rule || '—') + '</div>' +
          '<div class="info-grid__label">위약금 비율</div><div class="info-grid__value"><span class="refund-penalty-rate--highlighted">' + (r.penalty_rate || 0) + '%</span></div>' +
          '<div class="info-grid__label">위약금 금액</div><div class="info-grid__value"><span class="refund-penalty-rate--highlighted">' + api.formatMoney(r.penalty_amount || 0) + '</span></div>' +
          '</div>';
      }

      // ── 영역 4: 환불 처리 정보 ──
      var proc = document.getElementById('detailRefProc');
      if (proc) {
        api.setHtml(proc, [
          ['PG 환불 거래번호', api.escapeHtml(r.pg_refund_tx_id || '')],
          ['환불 수단', api.escapeHtml(r.refund_method || '')],
          ['환불 처리상태', api.autoBadge(r.status || '')],
          ['환불 완료일시', api.formatDate(r.completed_at) || '—'],
          ['환불 실패 사유', r.fail_reason ? api.escapeHtml(r.fail_reason) : '<span style="color:var(--text-weak);">—</span>']
        ]);
      }

      // ── 영역 5: 관련 링크 ──
      var links = document.getElementById('detailRefLinks');
      if (links) {
        api.setHtml(links, [
          ['원 결제번호', r.payment_id ? '<a href="payment-detail.html?id=' + encodeURIComponent(r.payment_id) + '" class="info-grid__value--link">' + api.escapeHtml(r.payment_id) + '</a>' : '—'],
          ['예약번호', r.reservation_id ? '<a href="reservation-detail.html?id=' + encodeURIComponent(r.reservation_id) + '" class="info-grid__value--link">' + api.escapeHtml(r.reservation_id) + '</a>' : '—'],
          ['정산번호', '—']
        ]);
      }

      console.log('[refund-detail] loadRefundDetail DONE');

    } catch (err) {
      console.error('[refund-detail] detail exception:', err);
      showRefundDetailError('데이터를 불러오는 중 오류가 발생했습니다. (' + (err.message || err) + ')');
    }
  }

  function bindRefundDetailModals() {
    // 직접 환불 처리
    var directBtn = document.querySelector('#directRefundModal .modal__btn--confirm-primary');
    if (directBtn) {
      directBtn.addEventListener('click', function () {
        var id = api.getParam('id');
        api.updateRecord('refunds', id, { status: '환불완료' }).then(function () {
          api.insertAuditLog('직접환불처리', 'refunds', id, {});
          location.reload();
        });
      });
    }

    // 위약금 면제
    var waiveBtn = document.getElementById('waivePenaltyBtn');
    if (waiveBtn) {
      waiveBtn.addEventListener('click', function () {
        var reason = document.getElementById('waivePenaltyReason').value;
        if (!reason) return;
        var id = api.getParam('id');
        api.updateRecord('refunds', id, { penalty_amount: 0, penalty_rate: 0 }).then(function () {
          api.insertAuditLog('위약금면제', 'refunds', id, { reason: reason });
          location.reload();
        });
      });
    }

    // 직권 취소
    var forceBtn = document.getElementById('forceCancelBtn');
    if (forceBtn) {
      forceBtn.addEventListener('click', function () {
        var reason = document.getElementById('forceCancelReason').value;
        if (!reason) return;
        var id = api.getParam('id');
        api.updateRecord('refunds', id, { status: '직권취소' }).then(function () {
          api.insertAuditLog('직권취소', 'refunds', id, { reason: reason });
          location.reload();
        });
      });
    }
  }

  function initRefundDetail() {
    console.log('[refund-detail] initRefundDetail called');
    loadRefundDetail();
    bindRefundDetailModals();
    api.hideIfReadOnly(PERM_KEY);
  }

  /* ══════════════════════════════════════════
     D. 초기화
     ══════════════════════════════════════════ */

  document.addEventListener('DOMContentLoaded', function () {
    console.log('[payments] DOMContentLoaded — isListPage:', isListPage(), 'isPayDetail:', isPayDetail(), 'isRefundDetail:', isRefundDetail());
    if (isListPage()) initList();
    else if (isPayDetail()) initPayDetail();
    else if (isRefundDetail()) initRefundDetail();
  });

})();
