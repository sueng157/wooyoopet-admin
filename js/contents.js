/**
 * 우유펫 관리자 대시보드 — 콘텐츠관리 (contents.js)
 *
 * 목록 (contents.html — 4 tabs) + 배너/공지/FAQ/약관 상세·등록
 * 의존: api.js, auth.js, common.js
 */
(function () {
  'use strict';

  var api = window.__api;
  var auth = window.__auth;
  if (!api || !auth) return;

  var PERM_KEY = 'perm_contents';
  var PER_PAGE = 20;

  // ══════════════════════════════════════════
  // A. 목록 페이지 (contents.html)
  // ══════════════════════════════════════════

  function isListPage() {
    return !!document.getElementById('bannerListBody');
  }

  var bannerBody, noticeBody, faqBody, termsBody;
  var bannerCount, noticeCount, faqCount, termsCount;
  var bPage = 1, nPage = 1, fPage = 1, tPage = 1;

  // 배너 탭 전용 DOM 캐시
  var b = {};
  var bFilterBar;

  // 공지사항 탭 전용 DOM 캐시
  var n = {};
  var nFilterBar;

  // FAQ 탭 전용 DOM 캐시
  var f = {};
  var fFilterBar;

  function cacheListDom() {
    bannerBody = document.getElementById('bannerListBody');
    noticeBody = document.getElementById('noticeListBody');
    faqBody = document.getElementById('faqListBody');
    termsBody = document.getElementById('termsListBody');

    var tabs = ['tab-banner', 'tab-notice', 'tab-faq', 'tab-terms'];
    var counts = [null, null, null, null];
    for (var i = 0; i < tabs.length; i++) {
      var tab = document.getElementById(tabs[i]);
      if (tab) counts[i] = tab.querySelector('.result-header__count strong');
    }
    bannerCount = counts[0]; noticeCount = counts[1]; faqCount = counts[2]; termsCount = counts[3];

    // 배너 탭 전용 DOM 캐시
    var bTab = document.getElementById('tab-banner');
    if (bTab) {
      bFilterBar     = bTab.querySelector('.filter-bar');
      b.dateType     = document.getElementById('bDateType');
      b.dateFrom     = document.getElementById('bDateFrom');
      b.dateTo       = document.getElementById('bDateTo');
      b.position     = document.getElementById('bPosition');
      b.exposure     = document.getElementById('bExposure');
      b.public       = document.getElementById('bPublic');
      b.searchField  = document.getElementById('bSearchField');
      b.searchInput  = document.getElementById('bSearchInput');
      b.btnReset     = document.getElementById('bBtnReset');
      b.btnSearch    = document.getElementById('bBtnSearch');
      b.btnExcel     = bTab.querySelector('.btn-excel');
    }

    // 공지사항 탭 전용 DOM 캐시
    var nTab = document.getElementById('tab-notice');
    if (nTab) {
      nFilterBar      = nTab.querySelector('.filter-bar');
      n.dateType      = document.getElementById('nDateType');
      n.dateFrom      = document.getElementById('nDateFrom');
      n.dateTo        = document.getElementById('nDateTo');
      n.target        = document.getElementById('nTarget');
      n.public        = document.getElementById('nPublic');
      n.searchField   = document.getElementById('nSearchField');
      n.searchInput   = document.getElementById('nSearchInput');
      n.btnReset      = document.getElementById('nBtnReset');
      n.btnSearch     = document.getElementById('nBtnSearch');
      n.btnExcel      = nTab.querySelector('.btn-excel');
    }

    // FAQ 탭 전용 DOM 캐시
    var fTab = document.getElementById('tab-faq');
    if (fTab) {
      fFilterBar      = fTab.querySelector('.filter-bar');
      f.category      = document.getElementById('fCategory');
      f.target        = document.getElementById('fTarget');
      f.public        = document.getElementById('fPublic');
      f.searchField   = document.getElementById('fSearchField');
      f.searchInput   = document.getElementById('fSearchInput');
      f.btnReset      = document.getElementById('fBtnReset');
      f.btnSearch     = document.getElementById('fBtnSearch');
      f.btnExcel      = fTab.querySelector('.btn-excel');
    }
  }

  // ── 노출상태 계산 (공개 + 날짜 기반) ──
  function calcExposureStatus(row) {
    if (row.visibility === '비공개') return '—';
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var s = row.start_date ? new Date(row.start_date) : null;
    var e = row.end_date ? new Date(row.end_date) : null;
    if (s) s.setHours(0, 0, 0, 0);
    if (e) e.setHours(0, 0, 0, 0);
    if (s && today < s) return '예정';
    if (e && today > e) return '종료';
    return '노출중';
  }

  function exposureBadge(status) {
    if (status === '노출중') return '<span class="badge badge--c-green">노출중</span>';
    if (status === '예정')   return '<span class="badge badge--c-blue">예정</span>';
    if (status === '종료')   return '<span class="badge badge--c-gray">종료</span>';
    return '<span style="color:var(--text-weak);">—</span>';
  }

  function publicBadge(visibility) {
    if (visibility === '비공개') return '<span class="badge badge--c-gray">비공개</span>';
    return '<span class="badge badge--c-green">공개</span>';
  }

  // ── 배너 ──
  async function loadBannerList() {
    if (!bannerBody) return;
    api.showTableLoading(bannerBody, 12);
    var tab = document.getElementById('tab-banner');

    // 필터 조건 조립 (배너 전용)
    var filters = [];
    var dateCol = (b.dateType && b.dateType.value) ? b.dateType.value : 'created_at';
    if (b.dateFrom && b.dateFrom.value) {
      filters.push({ column: dateCol, op: 'gte', value: b.dateFrom.value + 'T00:00:00' });
    }
    if (b.dateTo && b.dateTo.value) {
      filters.push({ column: dateCol, op: 'lte', value: b.dateTo.value + 'T23:59:59' });
    }
    if (b.position && b.position.value) {
      filters.push({ column: 'display_position', op: 'eq', value: b.position.value });
    }
    // 공개상태 필터
    if (b.public && b.public.value) {
      filters.push({ column: 'visibility', op: 'eq', value: b.public.value });
    }
    // 노출상태 필터: 서버에서 직접 필터 불가 — 공개 + 날짜 조건으로 근사 처리
    var exposureFilter = (b.exposure && b.exposure.value) ? b.exposure.value : '';
    if (exposureFilter) {
      // 노출상태는 공개인 항목만 의미 있음
      filters.push({ column: 'visibility', op: 'eq', value: '공개' });
      var todayStr = api.getToday();
      if (exposureFilter === '예정') {
        filters.push({ column: 'start_date', op: 'gt', value: todayStr + 'T23:59:59' });
      } else if (exposureFilter === '노출중') {
        filters.push({ column: 'start_date', op: 'lte', value: todayStr + 'T23:59:59' });
        filters.push({ column: 'end_date', op: 'gte', value: todayStr + 'T00:00:00' });
      } else if (exposureFilter === '종료') {
        filters.push({ column: 'end_date', op: 'lt', value: todayStr + 'T00:00:00' });
      }
    }
    var searchOpts = {};
    if (b.searchInput && b.searchInput.value.trim()) {
      searchOpts = { column: 'title', value: b.searchInput.value.trim() };
    }

    var result = await api.fetchList('banners', {
      filters: filters,
      search: searchOpts,
      orderBy: 'created_at', page: bPage, perPage: PER_PAGE
    });
    if (result.error) { api.showTableEmpty(bannerBody, 12, '데이터 로드 실패'); return; }
    if (bannerCount) bannerCount.textContent = api.formatNumber(result.count);
    if (!result.data.length) { api.showTableEmpty(bannerBody, 12); return; }

    var html = '';
    var start = (bPage - 1) * PER_PAGE;
    for (var i = 0; i < result.data.length; i++) {
      var row = result.data[i];
      var imgHtml;
      if (row.image_url) {
        imgHtml = '<div class="cnt-thumb"><img src="' + api.escapeHtml(row.image_url) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;"></div>';
      } else {
        imgHtml = '<div class="cnt-thumb"><div class="cnt-thumb__placeholder">360\u00d7100</div></div>';
      }
      var expStatus = calcExposureStatus(row);

      html += '<tr data-id="' + row.id + '">' +
        '<td>' + (start + i + 1) + '</td>' +
        '<td>' + api.escapeHtml(row.title) + '</td>' +
        '<td>' + imgHtml + '</td>' +
        '<td class="cnt-link-cell">' + api.escapeHtml(row.link_url || '') + '</td>' +
        '<td>' + api.escapeHtml(row.display_position || '') + '</td>' +
        '<td>' + (row.display_order || '-') + '</td>' +
        '<td>' + api.formatDate(row.start_date, true) + '</td>' +
        '<td>' + api.formatDate(row.end_date, true) + '</td>' +
        '<td>' + exposureBadge(expStatus) + '</td>' +
        '<td>' + publicBadge(row.visibility) + '</td>' +
        '<td>' + api.formatDate(row.created_at) + '</td>' +
        '<td>' + api.renderDetailLink('content-banner-detail.html', row.id) + '</td>' +
        '</tr>';
    }
    bannerBody.innerHTML = html;
    var pagination = tab ? tab.querySelector('.pagination') : null;
    if (pagination) api.renderPagination(pagination, bPage, result.count, PER_PAGE, function (p) { bPage = p; loadBannerList(); });
  }

  // ── 공지사항 ──
  async function loadNoticeList() {
    if (!noticeBody) return;
    api.showTableLoading(noticeBody, 9);
    var tab = document.getElementById('tab-notice');

    // 필터 조건 조립 (공지사항 전용)
    var filters = [];
    var dateCol = (n.dateType && n.dateType.value) ? n.dateType.value : 'created_at';
    if (n.dateFrom && n.dateFrom.value) {
      filters.push({ column: dateCol, op: 'gte', value: n.dateFrom.value + 'T00:00:00' });
    }
    if (n.dateTo && n.dateTo.value) {
      filters.push({ column: dateCol, op: 'lte', value: n.dateTo.value + 'T23:59:59' });
    }
    if (n.target && n.target.value) {
      filters.push({ column: 'target', op: 'eq', value: n.target.value });
    }
    if (n.public && n.public.value) {
      filters.push({ column: 'visibility', op: 'eq', value: n.public.value });
    }
    var searchOpts = {};
    if (n.searchInput && n.searchInput.value.trim()) {
      var searchCol = (n.searchField && n.searchField.value) ? n.searchField.value : 'title';
      searchOpts = { column: searchCol, value: n.searchInput.value.trim() };
    }

    var result = await api.fetchList('notices', {
      filters: filters,
      search: searchOpts,
      orderBy: 'created_at', page: nPage, perPage: PER_PAGE
    });
    if (result.error) { api.showTableEmpty(noticeBody, 9, '데이터 로드 실패'); return; }
    if (noticeCount) noticeCount.textContent = api.formatNumber(result.count);
    if (!result.data.length) { api.showTableEmpty(noticeBody, 9); return; }

    var html = '';
    var start = (nPage - 1) * PER_PAGE;
    for (var i = 0; i < result.data.length; i++) {
      var row = result.data[i];
      html += '<tr>' +
        '<td>' + (start + i + 1) + '</td>' +
        '<td>' + api.escapeHtml(row.title) + '</td>' +
        '<td>' + api.autoBadge(row.target || '') + '</td>' +
        '<td>' + (row.is_pinned ? '<span style="color:var(--danger);font-weight:600;">고정</span>' : '-') + '</td>' +
        '<td>' + api.autoBadge(row.visibility === '공개' ? '공개' : '비공개') + '</td>' +
        '<td>' + (row.view_count || 0) + '</td>' +
        '<td>' + api.formatDate(row.created_at) + '</td>' +
        '<td>' + api.formatDate(row.updated_at) + '</td>' +
        '<td>' + api.renderDetailLink('content-notice-detail.html', row.id) + '</td>' +
        '</tr>';
    }
    noticeBody.innerHTML = html;
    var pagination = tab ? tab.querySelector('.pagination') : null;
    if (pagination) api.renderPagination(pagination, nPage, result.count, PER_PAGE, function (p) { nPage = p; loadNoticeList(); });
  }

  // ── FAQ ──
  async function loadFaqList() {
    if (!faqBody) return;
    api.showTableLoading(faqBody, 9);
    var tab = document.getElementById('tab-faq');

    // 필터 조건 조립 (FAQ 전용)
    var filters = [];
    if (f.category && f.category.value) {
      filters.push({ column: 'category', op: 'eq', value: f.category.value });
    }
    if (f.target && f.target.value) {
      filters.push({ column: 'target', op: 'eq', value: f.target.value });
    }
    if (f.public && f.public.value) {
      filters.push({ column: 'visibility', op: 'eq', value: f.public.value });
    }
    var searchOpts = {};
    if (f.searchInput && f.searchInput.value.trim()) {
      searchOpts = { column: 'question', value: f.searchInput.value.trim() };
    }

    var result = await api.fetchList('faqs', {
      filters: filters,
      search: searchOpts,
      orderBy: 'created_at', page: fPage, perPage: PER_PAGE
    });
    if (result.error) { api.showTableEmpty(faqBody, 9, '데이터 로드 실패'); return; }
    if (faqCount) faqCount.textContent = api.formatNumber(result.count);
    if (!result.data.length) { api.showTableEmpty(faqBody, 9); return; }

    var html = '';
    var start = (fPage - 1) * PER_PAGE;
    for (var i = 0; i < result.data.length; i++) {
      var row = result.data[i];
      html += '<tr>' +
        '<td>' + (start + i + 1) + '</td>' +
        '<td>' + api.escapeHtml(row.category || '') + '</td>' +
        '<td>' + api.escapeHtml(row.question || '') + '</td>' +
        '<td>' + api.autoBadge(row.target || '') + '</td>' +
        '<td>' + (row.display_order || '-') + '</td>' +
        '<td>' + api.autoBadge(row.visibility || '') + '</td>' +
        '<td>' + api.formatDate(row.created_at) + '</td>' +
        '<td>' + api.formatDate(row.updated_at) + '</td>' +
        '<td>' + api.renderDetailLink('content-faq-detail.html', row.id) + '</td>' +
        '</tr>';
    }
    faqBody.innerHTML = html;
    var pagination = tab ? tab.querySelector('.pagination') : null;
    if (pagination) api.renderPagination(pagination, fPage, result.count, PER_PAGE, function (p) { fPage = p; loadFaqList(); });
  }

  // ── 약관 ──
  async function loadTermsList() {
    if (!termsBody) return;
    api.showTableLoading(termsBody, 8);
    var tab = document.getElementById('tab-terms');

    var result = await api.fetchList('terms', {
      orderBy: 'created_at', page: tPage, perPage: PER_PAGE
    });
    if (result.error) { api.showTableEmpty(termsBody, 8, '데이터 로드 실패'); return; }
    if (termsCount) termsCount.textContent = api.formatNumber(result.count);
    if (!result.data.length) { api.showTableEmpty(termsBody, 8); return; }

    var html = '';
    for (var i = 0; i < result.data.length; i++) {
      var t = result.data[i];
      var start = (tPage - 1) * PER_PAGE;
      html += '<tr>' +
        '<td>' + (start + i + 1) + '</td>' +
        '<td>' + api.escapeHtml(t.title) + '</td>' +
        '<td>' + (t.is_required ? '<span style="color:var(--danger);">필수</span>' : '선택') + '</td>' +
        '<td>' + api.escapeHtml(t.current_version || '') + '</td>' +
        '<td>' + api.formatDate(t.effective_date, true) + '</td>' +
        '<td>' + api.autoBadge(t.visibility === '공개' ? '공개' : '비공개') + '</td>' +
        '<td>' + api.formatDate(t.created_at) + '</td>' +
        '<td>' + api.renderDetailLink('content-terms-detail.html', t.id) + '</td>' +
        '</tr>';
    }
    termsBody.innerHTML = html;
    var pagination = tab ? tab.querySelector('.pagination') : null;
    if (pagination) api.renderPagination(pagination, tPage, result.count, PER_PAGE, function (p) { tPage = p; loadTermsList(); });
  }

  // ── 탭 공통 필터 ──
  function buildTabFilters(tab, dateCol) {
    var filters = [];
    if (!tab) return filters;
    var dates = tab.querySelectorAll('.filter-input--date');
    if (dates[0] && dates[0].value) filters.push({ column: dateCol, op: 'gte', value: dates[0].value + 'T00:00:00' });
    if (dates[1] && dates[1].value) filters.push({ column: dateCol, op: 'lte', value: dates[1].value + 'T23:59:59' });
    var sels = tab.querySelectorAll('.filter-select');
    if (sels.length > 0) {
      var v = sels[0].value;
      if (v && !v.includes('전체') && !v.includes(':')) {
        var col = dateCol === 'start_date' ? 'visibility' : (sels[0].closest('.filter-row') ? 'visibility' : 'visibility');
        filters.push({ column: col, op: 'eq', value: v });
      }
    }
    return filters;
  }

  // ── 탭별 엑셀 다운로드 ──
  async function excelForTab(tabName) {
    var cfg = {
      'tab-banner': {
        table: 'banners', orderBy: 'created_at', dateCol: 'created_at',
        map: function (r) {
          return {
            title: r.title || '',
            link_url: r.link_url || '',
            display_position: r.display_position || '',
            display_order: r.display_order || '',
            start_date: api.formatDate(r.start_date, true),
            end_date: api.formatDate(r.end_date, true),
            exposure: calcExposureStatus(r),
            visibility: r.visibility || '',
            created_at: api.formatDate(r.created_at)
          };
        },
        headers: [
          { key: 'title', label: '배너 제목' },
          { key: 'link_url', label: '연결 링크' },
          { key: 'display_position', label: '표시 위치' },
          { key: 'display_order', label: '노출순서' },
          { key: 'start_date', label: '노출 시작일' },
          { key: 'end_date', label: '노출 종료일' },
          { key: 'exposure', label: '노출상태' },
          { key: 'visibility', label: '공개상태' },
          { key: 'created_at', label: '등록일' }
        ],
        filename: '배너'
      },
      'tab-notice': {
        table: 'notices', orderBy: 'created_at', dateCol: 'created_at',
        map: function (row) {
          return {
            title: row.title || '',
            target: row.target || '',
            pinned: row.is_pinned ? '고정' : '-',
            visibility: row.visibility || '',
            views: row.view_count || 0,
            created: api.formatDate(row.created_at),
            updated: api.formatDate(row.updated_at)
          };
        },
        headers: [
          { key: 'title', label: '공지제목' },
          { key: 'target', label: '대상' },
          { key: 'pinned', label: '상단고정' },
          { key: 'visibility', label: '공개상태' },
          { key: 'views', label: '조회수' },
          { key: 'created', label: '등록일' },
          { key: 'updated', label: '수정일' }
        ],
        filename: '공지사항'
      },
      'tab-faq': {
        table: 'faqs', orderBy: 'created_at', dateCol: 'created_at',
        map: function (row) {
          return {
            category: row.category || '',
            question: row.question || '',
            target: row.target || '',
            order: row.display_order || 0,
            visibility: row.visibility || '',
            created: api.formatDate(row.created_at),
            updated: api.formatDate(row.updated_at)
          };
        },
        headers: [
          { key: 'category', label: '카테고리' },
          { key: 'question', label: '질문' },
          { key: 'target', label: '대상' },
          { key: 'order', label: '순서' },
          { key: 'visibility', label: '공개상태' },
          { key: 'created', label: '등록일' },
          { key: 'updated', label: '수정일' }
        ],
        filename: 'FAQ'
      }
    };
    var c = cfg[tabName];
    if (!c) { alert('이 탭은 엑셀 다운로드를 지원하지 않습니다.'); return; }
    var tab = document.getElementById(tabName);

    // 탭별 전용 필터 사용
    var filters;
    if (tabName === 'tab-banner') {
      filters = [];
      var dateCol = (b.dateType && b.dateType.value) ? b.dateType.value : 'created_at';
      if (b.dateFrom && b.dateFrom.value) filters.push({ column: dateCol, op: 'gte', value: b.dateFrom.value + 'T00:00:00' });
      if (b.dateTo && b.dateTo.value) filters.push({ column: dateCol, op: 'lte', value: b.dateTo.value + 'T23:59:59' });
      if (b.position && b.position.value) filters.push({ column: 'display_position', op: 'eq', value: b.position.value });
      if (b.public && b.public.value) filters.push({ column: 'visibility', op: 'eq', value: b.public.value });
    } else if (tabName === 'tab-notice') {
      filters = [];
      var dateCol = (n.dateType && n.dateType.value) ? n.dateType.value : 'created_at';
      if (n.dateFrom && n.dateFrom.value) filters.push({ column: dateCol, op: 'gte', value: n.dateFrom.value + 'T00:00:00' });
      if (n.dateTo && n.dateTo.value) filters.push({ column: dateCol, op: 'lte', value: n.dateTo.value + 'T23:59:59' });
      if (n.target && n.target.value) filters.push({ column: 'target', op: 'eq', value: n.target.value });
      if (n.public && n.public.value) filters.push({ column: 'visibility', op: 'eq', value: n.public.value });
    } else if (tabName === 'tab-faq') {
      filters = [];
      if (f.category && f.category.value) filters.push({ column: 'category', op: 'eq', value: f.category.value });
      if (f.target && f.target.value) filters.push({ column: 'target', op: 'eq', value: f.target.value });
      if (f.public && f.public.value) filters.push({ column: 'visibility', op: 'eq', value: f.public.value });
    } else {
      filters = buildTabFilters(tab, c.dateCol);
    }

    var fetchOpts = { filters: filters, orderBy: c.orderBy };
    if (c.ascending !== undefined) fetchOpts.ascending = c.ascending;
    if (tabName === 'tab-banner' && b.searchInput && b.searchInput.value.trim()) {
      fetchOpts.search = { column: 'title', value: b.searchInput.value.trim() };
    } else if (tabName === 'tab-notice' && n.searchInput && n.searchInput.value.trim()) {
      var searchCol = (n.searchField && n.searchField.value) ? n.searchField.value : 'title';
      fetchOpts.search = { column: searchCol, value: n.searchInput.value.trim() };
    } else if (tabName === 'tab-faq' && f.searchInput && f.searchInput.value.trim()) {
      fetchOpts.search = { column: 'question', value: f.searchInput.value.trim() };
    }
    var all = await api.fetchAll(c.table, fetchOpts);
    var rows = (all.data || []).map(c.map);
    api.exportExcel(rows, c.headers, c.filename);
  }

  function bindListEvents() {
    // ── 배너 탭 전용 이벤트 ──
    var bannerTab = document.getElementById('tab-banner');
    if (bannerTab) {
      // 검색 버튼
      if (b.btnSearch) b.btnSearch.addEventListener('click', function () { bPage = 1; loadBannerList(); });
      // 검색어 Enter 키
      if (b.searchInput) b.searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { bPage = 1; loadBannerList(); }
      });
      // 초기화 버튼: 필터값만 리셋, 데이터테이블 갱신 안함
      if (b.btnReset) b.btnReset.addEventListener('click', function () {
        if (window.__resetFilters) window.__resetFilters(bFilterBar);
        // 기간 퀵버튼을 '전체'로 복원
        bannerTab.querySelectorAll('.filter-period-btn').forEach(function (btn) {
          btn.classList.toggle('active', btn.getAttribute('data-period') === 'all');
        });
      });
      // 노출상태 변경 → 공개상태 자동 설정 ('전체' 외 선택 시 공개로)
      if (b.exposure) b.exposure.addEventListener('change', function () {
        if (b.exposure.value && b.public) b.public.value = '공개';
      });
      // 공개상태 '비공개' 선택 → 노출상태 '전체'로 초기화
      if (b.public) b.public.addEventListener('change', function () {
        if (b.public.value === '비공개' && b.exposure) b.exposure.value = '';
      });
      // 엑셀 다운로드
      if (b.btnExcel) b.btnExcel.addEventListener('click', function () {
        excelForTab('tab-banner');
      });

      // 기간 퀵버튼 (reviews.js bindGuardianPeriodButtons 동일 패턴)
      var periodBtns = bannerTab.querySelectorAll('.filter-period-btn');
      periodBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          periodBtns.forEach(function (pb) { pb.classList.remove('active'); });
          btn.classList.add('active');

          var period = btn.getAttribute('data-period');
          var from = '';
          var to = '';

          if (period === 'all') {
            from = ''; to = '';
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

          if (b.dateFrom) b.dateFrom.value = from;
          if (b.dateTo) b.dateTo.value = to;
        });
      });

      // 날짜 input 수동 변경 시 기간 퀵버튼 active 해제
      [b.dateFrom, b.dateTo].forEach(function (el) {
        if (!el) return;
        el.addEventListener('change', function () {
          periodBtns.forEach(function (pb) { pb.classList.remove('active'); });
        });
      });
    }

    // ── 공지사항 탭 전용 이벤트 ──
    var noticeTab = document.getElementById('tab-notice');
    if (noticeTab) {
      // 검색 버튼
      if (n.btnSearch) n.btnSearch.addEventListener('click', function () { nPage = 1; loadNoticeList(); });
      // 검색어 Enter 키
      if (n.searchInput) n.searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { nPage = 1; loadNoticeList(); }
      });
      // 초기화 버튼: 필터값만 리셋, 데이터테이블 갱신 안함
      if (n.btnReset) n.btnReset.addEventListener('click', function () {
        if (window.__resetFilters) window.__resetFilters(nFilterBar);
        // 기간 퀵버튼을 '전체'로 복원
        noticeTab.querySelectorAll('.filter-period-btn').forEach(function (btn) {
          btn.classList.toggle('active', btn.getAttribute('data-period') === 'all');
        });
      });
      // 엑셀 다운로드
      if (n.btnExcel) n.btnExcel.addEventListener('click', function () {
        excelForTab('tab-notice');
      });

      // 기간 퀵버튼 (배너 탭과 동일 패턴)
      var nPeriodBtns = noticeTab.querySelectorAll('.filter-period-btn');
      nPeriodBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          nPeriodBtns.forEach(function (pb) { pb.classList.remove('active'); });
          btn.classList.add('active');

          var period = btn.getAttribute('data-period');
          var from = '';
          var to = '';

          if (period === 'all') {
            from = ''; to = '';
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

          if (n.dateFrom) n.dateFrom.value = from;
          if (n.dateTo) n.dateTo.value = to;
        });
      });

      // 날짜 input 수동 변경 시 기간 퀵버튼 active 해제
      [n.dateFrom, n.dateTo].forEach(function (el) {
        if (!el) return;
        el.addEventListener('change', function () {
          nPeriodBtns.forEach(function (pb) { pb.classList.remove('active'); });
        });
      });
    }

    // ── FAQ 탭 전용 이벤트 ──
    var faqTab = document.getElementById('tab-faq');
    if (faqTab) {
      if (f.btnSearch) f.btnSearch.addEventListener('click', function () { fPage = 1; loadFaqList(); });
      if (f.searchInput) f.searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { fPage = 1; loadFaqList(); }
      });
      if (f.btnReset) f.btnReset.addEventListener('click', function () {
        if (window.__resetFilters) window.__resetFilters(fFilterBar);
      });
      if (f.btnExcel) f.btnExcel.addEventListener('click', function () {
        excelForTab('tab-faq');
      });
    }

    // ── 나머지 탭(약관) — 기존 로직 유지 ──
    var tabs = ['tab-terms'];
    var loaders = [loadTermsList];
    var pageResets = [function () { tPage = 1; }];

    for (var i = 0; i < tabs.length; i++) {
      var tab = document.getElementById(tabs[i]);
      if (!tab) continue;
      (function (t, tName, load, resetPage) {
        var btnSearch = t.querySelector('.btn-search');
        if (btnSearch) btnSearch.addEventListener('click', function () { resetPage(); load(); });
        var searchInput = t.querySelector('.filter-input--search');
        if (searchInput) searchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { resetPage(); load(); } });
        var btnExcel = t.querySelector('.btn-excel');
        if (btnExcel) btnExcel.addEventListener('click', async function () {
          excelForTab(tName);
        });
      })(tab, tabs[i], loaders[i], pageResets[i]);
    }
  }

  function initList() {
    cacheListDom();
    bindListEvents();
    api.hideIfReadOnly(PERM_KEY, ['.btn-action', '.btn-add-new']);
    loadBannerList();
    loadNoticeList();
    loadFaqList();
    loadTermsList();
  }

  // ══════════════════════════════════════════
  // B. 배너 상세 (content-banner-detail.html)
  // ══════════════════════════════════════════

  function isBannerDetailPage() {
    return !!document.getElementById('detailBannerBasic') && !!document.getElementById('viewDetail');
  }

  /* ── 보기/편집 모드 전환 (배너 상세) ── */
  function toggleBannerViewEdit(isViewMode) {
    var pairs = [['viewBasic', 'editBasic'], ['viewDetail', 'editDetail']];
    for (var i = 0; i < pairs.length; i++) {
      var vEl = document.getElementById(pairs[i][0]);
      var eEl = document.getElementById(pairs[i][1]);
      if (vEl) vEl.style.display = isViewMode ? '' : 'none';
      if (eEl) eEl.style.display = isViewMode ? 'none' : '';
    }
  }

  /* ── 배너 이미지 플레이스홀더 ── */
  var BANNER_DETAIL_PLACEHOLDER =
    '<div class="edu-img-preview__placeholder">' +
    '<svg viewBox="0 0 24 24"><path d="M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>' +
    '360 \u00d7 100px</div>';

  /* ── 상세 페이지 메인 로드 ── */
  async function loadBannerDetail() {
    var id = api.getParam('id');
    if (!id) return;

    var result = await api.fetchDetail('banners', id);
    if (result.error || !result.data) { alert('배너를 불러올 수 없습니다.'); return; }
    var d = result.data;

    // ── ① 기본정보 보기 모드 ──
    var viewBasic = document.getElementById('viewBasic');
    if (viewBasic) {
      viewBasic.innerHTML =
        '<span class="info-grid__label">배너 고유번호</span><span class="info-grid__value">' + api.escapeHtml(d.id || '-') + '</span>' +
        '<span class="info-grid__label">표시 위치</span><span class="info-grid__value">' + api.escapeHtml(d.display_position || '-') + '</span>' +
        '<span class="info-grid__label">노출 순서</span><span class="info-grid__value">' + (d.display_order || '-') + '</span>' +
        '<span class="info-grid__label">공개 상태</span><span class="info-grid__value">' + publicBadge(d.visibility) + '</span>' +
        '<span class="info-grid__label">노출 상태</span><span class="info-grid__value">' + exposureBadge(calcExposureStatus(d)) + '</span>' +
        '<span class="info-grid__label">등록일</span><span class="info-grid__value">' + api.formatDate(d.created_at, true) + '</span>' +
        '<span class="info-grid__label">수정일</span><span class="info-grid__value">' + api.formatDate(d.updated_at || d.created_at, true) + '</span>';
    }

    // ── ② 상세정보 보기 모드 ──
    var viewDetail = document.getElementById('viewDetail');
    if (viewDetail) {
      var imgHtml = d.image_url
        ? '<img src="' + api.escapeHtml(d.image_url) + '" alt="배너 이미지">'
        : BANNER_DETAIL_PLACEHOLDER;

      var linkHtml = d.link_url
        ? '<a href="' + api.escapeHtml(d.link_url) + '" target="_blank" style="color:var(--primary);word-break:break-all;">' + api.escapeHtml(d.link_url) + '</a>'
        : '<span style="color:var(--text-weak);">-</span>';

      viewDetail.innerHTML =
        '<span class="info-grid__label">배너 제목</span><span class="info-grid__value">' + api.escapeHtml(d.title || '-') + '</span>' +
        '<span class="info-grid__label">배너 이미지</span><span class="info-grid__value"><div class="edu-img-preview" id="bannerImgPreview">' + imgHtml + '</div></span>' +
        '<span class="info-grid__label">연결 유형</span><span class="info-grid__value">' + api.escapeHtml(d.link_type || '-') + '</span>' +
        '<span class="info-grid__label">연결 링크</span><span class="info-grid__value">' + linkHtml + '</span>' +
        '<span class="info-grid__label">노출 시작일</span><span class="info-grid__value">' + api.formatDate(d.start_date, true) + '</span>' +
        '<span class="info-grid__label">노출 종료일</span><span class="info-grid__value">' + api.formatDate(d.end_date, true) + '</span>';
    }

    // ── 공개/비공개 전환 버튼 텍스트 동적 세팅 ──
    var btnToggle = document.getElementById('btnToggleVisibility');
    if (btnToggle) {
      btnToggle.textContent = d.visibility === '공개' ? '비공개 전환' : '공개 전환';
    }

    // ── 버튼 이벤트 바인딩 ──
    bindBannerDetailActions(id, d);

    api.hideIfReadOnly(PERM_KEY, ['.btn-action', '.detail-actions']);
  }

  /* ── 상세 페이지 액션 바인딩 (educations.js bindDetailActions 패턴) ── */
  function bindBannerDetailActions(id, d) {
    // 편집 모드에서 사용할 이미지 URL 변수
    var editImgUrl = d.image_url || null;
    var origImgUrl = editImgUrl;
    var detailEditSaved = false;
    var isInEditMode = false;

    // 편집 모드에서 페이지 이탈 시 고아 이미지 정리
    function cleanupDetailOrphan() {
      if (detailEditSaved || !isInEditMode) return;
      if (editImgUrl && editImgUrl !== origImgUrl) {
        try { deleteBannerImage(editImgUrl); } catch (e) { /* ignore */ }
      }
    }
    window.addEventListener('beforeunload', cleanupDetailOrphan);
    window.addEventListener('pagehide', cleanupDetailOrphan);

    // ── [수정] 버튼 → 편집 모드 진입 ──
    var btnEdit = document.getElementById('btnEditMode');
    if (btnEdit) {
      btnEdit.addEventListener('click', function () {
        isInEditMode = true;
        document.getElementById('detailViewActions').style.display = 'none';
        document.getElementById('detailEditActions').style.display = '';
        toggleBannerViewEdit(false);

        // 기본정보 폼 채우기
        var editIdEl = document.getElementById('editId');
        if (editIdEl) editIdEl.innerHTML = api.escapeHtml(d.id || '-');
        var editPosEl = document.getElementById('editPosition');
        if (editPosEl) editPosEl.value = d.display_position || '홈 상단';
        var editOrderEl = document.getElementById('editDisplayOrder');
        if (editOrderEl) editOrderEl.value = d.display_order || 1;
        var editVisEl = document.getElementById('editVisibility');
        if (editVisEl) editVisEl.innerHTML = publicBadge(d.visibility);
        var editExpEl = document.getElementById('editExposureStatus');
        if (editExpEl) editExpEl.innerHTML = exposureBadge(calcExposureStatus(d));
        var editCreatedEl = document.getElementById('editCreatedAt');
        if (editCreatedEl) editCreatedEl.innerHTML = api.formatDate(d.created_at, true);
        var editUpdatedEl = document.getElementById('editUpdatedAt');
        if (editUpdatedEl) editUpdatedEl.innerHTML = api.formatDate(d.updated_at || d.created_at, true);

        // 상세정보 폼 채우기
        var editTitleEl = document.getElementById('editTitle');
        if (editTitleEl) editTitleEl.value = d.title || '';
        var editLinkUrlEl = document.getElementById('editLinkUrl');
        if (editLinkUrlEl) editLinkUrlEl.value = d.link_url || '';
        var editStartEl = document.getElementById('editStartDate');
        if (editStartEl) editStartEl.value = d.start_date ? d.start_date.substring(0, 10) : '';
        var editEndEl = document.getElementById('editEndDate');
        if (editEndEl) editEndEl.value = d.end_date ? d.end_date.substring(0, 10) : '';

        // 연결 유형 라디오
        var linkRadios = document.querySelectorAll('input[name="editLinkType"]');
        linkRadios.forEach(function (r) { r.checked = (r.value === (d.link_type || '외부 URL')); });

        // 연결 유형 → 연결 링크 placeholder 동기화
        if (editLinkUrlEl) {
          editLinkUrlEl.placeholder = (d.link_type === '앱 내 화면') ? '앱 내 화면 경로를 입력하세요' : 'URL을 입력하세요';
        }
        linkRadios.forEach(function (radio) {
          radio.addEventListener('change', function () {
            if (!editLinkUrlEl) return;
            editLinkUrlEl.placeholder = (radio.value === '앱 내 화면') ? '앱 내 화면 경로를 입력하세요' : 'URL을 입력하세요';
          });
        });

        // 이미지 프리뷰 및 버튼 상태
        var imgPreview = document.getElementById('editBannerImgPreview');
        if (imgPreview) {
          imgPreview.innerHTML = editImgUrl
            ? '<img src="' + api.escapeHtml(editImgUrl) + '" alt="미리보기">'
            : BANNER_DETAIL_PLACEHOLDER;
        }
        var imgActions = document.getElementById('editBannerImgActions');
        if (imgActions) {
          imgActions.innerHTML = editImgUrl
            ? '<button class="edu-img-actions__btn" id="editBannerImgBtn">이미지 교체</button><button class="edu-img-actions__btn edu-img-actions__btn--delete" id="editBannerImgBtnDel">삭제</button>'
            : '<button class="edu-img-actions__btn" id="editBannerImgBtn">이미지 업로드</button>';
        }

        // 이미지 업로드 바인딩
        bindBannerImageUpload({
          uploadBtnId: 'editBannerImgBtn',
          fileInputId: 'editBannerImgFile',
          previewId: 'editBannerImgPreview',
          actionsId: 'editBannerImgActions',
          folder: 'banners',
          getCurrentUrl: function () { return editImgUrl; },
          setUrl: function (url) { editImgUrl = url; }
        });
      });
    }

    // ── [취소] 버튼 → 보기 모드 복원 + 고아 파일 정리 ──
    var btnCancel = document.getElementById('btnEditCancel');
    if (btnCancel) {
      btnCancel.addEventListener('click', async function () {
        if (editImgUrl && editImgUrl !== origImgUrl) {
          try { await deleteBannerImage(editImgUrl); } catch (e) { /* ignore */ }
        }
        editImgUrl = origImgUrl;
        isInEditMode = false;

        document.getElementById('detailViewActions').style.display = '';
        document.getElementById('detailEditActions').style.display = 'none';
        toggleBannerViewEdit(true);
      });
    }

    // ── [저장] 버튼 → 저장 모달 열기 ──
    var btnSave = document.getElementById('btnEditSave');
    if (btnSave) {
      btnSave.addEventListener('click', function () {
        var modal = document.getElementById('saveModal');
        if (modal) modal.classList.add('active');
      });
    }

    // ── 저장 모달 확인 ──
    var btnSaveConfirm = document.getElementById('btnSaveConfirm');
    if (btnSaveConfirm) {
      btnSaveConfirm.addEventListener('click', async function () {
        var titleEl = document.getElementById('editTitle');
        var startEl = document.getElementById('editStartDate');
        var endEl = document.getElementById('editEndDate');

        if (!titleEl || !titleEl.value.trim()) { alert('배너 제목을 입력하세요.'); if (titleEl) titleEl.focus(); return; }
        if (!startEl || !startEl.value) { alert('노출 시작일을 선택하세요.'); return; }
        if (!endEl || !endEl.value) { alert('노출 종료일을 선택하세요.'); return; }
        if (startEl.value > endEl.value) { alert('노출 종료일은 시작일 이후여야 합니다.'); return; }

        // 원본과 다른 이전 이미지 Storage 정리
        if (origImgUrl && editImgUrl !== origImgUrl) {
          try { await deleteBannerImage(origImgUrl); } catch (e) { /* ignore */ }
        }

        var linkType = '외부 URL';
        var checkedRadio = document.querySelector('input[name="editLinkType"]:checked');
        if (checkedRadio) linkType = checkedRadio.value;

        var updateData = {
          title: titleEl.value.trim(),
          image_url: editImgUrl || null,
          link_type: linkType,
          link_url: document.getElementById('editLinkUrl') ? document.getElementById('editLinkUrl').value.trim() || null : null,
          display_position: document.getElementById('editPosition') ? document.getElementById('editPosition').value : '홈 상단',
          display_order: document.getElementById('editDisplayOrder') ? parseInt(document.getElementById('editDisplayOrder').value, 10) : 1,
          start_date: startEl.value,
          end_date: endEl.value
        };

        var res = await api.updateRecord('banners', id, updateData);
        if (res.error) { alert('저장 실패: ' + (res.error.message || '알 수 없는 오류')); return; }

        await api.insertAuditLog('배너수정', 'banners', id, {});
        detailEditSaved = true;
        alert('저장되었습니다.');
        location.reload();
      });
    }

    // ── [공개/비공개 전환] 버튼 → 토글 모달 ──
    var btnToggleVis = document.getElementById('btnToggleVisibility');
    if (btnToggleVis) {
      btnToggleVis.addEventListener('click', function () {
        var newVis = d.visibility === '공개' ? '비공개' : '공개';
        var msgEl = document.getElementById('toggleModalMessage');
        var titleEl = document.getElementById('toggleModalTitle');
        var confirmEl = document.getElementById('btnToggleConfirm');
        if (titleEl) titleEl.textContent = newVis + ' 전환';
        if (msgEl) {
          msgEl.innerHTML = newVis === '비공개'
            ? '이 배너를 비공개로 전환하면 앱에서 더 이상 노출되지 않습니다.<br>비공개로 전환하시겠습니까?'
            : '이 배너를 공개로 전환하면 노출 일정에 따라 앱에서 노출됩니다.<br>공개로 전환하시겠습니까?';
        }
        if (confirmEl) confirmEl.textContent = newVis + ' 전환';
        var modal = document.getElementById('toggleModal');
        if (modal) modal.classList.add('active');
      });
    }

    // ── 토글 모달 확인 ──
    var btnToggleConfirm = document.getElementById('btnToggleConfirm');
    if (btnToggleConfirm) {
      btnToggleConfirm.addEventListener('click', async function () {
        var newVis = d.visibility === '공개' ? '비공개' : '공개';
        await api.updateRecord('banners', id, { visibility: newVis });
        await api.insertAuditLog('공개상태변경', 'banners', id, { from: d.visibility, to: newVis });
        alert(newVis + '로 변경되었습니다.');
        location.reload();
      });
    }

    // ── [삭제] 버튼 → 삭제 모달 ──
    var btnDeleteOpen = document.getElementById('btnDeleteOpen');
    if (btnDeleteOpen) {
      btnDeleteOpen.addEventListener('click', function () {
        var modal = document.getElementById('deleteModal');
        if (modal) modal.classList.add('active');
      });
    }

    // ── 삭제 모달 확인 ──
    var btnDeleteConfirm = document.getElementById('btnDeleteConfirm');
    if (btnDeleteConfirm) {
      btnDeleteConfirm.addEventListener('click', async function () {
        // Storage 이미지 정리
        if (d.image_url) {
          try { await deleteBannerImage(d.image_url); } catch (e) { /* ignore */ }
        }
        await api.deleteRecord('banners', id);
        await api.insertAuditLog('배너삭제', 'banners', id, {});
        alert('삭제되었습니다.');
        location.href = 'contents.html#tab-banner';
      });
    }
  }

  // ══════════════════════════════════════════
  // C. 공지사항 상세 (content-notice-detail.html)
  // ══════════════════════════════════════════

  var NOTICE_BUCKET = 'notice-attachments';
  var ALLOWED_NOTICE_FILES = ['pdf', 'doc', 'docx', 'hwp', 'jpg', 'jpeg', 'png'];
  var MAX_NOTICE_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  var MAX_NOTICE_FILE_COUNT = 10;

  // ── Storage 헬퍼 함수 ──
  async function uploadNoticeAttachment(file) {
    var sb = window.__supabase;
    var ext = file.name.split('.').pop().toLowerCase();
    var fileName = 'notices/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    var res = await sb.storage.from(NOTICE_BUCKET).upload(fileName, file, { cacheControl: '3600', upsert: false });
    if (res.error) throw res.error;
    var pub = sb.storage.from(NOTICE_BUCKET).getPublicUrl(fileName);
    return pub.data.publicUrl;
  }

  async function deleteNoticeAttachment(url) {
    if (!url) return;
    var sb = window.__supabase;
    var m = url.match(new RegExp(NOTICE_BUCKET + '/(.+)$'));
    if (!m) return;
    await sb.storage.from(NOTICE_BUCKET).remove([m[1]]);
  }

  function validateNoticeFile(file) {
    var ext = file.name.split('.').pop().toLowerCase();
    if (ALLOWED_NOTICE_FILES.indexOf(ext) === -1) {
      alert('허용되지 않는 파일 형식입니다.\n허용: ' + ALLOWED_NOTICE_FILES.join(', ').toUpperCase());
      return false;
    }
    if (file.size > MAX_NOTICE_FILE_SIZE) {
      alert('파일 크기가 10MB를 초과합니다.');
      return false;
    }
    return true;
  }

  function getFileNameFromUrl(url) {
    if (!url) return '';
    var parts = url.split('/');
    var fullName = parts[parts.length - 1];
    // timestamp_random.ext → 원본 이름 추출 불가하므로 전체 표시
    return decodeURIComponent(fullName);
  }

  // ── 첨부파일 목록 렌더링 (보기 모드) ──
  function renderViewAttachments(containerEl, urls) {
    if (!containerEl) return;
    if (!urls || urls.length === 0) {
      containerEl.innerHTML = '<span style="color:var(--text-weak);">첨부 파일 없음</span>';
      return;
    }
    var html = '<div class="cnt-attachment-list">';
    for (var i = 0; i < urls.length; i++) {
      var fname = getFileNameFromUrl(urls[i]);
      html += '<div class="cnt-attachment-item">' +
        '<a href="' + api.escapeHtml(urls[i]) + '" target="_blank" style="color:var(--primary);text-decoration:underline;">' + api.escapeHtml(fname) + '</a>' +
        '</div>';
    }
    html += '</div>';
    containerEl.innerHTML = html;
  }

  // ── 첨부파일 목록 렌더링 (편집 모드) ──
  function renderEditAttachments(containerEl, urls, onDelete) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    for (var i = 0; i < urls.length; i++) {
      (function (idx) {
        var fname = getFileNameFromUrl(urls[idx]);
        var item = document.createElement('div');
        item.className = 'cnt-attachment-item';
        item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;';
        item.innerHTML = '<span style="font-size:13px;">' + api.escapeHtml(fname) + '</span>' +
          '<button class="btn-action btn-action--outline-danger" style="padding:2px 8px;font-size:11px;" data-idx="' + idx + '">X</button>';
        item.querySelector('button').addEventListener('click', function () {
          onDelete(idx);
        });
        containerEl.appendChild(item);
      })(i);
    }
  }

  function isNoticeDetailPage() {
    return !!document.getElementById('detailNoticeBasic') && !!document.getElementById('viewNoticeBasic');
  }

  async function loadNoticeDetail() {
    var id = api.getParam('id');
    if (!id) return;
    var result = await api.fetchDetail('notices', id);
    if (result.error || !result.data) { alert('공지사항을 불러올 수 없습니다.'); return; }
    var d = result.data;

    // 원본 데이터 보존 (편집 취소 시 복원용)
    var origData = JSON.parse(JSON.stringify(d));
    var noticeQuill = null;
    var editAttachUrls = [];
    var addedAttachUrls = []; // 편집 중 새로 추가된 URL (취소 시 삭제용)
    var deletedAttachUrls = []; // 편집 중 삭제 예정 URL (저장 시 Storage에서 삭제)

    // ── 보기 모드 렌더링 ──
    function renderViewMode() {
      var viewEl = document.getElementById('viewNoticeBasic');
      if (viewEl) {
        var pushBadge = d.push_sent
          ? '<span class="badge badge--c-blue">발송완료</span>'
          : '<span class="badge badge--c-gray">미발송</span>';

        viewEl.innerHTML =
          '<span class="info-grid__label">고유번호</span><span class="info-grid__value">' + api.escapeHtml(d.id || '-') + '</span>' +
          '<span class="info-grid__label">공지사항 제목</span><span class="info-grid__value">' + api.escapeHtml(d.title || '') + '</span>' +
          '<span class="info-grid__label">대상</span><span class="info-grid__value">' + api.autoBadge(d.target || '') + '</span>' +
          '<span class="info-grid__label">상단 고정</span><span class="info-grid__value">' + (d.is_pinned ? '<span style="color:var(--danger);font-weight:600;">고정</span>' : '-') + '</span>' +
          '<span class="info-grid__label">공개 상태</span><span class="info-grid__value">' + publicBadge(d.visibility) + '</span>' +
          '<span class="info-grid__label">푸시 발송</span><span class="info-grid__value">' + pushBadge + '</span>' +
          '<span class="info-grid__label">조회수</span><span class="info-grid__value">' + api.formatNumber(d.view_count || 0) + '</span>' +
          '<span class="info-grid__label">등록일시</span><span class="info-grid__value">' + api.formatDate(d.created_at) + '</span>' +
          '<span class="info-grid__label">수정일시</span><span class="info-grid__value">' + api.formatDate(d.updated_at) + '</span>';
      }

      // 본문 innerHTML 렌더링
      var contentEl = document.getElementById('viewNoticeContent');
      if (contentEl) {
        contentEl.innerHTML = '<div class="notice-content-render ql-editor" style="line-height:1.6;padding:0;">' + (d.content || '') + '</div>';
      }

      // 첨부파일
      var attachEl = document.getElementById('viewNoticeAttachments');
      renderViewAttachments(attachEl, d.attachment_urls || []);

      // 공개/비공개 전환 버튼 텍스트
      var btnToggle = document.getElementById('btnToggleVisibility');
      if (btnToggle) {
        btnToggle.textContent = d.visibility === '공개' ? '비공개 전환' : '공개 전환';
      }

      // 푸시 발송 버튼 상태
      var btnPush = document.getElementById('btnPushSend');
      if (btnPush) {
        if (d.push_sent) {
          btnPush.textContent = '발송완료';
          btnPush.disabled = true;
          btnPush.classList.add('btn-action--disabled');
        } else {
          btnPush.textContent = '푸시 알림 발송';
          btnPush.disabled = false;
          btnPush.classList.remove('btn-action--disabled');
        }
      }
    }

    renderViewMode();

    // ── 보기 ↔ 편집 전환 ──
    function toggleMode(isView) {
      document.getElementById('detailViewActions').style.display = isView ? '' : 'none';
      document.getElementById('detailEditActions').style.display = isView ? 'none' : '';
      document.getElementById('viewNoticeBasic').style.display = isView ? '' : 'none';
      document.getElementById('editNoticeBasic').style.display = isView ? 'none' : '';
      document.getElementById('viewNoticeBody').style.display = isView ? '' : 'none';
      document.getElementById('editNoticeBody').style.display = isView ? 'none' : '';
    }

    // ── [수정] 버튼 → 편집 모드 진입 ──
    var btnEdit = document.getElementById('btnEditMode');
    if (btnEdit) {
      btnEdit.addEventListener('click', function () {
        toggleMode(false);

        // 기본정보 편집 폼 렌더링
        var editBasic = document.getElementById('editNoticeBasic');
        if (editBasic) {
          editBasic.innerHTML =
            '<span class="info-grid__label">고유번호</span><span class="info-grid__value" style="color:var(--text-weak);">' + api.escapeHtml(d.id || '') + '</span>' +
            '<span class="info-grid__label">공지사항 제목</span><span class="info-grid__value"><input type="text" class="form-input" id="editNoticeTitle" value="' + api.escapeHtml(d.title || '') + '"></span>' +
            '<span class="info-grid__label">대상</span><span class="info-grid__value">' +
              '<select class="form-select" id="editNoticeTarget">' +
                '<option value="전체(공통)"' + (d.target === '전체(공통)' ? ' selected' : '') + '>전체(공통)</option>' +
                '<option value="보호자"' + (d.target === '보호자' ? ' selected' : '') + '>보호자</option>' +
                '<option value="유치원"' + (d.target === '유치원' ? ' selected' : '') + '>유치원</option>' +
              '</select></span>' +
            '<span class="info-grid__label">상단 고정</span><span class="info-grid__value"><label class="form-checkbox"><input type="checkbox" id="editNoticePinned"' + (d.is_pinned ? ' checked' : '') + '> 고정</label></span>' +
            '<span class="info-grid__label">공개 상태</span><span class="info-grid__value">' + publicBadge(d.visibility) + '</span>' +
            '<span class="info-grid__label">푸시 발송</span><span class="info-grid__value">' + (d.push_sent ? '<span class="badge badge--c-blue">발송완료</span>' : '<span class="badge badge--c-gray">미발송</span>') + '</span>' +
            '<span class="info-grid__label">조회수</span><span class="info-grid__value">' + api.formatNumber(d.view_count || 0) + '</span>' +
            '<span class="info-grid__label">등록일시</span><span class="info-grid__value">' + api.formatDate(d.created_at) + '</span>' +
            '<span class="info-grid__label">수정일시</span><span class="info-grid__value">' + api.formatDate(d.updated_at) + '</span>';
        }

        // Quill 에디터 생성
        var editorContainer = document.getElementById('noticeEditorContainer');
        if (editorContainer) {
          editorContainer.innerHTML = '';
          noticeQuill = new Quill(editorContainer, {
            theme: 'snow',
            modules: { toolbar: [[{ header: [1, 2, 3, false] }], ['bold', 'italic', 'underline', 'strike'], [{ list: 'ordered' }, { list: 'bullet' }], [{ color: [] }, { background: [] }], ['link', 'image'], ['clean']] }
          });
          noticeQuill.root.innerHTML = d.content || '';
        }

        // 첨부파일 편집 목록
        editAttachUrls = (d.attachment_urls || []).slice();
        addedAttachUrls = [];
        deletedAttachUrls = [];
        var editAttachList = document.getElementById('editAttachmentList');
        renderEditAttachments(editAttachList, editAttachUrls, function (idx) {
          var removed = editAttachUrls.splice(idx, 1)[0];
          if (addedAttachUrls.indexOf(removed) !== -1) {
            // 새로 추가한 건 즉시 Storage 삭제
            addedAttachUrls.splice(addedAttachUrls.indexOf(removed), 1);
            deleteNoticeAttachment(removed);
          } else {
            // 기존 첨부는 저장 시 삭제 예정 목록에 추가
            deletedAttachUrls.push(removed);
          }
          renderEditAttachments(editAttachList, editAttachUrls, arguments.callee);
        });

        // 편집 모드 파일 추가 버튼
        var btnEditAdd = document.getElementById('btnEditAddAttachment');
        var editFileInput = document.getElementById('editNoticeFileInput');
        if (btnEditAdd && editFileInput) {
          btnEditAdd.onclick = function () {
            if (editAttachUrls.length >= MAX_NOTICE_FILE_COUNT) {
              alert('최대 ' + MAX_NOTICE_FILE_COUNT + '개까지 첨부할 수 있습니다.');
              return;
            }
            editFileInput.click();
          };
          editFileInput.onchange = async function () {
            var file = editFileInput.files[0];
            if (!file) return;
            if (!validateNoticeFile(file)) { editFileInput.value = ''; return; }
            if (editAttachUrls.length >= MAX_NOTICE_FILE_COUNT) {
              alert('최대 ' + MAX_NOTICE_FILE_COUNT + '개까지 첨부할 수 있습니다.');
              editFileInput.value = '';
              return;
            }
            try {
              var url = await uploadNoticeAttachment(file);
              editAttachUrls.push(url);
              addedAttachUrls.push(url);
              var editAttachList2 = document.getElementById('editAttachmentList');
              renderEditAttachments(editAttachList2, editAttachUrls, function (idx2) {
                var removed2 = editAttachUrls.splice(idx2, 1)[0];
                if (addedAttachUrls.indexOf(removed2) !== -1) {
                  addedAttachUrls.splice(addedAttachUrls.indexOf(removed2), 1);
                  deleteNoticeAttachment(removed2);
                } else {
                  deletedAttachUrls.push(removed2);
                }
                renderEditAttachments(document.getElementById('editAttachmentList'), editAttachUrls, arguments.callee);
              });
            } catch (err) {
              alert('파일 업로드 실패: ' + (err.message || err));
            }
            editFileInput.value = '';
          };
        }
      });
    }

    // ── [취소] 버튼 → 보기 모드 복원 ──
    var btnCancel = document.getElementById('btnEditCancel');
    if (btnCancel) {
      btnCancel.addEventListener('click', async function () {
        // 새로 추가된 파일 정리
        for (var i = 0; i < addedAttachUrls.length; i++) {
          try { await deleteNoticeAttachment(addedAttachUrls[i]); } catch (e) { /* ignore */ }
        }
        addedAttachUrls = [];
        deletedAttachUrls = [];

        // Quill 파괴
        if (noticeQuill) {
          var container = document.getElementById('noticeEditorContainer');
          if (container) container.innerHTML = '';
          noticeQuill = null;
        }

        // 원본 데이터 복원
        d = JSON.parse(JSON.stringify(origData));
        renderViewMode();
        toggleMode(true);
      });
    }

    // ── [저장] 버튼 → 모달 열기 ──
    var btnSave = document.getElementById('btnEditSave');
    if (btnSave) {
      btnSave.addEventListener('click', function () {
        var modal = document.getElementById('saveModal');
        if (modal) modal.classList.add('active');
      });
    }

    // ── 저장 모달 확인 ──
    var btnSaveConfirm = document.getElementById('btnSaveConfirm');
    if (btnSaveConfirm) {
      btnSaveConfirm.addEventListener('click', async function () {
        var titleEl = document.getElementById('editNoticeTitle');
        if (!titleEl || !titleEl.value.trim()) {
          alert('공지사항 제목을 입력하세요.');
          if (titleEl) titleEl.focus();
          return;
        }

        // 삭제 예정 파일 Storage에서 삭제
        for (var i = 0; i < deletedAttachUrls.length; i++) {
          try { await deleteNoticeAttachment(deletedAttachUrls[i]); } catch (e) { /* ignore */ }
        }

        var updateData = {
          title: titleEl.value.trim(),
          target: document.getElementById('editNoticeTarget') ? document.getElementById('editNoticeTarget').value : d.target,
          is_pinned: document.getElementById('editNoticePinned') ? document.getElementById('editNoticePinned').checked : d.is_pinned,
          content: noticeQuill ? noticeQuill.root.innerHTML : d.content,
          attachment_urls: editAttachUrls.length > 0 ? editAttachUrls : null
        };

        var res = await api.updateRecord('notices', id, updateData);
        if (res.error) {
          alert('저장 실패: ' + (res.error.message || '알 수 없는 오류'));
          return;
        }

        await api.insertAuditLog('공지수정', 'notices', id, {});

        // 모달 닫기
        var modal = document.getElementById('saveModal');
        if (modal) modal.classList.remove('active');

        // Quill 파괴 후 새 데이터로 보기 모드 복원
        if (noticeQuill) {
          var container = document.getElementById('noticeEditorContainer');
          if (container) container.innerHTML = '';
          noticeQuill = null;
        }

        // 갱신된 데이터 재로드
        var refreshed = await api.fetchDetail('notices', id);
        if (refreshed.data) {
          d = refreshed.data;
          origData = JSON.parse(JSON.stringify(d));
        }
        renderViewMode();
        toggleMode(true);
        alert('저장되었습니다.');
      });
    }

    // ── [푸시 알림 발송] 버튼 ──
    var btnPush = document.getElementById('btnPushSend');
    if (btnPush) {
      btnPush.addEventListener('click', function () {
        if (d.push_sent) return;
        var modal = document.getElementById('pushModal');
        if (modal) modal.classList.add('active');
      });
    }
    var btnPushConfirm = document.getElementById('btnPushConfirm');
    if (btnPushConfirm) {
      btnPushConfirm.addEventListener('click', async function () {
        await api.updateRecord('notices', id, { push_sent: true });
        await api.insertAuditLog('푸시발송', 'notices', id, {});
        var modal = document.getElementById('pushModal');
        if (modal) modal.classList.remove('active');
        d.push_sent = true;
        origData.push_sent = true;
        renderViewMode();
        alert('푸시 발송이 완료되었습니다.');
      });
    }

    // ── [공개/비공개 전환] 버튼 ──
    var btnToggle = document.getElementById('btnToggleVisibility');
    if (btnToggle) {
      btnToggle.addEventListener('click', function () {
        var newVis = d.visibility === '공개' ? '비공개' : '공개';
        var titleEl = document.getElementById('toggleModalTitle');
        var msgEl = document.getElementById('toggleModalMessage');
        var confirmEl = document.getElementById('btnToggleConfirm');
        if (titleEl) titleEl.textContent = newVis + ' 전환';
        if (msgEl) {
          msgEl.innerHTML = newVis === '비공개'
            ? '이 공지사항을 비공개로 전환하면 앱에서 더 이상 표시되지 않습니다.<br>비공개로 전환하시겠습니까?'
            : '이 공지사항을 공개로 전환하면 앱에서 표시됩니다.<br>공개로 전환하시겠습니까?';
        }
        if (confirmEl) confirmEl.textContent = newVis + ' 전환';
        var modal = document.getElementById('toggleModal');
        if (modal) modal.classList.add('active');
      });
    }
    var btnToggleConfirm = document.getElementById('btnToggleConfirm');
    if (btnToggleConfirm) {
      btnToggleConfirm.addEventListener('click', async function () {
        var newVis = d.visibility === '공개' ? '비공개' : '공개';
        await api.updateRecord('notices', id, { visibility: newVis });
        await api.insertAuditLog('공개상태변경', 'notices', id, { from: d.visibility, to: newVis });
        var modal = document.getElementById('toggleModal');
        if (modal) modal.classList.remove('active');
        d.visibility = newVis;
        origData.visibility = newVis;
        renderViewMode();
        alert(newVis + '로 변경되었습니다.');
      });
    }

    // ── [삭제] 버튼 ──
    var btnDeleteOpen = document.getElementById('btnDeleteOpen');
    if (btnDeleteOpen) {
      btnDeleteOpen.addEventListener('click', function () {
        var modal = document.getElementById('deleteModal');
        if (modal) modal.classList.add('active');
      });
    }
    var btnDeleteConfirm = document.getElementById('btnDeleteConfirm');
    if (btnDeleteConfirm) {
      btnDeleteConfirm.addEventListener('click', async function () {
        // Storage 첨부파일 정리
        var urls = d.attachment_urls || [];
        for (var i = 0; i < urls.length; i++) {
          try { await deleteNoticeAttachment(urls[i]); } catch (e) { /* ignore */ }
        }
        await api.deleteRecord('notices', id);
        await api.insertAuditLog('공지삭제', 'notices', id, {});
        alert('삭제되었습니다.');
        location.href = 'contents.html#tab-notice';
      });
    }

    api.hideIfReadOnly(PERM_KEY, ['.btn-action', '.detail-actions']);
  }

  // ══════════════════════════════════════════
  // D. FAQ 상세 (content-faq-detail.html)
  // ══════════════════════════════════════════

  function isFaqDetailPage() {
    return !!document.getElementById('detailFaqBasic') && !!document.getElementById('viewFaqBasic');
  }

  async function loadFaqDetail() {
    var id = api.getParam('id');
    if (!id) return;
    var result = await api.fetchDetail('faqs', id);
    if (result.error || !result.data) { alert('FAQ를 불러올 수 없습니다.'); return; }
    var d = result.data;
    var origData = JSON.parse(JSON.stringify(d));
    var faqQuill = null;

    // ── 보기 모드 렌더링 ──
    function renderViewMode() {
      var viewEl = document.getElementById('viewFaqBasic');
      if (viewEl) {
        viewEl.innerHTML =
          '<span class="info-grid__label">FAQ 고유번호</span><span class="info-grid__value">' + api.escapeHtml(d.id || '-') + '</span>' +
          '<span class="info-grid__label">카테고리</span><span class="info-grid__value">' + api.escapeHtml(d.category || '') + '</span>' +
          '<span class="info-grid__label">질문</span><span class="info-grid__value">' + api.escapeHtml(d.question || '') + '</span>' +
          '<span class="info-grid__label">답변</span><span class="info-grid__value cnt-full-width"><div class="faq-content-render ql-editor" style="line-height:1.6;padding:0;">' + (d.answer || '') + '</div></span>' +
          '<span class="info-grid__label">대상</span><span class="info-grid__value">' + api.autoBadge(d.target || '') + '</span>' +
          '<span class="info-grid__label">노출 순서</span><span class="info-grid__value">' + (d.display_order || '-') + '</span>' +
          '<span class="info-grid__label">공개 상태</span><span class="info-grid__value">' + publicBadge(d.visibility) + '</span>' +
          '<span class="info-grid__label">등록일시</span><span class="info-grid__value">' + api.formatDate(d.created_at) + '</span>' +
          '<span class="info-grid__label">수정일시</span><span class="info-grid__value">' + api.formatDate(d.updated_at) + '</span>';
      }

      // 공개/비공개 전환 버튼 텍스트 동적 세팅
      var btnToggle = document.getElementById('btnToggleVisibility');
      if (btnToggle) {
        btnToggle.textContent = d.visibility === '공개' ? '비공개 전환' : '공개 전환';
      }
    }

    renderViewMode();

    // ── 보기 ↔ 편집 전환 ──
    function toggleMode(isView) {
      document.getElementById('detailViewActions').style.display = isView ? '' : 'none';
      document.getElementById('detailEditActions').style.display = isView ? 'none' : '';
      document.getElementById('viewFaqBasic').style.display = isView ? '' : 'none';
      document.getElementById('editFaqBasic').style.display = isView ? 'none' : '';
    }

    // ── [수정] 버튼 → 편집 모드 진입 ──
    var btnEdit = document.getElementById('btnEditMode');
    if (btnEdit) {
      btnEdit.addEventListener('click', function () {
        toggleMode(false);

        var editEl = document.getElementById('editFaqBasic');
        if (editEl) {
          editEl.innerHTML =
            '<span class="info-grid__label">FAQ 고유번호</span><span class="info-grid__value" style="color:var(--text-weak);">' + api.escapeHtml(d.id || '') + '</span>' +
            '<span class="info-grid__label">카테고리</span><span class="info-grid__value">' +
              '<select class="form-select" id="editFaqCategory">' +
                '<option value="공통"' + (d.category === '공통' ? ' selected' : '') + '>공통</option>' +
              '</select></span>' +
            '<span class="info-grid__label">질문</span><span class="info-grid__value"><input type="text" class="form-input" id="editFaqQuestion" value="' + api.escapeHtml(d.question || '') + '"></span>' +
            '<span class="info-grid__label">답변</span><span class="info-grid__value cnt-full-width"><div id="faqDetailEditorContainer" style="height:300px;"></div></span>' +
            '<span class="info-grid__label">대상</span><span class="info-grid__value">' +
              '<select class="form-select" id="editFaqTarget">' +
                '<option value="전체(공통)"' + (d.target === '전체(공통)' ? ' selected' : '') + '>전체(공통)</option>' +
                '<option value="보호자"' + (d.target === '보호자' ? ' selected' : '') + '>보호자</option>' +
                '<option value="유치원"' + (d.target === '유치원' ? ' selected' : '') + '>유치원</option>' +
              '</select></span>' +
            '<span class="info-grid__label">노출 순서</span><span class="info-grid__value">' +
              '<div style="display:flex;align-items:center;gap:8px;">' +
                '<input type="number" class="form-input form-input--short" id="editFaqOrder" value="' + (d.display_order || 1) + '" min="1">' +
                '<button class="btn-action btn-action--outline-gray" id="btnOrderUp" style="padding:2px 8px;font-size:12px;">&#9650;</button>' +
                '<button class="btn-action btn-action--outline-gray" id="btnOrderDown" style="padding:2px 8px;font-size:12px;">&#9660;</button>' +
              '</div></span>' +
            '<span class="info-grid__label">공개 상태</span><span class="info-grid__value">' + publicBadge(d.visibility) + '</span>' +
            '<span class="info-grid__label">등록일시</span><span class="info-grid__value" style="color:var(--text-weak);">' + api.formatDate(d.created_at) + '</span>' +
            '<span class="info-grid__label">수정일시</span><span class="info-grid__value" style="color:var(--text-weak);">' + api.formatDate(d.updated_at) + '</span>';
        }

        // Quill 에디터 생성
        var editorContainer = document.getElementById('faqDetailEditorContainer');
        if (editorContainer) {
          editorContainer.innerHTML = '';
          faqQuill = new Quill(editorContainer, {
            theme: 'snow',
            modules: { toolbar: [[{ header: [1, 2, 3, false] }], ['bold', 'italic', 'underline', 'strike'], [{ list: 'ordered' }, { list: 'bullet' }], [{ color: [] }, { background: [] }], ['link', 'image'], ['clean']] }
          });
          faqQuill.root.innerHTML = d.answer || '';
        }

        // ▲▼ 버튼 바인딩
        var orderInput = document.getElementById('editFaqOrder');
        var btnUp = document.getElementById('btnOrderUp');
        var btnDown = document.getElementById('btnOrderDown');
        if (btnUp && orderInput) {
          btnUp.addEventListener('click', function () {
            var cur = parseInt(orderInput.value, 10) || 1;
            orderInput.value = cur + 1;
          });
        }
        if (btnDown && orderInput) {
          btnDown.addEventListener('click', function () {
            var cur = parseInt(orderInput.value, 10) || 1;
            if (cur > 1) orderInput.value = cur - 1;
          });
        }
      });
    }

    // ── [취소] 버튼 → 보기 모드 복원 ──
    var btnCancel = document.getElementById('btnEditCancel');
    if (btnCancel) {
      btnCancel.addEventListener('click', function () {
        // Quill 파괴
        if (faqQuill) {
          var container = document.getElementById('faqDetailEditorContainer');
          if (container) container.innerHTML = '';
          faqQuill = null;
        }

        // 원본 데이터 복원
        d = JSON.parse(JSON.stringify(origData));
        renderViewMode();
        toggleMode(true);
      });
    }

    // ── [저장] 버튼 → 모달 열기 ──
    var btnSave = document.getElementById('btnEditSave');
    if (btnSave) {
      btnSave.addEventListener('click', function () {
        var modal = document.getElementById('saveModal');
        if (modal) modal.classList.add('active');
      });
    }

    // ── 저장 모달 확인 ──
    var btnSaveConfirm = document.getElementById('btnSaveConfirm');
    if (btnSaveConfirm) {
      btnSaveConfirm.addEventListener('click', async function () {
        var questionEl = document.getElementById('editFaqQuestion');
        if (!questionEl || !questionEl.value.trim()) {
          alert('질문을 입력하세요.');
          if (questionEl) questionEl.focus();
          return;
        }

        // 답변 필수 검증
        var answerHtml = faqQuill ? faqQuill.root.innerHTML : '';
        var answerText = faqQuill ? faqQuill.getText().trim() : '';
        if (!answerText) {
          alert('답변을 입력하세요.');
          return;
        }

        var categoryEl = document.getElementById('editFaqCategory');
        var targetEl = document.getElementById('editFaqTarget');
        var orderEl = document.getElementById('editFaqOrder');

        var newOrder = orderEl ? parseInt(orderEl.value, 10) : d.display_order;
        var oldOrder = d.display_order;
        if (newOrder < 1) newOrder = 1;

        var updateData = {
          category: categoryEl ? categoryEl.value : d.category,
          question: questionEl.value.trim(),
          answer: answerHtml,
          target: targetEl ? targetEl.value : d.target,
          display_order: newOrder
        };

        var sb = window.__supabase;

        // 순서 변경이 있으면 RPC로 트랜잭션 처리, 없으면 일반 update
        if (newOrder !== oldOrder) {
          var rpcRes = await sb.rpc('reorder_faq_display_order', {
            p_faq_id: id,
            p_category: d.category,
            p_old_order: oldOrder,
            p_new_order: newOrder,
            p_update_data: updateData
          });
          if (rpcRes.error) {
            alert('저장 실패: ' + (rpcRes.error.message || '알 수 없는 오류'));
            return;
          }
        } else {
          var res = await api.updateRecord('faqs', id, updateData);
          if (res.error) {
            alert('저장 실패: ' + (res.error.message || '알 수 없는 오류'));
            return;
          }
        }

        await api.insertAuditLog('FAQ수정', 'faqs', id, {});

        // 모달 닫기
        var modal = document.getElementById('saveModal');
        if (modal) modal.classList.remove('active');

        // Quill 파괴 후 새 데이터로 보기 모드 복원
        if (faqQuill) {
          var container = document.getElementById('faqDetailEditorContainer');
          if (container) container.innerHTML = '';
          faqQuill = null;
        }

        // 갱신된 데이터 재로드
        var refreshed = await api.fetchDetail('faqs', id);
        if (refreshed.data) {
          d = refreshed.data;
          origData = JSON.parse(JSON.stringify(d));
        }
        renderViewMode();
        toggleMode(true);
        alert('저장되었습니다.');
      });
    }

    // ── [공개/비공개 전환] 버튼 ──
    var btnToggleVis = document.getElementById('btnToggleVisibility');
    if (btnToggleVis) {
      btnToggleVis.addEventListener('click', function () {
        var newVis = d.visibility === '공개' ? '비공개' : '공개';
        var msgEl = document.getElementById('toggleModalMessage');
        var titleEl = document.getElementById('toggleModalTitle');
        var confirmEl = document.getElementById('btnToggleConfirm');
        if (titleEl) titleEl.textContent = newVis + ' 전환';
        if (msgEl) {
          msgEl.innerHTML = newVis === '비공개'
            ? '이 FAQ를 비공개로 전환하면 앱에서 더 이상 표시되지 않습니다.<br>비공개로 전환하시겠습니까?'
            : '이 FAQ를 공개로 전환하면 앱에서 표시됩니다.<br>공개로 전환하시겠습니까?';
        }
        if (confirmEl) confirmEl.textContent = newVis + ' 전환';
        var modal = document.getElementById('toggleModal');
        if (modal) modal.classList.add('active');
      });
    }

    // ── 토글 모달 확인 ──
    var btnToggleConfirm = document.getElementById('btnToggleConfirm');
    if (btnToggleConfirm) {
      btnToggleConfirm.addEventListener('click', async function () {
        var newVis = d.visibility === '공개' ? '비공개' : '공개';
        await api.updateRecord('faqs', id, { visibility: newVis });
        await api.insertAuditLog('공개상태변경', 'faqs', id, { from: d.visibility, to: newVis });
        var modal = document.getElementById('toggleModal');
        if (modal) modal.classList.remove('active');
        d.visibility = newVis;
        origData.visibility = newVis;
        renderViewMode();
        alert(newVis + '로 변경되었습니다.');
      });
    }

    // ── [삭제] 버튼 → 삭제 모달 ──
    var btnDeleteOpen = document.getElementById('btnDeleteOpen');
    if (btnDeleteOpen) {
      btnDeleteOpen.addEventListener('click', function () {
        var modal = document.getElementById('deleteModal');
        if (modal) modal.classList.add('active');
      });
    }

    // ── 삭제 모달 확인 (delete 먼저 → reorder) ──
    var btnDeleteConfirm = document.getElementById('btnDeleteConfirm');
    if (btnDeleteConfirm) {
      btnDeleteConfirm.addEventListener('click', async function () {
        var sb = window.__supabase;
        var rpcRes = await sb.rpc('delete_faq_and_reorder', {
          p_faq_id: id,
          p_category: d.category,
          p_order: d.display_order
        });
        if (rpcRes.error) {
          alert('삭제 실패: ' + (rpcRes.error.message || '알 수 없는 오류'));
          return;
        }
        await api.insertAuditLog('FAQ삭제', 'faqs', id, {});
        alert('삭제되었습니다.');
        location.href = 'contents.html#tab-faq';
      });
    }

    api.hideIfReadOnly(PERM_KEY, ['.btn-action', '.detail-actions']);
  }

  // ══════════════════════════════════════════
  // E. 약관 상세 (content-terms-detail.html)
  // ══════════════════════════════════════════

  function isTermsDetailPage() {
    return !!document.getElementById('detailTermsBasic') && !!document.getElementById('viewTermsBasic');
  }

  async function loadTermsDetail() {
    var id = api.getParam('id');
    if (!id) return;
    var result = await api.fetchDetail('terms', id);
    if (result.error || !result.data) { alert('약관을 불러올 수 없습니다.'); return; }
    var d = result.data;
    var origData = JSON.parse(JSON.stringify(d));
    var termsDetailQuill = null;

    // ── 보기 모드 렌더링 ──
    function renderViewMode() {
      var viewEl = document.getElementById('viewTermsBasic');
      if (viewEl) {
        viewEl.innerHTML =
          '<span class="info-grid__label">약관 고유번호</span><span class="info-grid__value">' + api.escapeHtml(d.id || '-') + '</span>' +
          '<span class="info-grid__label">약관 제목</span><span class="info-grid__value">' + api.escapeHtml(d.title || '') + '</span>' +
          '<span class="info-grid__label">필수 여부</span><span class="info-grid__value">' + requiredBadge(d.is_required) + '</span>' +
          '<span class="info-grid__label">최초 등록일</span><span class="info-grid__value">' + api.formatDate(d.created_at, true) + '</span>' +
          '<span class="info-grid__label">현재 버전</span><span class="info-grid__value">' + api.escapeHtml(d.current_version || '') + '</span>' +
          '<span class="info-grid__label">현재 버전 시행일</span><span class="info-grid__value">' + (d.effective_date ? api.formatDate(d.effective_date, true) : '-') + '</span>' +
          '<span class="info-grid__label">공개 상태</span><span class="info-grid__value">' + publicBadge(d.visibility) + '</span>';
      }

      var contentView = document.getElementById('viewTermsContent');
      if (contentView) {
        contentView.innerHTML = d.content || '<span style="color:var(--text-weak);">본문 없음</span>';
      }

      var btnToggle = document.getElementById('btnToggleVisibility');
      if (btnToggle) {
        btnToggle.textContent = d.visibility === '공개' ? '비공개 전환' : '공개 전환';
      }
    }

    renderViewMode();

    // ── 버전 이력 로드 ──
    var vBody = document.getElementById('detailTermsVersions');
    var versionDataArr = [];
    if (vBody) {
      var vResult = await api.fetchList('term_versions', {
        filters: [{ column: 'term_id', op: 'eq', value: id }],
        orderBy: 'version_number', ascending: false, perPage: 100
      });
      if (vResult.data && vResult.data.length > 0) {
        versionDataArr = vResult.data;
        var html = '';
        for (var vi = 0; vi < vResult.data.length; vi++) {
          var v = vResult.data[vi];
          html += '<tr>' +
            '<td>' + api.escapeHtml(v.version_number || '') + '</td>' +
            '<td>' + api.formatDate(v.effective_date, true) + '</td>' +
            '<td>' + (v.end_date ? api.formatDate(v.end_date, true) : '-') + '</td>' +
            '<td>' + api.escapeHtml(v.change_reason || '-') + '</td>' +
            '<td><a href="#" class="btn-version-view" data-version-idx="' + vi + '" style="color:var(--primary);font-weight:500;cursor:pointer;">보기</a></td>' +
            '</tr>';
        }
        vBody.innerHTML = html;
      } else {
        vBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-weak);">버전 내역이 없습니다.</td></tr>';
      }
    }

    // 이전 버전 본문 보기 모달
    if (vBody) {
      vBody.addEventListener('click', function (e) {
        var link = e.target.closest('.btn-version-view');
        if (!link) return;
        e.preventDefault();
        var idx = parseInt(link.getAttribute('data-version-idx'), 10);
        var ver = versionDataArr[idx];
        if (!ver) return;
        var titleEl = document.getElementById('versionContentModalTitle');
        if (titleEl) titleEl.textContent = ver.version_number + ' 약관 본문';
        var bodyEl = document.getElementById('versionContentModalBody');
        if (bodyEl) bodyEl.innerHTML = ver.content || '<span style="color:var(--text-weak);">본문 없음</span>';
        var modal = document.getElementById('versionContentModal');
        if (modal) modal.classList.add('active');
      });
    }

    // ── 보기 ↔ 편집 전환 (본문 블록만) ──
    function toggleEditMode(isView) {
      document.getElementById('detailViewActions').style.display = isView ? '' : 'none';
      document.getElementById('detailEditActions').style.display = isView ? 'none' : '';
      document.getElementById('viewTermsContent').style.display = isView ? '' : 'none';
      document.getElementById('editTermsContent').style.display = isView ? 'none' : '';
    }

    // ── [새 버전 등록] 버튼 ──
    var btnNewVersion = document.getElementById('btnNewVersion');
    if (btnNewVersion) {
      btnNewVersion.addEventListener('click', function () {
        location.href = 'content-terms-version-create.html?id=' + id;
      });
    }

    // ── [수정] 버튼 → 편집 모드 ──
    var btnEdit = document.getElementById('btnEditMode');
    if (btnEdit) {
      btnEdit.addEventListener('click', function () {
        toggleEditMode(false);
        var editorContainer = document.getElementById('termsDetailEditorContainer');
        if (editorContainer) {
          editorContainer.innerHTML = '';
          termsDetailQuill = new Quill(editorContainer, {
            theme: 'snow',
            modules: { toolbar: [[{ header: [1, 2, 3, false] }], ['bold', 'italic', 'underline', 'strike'], [{ list: 'ordered' }, { list: 'bullet' }], [{ indent: '-1' }, { indent: '+1' }], [{ color: [] }, { background: [] }], ['link'], ['clean']] }
          });
          termsDetailQuill.root.innerHTML = d.content || '';
        }
      });
    }

    // ── [취소] 버튼 ──
    var btnCancel = document.getElementById('btnEditCancel');
    if (btnCancel) {
      btnCancel.addEventListener('click', function () {
        if (termsDetailQuill) {
          var container = document.getElementById('termsDetailEditorContainer');
          if (container) container.innerHTML = '';
          termsDetailQuill = null;
        }
        d = JSON.parse(JSON.stringify(origData));
        renderViewMode();
        toggleEditMode(true);
      });
    }

    // ── [저장] 버튼 → 모달 ──
    var btnSave = document.getElementById('btnEditSave');
    if (btnSave) {
      btnSave.addEventListener('click', function () {
        var modal = document.getElementById('saveModal');
        if (modal) modal.classList.add('active');
      });
    }

    // ── 저장 모달 확인 ──
    var btnSaveConfirm = document.getElementById('btnSaveConfirm');
    if (btnSaveConfirm) {
      btnSaveConfirm.addEventListener('click', async function () {
        var contentHtml = termsDetailQuill ? termsDetailQuill.root.innerHTML : d.content;
        var res = await api.updateRecord('terms', id, { content: contentHtml });
        if (res.error) { alert('저장 실패: ' + (res.error.message || '알 수 없는 오류')); return; }
        await api.insertAuditLog('약관수정', 'terms', id, {});
        var modal = document.getElementById('saveModal');
        if (modal) modal.classList.remove('active');
        if (termsDetailQuill) {
          var container = document.getElementById('termsDetailEditorContainer');
          if (container) container.innerHTML = '';
          termsDetailQuill = null;
        }
        var refreshed = await api.fetchDetail('terms', id);
        if (refreshed.data) { d = refreshed.data; origData = JSON.parse(JSON.stringify(d)); }
        renderViewMode();
        toggleEditMode(true);
        alert('저장되었습니다.');
      });
    }

    // ── [공개/비공개 전환] 버튼 ──
    var btnToggleVis = document.getElementById('btnToggleVisibility');
    if (btnToggleVis) {
      btnToggleVis.addEventListener('click', function () {
        var newVis = d.visibility === '공개' ? '비공개' : '공개';
        var titleEl = document.getElementById('toggleModalTitle');
        var msgEl = document.getElementById('toggleModalMessage');
        var confirmEl = document.getElementById('btnToggleConfirm');
        if (titleEl) titleEl.textContent = newVis + ' 전환';
        if (msgEl) {
          msgEl.innerHTML = newVis === '공개'
            ? '이 약관을 공개로 전환하면 앱에서 표시됩니다.<br>공개로 전환하시겠습니까?'
            : '이 약관을 비공개로 전환하면 앱에서 더 이상 표시되지 않습니다.<br>비공개로 전환하시겠습니까?';
        }
        if (confirmEl) confirmEl.textContent = newVis + ' 전환';
        var modal = document.getElementById('toggleModal');
        if (modal) modal.classList.add('active');
      });
    }

    // ── 토글 모달 확인 ──
    var btnToggleConfirm = document.getElementById('btnToggleConfirm');
    if (btnToggleConfirm) {
      btnToggleConfirm.addEventListener('click', async function () {
        var newVis = d.visibility === '공개' ? '비공개' : '공개';
        var updateData = { visibility: newVis };
        // 최초 공개 전환 시 effective_date + v1 이력 생성
        if (newVis === '공개' && !d.effective_date) {
          var todayStr = api.getToday();
          updateData.effective_date = todayStr;
          await api.insertRecord('term_versions', {
            term_id: id,
            version_number: d.current_version || 'v1',
            effective_date: todayStr,
            end_date: null,
            change_reason: '최초 공개',
            content: d.content || ''
          });
        }
        await api.updateRecord('terms', id, updateData);
        await api.insertAuditLog('공개상태변경', 'terms', id, { from: d.visibility, to: newVis });
        alert(newVis + '로 변경되었습니다.');
        location.reload();
      });
    }

    // ── [삭제] 버튼 ──
    var btnDeleteOpen = document.getElementById('btnDeleteOpen');
    if (btnDeleteOpen) {
      btnDeleteOpen.addEventListener('click', function () {
        var modal = document.getElementById('deleteModal');
        if (modal) modal.classList.add('active');
      });
    }

    // ── 삭제 모달 확인 ──
    var btnDeleteConfirm = document.getElementById('btnDeleteConfirm');
    if (btnDeleteConfirm) {
      btnDeleteConfirm.addEventListener('click', async function () {
        var sb = window.__supabase;
        await sb.from('term_versions').delete().eq('term_id', id);
        await api.deleteRecord('terms', id);
        await api.insertAuditLog('약관삭제', 'terms', id, {});
        alert('삭제되었습니다.');
        location.href = 'contents.html#tab-terms';
      });
    }

    api.hideIfReadOnly(PERM_KEY, ['.btn-action', '.detail-actions']);
  }

  // ══════════════════════════════════════════
  // E-2. 약관 새 버전 등록 (content-terms-version-create.html)
  // ══════════════════════════════════════════

  function isTermsVersionCreatePage() {
    return !!document.getElementById('detailTermsVersionCreate') && !!document.getElementById('versionEditorContainer');
  }

  async function initTermsVersionCreate() {
    var id = api.getParam('id');
    if (!id) return;

    var btnBack = document.getElementById('btnBackToDetail');
    if (btnBack) btnBack.href = 'content-terms-detail.html?id=' + id;

    var result = await api.fetchDetail('terms', id);
    if (result.error || !result.data) { alert('약관을 불러올 수 없습니다.'); return; }
    var d = result.data;

    // 다음 버전 번호 계산
    var currentNum = 1;
    var cv = d.current_version || '';
    var match = cv.match(/v(\d+)/i);
    if (match) currentNum = parseInt(match[1], 10);
    var nextVersion = 'v' + (currentNum + 1);

    var infoEl = document.getElementById('versionCreateInfo');
    if (infoEl) {
      infoEl.innerHTML =
        '<span class="info-grid__label">약관 고유번호</span><span class="info-grid__value" style="color:var(--text-weak);">' + api.escapeHtml(d.id || '') + '</span>' +
        '<span class="info-grid__label">약관 제목</span><span class="info-grid__value">' + api.escapeHtml(d.title || '') + '</span>' +
        '<span class="info-grid__label">필수 여부</span><span class="info-grid__value">' + requiredBadge(d.is_required) + '</span>' +
        '<span class="info-grid__label">새 버전</span><span class="info-grid__value">' + api.escapeHtml(nextVersion) + '</span>' +
        '<span class="info-grid__label">공개 상태</span><span class="info-grid__value">' + publicBadge(d.visibility) + '</span>';
    }

    // Quill 에디터 초기화 (기존 본문 프리로드)
    var versionQuill = null;
    var editorContainer = document.getElementById('versionEditorContainer');
    if (editorContainer) {
      versionQuill = new Quill(editorContainer, {
        theme: 'snow',
        placeholder: '약관 본문을 입력하세요',
        modules: { toolbar: [[{ header: [1, 2, 3, false] }], ['bold', 'italic', 'underline', 'strike'], [{ list: 'ordered' }, { list: 'bullet' }], [{ indent: '-1' }, { indent: '+1' }], [{ color: [] }, { background: [] }], ['link'], ['clean']] }
      });
      versionQuill.root.innerHTML = d.content || '';
    }

    // 등록 모달 확인 버튼
    var createBtn = document.getElementById('btnVersionCreate');
    if (createBtn) {
      createBtn.addEventListener('click', async function () {
        var reasonEl = document.getElementById('versionChangeReason');
        if (!reasonEl || !reasonEl.value.trim()) {
          alert('수정 사유를 입력하세요.');
          if (reasonEl) reasonEl.focus();
          var modal = document.getElementById('registerModal');
          if (modal) modal.classList.remove('active');
          return;
        }

        var contentHtml = versionQuill ? versionQuill.root.innerHTML : '';
        var contentText = versionQuill ? versionQuill.getText().trim() : '';
        if (!contentText) {
          alert('약관 본문을 입력하세요.');
          var modal2 = document.getElementById('registerModal');
          if (modal2) modal2.classList.remove('active');
          return;
        }

        var todayStr = api.getToday();
        var sb = window.__supabase;

        // 이전 버전 end_date 업데이트
        await sb.from('term_versions').update({ end_date: todayStr }).eq('term_id', id).is('end_date', null);

        // 새 term_versions 삽입
        var versionRes = await api.insertRecord('term_versions', {
          term_id: id,
          version_number: nextVersion,
          effective_date: todayStr,
          end_date: null,
          change_reason: reasonEl.value.trim(),
          content: contentHtml
        });
        if (versionRes.error) { alert('버전 등록 실패: ' + (versionRes.error.message || '알 수 없는 오류')); return; }

        // terms 테이블 업데이트
        var updateRes = await api.updateRecord('terms', id, {
          current_version: nextVersion,
          effective_date: todayStr,
          content: contentHtml
        });
        if (updateRes.error) { alert('약관 업데이트 실패: ' + (updateRes.error.message || '알 수 없는 오류')); return; }

        await api.insertAuditLog('약관버전등록', 'terms', id, { version: nextVersion });
        alert('새 버전이 등록되었습니다.');
        location.href = 'content-terms-detail.html?id=' + id;
      });
    }
  }

  // ══════════════════════════════════════════
  // F. 등록 페이지 (create)
  // ══════════════════════════════════════════

  function isBannerCreatePage() { return !!document.getElementById('detailBannerCreate'); }
  function isNoticeCreatePage() { return !!document.getElementById('detailNoticeCreate'); }
  function isFaqCreatePage() { return !!document.getElementById('detailFaqCreate'); }
  function isTermsCreatePage() { return !!document.getElementById('detailTermsCreate'); }

  // ── 배너 등록 (content-banner-create.html) ──

  var BANNER_BUCKET = 'banner-images';

  async function uploadBannerImage(file, folder) {
    var sb = window.__supabase;
    var ext = file.name.split('.').pop().toLowerCase();
    var fileName = folder + '/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    var res = await sb.storage.from(BANNER_BUCKET).upload(fileName, file, { cacheControl: '3600', upsert: false });
    if (res.error) throw res.error;
    var pub = sb.storage.from(BANNER_BUCKET).getPublicUrl(fileName);
    return pub.data.publicUrl;
  }

  async function deleteBannerImage(url) {
    if (!url) return;
    var sb = window.__supabase;
    var m = url.match(new RegExp(BANNER_BUCKET + '/(.+)$'));
    if (!m) return;
    await sb.storage.from(BANNER_BUCKET).remove([m[1]]);
  }

  var BANNER_IMG_PLACEHOLDER =
    '<div class="edu-img-preview__placeholder">' +
    '<svg viewBox="0 0 24 24"><path d="M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>' +
    '360 \u00d7 100px (\ub610\ub294 720 \u00d7 200px)</div>';

  function bindBannerImageUpload(opts) {
    var fileInput = document.getElementById(opts.fileInputId);
    var preview = document.getElementById(opts.previewId);
    var actions = document.getElementById(opts.actionsId);
    if (!fileInput || !preview || !actions) return;

    function renderUploadBtn() {
      actions.innerHTML = '<button class="edu-img-actions__btn" id="' + opts.uploadBtnId + '">\uc774\ubbf8\uc9c0 \uc5c5\ub85c\ub4dc</button>';
      document.getElementById(opts.uploadBtnId).addEventListener('click', function () { fileInput.click(); });
    }

    function renderReplaceDeleteBtns() {
      actions.innerHTML =
        '<button class="edu-img-actions__btn" id="' + opts.uploadBtnId + '">\uc774\ubbf8\uc9c0 \uad50\uccb4</button>' +
        '<button class="edu-img-actions__btn edu-img-actions__btn--delete" id="' + opts.uploadBtnId + 'Del">\uc0ad\uc81c</button>';
      document.getElementById(opts.uploadBtnId).addEventListener('click', function () { fileInput.click(); });
      document.getElementById(opts.uploadBtnId + 'Del').addEventListener('click', async function () {
        try { await deleteBannerImage(opts.getCurrentUrl()); } catch (e) { /* ignore */ }
        opts.setUrl(null);
        preview.innerHTML = BANNER_IMG_PLACEHOLDER;
        renderUploadBtn();
      });
    }

    var initBtn = document.getElementById(opts.uploadBtnId);
    if (initBtn) initBtn.addEventListener('click', function () { fileInput.click(); });

    fileInput.addEventListener('change', async function () {
      var file = fileInput.files[0];
      if (!file) return;
      try {
        var prevUrl = opts.getCurrentUrl();
        if (prevUrl) await deleteBannerImage(prevUrl);
        var url = await uploadBannerImage(file, opts.folder);
        opts.setUrl(url);
        preview.innerHTML = '<img src="' + url + '" alt="\ubbf8\ub9ac\ubcf4\uae30">';
        renderReplaceDeleteBtns();
      } catch (err) {
        alert('\uc774\ubbf8\uc9c0 \uc5c5\ub85c\ub4dc \uc2e4\ud328: ' + (err.message || err));
      }
      fileInput.value = '';
    });
  }

  var bannerImageUrl = null;
  var bannerCreateSaved = false;

  async function initBannerCreate() {
    // 페이지 이탈 시 미저장 이미지 Storage 정리
    function cleanupOrphanImages() {
      if (bannerCreateSaved) return;
      if (bannerImageUrl) { try { deleteBannerImage(bannerImageUrl); } catch (e) { /* ignore */ } }
    }
    window.addEventListener('beforeunload', cleanupOrphanImages);
    window.addEventListener('pagehide', cleanupOrphanImages);

    // 이미지 업로드 바인딩
    bindBannerImageUpload({
      uploadBtnId: 'bannerImgBtn',
      fileInputId: 'bannerImgFile',
      previewId: 'bannerImgPreview',
      actionsId: 'bannerImgActions',
      folder: 'banners',
      getCurrentUrl: function () { return bannerImageUrl; },
      setUrl: function (url) { bannerImageUrl = url; }
    });

    // 표시 위치 변경 시 노출순서 자동 계산
    var positionSelect = document.getElementById('bannerPosition');
    var orderInput = document.getElementById('bannerDisplayOrder');

    async function updateDisplayOrder() {
      if (!positionSelect || !orderInput) return;
      var pos = positionSelect.value;
      try {
        var sb = window.__supabase;
        var maxRes = await sb.from('banners')
          .select('display_order')
          .eq('display_position', pos)
          .order('display_order', { ascending: false })
          .limit(1);
        var maxOrder = (maxRes.data && maxRes.data.length > 0) ? (maxRes.data[0].display_order || 0) : 0;
        orderInput.value = maxOrder + 1;
      } catch (e) {
        orderInput.value = 1;
      }
    }
    if (positionSelect) positionSelect.addEventListener('change', updateDisplayOrder);
    await updateDisplayOrder();

    // 연결 유형 라디오 변경 시 placeholder 업데이트
    var linkRadios = document.querySelectorAll('input[name="linkType"]');
    var linkUrlInput = document.getElementById('bannerLinkUrl');
    linkRadios.forEach(function (radio) {
      radio.addEventListener('change', function () {
        if (!linkUrlInput) return;
        if (radio.value === '앱 내 화면') {
          linkUrlInput.placeholder = '\uc575 \ub0b4 \ud654\uba74 \uacbd\ub85c\ub97c \uc785\ub825\ud558\uc138\uc694';
        } else {
          linkUrlInput.placeholder = 'URL\uc744 \uc785\ub825\ud558\uc138\uc694';
        }
      });
    });

    // 등록 모달 확인 버튼
    var createBtn = document.querySelector('#registerModal .modal__btn--confirm-primary');
    if (!createBtn) createBtn = document.getElementById('btnBannerCreate');
    if (createBtn) {
      createBtn.addEventListener('click', async function () {
        var titleEl = document.getElementById('bannerTitle');
        var startEl = document.getElementById('bannerStartDate');
        var endEl = document.getElementById('bannerEndDate');

        // 필수값 검증
        if (!titleEl || !titleEl.value.trim()) { alert('배너 제목을 입력하세요.'); if (titleEl) titleEl.focus(); return; }
        if (!startEl || !startEl.value) { alert('노출 시작일을 선택하세요.'); return; }
        if (!endEl || !endEl.value) { alert('노출 종료일을 선택하세요.'); return; }
        if (startEl.value > endEl.value) { alert('노출 종료일은 시작일 이후여야 합니다.'); return; }

        var linkType = '외부 URL';
        var checkedRadio = document.querySelector('input[name="linkType"]:checked');
        if (checkedRadio) linkType = checkedRadio.value;

        var data = {
          title: titleEl.value.trim(),
          image_url: bannerImageUrl || null,
          link_type: linkType,
          link_url: linkUrlInput ? linkUrlInput.value.trim() || null : null,
          display_position: positionSelect ? positionSelect.value : '홈 상단',
          display_order: orderInput ? parseInt(orderInput.value, 10) : 1,
          start_date: startEl.value,
          end_date: endEl.value,
          visibility: '비공개'
        };

        var res = await api.insertRecord('banners', data);
        if (res.error) {
          alert('배너 등록 실패: ' + (res.error.message || '알 수 없는 오류'));
          return;
        }

        var newId = (res.data && res.data[0]) ? res.data[0].id : null;
        if (newId) await api.insertAuditLog('배너등록', 'banners', newId, {});
        bannerCreateSaved = true;
        alert('배너가 등록되었습니다.');
        location.href = 'contents.html#tab-banner';
      });
    }
  }

  // ── 공지 등록 (content-notice-create.html) ──

  var noticeCreateAttachUrls = [];
  var noticeCreateSaved = false;
  var noticeCreateQuill = null;

  async function initNoticeCreate() {
    // 페이지 이탈 시 미저장 첨부파일 정리
    function cleanupOrphanFiles() {
      if (noticeCreateSaved) return;
      for (var i = 0; i < noticeCreateAttachUrls.length; i++) {
        try { deleteNoticeAttachment(noticeCreateAttachUrls[i]); } catch (e) { /* ignore */ }
      }
    }
    window.addEventListener('beforeunload', cleanupOrphanFiles);
    window.addEventListener('pagehide', cleanupOrphanFiles);

    // Quill 에디터 즉시 초기화
    var editorContainer = document.getElementById('noticeEditorContainer');
    if (editorContainer) {
      noticeCreateQuill = new Quill(editorContainer, {
        theme: 'snow',
        placeholder: '공지 내용을 입력하세요',
        modules: { toolbar: [[{ header: [1, 2, 3, false] }], ['bold', 'italic', 'underline', 'strike'], [{ list: 'ordered' }, { list: 'bullet' }], [{ color: [] }, { background: [] }], ['link', 'image'], ['clean']] }
      });
    }

    // 첨부파일 목록 렌더링
    var attachList = document.getElementById('noticeAttachmentList');
    function refreshAttachList() {
      renderEditAttachments(attachList, noticeCreateAttachUrls, function (idx) {
        var removed = noticeCreateAttachUrls.splice(idx, 1)[0];
        deleteNoticeAttachment(removed);
        refreshAttachList();
      });
    }

    // 파일 추가 버튼
    var btnAdd = document.getElementById('btnAddAttachment');
    var fileInput = document.getElementById('noticeFileInput');
    if (btnAdd && fileInput) {
      btnAdd.addEventListener('click', function () {
        if (noticeCreateAttachUrls.length >= MAX_NOTICE_FILE_COUNT) {
          alert('최대 ' + MAX_NOTICE_FILE_COUNT + '개까지 첨부할 수 있습니다.');
          return;
        }
        fileInput.click();
      });
      fileInput.addEventListener('change', async function () {
        var file = fileInput.files[0];
        if (!file) return;
        if (!validateNoticeFile(file)) { fileInput.value = ''; return; }
        if (noticeCreateAttachUrls.length >= MAX_NOTICE_FILE_COUNT) {
          alert('최대 ' + MAX_NOTICE_FILE_COUNT + '개까지 첨부할 수 있습니다.');
          fileInput.value = '';
          return;
        }
        try {
          var url = await uploadNoticeAttachment(file);
          noticeCreateAttachUrls.push(url);
          refreshAttachList();
        } catch (err) {
          alert('파일 업로드 실패: ' + (err.message || err));
        }
        fileInput.value = '';
      });
    }

    // 등록 버튼 → 모달 열기
    var btnRegister = document.getElementById('btnNoticeRegister');
    if (btnRegister) {
      btnRegister.addEventListener('click', function () {
        var modal = document.getElementById('registerModal');
        if (modal) modal.classList.add('active');
      });
    }

    // 등록 모달 확인
    var btnConfirm = document.getElementById('btnRegisterConfirm');
    if (btnConfirm) {
      btnConfirm.addEventListener('click', async function () {
        var titleEl = document.getElementById('noticeTitle');
        if (!titleEl || !titleEl.value.trim()) {
          alert('공지사항 제목을 입력하세요.');
          if (titleEl) titleEl.focus();
          return;
        }

        var data = {
          title: titleEl.value.trim(),
          target: document.getElementById('noticeTarget') ? document.getElementById('noticeTarget').value : '전체(공통)',
          is_pinned: document.getElementById('noticePinned') ? document.getElementById('noticePinned').checked : false,
          visibility: '비공개',
          content: noticeCreateQuill ? noticeCreateQuill.root.innerHTML : '',
          attachment_urls: noticeCreateAttachUrls.length > 0 ? noticeCreateAttachUrls : null
        };

        var res = await api.insertRecord('notices', data);
        if (res.error) {
          alert('공지사항 등록 실패: ' + (res.error.message || '알 수 없는 오류'));
          return;
        }

        var newId = (res.data && res.data[0]) ? res.data[0].id : null;
        if (newId) await api.insertAuditLog('공지등록', 'notices', newId, {});
        noticeCreateSaved = true;
        alert('공지사항이 등록되었습니다.');
        location.href = 'contents.html#tab-notice';
      });
    }
  }

  // ── FAQ 등록 (content-faq-create.html) ──

  var faqCreateQuill = null;
  var faqCreateSaved = false;

  async function initFaqCreate() {
    // Quill 에디터 초기화
    var editorContainer = document.getElementById('faqEditorContainer');
    if (editorContainer) {
      faqCreateQuill = new Quill(editorContainer, {
        theme: 'snow',
        placeholder: '답변을 입력하세요',
        modules: { toolbar: [[{ header: [1, 2, 3, false] }], ['bold', 'italic', 'underline', 'strike'], [{ list: 'ordered' }, { list: 'bullet' }], [{ color: [] }, { background: [] }], ['link', 'image'], ['clean']] }
      });
    }

    // 노출순서 자동계산: 같은 카테고리 내 max(display_order) + 1
    var categorySelect = document.getElementById('faqCategory');
    var orderInput = document.getElementById('faqDisplayOrder');

    async function updateFaqDisplayOrder() {
      if (!categorySelect || !orderInput) return;
      var cat = categorySelect.value;
      try {
        var sb = window.__supabase;
        var maxRes = await sb.from('faqs')
          .select('display_order')
          .eq('category', cat)
          .order('display_order', { ascending: false })
          .limit(1);
        var maxOrder = (maxRes.data && maxRes.data.length > 0) ? (maxRes.data[0].display_order || 0) : 0;
        orderInput.value = maxOrder + 1;
      } catch (e) {
        orderInput.value = 1;
      }
    }
    if (categorySelect) categorySelect.addEventListener('change', updateFaqDisplayOrder);
    await updateFaqDisplayOrder();

    // 등록 모달 확인 버튼
    var createBtn = document.getElementById('btnFaqCreate');
    if (createBtn) {
      createBtn.addEventListener('click', async function () {
        var questionEl = document.getElementById('faqQuestion');
        if (!questionEl || !questionEl.value.trim()) {
          alert('질문을 입력하세요.');
          if (questionEl) questionEl.focus();
          return;
        }

        // 답변 필수 검증
        var answerHtml = faqCreateQuill ? faqCreateQuill.root.innerHTML : '';
        var answerText = faqCreateQuill ? faqCreateQuill.getText().trim() : '';
        if (!answerText) {
          alert('답변을 입력하세요.');
          return;
        }

        var data = {
          category: categorySelect ? categorySelect.value : '공통',
          question: questionEl.value.trim(),
          answer: answerHtml,
          target: document.getElementById('faqTarget') ? document.getElementById('faqTarget').value : '전체(공통)',
          display_order: orderInput ? parseInt(orderInput.value, 10) : 1,
          visibility: '비공개'
        };

        var res = await api.insertRecord('faqs', data);
        if (res.error) {
          alert('FAQ 등록 실패: ' + (res.error.message || '알 수 없는 오류'));
          return;
        }

        var newId = (res.data && res.data[0]) ? res.data[0].id : null;
        if (newId) await api.insertAuditLog('FAQ등록', 'faqs', newId, {});
        faqCreateSaved = true;
        alert('FAQ가 등록되었습니다.');
        location.href = 'contents.html#tab-faq';
      });
    }
  }

  // ══════════════════════════════════════════
  // G. 공통 모달 (비공개/삭제)
  // ══════════════════════════════════════════

  function bindContentModals(table, id, data) {
    // 비공개 처리
    var privateBtn = document.querySelector('#privateModal .modal__btn--delete, #privateModal .modal__btn--confirm-danger');
    if (privateBtn) {
      privateBtn.addEventListener('click', async function () {
        var newVis = data.visibility === '공개' || data.visibility === '노출중' ? '비공개' : '공개';
        await api.updateRecord(table, id, { visibility: newVis });
        await api.insertAuditLog('공개상태변경', table, id, { from: data.visibility, to: newVis });
        alert(newVis + '로 변경되었습니다.');
        location.reload();
      });
    }

    // 삭제 처리
    var deleteBtn = document.querySelector('#deleteModal .modal__btn--delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async function () {
        await api.deleteRecord(table, id);
        await api.insertAuditLog('콘텐츠삭제', table, id, {});
        alert('삭제되었습니다.');
        var tabHash = { notices: '#tab-notice', faqs: '#tab-faq', terms: '#tab-terms', banners: '#tab-banner' };
        location.href = 'contents.html' + (tabHash[table] || '');
      });
    }

    api.hideIfReadOnly(PERM_KEY, ['.btn-action', '.detail-actions']);
  }

  // ══════════════════════════════════════════
  // 초기화
  // ══════════════════════════════════════════

  document.addEventListener('DOMContentLoaded', function () {
    if (isListPage()) initList();
    else if (isBannerCreatePage()) initBannerCreate();
    else if (isNoticeCreatePage()) initNoticeCreate();
    else if (isFaqCreatePage()) initFaqCreate();
    else if (isTermsCreatePage()) initTermsCreate();
    else if (isTermsVersionCreatePage()) initTermsVersionCreate();
    else if (isBannerDetailPage()) loadBannerDetail();
    else if (isNoticeDetailPage()) loadNoticeDetail();
    else if (isFaqDetailPage()) loadFaqDetail();
    else if (isTermsDetailPage()) loadTermsDetail();
  });

})();
