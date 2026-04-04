/**
 * 우유펫 관리자 대시보드 — 후기관리 (reviews.js)
 *
 * 목록 (reviews.html) + 보호자 후기 상세 (review-detail.html) + 유치원 후기 상세 (review-kg-detail.html)
 * 의존: api.js, auth.js, common.js
 */
(function () {
  'use strict';

  var api = window.__api;
  var auth = window.__auth;
  if (!api || !auth) return;

  var PERM_KEY = 'perm_reviews';
  var PER_PAGE = 20;

  // ══════════════════════════════════════════
  // A. 목록 페이지 (reviews.html)
  // ══════════════════════════════════════════

  function isListPage() {
    return !!document.getElementById('guardianListBody');
  }

  // ── 탭 1: 보호자 후기 ──
  var g = {};
  var gFilterBar;
  // ── 탭 2: 유치원 후기 ──
  var k = {};
  var kFilterBar;
  var gPage = 1, kPage = 1;

  function cacheListDom() {
    var tab1 = document.getElementById('tab-guardian');
    var tab2 = document.getElementById('tab-kindergarten');

    if (tab1) {
      gFilterBar        = tab1.querySelector('.filter-bar');
      g.dateFrom        = document.getElementById('gDateFrom');
      g.dateTo          = document.getElementById('gDateTo');
      g.satisfaction    = document.getElementById('gSatisfaction');
      g.imageFilter     = document.getElementById('gImageFilter');
      g.searchField     = document.getElementById('gSearchField');
      g.searchInput     = document.getElementById('gSearchInput');
      g.btnReset        = document.getElementById('gBtnReset');
      g.btnSearch       = document.getElementById('gBtnSearch');
      g.btnExcel        = tab1.querySelector('.btn-excel');
      g.resultCount     = tab1.querySelector('.result-header__count strong');
      g.body            = document.getElementById('guardianListBody');
      g.pagination      = tab1.querySelector('.pagination');
    }

    if (tab2) {
      kFilterBar        = tab2.querySelector('.filter-bar');
      k.dateFrom        = document.getElementById('kDateFrom');
      k.dateTo          = document.getElementById('kDateTo');
      k.satisfaction    = document.getElementById('kSatisfaction');
      k.guardianOnly    = document.getElementById('kGuardianOnly');
      k.searchField     = document.getElementById('kSearchField');
      k.searchInput     = document.getElementById('kSearchInput');
      k.btnReset        = document.getElementById('kBtnReset');
      k.btnSearch       = document.getElementById('kBtnSearch');
      k.btnExcel        = tab2.querySelector('.btn-excel');
      k.resultCount     = tab2.querySelector('.result-header__count strong');
      k.body            = document.getElementById('kgReviewListBody');
      k.pagination      = tab2.querySelector('.pagination');
    }
  }

  // ── 보호자 후기 RPC 파라미터 조립 (search_guardian_reviews) ──
  function buildGuardianRpcParams(page, perPage) {
    var params = {
      p_date_from:      (g.dateFrom && g.dateFrom.value) ? g.dateFrom.value : null,
      p_date_to:        (g.dateTo && g.dateTo.value) ? g.dateTo.value : null,
      p_satisfaction:   (g.satisfaction && g.satisfaction.value) ? g.satisfaction.value : null,
      p_image_filter:   (g.imageFilter && g.imageFilter.value) ? g.imageFilter.value : null,
      p_search_type:    null,
      p_search_keyword: null,
      p_page:           page || 1,
      p_per_page:       perPage || PER_PAGE
    };

    if (g.searchInput && g.searchInput.value.trim()) {
      params.p_search_type = g.searchField ? g.searchField.value : '보호자 닉네임';
      params.p_search_keyword = g.searchInput.value.trim();
    }

    return params;
  }

  /** RPC 결과 파싱 (문자열 방어) */
  function parseGuardianRpcResult(raw) {
    if (!raw) return { data: [], count: 0 };
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch (e) { return { data: [], count: 0 }; }
    }
    return raw;
  }

  function renderGuardianRow(r, idx, offset) {
    var no = offset + idx + 1;
    var tags = (r.selected_tags || []);
    var tagHtml = '';
    var maxShow = 2;
    for (var i = 0; i < Math.min(tags.length, maxShow); i++) {
      tagHtml += '<span class="review-tag-pill">' + api.escapeHtml(tags[i]) + '</span>';
    }
    if (tags.length > maxShow) {
      tagHtml += '<span class="review-tag-more">+' + (tags.length - maxShow) + '</span>';
    }
    var imgs = r.image_urls || [];
    var imgCount = Array.isArray(imgs) ? imgs.length : 0;
    var imgClass = imgCount === 0 ? 'review-img-count review-img-count--zero' : 'review-img-count';
    var content = r.content || '';
    var preview = content.length > 30 ? content.substring(0, 30) + '...' : content;

    var memberNick = '';
    if (r.members) memberNick = r.members.nickname || '';
    var kgName = '';
    if (r.kindergartens) kgName = r.kindergartens.name || '';
    var petName = '';
    if (r.pets) petName = r.pets.name || '';

    return '<tr>' +
      '<td>' + no + '</td>' +
      '<td>' + api.formatDate(r.written_at, true) + '</td>' +
      '<td>' + api.escapeHtml(memberNick) + '</td>' +
      '<td>' + api.escapeHtml(kgName) + '</td>' +
      '<td>' + api.escapeHtml(petName) + '</td>' +
      '<td>' + api.autoBadge(r.satisfaction) + '</td>' +
      '<td>' + (tagHtml || '-') + '</td>' +
      '<td><span class="review-content">' + api.escapeHtml(preview) + '</span></td>' +
      '<td><span class="' + imgClass + '">' + imgCount + '장</span></td>' +
      '<td>' + (r.reservation_id ? '<a href="reservation-detail.html?id=' + encodeURIComponent(r.reservation_id) + '" class="data-table__link">예약상세</a>' : '-') + '</td>' +
      '<td>' + api.renderDetailLink('review-detail.html', r.id) + '</td>' +
      '</tr>';
  }

  async function loadGuardianList(page) {
    gPage = page || 1;
    if (!g.body) return;
    var offset = (gPage - 1) * PER_PAGE;
    api.showTableLoading(g.body, 11);

    try {
      var rpcResult = await window.__supabase.rpc('search_guardian_reviews', buildGuardianRpcParams(gPage));

      if (rpcResult.error) {
        console.error('[reviews] guardian RPC error:', rpcResult.error);
        api.showTableEmpty(g.body, 11, '데이터 로드 실패: ' + (rpcResult.error.message || JSON.stringify(rpcResult.error)));
        return;
      }

      var result = parseGuardianRpcResult(rpcResult.data);
      var rows = result.data || [];
      var total = result.count || 0;

      if (g.resultCount) g.resultCount.textContent = api.formatNumber(total);

      if (!rows.length) {
        api.showTableEmpty(g.body, 11, '검색 결과가 없습니다.');
        if (g.pagination) g.pagination.innerHTML = '';
        return;
      }

      g.body.innerHTML = rows.map(function (r, i) { return renderGuardianRow(r, i, offset); }).join('');
      api.renderPagination(g.pagination, gPage, total, PER_PAGE, loadGuardianList);
    } catch (err) {
      console.error('[reviews] guardian list exception:', err);
      api.showTableEmpty(g.body, 11, '데이터를 불러오지 못했습니다.');
    }
  }

  // ── 유치원 후기 RPC 파라미터 조립 (search_kindergarten_reviews) ──
  function buildKgRpcParams(page, perPage) {
    var params = {
      p_date_from:      (k.dateFrom && k.dateFrom.value) ? k.dateFrom.value : null,
      p_date_to:        (k.dateTo && k.dateTo.value) ? k.dateTo.value : null,
      p_satisfaction:   (k.satisfaction && k.satisfaction.value) ? k.satisfaction.value : null,
      p_guardian_only:  (k.guardianOnly && k.guardianOnly.value) ? k.guardianOnly.value : null,
      p_search_type:    null,
      p_search_keyword: null,
      p_page:           page || 1,
      p_per_page:       perPage || PER_PAGE
    };

    if (k.searchInput && k.searchInput.value.trim()) {
      params.p_search_type = k.searchField ? k.searchField.value : '유치원명';
      params.p_search_keyword = k.searchInput.value.trim();
    }

    return params;
  }

  /** RPC 결과 파싱 (문자열 방어) */
  function parseKgRpcResult(raw) {
    if (!raw) return { data: [], count: 0 };
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch (e) { return { data: [], count: 0 }; }
    }
    return raw;
  }

  function renderKgRow(r, idx, offset) {
    var no = offset + idx + 1;
    var tags = (r.selected_tags || []);
    var tagHtml = '';
    var maxShow = 2;
    for (var i = 0; i < Math.min(tags.length, maxShow); i++) {
      tagHtml += '<span class="review-tag-pill">' + api.escapeHtml(tags[i]) + '</span>';
    }
    if (tags.length > maxShow) {
      tagHtml += '<span class="review-tag-more">+' + (tags.length - maxShow) + '</span>';
    }
    var content = r.content || '';
    var preview = content.length > 30 ? content.substring(0, 30) + '...' : content;
    var guardianOnly = r.is_guardian_only ? '전용' : '공개';

    var kgName = '';
    if (r.kindergartens) kgName = r.kindergartens.name || '';
    var memberNick = '';
    if (r.members) memberNick = r.members.nickname || '';
    var petName = '';
    if (r.pets) petName = r.pets.name || '';

    return '<tr>' +
      '<td>' + no + '</td>' +
      '<td>' + api.formatDate(r.written_at, true) + '</td>' +
      '<td>' + api.escapeHtml(kgName) + '</td>' +
      '<td>' + api.escapeHtml(memberNick) + '</td>' +
      '<td>' + api.escapeHtml(petName) + '</td>' +
      '<td>' + api.autoBadge(r.satisfaction) + '</td>' +
      '<td>' + (tagHtml || '-') + '</td>' +
      '<td><span class="review-content">' + api.escapeHtml(preview) + '</span></td>' +
      '<td>' + api.autoBadge(guardianOnly) + '</td>' +
      '<td>' + (r.reservation_id ? '<a href="reservation-detail.html?id=' + encodeURIComponent(r.reservation_id) + '" class="data-table__link">예약상세</a>' : '-') + '</td>' +
      '<td>' + api.renderDetailLink('review-kg-detail.html', r.id) + '</td>' +
      '</tr>';
  }

  async function loadKgList(page) {
    kPage = page || 1;
    if (!k.body) return;
    var offset = (kPage - 1) * PER_PAGE;
    api.showTableLoading(k.body, 11);

    try {
      var rpcResult = await window.__supabase.rpc('search_kindergarten_reviews', buildKgRpcParams(kPage));

      if (rpcResult.error) {
        console.error('[reviews] kg RPC error:', rpcResult.error);
        api.showTableEmpty(k.body, 11, '데이터 로드 실패: ' + (rpcResult.error.message || JSON.stringify(rpcResult.error)));
        return;
      }

      var result = parseKgRpcResult(rpcResult.data);
      var rows = result.data || [];
      var total = result.count || 0;

      if (k.resultCount) k.resultCount.textContent = api.formatNumber(total);

      if (!rows.length) {
        api.showTableEmpty(k.body, 11, '검색 결과가 없습니다.');
        if (k.pagination) k.pagination.innerHTML = '';
        return;
      }

      k.body.innerHTML = rows.map(function (r, i) { return renderKgRow(r, i, offset); }).join('');
      api.renderPagination(k.pagination, kPage, total, PER_PAGE, loadKgList);
    } catch (err) {
      console.error('[reviews] kg list exception:', err);
      api.showTableEmpty(k.body, 11, '데이터를 불러오지 못했습니다.');
    }
  }

  // ── 보호자 후기 기간 퀵버튼 이벤트 바인딩 ──
  function bindGuardianPeriodButtons() {
    var tab = document.getElementById('tab-guardian');
    if (!tab) return;
    var btns = tab.querySelectorAll('.filter-period-btn');

    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');

        var period = btn.getAttribute('data-period');
        var from = '';
        var to = '';

        if (period === 'all') {
          from = '';
          to = '';
        } else if (period === 'this-month') {
          var now = new Date();
          from = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
          var lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
          to = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
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

        if (g.dateFrom) g.dateFrom.value = from;
        if (g.dateTo) g.dateTo.value = to;
      });
    });

    // 날짜 입력 수동 변경 시 기간 버튼 active 해제
    [g.dateFrom, g.dateTo].forEach(function (el) {
      if (!el) return;
      el.addEventListener('change', function () {
        btns.forEach(function (b) { b.classList.remove('active'); });
      });
    });
  }

  // ── 목록 이벤트 바인딩 ──
  function bindListEvents() {
    // 보호자 후기 — 검색
    if (g.btnSearch) g.btnSearch.addEventListener('click', function () { loadGuardianList(1); });
    if (g.searchInput) g.searchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') loadGuardianList(1); });

    // 보호자 후기 — 초기화 (필터값만 리셋, 데이터테이블 갱신 안함)
    if (g.btnReset) g.btnReset.addEventListener('click', function () {
      if (window.__resetFilters) window.__resetFilters(gFilterBar);
      // 기간 버튼을 '전체'로 복원
      var tab = document.getElementById('tab-guardian');
      if (tab) {
        tab.querySelectorAll('.filter-period-btn').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-period') === 'all');
        });
      }
    });

    // 보호자 후기 — 엑셀 다운로드 (RPC 사용)
    if (g.btnExcel) g.btnExcel.addEventListener('click', function () {
      var params = buildGuardianRpcParams(1, 10000);
      window.__supabase.rpc('search_guardian_reviews', params).then(function (rpcResult) {
        if (rpcResult.error) { alert('다운로드 실패'); return; }
        var result = parseGuardianRpcResult(rpcResult.data);
        var rows = result.data || [];
        api.exportExcel(rows.map(function (r) {
          return {
            written_at: api.formatDate(r.written_at, true),
            nickname: r.members ? r.members.nickname : '',
            kg: r.kindergartens ? r.kindergartens.name : '',
            pet: r.pets ? r.pets.name : '',
            satisfaction: r.satisfaction,
            tags: (r.selected_tags || []).join(', '),
            content: r.content || ''
          };
        }), [
          { key: 'written_at', label: '작성일' }, { key: 'nickname', label: '보호자 닉네임' },
          { key: 'kg', label: '유치원명' }, { key: 'pet', label: '반려동물 이름' },
          { key: 'satisfaction', label: '만족도' }, { key: 'tags', label: '선택 태그' },
          { key: 'content', label: '내용' }
        ], '보호자후기');
      });
    });

    // 유치원 후기 — 검색
    if (k.btnSearch) k.btnSearch.addEventListener('click', function () { loadKgList(1); });
    if (k.searchInput) k.searchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') loadKgList(1); });

    // 유치원 후기 — 초기화 (필터값만 리셋, 데이터테이블 갱신 안함)
    if (k.btnReset) k.btnReset.addEventListener('click', function () {
      if (window.__resetFilters) window.__resetFilters(kFilterBar);
      // 기간 버튼을 '전체'로 복원
      var tab = document.getElementById('tab-kindergarten');
      if (tab) {
        tab.querySelectorAll('.filter-period-btn').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-period') === 'all');
        });
      }
    });

    // 유치원 후기 — 엑셀 다운로드 (RPC 사용)
    if (k.btnExcel) k.btnExcel.addEventListener('click', function () {
      var params = buildKgRpcParams(1, 10000);
      window.__supabase.rpc('search_kindergarten_reviews', params).then(function (rpcResult) {
        if (rpcResult.error) { alert('다운로드 실패'); return; }
        var result = parseKgRpcResult(rpcResult.data);
        var rows = result.data || [];
        api.exportExcel(rows.map(function (r) {
          return {
            written_at: api.formatDate(r.written_at, true),
            kg: r.kindergartens ? r.kindergartens.name : '',
            nickname: r.members ? r.members.nickname : '',
            pet: r.pets ? r.pets.name : '',
            satisfaction: r.satisfaction,
            tags: (r.selected_tags || []).join(', '),
            content: r.content || '',
            guardian_only: r.is_guardian_only ? '전용' : '공개'
          };
        }), [
          { key: 'written_at', label: '작성일' }, { key: 'kg', label: '유치원명' },
          { key: 'nickname', label: '보호자 닉네임' }, { key: 'pet', label: '반려동물 이름' },
          { key: 'satisfaction', label: '만족도' }, { key: 'tags', label: '선택 태그' },
          { key: 'content', label: '내용' }, { key: 'guardian_only', label: '보호자 전용' }
        ], '유치원후기');
      });
    });
  }

  // ── 유치원 후기 기간 퀵버튼 이벤트 바인딩 ──
  function bindKgPeriodButtons() {
    var tab = document.getElementById('tab-kindergarten');
    if (!tab) return;
    var btns = tab.querySelectorAll('.filter-period-btn');

    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');

        var period = btn.getAttribute('data-period');
        var from = '';
        var to = '';

        if (period === 'all') {
          from = '';
          to = '';
        } else if (period === 'this-month') {
          var now = new Date();
          from = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
          var lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
          to = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
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

        if (k.dateFrom) k.dateFrom.value = from;
        if (k.dateTo) k.dateTo.value = to;
      });
    });

    // 날짜 입력 수동 변경 시 기간 버튼 active 해제
    [k.dateFrom, k.dateTo].forEach(function (el) {
      if (!el) return;
      el.addEventListener('change', function () {
        btns.forEach(function (b) { b.classList.remove('active'); });
      });
    });
  }

  function initList() {
    cacheListDom();
    bindListEvents();
    bindGuardianPeriodButtons();
    bindKgPeriodButtons();
    api.hideIfReadOnly(PERM_KEY, ['.btn-action']);
    loadGuardianList(1);
    loadKgList(1);
  }

  // ══════════════════════════════════════════
  // B. 보호자 후기 상세 (review-detail.html)
  // ══════════════════════════════════════════

  function isGuardianDetailPage() {
    return !!document.getElementById('detailRevBasic');
  }

  async function loadGuardianDetail() {
    var id = api.getParam('id');
    if (!id) return;

    var result = await api.fetchDetail('guardian_reviews', id, '*, members:member_id(*), kindergartens:kindergarten_id(id, name, member_id, members:member_id(name)), pets:pet_id(id, name), reservations:reservation_id(id, checkin_scheduled, checkout_scheduled)');
    if (result.error || !result.data) { alert('후기 데이터를 불러올 수 없습니다.'); return; }
    var d = result.data;
    var m = d.members || {};
    var kg = d.kindergartens || {};
    var kgOwner = kg.members || {};
    var pet = d.pets || {};
    var res = d.reservations || {};

    // ① 기본정보
    var basicEl = document.getElementById('detailRevBasic');
    if (basicEl) {
      var tags = (d.selected_tags || []);
      var tagHtml = tags.map(function (t) { return '<span class="review-tag-pill">' + api.escapeHtml(t) + '</span>'; }).join('');
      var imgHtml = '';
      var imgs = d.image_urls || [];
      if (Array.isArray(imgs) && imgs.length > 0) {
        imgHtml = '<div class="photo-gallery">';
        for (var i = 0; i < imgs.length; i++) {
          imgHtml += '<div class="photo-gallery__item"><div class="photo-gallery__img" style="background:#e8e8e8;display:flex;align-items:center;justify-content:center;"><svg width="24" height="24" viewBox="0 0 24 24" fill="#bbb"><path d="M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div></div>';
        }
        imgHtml += '</div>';
      } else { imgHtml = '없음'; }

      api.setHtml(basicEl, '<div class="info-grid">' +
        '<span class="info-grid__label">후기 고유번호</span><span class="info-grid__value">' + api.escapeHtml(d.id) + '</span>' +
        '<span class="info-grid__label">작성일시</span><span class="info-grid__value">' + api.formatDate(d.written_at) + '</span>' +
        '<span class="info-grid__label">만족도</span><span class="info-grid__value">' + api.autoBadge(d.satisfaction) + '</span>' +
        '<span class="info-grid__label">선택 태그</span><span class="info-grid__value"><div class="review-tags-wrap">' + (tagHtml || '-') + '</div></span>' +
        '<span class="info-grid__label">후기 내용</span><span class="info-grid__value"><div class="review-full-content">' + api.escapeHtml(d.content) + '</div></span>' +
        '<span class="info-grid__label">첨부 이미지</span><span class="info-grid__value">' + imgHtml + '</span>' +
        '<span class="info-grid__label">숨김 여부</span><span class="info-grid__value">' + (d.is_hidden ? api.renderBadge('숨김', 'red') + ' (' + api.escapeHtml(d.hidden_reason || '') + ')' : api.renderBadge('노출중', 'green')) + '</span>' +
        '</div>');
    }

    // ② 작성자 정보
    var writerEl = document.getElementById('detailRevWriter');
    if (writerEl) {
      api.setHtml(writerEl, '<div class="info-grid">' +
        '<span class="info-grid__label">보호자 닉네임</span><span class="info-grid__value">' + api.escapeHtml(m.nickname || '') + '</span>' +
        '<span class="info-grid__label">보호자 이름</span><span class="info-grid__value">' + api.escapeHtml(m.name || '') + '</span>' +
        '<span class="info-grid__label">보호자 연락처</span><span class="info-grid__value"><span class="masked-field">' + api.renderMaskedField(api.maskPhone(m.phone), api.formatPhone(m.phone), 'guardian_reviews', id, 'phone') + '</span></span>' +
        '<span class="info-grid__label">회원번호</span><span class="info-grid__value"><a href="member-detail.html?id=' + (m.id || '') + '" class="info-grid__value--link">' + api.escapeHtml(m.id || '') + '</a></span>' +
        '</div>');
    }

    // ③ 대상 유치원
    var kgEl = document.getElementById('detailRevKg');
    if (kgEl) {
      api.setHtml(kgEl, '<div class="info-grid">' +
        '<span class="info-grid__label">유치원명</span><span class="info-grid__value">' + api.escapeHtml(kg.name || '') + '</span>' +
        '<span class="info-grid__label">운영자 성명</span><span class="info-grid__value">' + api.escapeHtml(kgOwner.name || '') + '</span>' +
        '<span class="info-grid__label">유치원번호</span><span class="info-grid__value"><a href="kindergarten-detail.html?id=' + (kg.id || '') + '" class="info-grid__value--link">' + api.escapeHtml(kg.id || '') + '</a></span>' +
        '</div>');
    }

    // ④ 관련 돌봄 정보
    var careEl = document.getElementById('detailRevCare');
    if (careEl) {
      api.setHtml(careEl, '<div class="info-grid">' +
        '<span class="info-grid__label">예약번호</span><span class="info-grid__value"><a href="reservation-detail.html?id=' + (res.id || '') + '" class="info-grid__value--link">' + api.escapeHtml(res.id || '') + '</a></span>' +
        '<span class="info-grid__label">등원일시</span><span class="info-grid__value">' + api.formatDate(res.checkin_scheduled) + '</span>' +
        '<span class="info-grid__label">하원일시</span><span class="info-grid__value">' + api.formatDate(res.checkout_scheduled) + '</span>' +
        '<span class="info-grid__label">반려동물명</span><span class="info-grid__value">' + api.escapeHtml(pet.name || '') + '</span>' +
        '<span class="info-grid__label">반려동물번호</span><span class="info-grid__value"><a href="pet-detail.html?id=' + (pet.id || '') + '" class="info-grid__value--link">' + api.escapeHtml(pet.id || '') + '</a></span>' +
        '</div>');
    }

    // 모달 바인딩 (숨김/숨김해제)
    bindHideModal('guardian_reviews', id);
  }

  // ══════════════════════════════════════════
  // C. 유치원 후기 상세 (review-kg-detail.html)
  // ══════════════════════════════════════════

  function isKgDetailPage() {
    return !!document.getElementById('detailKgRevBasic');
  }

  async function loadKgDetail() {
    var id = api.getParam('id');
    if (!id) return;

    var result = await api.fetchDetail('kindergarten_reviews', id, '*, kindergartens:kindergarten_id(id, name, member_id, members:member_id(name, phone)), pets:pet_id(id, name, breed, size_class), members:member_id(id, name, nickname), reservations:reservation_id(id, checkin_scheduled, checkout_scheduled)');
    if (result.error || !result.data) { alert('후기 데이터를 불러올 수 없습니다.'); return; }
    var d = result.data;
    var kg = d.kindergartens || {};
    var kgOwner = kg.members || {};
    var pet = d.pets || {};
    var guardian = d.members || {};
    var res = d.reservations || {};

    // ① 기본정보
    var basicEl = document.getElementById('detailKgRevBasic');
    if (basicEl) {
      var tags = (d.selected_tags || []);
      var tagHtml = tags.map(function (t) { return '<span class="review-tag-pill">' + api.escapeHtml(t) + '</span>'; }).join('');
      api.setHtml(basicEl, '<div class="info-grid">' +
        '<span class="info-grid__label">후기 고유번호</span><span class="info-grid__value">' + api.escapeHtml(d.id) + '</span>' +
        '<span class="info-grid__label">작성일시</span><span class="info-grid__value">' + api.formatDate(d.written_at) + '</span>' +
        '<span class="info-grid__label">만족도</span><span class="info-grid__value">' + api.autoBadge(d.satisfaction) + '</span>' +
        '<span class="info-grid__label">선택 태그</span><span class="info-grid__value"><div class="review-tags-wrap">' + (tagHtml || '-') + '</div></span>' +
        '<span class="info-grid__label">후기 내용</span><span class="info-grid__value"><div class="review-full-content">' + api.escapeHtml(d.content) + '</div></span>' +
        '<span class="info-grid__label">보호자 전용</span><span class="info-grid__value">' + api.autoBadge(d.is_guardian_only ? '전용' : '공개') + '</span>' +
        '<span class="info-grid__label">숨김 여부</span><span class="info-grid__value">' + (d.is_hidden ? api.renderBadge('숨김', 'red') + ' (' + api.escapeHtml(d.hidden_reason || '') + ')' : api.renderBadge('노출중', 'green')) + '</span>' +
        '</div>');
    }

    // ② 작성자 정보 (유치원)
    var writerEl = document.getElementById('detailKgRevWriter');
    if (writerEl) {
      api.setHtml(writerEl, '<div class="info-grid">' +
        '<span class="info-grid__label">유치원명</span><span class="info-grid__value">' + api.escapeHtml(kg.name || '') + '</span>' +
        '<span class="info-grid__label">운영자 성명</span><span class="info-grid__value">' + api.escapeHtml(kgOwner.name || '') + '</span>' +
        '<span class="info-grid__label">운영자 연락처</span><span class="info-grid__value"><span class="masked-field">' + api.renderMaskedField(api.maskPhone(kgOwner.phone), api.formatPhone(kgOwner.phone), 'kindergarten_reviews', id, 'phone') + '</span></span>' +
        '<span class="info-grid__label">유치원번호</span><span class="info-grid__value"><a href="kindergarten-detail.html?id=' + (kg.id || '') + '" class="info-grid__value--link">' + api.escapeHtml(kg.id || '') + '</a></span>' +
        '</div>');
    }

    // ③ 대상 반려동물
    var petEl = document.getElementById('detailKgRevPet');
    if (petEl) {
      api.setHtml(petEl, '<div class="info-grid">' +
        '<span class="info-grid__label">반려동물명</span><span class="info-grid__value">' + api.escapeHtml(pet.name || '') + '</span>' +
        '<span class="info-grid__label">견종</span><span class="info-grid__value">' + api.escapeHtml(pet.breed || '') + '</span>' +
        '<span class="info-grid__label">크기 구분</span><span class="info-grid__value">' + api.escapeHtml(pet.size_class || '') + '</span>' +
        '<span class="info-grid__label">반려동물번호</span><span class="info-grid__value"><a href="pet-detail.html?id=' + (pet.id || '') + '" class="info-grid__value--link">' + api.escapeHtml(pet.id || '') + '</a></span>' +
        '</div>');
    }

    // ④ 대상 보호자
    var guardianEl = document.getElementById('detailKgRevGuardian');
    if (guardianEl) {
      api.setHtml(guardianEl, '<div class="info-grid">' +
        '<span class="info-grid__label">보호자 닉네임</span><span class="info-grid__value">' + api.escapeHtml(guardian.nickname || '') + '</span>' +
        '<span class="info-grid__label">보호자 이름</span><span class="info-grid__value">' + api.escapeHtml(guardian.name || '') + '</span>' +
        '<span class="info-grid__label">회원번호</span><span class="info-grid__value"><a href="member-detail.html?id=' + (guardian.id || '') + '" class="info-grid__value--link">' + api.escapeHtml(guardian.id || '') + '</a></span>' +
        '</div>');
    }

    // ⑤ 관련 돌봄 정보
    var careEl = document.getElementById('detailKgRevCare');
    if (careEl) {
      api.setHtml(careEl, '<div class="info-grid">' +
        '<span class="info-grid__label">예약번호</span><span class="info-grid__value"><a href="reservation-detail.html?id=' + (res.id || '') + '" class="info-grid__value--link">' + api.escapeHtml(res.id || '') + '</a></span>' +
        '<span class="info-grid__label">등원일시</span><span class="info-grid__value">' + api.formatDate(res.checkin_scheduled) + '</span>' +
        '<span class="info-grid__label">하원일시</span><span class="info-grid__value">' + api.formatDate(res.checkout_scheduled) + '</span>' +
        '</div>');
    }

    bindHideModal('kindergarten_reviews', id);
  }

  // ══════════════════════════════════════════
  // D. 공통 — 숨김/숨김해제 모달
  // ══════════════════════════════════════════

  function bindHideModal(table, id) {
    var hideBtn = document.getElementById('hideBtn');
    var hideReason = document.getElementById('hideReason');
    if (hideBtn) {
      hideBtn.addEventListener('click', async function () {
        var reason = hideReason ? hideReason.value.trim() : '';
        if (!reason) return;
        await api.updateRecord(table, id, { is_hidden: true, hidden_reason: reason, hidden_at: new Date().toISOString() });
        await api.insertAuditLog('후기숨김', table, id, { reason: reason });
        alert('숨김 처리되었습니다.');
        location.reload();
      });
    }

    var unhideBtn = document.querySelector('#unhideModal .modal__btn--confirm-primary');
    if (unhideBtn) {
      unhideBtn.addEventListener('click', async function () {
        await api.updateRecord(table, id, { is_hidden: false, hidden_reason: null, hidden_at: null });
        await api.insertAuditLog('후기숨김해제', table, id, {});
        alert('숨김 해제되었습니다.');
        location.reload();
      });
    }

    api.hideIfReadOnly(PERM_KEY, ['.btn-action']);
  }

  // ══════════════════════════════════════════
  // 초기화
  // ══════════════════════════════════════════

  document.addEventListener('DOMContentLoaded', function () {
    if (isListPage()) initList();
    else if (isGuardianDetailPage()) loadGuardianDetail();
    else if (isKgDetailPage()) loadKgDetail();
  });

})();
