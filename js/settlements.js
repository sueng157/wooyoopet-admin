/**
 * 우유펫 관리자 대시보드 — 정산관리 (settlements.js)
 *
 * 정산정보 탭 + 정산내역 탭 목록 (settlements.html)
 * 정산정보 상세 (settlement-info-detail.html)
 * 정산내역 상세 (settlement-detail.html)
 * 의존: api.js, auth.js, common.js
 */
(function () {
  'use strict';

  var api = window.__api;
  var auth = window.__auth;
  if (!api || !auth) return;

  var PERM_KEY = 'perm_settlements';
  var PER_PAGE = 20;

  /* ══════════════════════════════════════════
     A. 목록 페이지 (settlements.html)
     ══════════════════════════════════════════ */

  function isListPage() {
    return !!document.getElementById('stlInfoBody');
  }

  /* ── A-1: 정산정보 탭 ── */
  var infoDateFrom, infoDateTo, infoStatus, infoSearchField, infoSearchInput;
  var infoBtnSearch, infoBtnExcel, infoResultCount, infoBody, infoPagination;
  var infoPage = 1;

  function cacheInfoDom() {
    var tab = document.getElementById('tab-info');
    if (!tab) return;
    var dates = tab.querySelectorAll('.filter-input');
    infoDateFrom = dates[0];
    infoDateTo   = dates[1];

    var selects = tab.querySelectorAll('.filter-select');
    infoStatus      = selects[0];
    infoSearchField = selects[1];
    infoSearchInput = tab.querySelectorAll('.filter-input')[2];
    infoBtnSearch   = tab.querySelector('.btn-search');
    infoBtnExcel    = tab.querySelector('.btn-excel');

    infoResultCount = tab.querySelector('.result-header__count strong');
    infoBody        = document.getElementById('stlInfoBody');
    infoPagination  = tab.querySelector('.pagination');
  }

  function buildInfoFilters() {
    var f = [];
    if (infoDateFrom && infoDateFrom.value) f.push({ column: 'applied_at', op: 'gte', value: infoDateFrom.value + 'T00:00:00' });
    if (infoDateTo && infoDateTo.value) f.push({ column: 'applied_at', op: 'lte', value: infoDateTo.value + 'T23:59:59' });
    if (infoStatus && infoStatus.value !== '전체') f.push({ column: 'inicis_status', op: 'eq', value: infoStatus.value });
    return f;
  }

  function buildInfoSearch() {
    if (!infoSearchInput || !infoSearchInput.value.trim()) return null;
    var map = { '유치원명': 'kindergarten_name', '운영자 성명': 'operator_name' };
    return { column: map[infoSearchField ? infoSearchField.value : '유치원명'] || 'kindergarten_name', value: infoSearchInput.value.trim() };
  }

  function renderInfoRow(r, idx, offset) {
    var no = offset + idx + 1;
    var bizBadge = api.autoBadge(r.business_type || '', { '사업자': 'pink', '개인': 'brown' });
    var statusBadge = api.autoBadge(r.inicis_status || '', { '완료': 'green', '요청중': 'blue', '실패': 'red', '미등록': 'gray' });
    return '<tr>' +
      '<td>' + no + '</td>' +
      '<td>' + api.escapeHtml(r.kindergarten_name || '') + '</td>' +
      '<td>' + api.escapeHtml(r.operator_name || '') + '</td>' +
      '<td>' + api.maskPhone(r.operator_phone || '') + '</td>' +
      '<td>' + bizBadge + '</td>' +
      '<td>' + api.escapeHtml(r.business_number || '—') + '</td>' +
      '<td>' + api.escapeHtml(r.seller_id || '—') + '</td>' +
      '<td>' + api.escapeHtml(r.bank_name || '—') + '</td>' +
      '<td>' + api.escapeHtml(r.account_masked || '—') + '</td>' +
      '<td>' + api.escapeHtml(r.account_holder || '—') + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + api.escapeHtml(r.failure_reason || '—') + '</td>' +
      '<td>' + (api.formatDate(r.applied_at, 'date') || '—') + '</td>' +
      '<td>' + (api.formatDate(r.processed_at, 'date') || '—') + '</td>' +
      '<td><a href="settlement-info-detail.html?id=' + (r.id || '') + '" class="data-table__link">상세</a></td>' +
      '</tr>';
  }

  function loadInfoList(page) {
    infoPage = page || 1;
    var offset = (infoPage - 1) * PER_PAGE;
    api.showTableLoading(infoBody, 15);

    api.fetchList('settlement_info', {
      filters: buildInfoFilters(), search: buildInfoSearch(),
      order: { column: 'applied_at', ascending: false },
      page: infoPage, perPage: PER_PAGE
    }).then(function (res) {
      var rows = res.data || [], total = res.count || 0;
      infoResultCount.textContent = api.formatNumber(total);
      if (!rows.length) { api.showTableEmpty(infoBody, 15, '검색 결과가 없습니다.'); infoPagination.innerHTML = ''; return; }
      infoBody.innerHTML = rows.map(function (r, i) { return renderInfoRow(r, i, offset); }).join('');
      api.renderPagination(infoPagination, infoPage, Math.ceil(total / PER_PAGE), loadInfoList);
    }).catch(function () { api.showTableEmpty(infoBody, 15, '데이터를 불러오지 못했습니다.'); });
  }

  function bindInfoEvents() {
    if (infoBtnSearch) infoBtnSearch.addEventListener('click', function () { loadInfoList(1); });
    if (infoSearchInput) infoSearchInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') loadInfoList(1); });
    if (infoBtnExcel) infoBtnExcel.addEventListener('click', function () {
      api.fetchAll('settlement_info', { filters: buildInfoFilters(), search: buildInfoSearch(), order: { column: 'applied_at', ascending: false } }).then(function (rows) {
        api.exportExcel(rows.map(function (r) {
          return { '유치원명': r.kindergarten_name || '', '운영자': r.operator_name || '', '사업자유형': r.business_type || '', '판매자ID': r.seller_id || '', '은행': r.bank_name || '', '이니시스상태': r.inicis_status || '', '신청일': r.applied_at || '' };
        }), '정산정보');
      });
    });
  }

  /* ── A-2: 정산내역 탭 ── */
  var histDateFrom, histDateTo, histStatus, histSearchField, histSearchInput;
  var histBtnSearch, histBtnExcel, histBtnBatch, histResultCount, histBody, histPagination;
  var histPage = 1;

  function cacheHistDom() {
    var tab = document.getElementById('tab-history');
    if (!tab) return;
    var dates = tab.querySelectorAll('.filter-input');
    histDateFrom = dates[0];
    histDateTo   = dates[1];

    var selects = tab.querySelectorAll('.filter-select');
    histStatus      = selects[0];
    histSearchField = selects[1];
    histSearchInput = tab.querySelectorAll('.filter-input')[2];
    histBtnSearch   = tab.querySelector('.btn-search');
    histBtnExcel    = tab.querySelector('.btn-excel');
    histBtnBatch    = tab.querySelector('.btn-batch-settle');

    histResultCount = tab.querySelector('.result-header__count strong');
    histBody        = document.getElementById('stlHistBody');
    histPagination  = tab.querySelector('.pagination');
  }

  function buildHistFilters() {
    var f = [];
    if (histDateFrom && histDateFrom.value) f.push({ column: 'settlement_date', op: 'gte', value: histDateFrom.value });
    if (histDateTo && histDateTo.value) f.push({ column: 'settlement_date', op: 'lte', value: histDateTo.value });
    if (histStatus && histStatus.value !== '전체') f.push({ column: 'settlement_status', op: 'eq', value: histStatus.value });
    return f;
  }

  function buildHistSearch() {
    if (!histSearchInput || !histSearchInput.value.trim()) return null;
    var map = { '유치원명': 'kindergarten_name', '보호자 이름': 'guardian_name' };
    return { column: map[histSearchField ? histSearchField.value : '유치원명'] || 'kindergarten_name', value: histSearchInput.value.trim() };
  }

  function renderHistRow(r, idx, offset) {
    var no = offset + idx + 1;
    var typeBadge = api.autoBadge(r.transaction_type || '', { '돌봄결제': 'blue', '위약금': 'orange' });
    var statusBadge = api.autoBadge(r.settlement_status || '', { '정산예정': 'orange', '정산완료': 'green', '정산보류': 'red' });
    return '<tr>' +
      '<td class="data-table__checkbox"><input type="checkbox" data-id="' + (r.id || '') + '"></td>' +
      '<td>' + no + '</td>' +
      '<td>' + (api.formatDate(r.settlement_date, 'date') || '—') + '</td>' +
      '<td>' + api.escapeHtml(r.kindergarten_name || '') + '</td>' +
      '<td>' + api.escapeHtml(r.operator_name || '') + '</td>' +
      '<td>' + api.escapeHtml(r.guardian_name || '') + '</td>' +
      '<td>' + (r.reservation_number ? '<a href="reservation-detail.html?id=' + r.reservation_number + '" class="data-table__link">' + api.escapeHtml(r.reservation_number) + '</a>' : '—') + '</td>' +
      '<td>' + typeBadge + '</td>' +
      '<td style="text-align:right;">' + api.formatMoney(r.payment_amount) + '</td>' +
      '<td>' + (r.fee_rate || 20) + '%</td>' +
      '<td style="text-align:right;">' + api.formatMoney(r.fee_amount) + '</td>' +
      '<td style="text-align:right;">' + api.formatMoney(r.settlement_amount) + '</td>' +
      '<td>' + api.escapeHtml(r.account_display || '') + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + (api.formatDate(r.completed_at, 'date') || '—') + '</td>' +
      '<td><a href="settlement-detail.html?id=' + (r.id || '') + '" class="data-table__link">상세</a></td>' +
      '</tr>';
  }

  function loadHistList(page) {
    histPage = page || 1;
    var offset = (histPage - 1) * PER_PAGE;
    api.showTableLoading(histBody, 16);

    api.fetchList('settlements', {
      filters: buildHistFilters(), search: buildHistSearch(),
      order: { column: 'settlement_date', ascending: false },
      page: histPage, perPage: PER_PAGE
    }).then(function (res) {
      var rows = res.data || [], total = res.count || 0;
      histResultCount.textContent = api.formatNumber(total);
      if (!rows.length) { api.showTableEmpty(histBody, 16, '검색 결과가 없습니다.'); histPagination.innerHTML = ''; return; }
      histBody.innerHTML = rows.map(function (r, i) { return renderHistRow(r, i, offset); }).join('');
      api.renderPagination(histPagination, histPage, Math.ceil(total / PER_PAGE), loadHistList);
      bindCheckAll();
    }).catch(function () { api.showTableEmpty(histBody, 16, '데이터를 불러오지 못했습니다.'); });
  }

  function bindCheckAll() {
    var tab = document.getElementById('tab-history');
    if (!tab) return;
    var allCb = tab.querySelector('thead .data-table__checkbox input');
    if (allCb) {
      allCb.addEventListener('change', function () {
        var cbs = histBody.querySelectorAll('input[type="checkbox"]');
        for (var i = 0; i < cbs.length; i++) cbs[i].checked = allCb.checked;
      });
    }
  }

  function bindHistEvents() {
    if (histBtnSearch) histBtnSearch.addEventListener('click', function () { loadHistList(1); });
    if (histSearchInput) histSearchInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') loadHistList(1); });
    if (histBtnExcel) histBtnExcel.addEventListener('click', function () {
      api.fetchAll('settlements', { filters: buildHistFilters(), search: buildHistSearch(), order: { column: 'settlement_date', ascending: false } }).then(function (rows) {
        api.exportExcel(rows.map(function (r) {
          return { '정산번호': r.settlement_number || '', '예정일': r.settlement_date || '', '유치원명': r.kindergarten_name || '', '결제금액': r.payment_amount || 0, '수수료': r.fee_amount || 0, '정산금액': r.settlement_amount || 0, '상태': r.settlement_status || '' };
        }), '정산내역');
      });
    });

    // 일괄 정산완료
    if (histBtnBatch) {
      histBtnBatch.addEventListener('click', function () {
        var cbs = histBody.querySelectorAll('input[type="checkbox"]:checked');
        if (!cbs.length) { alert('선택된 항목이 없습니다.'); return; }
        if (!confirm('선택한 ' + cbs.length + '건을 정산완료 처리하시겠습니까?')) return;
        var ids = [];
        for (var i = 0; i < cbs.length; i++) ids.push(cbs[i].getAttribute('data-id'));
        Promise.all(ids.map(function (id) {
          return api.updateRecord('settlements', id, { settlement_status: '정산완료' });
        })).then(function () {
          loadHistList(histPage);
        });
      });
    }
  }

  // 정산 요약 카드 로드
  function loadSummary() {
    api.callRpc('get_settlement_summary', {}).then(function (data) {
      if (!data) return;
      var tab = document.getElementById('tab-history');
      if (!tab) return;
      var cards = tab.querySelectorAll('.stat-card__value');
      // cards are populated from DB if available
    }).catch(function () { /* summary stays as static HTML */ });
  }

  function initList() {
    cacheInfoDom();
    cacheHistDom();
    bindInfoEvents();
    bindHistEvents();
    loadInfoList(1);
    loadHistList(1);
    loadSummary();
  }

  /* ══════════════════════════════════════════
     B. 정산정보 상세 (settlement-info-detail.html)
     ══════════════════════════════════════════ */

  function isInfoDetail() {
    return !!document.getElementById('detailStlOperator');
  }

  function loadInfoDetail() {
    var id = api.getParam('id');
    if (!id) return;
    api.showLoading(true);

    api.fetchDetail('settlement_info', id).then(function (r) {
      if (!r) { api.showLoading(false); return; }

      // 영역 1: 운영자 기본정보
      var op = document.getElementById('detailStlOperator');
      if (op) {
        api.setHtml(op, [
          ['운영자 성명', api.escapeHtml(r.operator_name || '')],
          ['생년월일', api.formatDate(r.birth_date, 'date') || '—'],
          ['주민등록번호', api.renderMaskedField(r.ssn, r.ssn_masked)],
          ['핸드폰', api.renderMaskedField(r.operator_phone)],
          ['이메일', api.escapeHtml(r.email || '')],
          ['회원번호', r.member_id ? api.renderDetailLink('member-detail.html', r.member_id) : '—']
        ]);
      }

      // 영역 2: 사업자 정보
      var biz = document.getElementById('detailStlBiz');
      if (biz) {
        api.setHtml(biz, [
          ['사업자 유형', api.autoBadge(r.business_type || '', { '사업자': 'pink', '개인': 'brown' })],
          ['사업자등록번호', api.escapeHtml(r.business_number || '—')],
          ['상호명', api.escapeHtml(r.business_name || '—')],
          ['업종·업태', api.escapeHtml(r.business_category || '—')]
        ]);
      }

      // 영역 3: 계좌 정보
      var acc = document.getElementById('detailStlAccount');
      if (acc) {
        api.setHtml(acc, [
          ['정산 은행', api.escapeHtml(r.bank_name || '—')],
          ['계좌번호', api.escapeHtml(r.account_number || '—')],
          ['예금주', api.escapeHtml(r.account_holder || '—')]
        ]);
      }

      // 영역 4: 이니시스 서브몰
      var ini = document.getElementById('detailStlInicis');
      if (ini) {
        api.setHtml(ini, [
          ['판매자 ID', api.escapeHtml(r.seller_id || '—')],
          ['서브몰 코드', api.escapeHtml(r.submall_code || '—')],
          ['등록상태', api.autoBadge(r.inicis_status || '', { '완료': 'green', '요청중': 'blue', '실패': 'red', '미등록': 'gray' })],
          ['실패 사유', r.failure_reason || '—'],
          ['등록 요청일시', api.formatDate(r.applied_at)],
          ['등록 완료일시', api.formatDate(r.processed_at) || '—']
        ]);
      }

      // 영역 5: 유치원 정보
      var kg = document.getElementById('detailStlKg');
      if (kg) {
        api.setHtml(kg, [
          ['유치원명', api.escapeHtml(r.kindergarten_name || '')],
          ['유치원번호', r.kindergarten_id ? api.renderDetailLink('kindergarten-detail.html', r.kindergarten_id) : '—'],
          ['영업상태', api.autoBadge(r.kg_status || '')]
        ]);
      }

      // 영역 6: 처리 이력
      var log = document.getElementById('detailStlLog');
      if (log && r.status_logs && r.status_logs.length > 0) {
        log.innerHTML = '<thead><tr><th>변경일시</th><th>이전 상태</th><th>변경 상태</th><th>처리 주체</th><th>비고</th></tr></thead><tbody>' +
          r.status_logs.map(function (l) {
            return '<tr>' +
              '<td>' + api.formatDate(l.changed_at) + '</td>' +
              '<td>' + (l.prev_status ? api.autoBadge(l.prev_status) : '—') + '</td>' +
              '<td>' + api.autoBadge(l.new_status) + '</td>' +
              '<td>' + api.autoBadge(l.actor || '', { '시스템': 'gray', '관리자': 'red' }) + '</td>' +
              '<td>' + api.escapeHtml(l.note || '') + '</td>' +
              '</tr>';
          }).join('') +
          '</tbody>';
      }

      api.showLoading(false);
    }).catch(function () { api.showLoading(false); });
  }

  function bindInfoDetailModals() {
    // 이니시스 재등록
    var reRegBtn = document.querySelector('#reRegisterModal .modal__btn--confirm-primary');
    if (reRegBtn) {
      reRegBtn.addEventListener('click', function () {
        var id = api.getParam('id');
        api.updateRecord('settlement_info', id, { inicis_status: '요청중' }).then(function () {
          api.insertAuditLog('settlement_info', id, '이니시스 재등록 요청', '');
          location.reload();
        });
      });
    }

    // 강제 승인
    var approveBtn = document.getElementById('approveBtn');
    if (approveBtn) {
      approveBtn.addEventListener('click', function () {
        var reason = document.getElementById('approveReason').value;
        if (!reason) return;
        var id = api.getParam('id');
        api.updateRecord('settlement_info', id, { inicis_status: '완료' }).then(function () {
          api.insertAuditLog('settlement_info', id, '관리자 강제 승인', reason);
          location.reload();
        });
      });
    }

    // 강제 거절
    var rejectBtn = document.getElementById('rejectBtn');
    if (rejectBtn) {
      rejectBtn.addEventListener('click', function () {
        var reason = document.getElementById('rejectReason').value;
        if (!reason) return;
        var id = api.getParam('id');
        api.updateRecord('settlement_info', id, { inicis_status: '실패', failure_reason: reason }).then(function () {
          api.insertAuditLog('settlement_info', id, '관리자 강제 거절', reason);
          location.reload();
        });
      });
    }
  }

  function initInfoDetail() {
    loadInfoDetail();
    bindInfoDetailModals();
    api.hideIfReadOnly(PERM_KEY);
  }

  /* ══════════════════════════════════════════
     C. 정산내역 상세 (settlement-detail.html)
     ══════════════════════════════════════════ */

  function isHistDetail() {
    return !!document.getElementById('detailStlBasic');
  }

  function loadHistDetail() {
    var id = api.getParam('id');
    if (!id) return;
    api.showLoading(true);

    api.fetchDetail('settlements', id).then(function (r) {
      if (!r) { api.showLoading(false); return; }

      // 영역 1: 정산 기본정보
      var basic = document.getElementById('detailStlBasic');
      if (basic) {
        api.setHtml(basic, [
          ['정산 고유번호', r.settlement_number || r.id],
          ['정산 예정일', api.formatDate(r.settlement_date, 'date') || '—'],
          ['정산상태', api.autoBadge(r.settlement_status || '', { '정산예정': 'orange', '정산완료': 'green', '정산보류': 'red' })],
          ['정산 완료일', api.formatDate(r.completed_at, 'date') || '—'],
          ['보류 사유', r.hold_reason || '—']
        ]);
      }

      // 영역 2: 금액 상세
      var amount = document.getElementById('detailStlAmount');
      if (amount) {
        api.setHtml(amount, [
          ['거래유형', api.autoBadge(r.transaction_type || '', { '돌봄결제': 'blue', '위약금': 'orange' })],
          ['결제금액', '<span class="payment-amount-highlight">' + api.formatMoney(r.payment_amount) + '</span>'],
          ['수수료율', (r.fee_rate || 20) + '%'],
          ['수수료 금액', api.formatMoney(r.fee_amount)],
          ['정산금액', '<span class="settlement-amount-highlight">' + api.formatMoney(r.settlement_amount) + '</span>']
        ]);
      }

      // 영역 3: 유치원 계좌정보
      var acc = document.getElementById('detailStlAccInfo');
      if (acc) {
        api.setHtml(acc, [
          ['유치원명', api.escapeHtml(r.kindergarten_name || '')],
          ['운영자 성명', api.escapeHtml(r.operator_name || '')],
          ['정산 은행', api.escapeHtml(r.bank_name || '')],
          ['계좌번호', api.escapeHtml(r.account_number || '')],
          ['예금주', api.escapeHtml(r.account_holder || '')],
          ['서브몰 코드', api.escapeHtml(r.submall_code || '')]
        ]);
      }

      // 영역 4: 관련 링크
      var links = document.getElementById('detailStlLinks');
      if (links) {
        api.setHtml(links, [
          ['결제번호', r.payment_number ? api.renderDetailLink('payment-detail.html', r.payment_number) : '—'],
          ['예약번호', r.reservation_number ? api.renderDetailLink('reservation-detail.html', r.reservation_number) : '—'],
          ['보호자 회원번호', r.guardian_id ? api.renderDetailLink('member-detail.html', r.guardian_id) : '—'],
          ['유치원번호', r.kindergarten_id ? api.renderDetailLink('kindergarten-detail.html', r.kindergarten_id) : '—'],
          ['환불번호', r.refund_number ? api.renderDetailLink('refund-detail.html', r.refund_number) : '—']
        ]);
      }

      api.showLoading(false);
    }).catch(function () { api.showLoading(false); });
  }

  function bindHistDetailModals() {
    // 정산완료 처리
    var completeBtn = document.querySelector('#settleCompleteModal .modal__btn--confirm-primary');
    if (completeBtn) {
      completeBtn.addEventListener('click', function () {
        var id = api.getParam('id');
        api.updateRecord('settlements', id, { settlement_status: '정산완료' }).then(function () {
          api.insertAuditLog('settlements', id, '정산완료 처리', '');
          location.reload();
        });
      });
    }

    // 정산보류
    var holdBtn = document.getElementById('holdBtn');
    if (holdBtn) {
      holdBtn.addEventListener('click', function () {
        var reason = document.getElementById('holdReason').value;
        if (!reason) return;
        var id = api.getParam('id');
        api.updateRecord('settlements', id, { settlement_status: '정산보류', hold_reason: reason }).then(function () {
          api.insertAuditLog('settlements', id, '정산보류', reason);
          location.reload();
        });
      });
    }

    // 보류 해제
    var releaseBtn = document.querySelector('#holdReleaseModal .modal__btn--confirm-primary');
    if (releaseBtn) {
      releaseBtn.addEventListener('click', function () {
        var id = api.getParam('id');
        api.updateRecord('settlements', id, { settlement_status: '정산예정', hold_reason: null }).then(function () {
          api.insertAuditLog('settlements', id, '보류 해제', '');
          location.reload();
        });
      });
    }
  }

  function initHistDetail() {
    loadHistDetail();
    bindHistDetailModals();
    api.hideIfReadOnly(PERM_KEY);
  }

  /* ══════════════════════════════════════════
     D. 초기화
     ══════════════════════════════════════════ */

  document.addEventListener('DOMContentLoaded', function () {
    if (isListPage()) initList();
    else if (isInfoDetail()) initInfoDetail();
    else if (isHistDetail()) initHistDetail();
  });

})();
