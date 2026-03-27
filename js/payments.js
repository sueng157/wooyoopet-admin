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
  var payDateFrom, payDateTo, payStatus, paySearchField, paySearchInput;
  var payBtnSearch, payBtnExcel, payResultCount, payListBody, payPagination;
  var payPage = 1;

  function cachePayDom() {
    var tab = document.getElementById('tab-payment');
    if (!tab) return;
    var dates = tab.querySelectorAll('.filter-input--date');
    payDateFrom = dates[0];
    payDateTo   = dates[1];

    var selects = tab.querySelectorAll('.filter-select');
    payStatus      = selects[0];
    paySearchField = selects[1];
    paySearchInput = tab.querySelector('.filter-input--search');
    payBtnSearch   = tab.querySelector('.btn-search');
    payBtnExcel    = tab.querySelector('.btn-excel');

    payResultCount = tab.querySelector('.result-header__count strong');
    payListBody    = document.getElementById('payListBody');
    payPagination  = tab.querySelector('.pagination');
  }

  function buildPayFilters() {
    var f = [];
    if (payDateFrom && payDateFrom.value) f.push({ column: 'payment_datetime', op: 'gte', value: payDateFrom.value + 'T00:00:00' });
    if (payDateTo && payDateTo.value) f.push({ column: 'payment_datetime', op: 'lte', value: payDateTo.value + 'T23:59:59' });
    if (payStatus && payStatus.value !== '전체') f.push({ column: 'payment_status', op: 'eq', value: payStatus.value });
    return f;
  }

  function buildPaySearch() {
    if (!paySearchInput || !paySearchInput.value.trim()) return null;
    var map = { '보호자 이름': 'guardian_name', '유치원명': 'kindergarten_name', 'PG 거래번호': 'pg_transaction_id' };
    return { column: map[paySearchField ? paySearchField.value : '보호자 이름'] || 'guardian_name', value: paySearchInput.value.trim() };
  }

  function renderPayRow(r, idx, offset) {
    var no = offset + idx + 1;
    var statusBadge = api.autoBadge(r.payment_status || '', { '결제완료': 'green', '결제취소': 'red' });
    return '<tr>' +
      '<td>' + no + '</td>' +
      '<td>' + api.formatDate(r.payment_datetime) + '</td>' +
      '<td>' + api.escapeHtml(r.pg_transaction_id || '') + '</td>' +
      '<td>' + api.escapeHtml(r.approval_number || '') + '</td>' +
      '<td>' + api.escapeHtml(r.guardian_name || '') + '</td>' +
      '<td class="masked">' + api.maskPhone(r.guardian_phone || '') + '</td>' +
      '<td>' + api.escapeHtml(r.kindergarten_name || '') + '</td>' +
      '<td>' + api.escapeHtml(r.pet_name || '') + '</td>' +
      '<td class="text-right">' + api.formatMoney(r.payment_amount) + '</td>' +
      '<td>' + api.escapeHtml(r.payment_method || '') + '</td>' +
      '<td>' + api.escapeHtml(r.card_company || '') + '</td>' +
      '<td class="masked">' + api.escapeHtml(r.card_number_masked || '') + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + (r.reservation_number ? '<a href="reservation-detail.html?id=' + r.reservation_number + '" class="data-table__link">' + api.escapeHtml(r.reservation_number) + '</a>' : '—') + '</td>' +
      '<td><a href="payment-detail.html?id=' + (r.id || r.payment_number || '') + '" class="data-table__link">상세</a></td>' +
      '</tr>';
  }

  function loadPayList(page) {
    payPage = page || 1;
    var offset = (payPage - 1) * PER_PAGE;
    api.showTableLoading(payListBody, 15);

    api.fetchList('payments', {
      filters: buildPayFilters(), search: buildPaySearch(),
      order: { column: 'payment_datetime', ascending: false },
      page: payPage, perPage: PER_PAGE
    }).then(function (res) {
      var rows = res.data || [], total = res.count || 0;
      payResultCount.textContent = api.formatNumber(total);
      if (!rows.length) { api.showTableEmpty(payListBody, 15, '검색 결과가 없습니다.'); payPagination.innerHTML = ''; return; }
      payListBody.innerHTML = rows.map(function (r, i) { return renderPayRow(r, i, offset); }).join('');
      api.renderPagination(payPagination, payPage, Math.ceil(total / PER_PAGE), loadPayList);
    }).catch(function () { api.showTableEmpty(payListBody, 15, '데이터를 불러오지 못했습니다.'); });
  }

  function bindPayEvents() {
    if (payBtnSearch) payBtnSearch.addEventListener('click', function () { loadPayList(1); });
    if (paySearchInput) paySearchInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') loadPayList(1); });
    if (payBtnExcel) payBtnExcel.addEventListener('click', function () {
      api.fetchAll('payments', { filters: buildPayFilters(), search: buildPaySearch(), order: { column: 'payment_datetime', ascending: false } }).then(function (rows) {
        api.exportExcel(rows.map(function (r) {
          return { '결제번호': r.payment_number || '', '결제일시': r.payment_datetime || '', 'PG거래번호': r.pg_transaction_id || '', '보호자': r.guardian_name || '', '유치원명': r.kindergarten_name || '', '결제금액': r.payment_amount || 0, '결제수단': r.payment_method || '', '카드사': r.card_company || '', '상태': r.payment_status || '' };
        }), '결제내역');
      });
    });
  }

  /* ── A-2: 환불/위약금 탭 ── */
  var refDateFrom, refDateTo, refStatus, refRequester, refSearchField, refSearchInput;
  var refBtnSearch, refBtnExcel, refResultCount, refListBody, refPagination;
  var refPage = 1;

  function cacheRefDom() {
    var tab = document.getElementById('tab-refund');
    if (!tab) return;
    var dates = tab.querySelectorAll('.filter-input--date');
    refDateFrom = dates[0];
    refDateTo   = dates[1];

    var selects = tab.querySelectorAll('.filter-select');
    refStatus      = selects[0];
    refRequester   = selects[1];
    refSearchField = selects[2];
    refSearchInput = tab.querySelector('.filter-input--search');
    refBtnSearch   = tab.querySelector('.btn-search');
    refBtnExcel    = tab.querySelector('.btn-excel');

    refResultCount = tab.querySelector('.result-header__count strong');
    refListBody    = document.getElementById('refListBody');
    refPagination  = tab.querySelector('.pagination');
  }

  function buildRefFilters() {
    var f = [];
    if (refDateFrom && refDateFrom.value) f.push({ column: 'cancel_datetime', op: 'gte', value: refDateFrom.value + 'T00:00:00' });
    if (refDateTo && refDateTo.value) f.push({ column: 'cancel_datetime', op: 'lte', value: refDateTo.value + 'T23:59:59' });
    if (refStatus && refStatus.value !== '전체') f.push({ column: 'refund_status', op: 'eq', value: refStatus.value });
    if (refRequester && refRequester.value !== '전체') f.push({ column: 'requester', op: 'eq', value: refRequester.value });
    return f;
  }

  function buildRefSearch() {
    if (!refSearchInput || !refSearchInput.value.trim()) return null;
    var map = { '보호자 이름': 'guardian_name', '유치원명': 'kindergarten_name', '결제번호': 'payment_number' };
    return { column: map[refSearchField ? refSearchField.value : '보호자 이름'] || 'guardian_name', value: refSearchInput.value.trim() };
  }

  function renderRefRow(r, idx, offset) {
    var no = offset + idx + 1;
    var reqBadge = api.autoBadge(r.requester || '', { '보호자': 'brown', '유치원': 'pink', '관리자': 'red' });
    var statusBadge = api.autoBadge(r.refund_status || '', { '환불대기': 'orange', '환불완료': 'green', '환불실패': 'red' });
    var penaltyRate = (r.penalty_rate && r.penalty_rate > 0)
      ? '<span class="refund-penalty-rate--highlighted">' + r.penalty_rate + '%</span>'
      : (r.penalty_rate || '0') + '%';

    return '<tr>' +
      '<td>' + no + '</td>' +
      '<td>' + api.formatDate(r.cancel_datetime) + '</td>' +
      '<td>' + reqBadge + '</td>' +
      '<td>' + api.escapeHtml(r.guardian_name || '') + '</td>' +
      '<td>' + api.escapeHtml(r.kindergarten_name || '') + '</td>' +
      '<td>' + api.escapeHtml(r.pet_name || '') + '</td>' +
      '<td class="text-right">' + api.formatMoney(r.original_amount) + '</td>' +
      '<td class="text-right">' + api.formatMoney(r.refund_amount) + '</td>' +
      '<td>' + (r.refund_rate || 100) + '%</td>' +
      '<td class="text-right">' + api.formatMoney(r.penalty_amount) + '</td>' +
      '<td>' + penaltyRate + '</td>' +
      '<td>' + (r.remaining_hours || '—') + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + (api.formatDate(r.completed_at) || '—') + '</td>' +
      '<td>' + (r.payment_number ? '<a href="payment-detail.html?id=' + r.payment_number + '" class="data-table__link">' + api.escapeHtml(r.payment_number) + '</a>' : '—') + '</td>' +
      '<td>' + (r.reservation_number ? '<a href="reservation-detail.html?id=' + r.reservation_number + '" class="data-table__link">' + api.escapeHtml(r.reservation_number) + '</a>' : '—') + '</td>' +
      '<td><a href="refund-detail.html?id=' + (r.id || r.refund_number || '') + '" class="data-table__link">상세</a></td>' +
      '</tr>';
  }

  function loadRefList(page) {
    refPage = page || 1;
    var offset = (refPage - 1) * PER_PAGE;
    api.showTableLoading(refListBody, 17);

    api.fetchList('refunds', {
      filters: buildRefFilters(), search: buildRefSearch(),
      order: { column: 'cancel_datetime', ascending: false },
      page: refPage, perPage: PER_PAGE
    }).then(function (res) {
      var rows = res.data || [], total = res.count || 0;
      refResultCount.textContent = api.formatNumber(total);
      if (!rows.length) { api.showTableEmpty(refListBody, 17, '검색 결과가 없습니다.'); refPagination.innerHTML = ''; return; }
      refListBody.innerHTML = rows.map(function (r, i) { return renderRefRow(r, i, offset); }).join('');
      api.renderPagination(refPagination, refPage, Math.ceil(total / PER_PAGE), loadRefList);
    }).catch(function () { api.showTableEmpty(refListBody, 17, '데이터를 불러오지 못했습니다.'); });
  }

  function bindRefEvents() {
    if (refBtnSearch) refBtnSearch.addEventListener('click', function () { loadRefList(1); });
    if (refSearchInput) refSearchInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') loadRefList(1); });
    if (refBtnExcel) refBtnExcel.addEventListener('click', function () {
      api.fetchAll('refunds', { filters: buildRefFilters(), search: buildRefSearch(), order: { column: 'cancel_datetime', ascending: false } }).then(function (rows) {
        api.exportExcel(rows.map(function (r) {
          return { '환불번호': r.refund_number || '', '취소일시': r.cancel_datetime || '', '요청자': r.requester || '', '보호자': r.guardian_name || '', '유치원명': r.kindergarten_name || '', '원결제금액': r.original_amount || 0, '환불금액': r.refund_amount || 0, '위약금': r.penalty_amount || 0, '상태': r.refund_status || '' };
        }), '환불위약금');
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

  /* ══════════════════════════════════════════
     B. 결제 상세 (payment-detail.html)
     ══════════════════════════════════════════ */

  function isPayDetail() {
    return !!document.getElementById('detailPayBasic');
  }

  function loadPayDetail() {
    var id = api.getParam('id');
    if (!id) return;
    api.showLoading(true);

    api.fetchDetail('payments', id).then(function (r) {
      if (!r) { api.showLoading(false); return; }

      // 영역 1: 결제 기본정보
      var basic = document.getElementById('detailPayBasic');
      if (basic) {
        api.setHtml(basic, [
          ['결제 고유번호', r.payment_number || r.id],
          ['PG 거래번호', api.escapeHtml(r.pg_transaction_id || '')],
          ['승인번호', api.escapeHtml(r.approval_number || '')],
          ['결제일시', api.formatDate(r.payment_datetime)],
          ['결제금액', '<span class="payment-amount-highlight">' + api.formatMoney(r.payment_amount) + '</span>'],
          ['결제수단', api.escapeHtml(r.payment_method || '')],
          ['카드사', api.escapeHtml(r.card_company || '')],
          ['카드번호', api.renderMaskedField(r.card_number, r.card_number_masked)],
          ['서브몰 ID', api.escapeHtml(r.submall_id || '')],
          ['결제상태', api.autoBadge(r.payment_status || '', { '결제완료': 'green', '결제취소': 'red' })]
        ]);
      }

      // 영역 2: 결제자 정보
      var payer = document.getElementById('detailPayPayer');
      if (payer) {
        api.setHtml(payer, [
          ['보호자 이름', api.escapeHtml(r.guardian_name || '')],
          ['보호자 닉네임', api.escapeHtml(r.guardian_nickname || '')],
          ['보호자 연락처', api.renderMaskedField(r.guardian_phone)],
          ['회원번호', r.guardian_id ? api.renderDetailLink('member-detail.html', r.guardian_id) : '—']
        ]);
      }

      // 영역 3: 관련 예약 정보
      var res = document.getElementById('detailPayReservation');
      if (res) {
        api.setHtml(res, [
          ['예약번호', r.reservation_number ? api.renderDetailLink('reservation-detail.html', r.reservation_number) : '—'],
          ['유치원명', api.escapeHtml(r.kindergarten_name || '')],
          ['반려동물명', api.escapeHtml(r.pet_name || '')],
          ['등원 예정일시', api.formatDate(r.checkin_datetime)],
          ['하원 예정일시', api.formatDate(r.checkout_datetime)],
          ['예약 상태', api.autoBadge(r.reservation_status || '')]
        ]);
      }

      // 영역 4: 환불 정보 (조건부)
      var refund = document.getElementById('detailPayRefund');
      if (refund) {
        if (r.refund_number) {
          refund.closest('.detail-card').style.display = '';
          api.setHtml(refund, [
            ['환불 고유번호', api.renderDetailLink('refund-detail.html', r.refund_number)],
            ['환불 요청자', api.autoBadge(r.refund_requester || '', { '보호자': 'brown', '유치원': 'pink', '관리자': 'red' })],
            ['환불(기존 결제 취소) 요청일시', api.formatDate(r.refund_datetime)],
            ['환불(기존 결제 취소) 금액', '<span class="payment-amount-highlight">' + api.formatMoney(r.refund_amount || 0) + '</span>'],
            ['위약금 결제금액', api.formatMoney(r.penalty_amount || 0)],
            ['처리상태', api.autoBadge(r.refund_status || '', { '환불완료': 'green', '환불대기': 'orange', '환불실패': 'red' })]
          ]);
        } else {
          refund.closest('.detail-card').style.display = 'none';
        }
      }

      api.showLoading(false);
    }).catch(function () { api.showLoading(false); });
  }

  function bindPayDetailModals() {
    var btn = document.getElementById('cancelPaymentBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        var reason = document.getElementById('cancelPaymentReason').value;
        if (!reason) return;
        var id = api.getParam('id');
        api.updateRecord('payments', id, { payment_status: '결제취소' }).then(function () {
          api.insertAuditLog('payments', id, '결제취소', reason);
          location.reload();
        });
      });
    }
  }

  function initPayDetail() {
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

  function loadRefundDetail() {
    var id = api.getParam('id');
    if (!id) return;
    api.showLoading(true);

    api.fetchDetail('refunds', id).then(function (r) {
      if (!r) { api.showLoading(false); return; }

      // 영역 1: 환불 기본정보
      var basic = document.getElementById('detailRefBasic');
      if (basic) {
        api.setHtml(basic, [
          ['환불 고유번호', r.refund_number || r.id],
          ['취소 요청일시', api.formatDate(r.cancel_datetime)],
          ['요청자', api.autoBadge(r.requester || '', { '보호자': 'brown', '유치원': 'pink', '관리자': 'red' })],
          ['취소 사유', api.escapeHtml(r.cancel_reason || '')],
          ['처리상태', api.autoBadge(r.refund_status || '', { '환불완료': 'green', '환불대기': 'orange', '환불실패': 'red' })],
          ['완료일시', api.formatDate(r.completed_at) || '—'],
          ['실패 사유', r.failure_reason ? api.escapeHtml(r.failure_reason) : '<span style="color:var(--text-weak);">—</span>']
        ]);
      }

      // 영역 2: 위약금 산정
      var calc = document.getElementById('detailRefCalc');
      if (calc) {
        calc.innerHTML =
          '<div class="info-grid info-grid--wide">' +
          '<div class="info-grid__label">등원 예정일시</div><div class="info-grid__value">' + api.formatDate(r.checkin_datetime) + '</div>' +
          '<div class="info-grid__label">취소 요청일시</div><div class="info-grid__value">' + api.formatDate(r.cancel_datetime) + '</div>' +
          '<div class="info-grid__label">등원까지 남은시간</div><div class="info-grid__value" style="font-weight:700;">' + api.escapeHtml(r.remaining_hours || '—') + '</div>' +
          '<div class="info-grid__label">위약금 적용 규정</div><div class="info-grid__value">' + api.escapeHtml(r.penalty_rule || '—') + '</div>' +
          '<div class="info-grid__label">위약금 비율</div><div class="info-grid__value"><span class="refund-penalty-rate--highlighted">' + (r.penalty_rate || 0) + '%</span></div>' +
          '<div class="info-grid__label">위약금 금액</div><div class="info-grid__value"><span class="refund-penalty-rate--highlighted">' + api.formatMoney(r.penalty_amount || 0) + '</span></div>' +
          '<div class="info-grid__label">환불(기존 결제 취소) 금액</div><div class="info-grid__value"><span class="payment-amount-highlight">' + api.formatMoney(r.refund_amount || 0) + '</span></div>' +
          '</div>';
      }

      // 영역 3: 환불 처리 정보
      var proc = document.getElementById('detailRefProc');
      if (proc) {
        api.setHtml(proc, [
          ['PG 환불 거래번호', api.escapeHtml(r.pg_refund_id || '')],
          ['환불 수단', api.escapeHtml(r.refund_method || '')],
          ['환불 처리상태', api.autoBadge(r.refund_status || '')],
          ['환불 완료일시', api.formatDate(r.completed_at) || '—'],
          ['환불 실패 사유', r.failure_reason ? api.escapeHtml(r.failure_reason) : '<span style="color:var(--text-weak);">—</span>']
        ]);
      }

      // 영역 4: 위약금 결제 정보 (조건부)
      var penalty = document.getElementById('detailRefPenalty');
      if (penalty) {
        if (r.penalty_amount > 0) {
          penalty.closest('.detail-card').style.display = '';
          api.setHtml(penalty, [
            ['위약금 거래번호', api.escapeHtml(r.penalty_transaction_id || '')],
            ['위약금 금액', api.formatMoney(r.penalty_amount)],
            ['위약금 결제수단', api.escapeHtml(r.penalty_payment_method || '')],
            ['위약금 결제상태', api.autoBadge(r.penalty_payment_status || '', { '결제완료': 'green' })],
            ['유치원 입금 여부', api.autoBadge(r.penalty_settled || '', { '정산완료': 'green', '미정산': 'orange' })]
          ]);
        } else {
          penalty.closest('.detail-card').style.display = 'none';
        }
      }

      // 영역 5: 관련 링크
      var links = document.getElementById('detailRefLinks');
      if (links) {
        api.setHtml(links, [
          ['원 결제번호', r.payment_number ? api.renderDetailLink('payment-detail.html', r.payment_number) : '—'],
          ['예약번호', r.reservation_number ? api.renderDetailLink('reservation-detail.html', r.reservation_number) : '—'],
          ['정산번호', r.settlement_number ? api.renderDetailLink('settlement-detail.html', r.settlement_number) : '—']
        ]);
      }

      api.showLoading(false);
    }).catch(function () { api.showLoading(false); });
  }

  function bindRefundDetailModals() {
    // 직접 환불 처리
    var directBtn = document.querySelector('#directRefundModal .modal__btn--confirm-primary');
    if (directBtn) {
      directBtn.addEventListener('click', function () {
        var id = api.getParam('id');
        api.updateRecord('refunds', id, { refund_status: '환불완료' }).then(function () {
          api.insertAuditLog('refunds', id, '직접 환불 처리', '관리자 직접 환불');
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
          api.insertAuditLog('refunds', id, '위약금 면제', reason);
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
        api.updateRecord('refunds', id, { refund_status: '직권취소' }).then(function () {
          api.insertAuditLog('refunds', id, '직권 취소', reason);
          location.reload();
        });
      });
    }
  }

  function initRefundDetail() {
    loadRefundDetail();
    bindRefundDetailModals();
    api.hideIfReadOnly(PERM_KEY);
  }

  /* ══════════════════════════════════════════
     D. 초기화
     ══════════════════════════════════════════ */

  document.addEventListener('DOMContentLoaded', function () {
    if (isListPage()) initList();
    else if (isPayDetail()) initPayDetail();
    else if (isRefundDetail()) initRefundDetail();
  });

})();
