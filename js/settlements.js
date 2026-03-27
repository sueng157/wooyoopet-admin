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
    if (infoDateFrom && infoDateFrom.value) f.push({ column: 'created_at', op: 'gte', value: infoDateFrom.value + 'T00:00:00' });
    if (infoDateTo && infoDateTo.value) f.push({ column: 'created_at', op: 'lte', value: infoDateTo.value + 'T23:59:59' });
    if (infoStatus && infoStatus.value !== '전체') f.push({ column: 'inicis_status', op: 'eq', value: infoStatus.value });
    return f;
  }

  function buildInfoSearch() {
    if (!infoSearchInput || !infoSearchInput.value.trim()) return null;
    var field = infoSearchField ? infoSearchField.value : '운영자 성명';
    return { column: 'operator_name', value: infoSearchInput.value.trim() };
  }

  function renderInfoRow(r, idx, offset) {
    var no = offset + idx + 1;
    var kgName = (r.kindergartens && r.kindergartens.name) || '';
    var bizBadge = api.autoBadge(r.business_type || '', { '사업자': 'pink', '개인': 'brown' });
    var statusBadge = api.autoBadge(r.inicis_status || '', { '완료': 'green', '요청중': 'blue', '실패': 'red', '미등록': 'gray' });
    return '<tr>' +
      '<td>' + no + '</td>' +
      '<td>' + api.escapeHtml(kgName) + '</td>' +
      '<td>' + api.escapeHtml(r.operator_name || '') + '</td>' +
      '<td>' + api.maskPhone(r.operator_phone || '') + '</td>' +
      '<td>' + bizBadge + '</td>' +
      '<td>' + api.escapeHtml(r.business_reg_number || '—') + '</td>' +
      '<td>' + api.escapeHtml(r.inicis_seller_id || '—') + '</td>' +
      '<td>' + api.escapeHtml(r.account_bank || '—') + '</td>' +
      '<td>' + (r.account_number ? api.maskAccount(r.account_number) : '—') + '</td>' +
      '<td>' + api.escapeHtml(r.account_holder || '—') + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + api.escapeHtml(r.inicis_fail_reason || '—') + '</td>' +
      '<td>' + (api.formatDate(r.inicis_requested_at, true) || '—') + '</td>' +
      '<td>' + (api.formatDate(r.inicis_completed_at, true) || '—') + '</td>' +
      '<td><a href="settlement-info-detail.html?id=' + (r.id || '') + '" class="data-table__link">상세</a></td>' +
      '</tr>';
  }

  function loadInfoList(page) {
    infoPage = page || 1;
    var offset = (infoPage - 1) * PER_PAGE;
    api.showTableLoading(infoBody, 15);

    api.fetchList('settlement_infos', {
      select: '*, kindergartens:kindergarten_id(name)',
      filters: buildInfoFilters(), search: buildInfoSearch(),
      order: { column: 'created_at', ascending: false },
      page: infoPage, perPage: PER_PAGE
    }).then(function (res) {
      var rows = res.data || [], total = res.count || 0;
      infoResultCount.textContent = api.formatNumber(total);
      if (!rows.length) { api.showTableEmpty(infoBody, 15, '검색 결과가 없습니다.'); infoPagination.innerHTML = ''; return; }
      infoBody.innerHTML = rows.map(function (r, i) { return renderInfoRow(r, i, offset); }).join('');
      api.renderPagination(infoPagination, infoPage, total, PER_PAGE, loadInfoList);
    }).catch(function () { api.showTableEmpty(infoBody, 15, '데이터를 불러오지 못했습니다.'); });
  }

  function bindInfoEvents() {
    if (infoBtnSearch) infoBtnSearch.addEventListener('click', function () { loadInfoList(1); });
    if (infoSearchInput) infoSearchInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') loadInfoList(1); });
    if (infoBtnExcel) infoBtnExcel.addEventListener('click', function () {
      api.fetchAll('settlement_infos', { select: '*, kindergartens:kindergarten_id(name)', filters: buildInfoFilters(), search: buildInfoSearch(), order: { column: 'created_at', ascending: false } }).then(function (res) {
        var rows = res.data || [];
        api.exportExcel(rows.map(function (r) {
          return { '유치원명': (r.kindergartens && r.kindergartens.name) || '', '운영자': r.operator_name || '', '사업자유형': r.business_type || '', '판매자ID': r.inicis_seller_id || '', '은행': r.account_bank || '', '이니시스상태': r.inicis_status || '', '신청일': r.created_at || '' };
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
    if (histDateFrom && histDateFrom.value) f.push({ column: 'scheduled_date', op: 'gte', value: histDateFrom.value });
    if (histDateTo && histDateTo.value) f.push({ column: 'scheduled_date', op: 'lte', value: histDateTo.value });
    if (histStatus && histStatus.value !== '전체') f.push({ column: 'status', op: 'eq', value: histStatus.value });
    return f;
  }

  function buildHistSearch() {
    if (!histSearchInput || !histSearchInput.value.trim()) return null;
    // settlements 테이블에 operator_name 직접 존재
    return { column: 'operator_name', value: histSearchInput.value.trim() };
  }

  function renderHistRow(r, idx, offset) {
    var no = offset + idx + 1;
    var kgName = (r.kindergartens && r.kindergartens.name) || '';
    var memberName = (r.members && r.members.name) || '';
    var typeBadge = api.autoBadge(r.transaction_type || '', { '돌봄결제': 'blue', '위약금': 'orange' });
    var statusBadge = api.autoBadge(r.status || '', { '정산예정': 'orange', '정산완료': 'green', '정산보류': 'red' });
    return '<tr>' +
      '<td class="data-table__checkbox"><input type="checkbox" data-id="' + (r.id || '') + '"></td>' +
      '<td>' + no + '</td>' +
      '<td>' + (api.formatDate(r.scheduled_date, true) || '—') + '</td>' +
      '<td>' + api.escapeHtml(kgName) + '</td>' +
      '<td>' + api.escapeHtml(r.operator_name || '') + '</td>' +
      '<td>' + api.escapeHtml(memberName) + '</td>' +
      '<td>' + (r.reservation_id ? '<a href="reservation-detail.html?id=' + r.reservation_id + '" class="data-table__link">' + api.escapeHtml(String(r.reservation_id).substring(0, 8)) + '</a>' : '—') + '</td>' +
      '<td>' + typeBadge + '</td>' +
      '<td style="text-align:right;">' + api.formatMoney(r.payment_amount) + '</td>' +
      '<td>' + (r.commission_rate || 20) + '%</td>' +
      '<td style="text-align:right;">' + api.formatMoney(r.commission_amount) + '</td>' +
      '<td style="text-align:right;">' + api.formatMoney(r.settlement_amount) + '</td>' +
      '<td>' + api.escapeHtml((r.account_bank || '') + ' ' + (r.account_number || '')) + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + (api.formatDate(r.completed_date, true) || '—') + '</td>' +
      '<td><a href="settlement-detail.html?id=' + (r.id || '') + '" class="data-table__link">상세</a></td>' +
      '</tr>';
  }

  function loadHistList(page) {
    histPage = page || 1;
    var offset = (histPage - 1) * PER_PAGE;
    api.showTableLoading(histBody, 16);

    api.fetchList('settlements', {
      select: '*, kindergartens:kindergarten_id(name), members:member_id(name)',
      filters: buildHistFilters(), search: buildHistSearch(),
      order: { column: 'scheduled_date', ascending: false },
      page: histPage, perPage: PER_PAGE
    }).then(function (res) {
      var rows = res.data || [], total = res.count || 0;
      histResultCount.textContent = api.formatNumber(total);
      if (!rows.length) { api.showTableEmpty(histBody, 16, '검색 결과가 없습니다.'); histPagination.innerHTML = ''; return; }
      histBody.innerHTML = rows.map(function (r, i) { return renderHistRow(r, i, offset); }).join('');
      api.renderPagination(histPagination, histPage, total, PER_PAGE, loadHistList);
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
      api.fetchAll('settlements', { select: '*, kindergartens:kindergarten_id(name)', filters: buildHistFilters(), search: buildHistSearch(), order: { column: 'scheduled_date', ascending: false } }).then(function (res) {
        var rows = res.data || [];
        api.exportExcel(rows.map(function (r) {
          return { '정산번호': r.id || '', '예정일': r.scheduled_date || '', '유치원명': (r.kindergartens && r.kindergartens.name) || '', '결제금액': r.payment_amount || 0, '수수료': r.commission_amount || 0, '정산금액': r.settlement_amount || 0, '상태': r.status || '' };
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
          return api.updateRecord('settlements', id, { status: '정산완료' });
        })).then(function () {
          loadHistList(histPage);
        });
      });
    }
  }

  // 정산 요약 카드 로드
  function loadSummary() {
    api.callRpc('get_settlement_summary', {}).then(function (res) {
      var data = res && res.data ? res.data : res;
      if (!data) return;
      var tab = document.getElementById('tab-history');
      if (!tab) return;
      var cards = tab.querySelectorAll('.stat-card__value');
      if (cards.length < 10) return;
      cards[1].innerHTML = api.formatMoney(data.care_payment) + '<span class="stat-card__unit">원</span>';
      cards[2].innerHTML = api.formatMoney(data.penalty_payment) + '<span class="stat-card__unit">원</span>';
      cards[3].innerHTML = api.formatMoney(data.total_valid) + '<span class="stat-card__unit">원</span>';
      cards[4].innerHTML = api.formatMoney(data.platform_fee) + '<span class="stat-card__unit">원</span>';
      cards[5].innerHTML = api.formatMoney(data.kg_settlement) + '<span class="stat-card__unit">원</span>';
      cards[6].innerHTML = api.formatNumber(data.pending_count) + '<span class="stat-card__unit">건</span>';
      cards[7].innerHTML = api.formatMoney(data.pending_amount) + '<span class="stat-card__unit">원</span>';
      cards[8].innerHTML = api.formatNumber(data.completed_count) + '<span class="stat-card__unit">건</span>';
      cards[9].innerHTML = api.formatMoney(data.completed_amount) + '<span class="stat-card__unit">원</span>';
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

    api.fetchDetail('settlement_infos', id, '*, kindergartens:kindergarten_id(name, business_status)').then(function (result) {
      var r = result.data;
      if (!r || result.error) return;

      // 영역 1: 운영자 기본정보
      var op = document.getElementById('detailStlOperator');
      if (op) {
        api.setHtml(op, [
          ['운영자 성명', api.escapeHtml(r.operator_name || '')],
          ['생년월일', api.formatDate(r.operator_birth_date, true) || '—'],
          ['주민등록번호', api.renderMaskedField(r.operator_ssn_masked || '', r.operator_ssn_masked || '', 'settlement_infos', r.id, 'ssn')],
          ['핸드폰', api.renderMaskedField(api.maskPhone(r.operator_phone || ''), api.formatPhone(r.operator_phone || ''), 'settlement_infos', r.id, 'phone')],
          ['이메일', api.escapeHtml(r.operator_email || '')],
          ['회원번호', r.member_id ? api.renderDetailLink('member-detail.html', r.member_id) : '—']
        ]);
      }

      // 영역 2: 사업자 정보
      var biz = document.getElementById('detailStlBiz');
      if (biz) {
        api.setHtml(biz, [
          ['사업자 유형', api.autoBadge(r.business_type || '', { '사업자': 'pink', '개인': 'brown' })],
          ['사업자등록번호', api.escapeHtml(r.business_reg_number || '—')],
          ['상호명', api.escapeHtml(r.business_name || '—')],
          ['업종·업태', api.escapeHtml(r.business_category || '—')]
        ]);
      }

      // 영역 3: 계좌 정보
      var acc = document.getElementById('detailStlAccount');
      if (acc) {
        api.setHtml(acc, [
          ['정산 은행', api.escapeHtml(r.account_bank || '—')],
          ['계좌번호', api.escapeHtml(r.account_number || '—')],
          ['예금주', api.escapeHtml(r.account_holder || '—')]
        ]);
      }

      // 영역 4: 이니시스 서브몰
      var ini = document.getElementById('detailStlInicis');
      if (ini) {
        api.setHtml(ini, [
          ['판매자 ID', api.escapeHtml(r.inicis_seller_id || '—')],
          ['서브몰 코드', api.escapeHtml(r.submall_code || '—')],
          ['등록상태', api.autoBadge(r.inicis_status || '', { '완료': 'green', '요청중': 'blue', '실패': 'red', '미등록': 'gray' })],
          ['실패 사유', r.inicis_fail_reason || '—'],
          ['등록 요청일시', api.formatDate(r.inicis_requested_at)],
          ['등록 완료일시', api.formatDate(r.inicis_completed_at) || '—']
        ]);
      }

      // 영역 5: 유치원 정보
      var kg = document.getElementById('detailStlKg');
      if (kg) {
        var kgData = r.kindergartens || {};
        api.setHtml(kg, [
          ['유치원명', api.escapeHtml(kgData.name || '')],
          ['유치원번호', r.kindergarten_id ? api.renderDetailLink('kindergarten-detail.html', r.kindergarten_id) : '—'],
          ['영업상태', api.autoBadge(kgData.business_status || '')]
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

    }).catch(function (err) { console.error('[settlements] info detail error:', err); });
  }

  function bindInfoDetailModals() {
    var reRegBtn = document.querySelector('#reRegisterModal .modal__btn--confirm-primary');
    if (reRegBtn) {
      reRegBtn.addEventListener('click', function () {
        var id = api.getParam('id');
        api.updateRecord('settlement_infos', id, { inicis_status: '요청중' }).then(function () {
          api.insertAuditLog('이니시스재등록요청', 'settlement_infos', id, {});
          location.reload();
        });
      });
    }

    var approveBtn = document.getElementById('approveBtn');
    if (approveBtn) {
      approveBtn.addEventListener('click', function () {
        var reason = document.getElementById('approveReason').value;
        if (!reason) return;
        var id = api.getParam('id');
        api.updateRecord('settlement_infos', id, { inicis_status: '완료' }).then(function () {
          api.insertAuditLog('관리자강제승인', 'settlement_infos', id, { reason: reason });
          location.reload();
        });
      });
    }

    var rejectBtn = document.getElementById('rejectBtn');
    if (rejectBtn) {
      rejectBtn.addEventListener('click', function () {
        var reason = document.getElementById('rejectReason').value;
        if (!reason) return;
        var id = api.getParam('id');
        api.updateRecord('settlement_infos', id, { inicis_status: '실패', inicis_fail_reason: reason }).then(function () {
          api.insertAuditLog('관리자강제거절', 'settlement_infos', id, { reason: reason });
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

    api.fetchDetail('settlements', id, '*, kindergartens:kindergarten_id(name), members:member_id(name)').then(function (result) {
      var r = result.data;
      if (!r || result.error) return;

      // 영역 1: 정산 기본정보
      var basic = document.getElementById('detailStlBasic');
      if (basic) {
        api.setHtml(basic, [
          ['정산 고유번호', r.id],
          ['정산 예정일', api.formatDate(r.scheduled_date, true) || '—'],
          ['정산상태', api.autoBadge(r.status || '', { '정산예정': 'orange', '정산완료': 'green', '정산보류': 'red' })],
          ['정산 완료일', api.formatDate(r.completed_date, true) || '—'],
          ['보류 사유', r.hold_reason || '—']
        ]);
      }

      // 영역 2: 금액 상세
      var amount = document.getElementById('detailStlAmount');
      if (amount) {
        api.setHtml(amount, [
          ['거래유형', api.autoBadge(r.transaction_type || '', { '돌봄결제': 'blue', '위약금': 'orange' })],
          ['결제금액', '<span class="payment-amount-highlight">' + api.formatMoney(r.payment_amount) + '</span>'],
          ['수수료율', (r.commission_rate || 20) + '%'],
          ['수수료 금액', api.formatMoney(r.commission_amount)],
          ['정산금액', '<span class="settlement-amount-highlight">' + api.formatMoney(r.settlement_amount) + '</span>']
        ]);
      }

      // 영역 3: 유치원 계좌정보
      var acc = document.getElementById('detailStlAccInfo');
      if (acc) {
        var kgData = r.kindergartens || {};
        api.setHtml(acc, [
          ['유치원명', api.escapeHtml(kgData.name || '')],
          ['운영자 성명', api.escapeHtml(r.operator_name || '')],
          ['정산 은행', api.escapeHtml(r.account_bank || '')],
          ['계좌번호', api.escapeHtml(r.account_number || '')],
          ['예금주', api.escapeHtml(r.account_holder || '')],
          ['서브몰 코드', api.escapeHtml(r.inicis_submall_code || '')]
        ]);
      }

      // 영역 4: 관련 링크
      var links = document.getElementById('detailStlLinks');
      if (links) {
        api.setHtml(links, [
          ['결제번호', r.payment_id ? api.renderDetailLink('payment-detail.html', r.payment_id) : '—'],
          ['예약번호', r.reservation_id ? api.renderDetailLink('reservation-detail.html', r.reservation_id) : '—'],
          ['보호자 회원번호', r.member_id ? api.renderDetailLink('member-detail.html', r.member_id) : '—'],
          ['유치원번호', r.kindergarten_id ? api.renderDetailLink('kindergarten-detail.html', r.kindergarten_id) : '—'],
          ['환불번호', r.refund_id ? api.renderDetailLink('refund-detail.html', r.refund_id) : '—']
        ]);
      }

    }).catch(function (err) { console.error('[settlements] hist detail error:', err); });
  }

  function bindHistDetailModals() {
    var completeBtn = document.querySelector('#settleCompleteModal .modal__btn--confirm-primary');
    if (completeBtn) {
      completeBtn.addEventListener('click', function () {
        var id = api.getParam('id');
        api.updateRecord('settlements', id, { status: '정산완료' }).then(function () {
          api.insertAuditLog('정산완료처리', 'settlements', id, {});
          location.reload();
        });
      });
    }

    var holdBtn = document.getElementById('holdBtn');
    if (holdBtn) {
      holdBtn.addEventListener('click', function () {
        var reason = document.getElementById('holdReason').value;
        if (!reason) return;
        var id = api.getParam('id');
        api.updateRecord('settlements', id, { status: '정산보류', hold_reason: reason }).then(function () {
          api.insertAuditLog('정산보류', 'settlements', id, { reason: reason });
          location.reload();
        });
      });
    }

    var releaseBtn = document.querySelector('#holdReleaseModal .modal__btn--confirm-primary');
    if (releaseBtn) {
      releaseBtn.addEventListener('click', function () {
        var id = api.getParam('id');
        api.updateRecord('settlements', id, { status: '정산예정', hold_reason: null }).then(function () {
          api.insertAuditLog('보류해제', 'settlements', id, {});
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
