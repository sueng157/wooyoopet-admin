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
  var infoFilterBar, infoStatus, infoBizType, infoSearchField, infoSearchInput;
  var infoBtnReset, infoBtnSearch, infoBtnExcel, infoResultCount, infoBody, infoPagination;
  var infoPage = 1;

  function cacheInfoDom() {
    var tab = document.getElementById('tab-info');
    if (!tab) return;

    infoFilterBar = tab.querySelector('.filter-bar');
    var selects = tab.querySelectorAll('.filter-select');
    infoStatus      = selects[0];  // 등록상태 드롭다운
    infoBizType     = selects[1];  // 사업자유형 드롭다운
    infoSearchField = selects[2];  // 검색기준 드롭다운
    infoSearchInput = tab.querySelector('.filter-input');
    infoBtnReset    = tab.querySelector('.btn-reset');
    infoBtnSearch   = tab.querySelector('.btn-search');
    infoBtnExcel    = tab.querySelector('.btn-excel');

    infoResultCount = tab.querySelector('.result-header__count strong');
    infoBody        = document.getElementById('stlInfoBody');
    infoPagination  = tab.querySelector('.pagination');
  }

  /** RPC 파라미터 조립 (search_settlement_infos) */
  function buildInfoRpcParams(page, perPage) {
    var params = {
      p_inicis_status:   (infoStatus && infoStatus.value) ? infoStatus.value : null,
      p_business_type:   (infoBizType && infoBizType.value) ? infoBizType.value : null,
      p_search_type:     null,
      p_search_keyword:  null,
      p_kindergarten_id: api.getParam('kindergarten_id') || null,
      p_page:            page || 1,
      p_per_page:        perPage || PER_PAGE
    };

    if (infoSearchInput && infoSearchInput.value.trim()) {
      params.p_search_type = infoSearchField ? infoSearchField.value : '유치원명';
      params.p_search_keyword = infoSearchInput.value.trim();
    }

    return params;
  }

  /** RPC 결과 파싱 — 두 탭 공용 (문자열 방어) */
  function parseRpcResult(raw) {
    if (!raw) return { data: [], count: 0 };
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch (e) { return { data: [], count: 0 }; }
    }
    return raw;
  }

  function renderInfoRow(r, idx, offset) {
    var no = offset + idx + 1;
    var kgName = (r.kindergartens && r.kindergartens.name) || '';
    var bizBadge = api.autoBadge(r.business_type || '', { '개인사업자': 'pink', '법인사업자': 'blue', '비사업자': 'brown' });
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

  async function loadInfoList(page) {
    infoPage = page || 1;
    var offset = (infoPage - 1) * PER_PAGE;
    api.showTableLoading(infoBody, 15);

    try {
      var rpcResult = await window.__supabase.rpc('search_settlement_infos', buildInfoRpcParams(infoPage));

      if (rpcResult.error) {
        console.error('[settlements] info RPC error:', rpcResult.error);
        api.showTableEmpty(infoBody, 15, '데이터 로드 실패: ' + (rpcResult.error.message || JSON.stringify(rpcResult.error)));
        return;
      }

      var result = parseRpcResult(rpcResult.data);
      var rows = result.data || [];
      var total = result.count || 0;

      if (infoResultCount) infoResultCount.textContent = api.formatNumber(total);

      if (!rows.length) {
        api.showTableEmpty(infoBody, 15, '검색 결과가 없습니다.');
        if (infoPagination) infoPagination.innerHTML = '';
        return;
      }

      infoBody.innerHTML = rows.map(function (r, i) { return renderInfoRow(r, i, offset); }).join('');
      api.renderPagination(infoPagination, infoPage, total, PER_PAGE, loadInfoList);
    } catch (err) {
      console.error('[settlements] info list error:', err);
      api.showTableEmpty(infoBody, 15, '데이터를 불러오지 못했습니다.');
    }
  }

  function bindInfoEvents() {
    if (infoBtnSearch) infoBtnSearch.addEventListener('click', function () { loadInfoList(1); });
    if (infoSearchInput) infoSearchInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') loadInfoList(1); });
    if (infoBtnReset) infoBtnReset.addEventListener('click', function () {
      if (window.__resetFilters) window.__resetFilters(infoFilterBar);
    });
    if (infoBtnExcel) infoBtnExcel.addEventListener('click', function () {
      var params = buildInfoRpcParams(1, 10000);
      window.__supabase.rpc('search_settlement_infos', params).then(function (rpcResult) {
        var result = parseRpcResult(rpcResult.data);
        var rows = result.data || [];
        api.exportExcel(rows.map(function (r) {
          return {
            유치원명: (r.kindergartens && r.kindergartens.name) || '',
            운영자: r.operator_name || '',
            사업자유형: r.business_type || '',
            사업자등록번호: r.business_reg_number || '',
            판매자ID: r.inicis_seller_id || '',
            은행: r.account_bank || '',
            이니시스상태: r.inicis_status || '',
            신청일: r.created_at || ''
          };
        }), [
          { key: '유치원명', label: '유치원명' },
          { key: '운영자', label: '운영자 성명' },
          { key: '사업자유형', label: '사업자 유형' },
          { key: '사업자등록번호', label: '사업자등록번호' },
          { key: '판매자ID', label: '판매자 ID' },
          { key: '은행', label: '정산 은행' },
          { key: '이니시스상태', label: '이니시스 등록상태' },
          { key: '신청일', label: '신청일' }
        ], '정산정보');
      });
    });
  }

  /* ── A-2: 정산내역 탭 ── */
  var HIST_COL_COUNT = 15;
  var histFilterBar, histDateFrom, histDateTo, histStatus, histTxType;
  var histSearchField, histSearchInput, histAmountType, histAmountMin, histAmountMax;
  var histBtnReset, histBtnSearch, histBtnExcel, histBtnBatch;
  var histResultCount, histBody, histPagination;
  var histPage = 1;

  function cacheHistDom() {
    var tab = document.getElementById('tab-history');
    if (!tab) return;

    histFilterBar = tab.querySelector('.filter-bar');

    var dates = tab.querySelectorAll('.filter-input--date');
    histDateFrom = dates[0];
    histDateTo   = dates[1];

    var selects = tab.querySelectorAll('.filter-select');
    histStatus      = selects[0];  // 정산상태
    histTxType      = selects[1];  // 거래유형
    histSearchField = selects[2];  // 검색기준
    histAmountType  = selects[3];  // 금액유형

    histSearchInput = tab.querySelector('.filter-input--search');

    var amts = tab.querySelectorAll('.filter-input--amount');
    histAmountMin = amts[0];
    histAmountMax = amts[1];

    histBtnReset  = tab.querySelector('.btn-reset');
    histBtnSearch = tab.querySelector('.btn-search');
    histBtnExcel  = tab.querySelector('.btn-excel');
    histBtnBatch  = tab.querySelector('.btn-batch-settle');

    histResultCount = tab.querySelector('.result-header__count strong');
    histBody        = document.getElementById('stlHistBody');
    histPagination  = tab.querySelector('.pagination');
  }

  /**
   * search_settlements RPC 파라미터 조립
   * — 기존 RPC(search_payments, search_refunds, search_settlement_infos)와
   *   동일한 원래 타입 유지 패턴 사용.
   * — 값이 있으면 원래 타입(text/Number), 없으면 null 전달.
   */
  function buildHistRpcParams(page, perPage) {
    var params = {
      p_date_from:        (histDateFrom && histDateFrom.value) ? histDateFrom.value : null,
      p_date_to:          (histDateTo && histDateTo.value) ? histDateTo.value : null,
      p_status:           (histStatus && histStatus.value) ? histStatus.value : null,
      p_transaction_type: (histTxType && histTxType.value) ? histTxType.value : null,
      p_search_type:      null,
      p_search_keyword:   null,
      p_amount_type:      null,
      p_amount_min:       null,
      p_amount_max:       null,
      p_kindergarten_id:  api.getParam('kindergarten_id') || null,
      p_page:             page || 1,
      p_per_page:         perPage || PER_PAGE
    };

    // 검색 키워드
    if (histSearchInput && histSearchInput.value.trim()) {
      params.p_search_type = histSearchField ? histSearchField.value : '유치원명';
      params.p_search_keyword = histSearchInput.value.trim();
    }

    // 금액 필터
    if (histAmountType && histAmountType.value) {
      var minVal = histAmountMin ? histAmountMin.value.trim() : '';
      var maxVal = histAmountMax ? histAmountMax.value.trim() : '';
      if (minVal || maxVal) {
        params.p_amount_type = histAmountType.value;
        if (minVal) params.p_amount_min = Number(minVal);
        if (maxVal) params.p_amount_max = Number(maxVal);
      }
    }

    return params;
  }

  function renderHistRow(r, idx, offset) {
    var no = offset + idx + 1;
    var kgName = (r.kindergartens && r.kindergartens.name) || '';
    var typeBadge = api.autoBadge(r.transaction_type || '', { '돌봄': 'blue', '위약금': 'orange' });
    var statusBadge = api.autoBadge(r.status || '', { '정산예정': 'orange', '정산완료': 'green', '정산보류': 'red' });
    return '<tr>' +
      '<td class="data-table__checkbox"><input type="checkbox" data-id="' + (r.id || '') + '"></td>' +
      '<td>' + no + '</td>' +
      '<td>' + (api.formatDate(r.scheduled_date, true) || '—') + '</td>' +
      '<td>' + api.escapeHtml(kgName) + '</td>' +
      '<td>' + api.escapeHtml(r.operator_name || '') + '</td>' +
      '<td>' + typeBadge + '</td>' +
      '<td style="text-align:right;">' + api.formatMoney(r.payment_amount) + '</td>' +
      '<td>' + (r.commission_rate || 20) + '%</td>' +
      '<td style="text-align:right;">' + api.formatMoney(r.commission_amount) + '</td>' +
      '<td style="text-align:right;">' + api.formatMoney(r.settlement_amount) + '</td>' +
      '<td>' + api.escapeHtml(r.account_bank || '—') + '</td>' +
      '<td>' + (r.account_number ? api.maskAccount(r.account_number) : '—') + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + (api.formatDate(r.completed_date, true) || '—') + '</td>' +
      '<td><a href="settlement-detail.html?id=' + (r.id || '') + '" class="data-table__link">상세</a></td>' +
      '</tr>';
  }

  async function loadHistList(page) {
    histPage = page || 1;
    var offset = (histPage - 1) * PER_PAGE;
    api.showTableLoading(histBody, HIST_COL_COUNT);

    try {
      var rpcResult = await window.__supabase.rpc('search_settlements', buildHistRpcParams(histPage));

      if (rpcResult.error) {
        console.error('[settlements] hist RPC error:', rpcResult.error);
        api.showTableEmpty(histBody, HIST_COL_COUNT, '데이터 로드 실패: ' + (rpcResult.error.message || JSON.stringify(rpcResult.error)));
        return;
      }

      var result = parseRpcResult(rpcResult.data);
      var rows = result.data || [];
      var total = result.count || 0;

      if (histResultCount) histResultCount.textContent = api.formatNumber(total);

      if (!rows.length) {
        api.showTableEmpty(histBody, HIST_COL_COUNT, '검색 결과가 없습니다.');
        if (histPagination) histPagination.innerHTML = '';
        return;
      }

      histBody.innerHTML = rows.map(function (r, i) { return renderHistRow(r, i, offset); }).join('');
      api.renderPagination(histPagination, histPage, total, PER_PAGE, loadHistList);
      bindCheckAll();
    } catch (err) {
      console.error('[settlements] hist list error:', err);
      api.showTableEmpty(histBody, HIST_COL_COUNT, '데이터를 불러오지 못했습니다.');
    }
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
    // 검색 버튼 → 목록 + 요약 함께 갱신
    if (histBtnSearch) histBtnSearch.addEventListener('click', function () {
      loadHistList(1);
      loadSummary();
    });
    if (histSearchInput) histSearchInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') { loadHistList(1); loadSummary(); }
    });

    // 초기화 버튼
    if (histBtnReset) histBtnReset.addEventListener('click', function () {
      if (window.__resetFilters) window.__resetFilters(histFilterBar);
      // 기간 버튼을 '전체'로 복원
      var tab = document.getElementById('tab-history');
      if (tab) {
        tab.querySelectorAll('.filter-period-btn').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-period') === 'all');
        });
      }
    });

    // 엑셀 다운로드 → search_settlements RPC 사용
    if (histBtnExcel) histBtnExcel.addEventListener('click', function () {
      var params = buildHistRpcParams(1, 10000);
      window.__supabase.rpc('search_settlements', params).then(function (rpcResult) {
        var result = parseRpcResult(rpcResult.data);
        var rows = result.data || [];
        api.exportExcel(rows.map(function (r) {
          return {
            scheduled_date: r.scheduled_date || '',
            kindergarten: (r.kindergartens && r.kindergartens.name) || '',
            operator: r.operator_name || '',
            tx_type: r.transaction_type || '',
            payment: r.payment_amount || 0,
            rate: (r.commission_rate || 20) + '%',
            commission: r.commission_amount || 0,
            settlement: r.settlement_amount || 0,
            bank: r.account_bank || '',
            account: r.account_number || '',
            status: r.status || '',
            completed: r.completed_date || ''
          };
        }), [
          { key: 'scheduled_date', label: '정산 예정일' },
          { key: 'kindergarten', label: '유치원명' },
          { key: 'operator', label: '운영자 성명' },
          { key: 'tx_type', label: '거래유형' },
          { key: 'payment', label: '결제금액' },
          { key: 'rate', label: '수수료율' },
          { key: 'commission', label: '수수료 금액' },
          { key: 'settlement', label: '정산금액' },
          { key: 'bank', label: '정산 은행' },
          { key: 'account', label: '계좌번호' },
          { key: 'status', label: '정산상태' },
          { key: 'completed', label: '완료일' }
        ], '정산내역');
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
          loadSummary();
        });
      });
    }
  }

  /** 기간 버튼 이벤트 바인딩 */
  function bindPeriodButtons() {
    var tab = document.getElementById('tab-history');
    if (!tab) return;
    var btns = tab.querySelectorAll('.filter-period-btn');

    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        // 모든 기간 버튼 비활성 → 현재만 활성
        btns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');

        var period = btn.getAttribute('data-period');
        var now = new Date();
        var from = '';
        var to = '';

        if (period === 'all') {
          from = '';
          to = '';
        } else if (period === 'this-month') {
          from = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
          to = api.getToday();
        } else if (period === '1month') {
          var d1 = new Date();
          d1.setMonth(d1.getMonth() - 1);
          from = d1.getFullYear() + '-' + String(d1.getMonth() + 1).padStart(2, '0') + '-' + String(d1.getDate()).padStart(2, '0');
          to = api.getToday();
        } else if (period === '1week') {
          var d7 = new Date();
          d7.setDate(d7.getDate() - 7);
          from = d7.getFullYear() + '-' + String(d7.getMonth() + 1).padStart(2, '0') + '-' + String(d7.getDate()).padStart(2, '0');
          to = api.getToday();
        }

        if (histDateFrom) histDateFrom.value = from;
        if (histDateTo) histDateTo.value = to;
        // 버튼 클릭 시 자동 검색하지 않음 (사양)
      });
    });

    // 날짜 입력 수동 변경 시 기간 버튼 비활성(커스텀 날짜)
    [histDateFrom, histDateTo].forEach(function (el) {
      if (!el) return;
      el.addEventListener('change', function () {
        btns.forEach(function (b) { b.classList.remove('active'); });
      });
    });
  }

  // 정산 요약 카드 로드 — 현재 필터 기간 파라미터 전달
  function loadSummary() {
    var summaryParams = {
      p_date_from: (histDateFrom && histDateFrom.value) ? histDateFrom.value : null,
      p_date_to:   (histDateTo && histDateTo.value) ? histDateTo.value : null
    };

    api.callRpc('get_settlement_summary', summaryParams).then(function (res) {
      var raw = res && res.data ? res.data : res;
      var data = (typeof raw === 'string') ? JSON.parse(raw) : raw;
      if (!data) return;

      var tab = document.getElementById('tab-history');
      if (!tab) return;

      // 1행: 5개 금액 카드 (.summary-section > .stat-cards 첫 번째 그리드 내 .stat-card__value)
      var summarySection = tab.querySelector('.summary-section');
      if (summarySection) {
        var firstRow = summarySection.querySelector('.stat-cards');
        if (firstRow) {
          var cards = firstRow.querySelectorAll('.stat-card__value');
          if (cards.length >= 5) {
            cards[0].innerHTML = api.formatMoney(data.care_payment, false) + '<span class="stat-card__unit">원</span>';
            cards[1].innerHTML = api.formatMoney(data.penalty_payment, false) + '<span class="stat-card__unit">원</span>';
            cards[2].innerHTML = api.formatMoney(data.total_valid, false) + '<span class="stat-card__unit">원</span>';
            cards[3].innerHTML = api.formatMoney(data.platform_fee, false) + '<span class="stat-card__unit">원</span>';
            cards[4].innerHTML = api.formatMoney(data.kg_settlement, false) + '<span class="stat-card__unit">원</span>';
          }
        }
      }

      // 2행: 건수/금액 (span#summXxx)
      var el;
      el = document.getElementById('summPendingCount');    if (el) el.textContent = api.formatNumber(data.pending_count);
      el = document.getElementById('summPendingAmount');   if (el) el.textContent = api.formatMoney(data.pending_amount, false);
      el = document.getElementById('summCompletedCount');  if (el) el.textContent = api.formatNumber(data.completed_count);
      el = document.getElementById('summCompletedAmount'); if (el) el.textContent = api.formatMoney(data.completed_amount, false);
      el = document.getElementById('summHoldCount');       if (el) el.textContent = api.formatNumber(data.hold_count);
      el = document.getElementById('summHoldAmount');      if (el) el.textContent = api.formatMoney(data.hold_amount, false);
    }).catch(function (err) {
      console.error('[settlements] summary error:', err);
    });
  }

  // kindergarten_id 필터 배너 삽입
  async function renderKgFilterBanner() {
    var kgId = api.getParam('kindergarten_id');
    if (!kgId) return;

    // 유치원명 조회
    var sb = window.__supabase;
    var res = await sb.from('kindergartens').select('name').eq('id', kgId).maybeSingle();
    var kgName = (res.data && res.data.name) || kgId.slice(0, 8).toUpperCase();

    // 배너 HTML
    var bannerHtml =
      '<div class="kg-filter-banner">' +
        '<span class="kg-filter-banner__icon">&#9432;</span>' +
        '<span class="kg-filter-banner__text">' +
          '<strong>' + api.escapeHtml(kgName) + '</strong> 유치원의 정산 데이터만 표시 중입니다.' +
        '</span>' +
        '<a href="#" class="kg-filter-banner__clear">필터 해제 &times;</a>' +
      '</div>';

    // 정산정보 탭, 정산내역 탭 필터바 바로 아래에 삽입
    ['tab-info', 'tab-history'].forEach(function (tabId) {
      var tab = document.getElementById(tabId);
      if (!tab) return;
      var filterBar = tab.querySelector('.filter-bar');
      if (!filterBar) return;
      filterBar.insertAdjacentHTML('afterend', bannerHtml);
    });

    // 필터 해제 클릭 → kindergarten_id 파라미터만 제거하고 리로드
    document.querySelectorAll('.kg-filter-banner__clear').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var url = new URL(window.location.href);
        url.searchParams.delete('kindergarten_id');
        window.location.href = url.toString();
      });
    });
  }

  function initList() {
    cacheInfoDom();
    cacheHistDom();
    bindInfoEvents();
    bindHistEvents();
    bindPeriodButtons();
    loadInfoList(1);
    loadHistList(1);
    loadSummary();
    renderKgFilterBanner();

    // URL 파라미터로 탭 자동 전환 (예: ?tab=history)
    var tabParam = api.getParam('tab');
    if (tabParam) {
      var targetId = 'tab-' + tabParam;  // tab=history → tab-history
      var targetBtn = document.querySelector('[data-tab-target="' + targetId + '"]');
      if (targetBtn) targetBtn.click();
    }
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
          ['핸드폰', api.renderMaskedField(api.maskPhone(r.operator_phone || ''), api.formatPhone(r.operator_phone || ''), 'settlement_infos', r.id, 'phone')],
          ['회원번호', r.member_id ? api.renderDetailLink('member-detail.html', r.member_id) : '—']
        ]);
      }

      // 영역 2: 사업자 정보
      var biz = document.getElementById('detailStlBiz');
      if (biz) {
        var ssnValue = (r.business_type === '비사업자' && r.operator_ssn_masked)
          ? api.renderMaskedField(api.maskSsn(r.operator_ssn_masked), r.operator_ssn_masked, 'settlement_infos', r.id, 'ssn')
          : '—';
        api.setHtml(biz, [
          ['사업자 유형', api.autoBadge(r.business_type || '', { '개인사업자': 'pink', '법인사업자': 'blue', '비사업자': 'brown' })],
          ['주민등록번호', ssnValue],
          ['사업자등록번호', api.escapeHtml(r.business_reg_number || '—')],
          ['상호명', api.escapeHtml(r.business_name || '—')],
          ['업종·업태', api.escapeHtml(r.business_category || '—')],
          ['이메일', api.escapeHtml(r.operator_email || '—')]
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
          ['거래유형', api.autoBadge(r.transaction_type || '', { '돌봄': 'blue', '위약금': 'orange' })],
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
          ['유치원번호', r.kindergarten_id ? api.renderDetailLink('kindergarten-detail.html', r.kindergarten_id) : '—']
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
