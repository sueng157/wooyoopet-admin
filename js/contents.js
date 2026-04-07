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
    var filters = buildTabFilters(tab, 'created_at');

    var result = await api.fetchList('notices', {
      filters: filters,
      orderBy: 'created_at', page: nPage, perPage: PER_PAGE
    });
    if (result.error) { api.showTableEmpty(noticeBody, 9, '데이터 로드 실패'); return; }
    if (noticeCount) noticeCount.textContent = api.formatNumber(result.count);
    if (!result.data.length) { api.showTableEmpty(noticeBody, 9); return; }

    var html = '';
    for (var i = 0; i < result.data.length; i++) {
      var n = result.data[i];
      var start = (nPage - 1) * PER_PAGE;
      html += '<tr>' +
        '<td>' + (start + i + 1) + '</td>' +
        '<td>' + api.escapeHtml(n.title) + '</td>' +
        '<td>' + api.autoBadge(n.target || '') + '</td>' +
        '<td>' + (n.is_pinned ? '<span style="color:var(--danger);font-weight:600;">고정</span>' : '-') + '</td>' +
        '<td>' + api.autoBadge(n.visibility === '공개' ? '공개' : '비공개') + '</td>' +
        '<td>' + (n.view_count || 0) + '</td>' +
        '<td>' + (n.push_sent ? '발송' : '-') + '</td>' +
        '<td>' + api.formatDate(n.created_at) + '</td>' +
        '<td>' + api.renderDetailLink('content-notice-detail.html', n.id) + '</td>' +
        '</tr>';
    }
    noticeBody.innerHTML = html;
    var pagination = tab ? tab.querySelector('.pagination') : null;
    if (pagination) api.renderPagination(pagination, nPage, result.count, PER_PAGE, function (p) { nPage = p; loadNoticeList(); });
  }

  // ── FAQ ──
  async function loadFaqList() {
    if (!faqBody) return;
    api.showTableLoading(faqBody, 8);
    var tab = document.getElementById('tab-faq');
    var filters = buildTabFilters(tab, 'created_at');

    var result = await api.fetchList('faqs', {
      filters: filters,
      orderBy: 'category', ascending: true, page: fPage, perPage: PER_PAGE
    });
    if (result.error) { api.showTableEmpty(faqBody, 8, '데이터 로드 실패'); return; }
    if (faqCount) faqCount.textContent = api.formatNumber(result.count);
    if (!result.data.length) { api.showTableEmpty(faqBody, 8); return; }

    var html = '';
    for (var i = 0; i < result.data.length; i++) {
      var f = result.data[i];
      var start = (fPage - 1) * PER_PAGE;
      html += '<tr>' +
        '<td>' + (start + i + 1) + '</td>' +
        '<td>' + api.escapeHtml(f.category || '') + '</td>' +
        '<td>' + api.escapeHtml(f.question || '') + '</td>' +
        '<td>' + api.autoBadge(f.target || '') + '</td>' +
        '<td>' + (f.display_order || '-') + '</td>' +
        '<td>' + api.autoBadge(f.visibility === '공개' ? '공개' : '비공개') + '</td>' +
        '<td>' + api.formatDate(f.created_at) + '</td>' +
        '<td>' + api.renderDetailLink('content-faq-detail.html', f.id) + '</td>' +
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
        map: function (n) { return { title: n.title || '', target: n.target || '', pinned: n.is_pinned ? '고정' : '-', visibility: n.visibility || '', views: n.view_count || 0, push: n.push_sent ? '발송' : '미발송', created: api.formatDate(n.created_at) }; },
        headers: [{ key: 'title', label: '제목' }, { key: 'target', label: '대상' }, { key: 'pinned', label: '상단고정' }, { key: 'visibility', label: '공개' }, { key: 'views', label: '조회수' }, { key: 'push', label: '푸시' }, { key: 'created', label: '등록일' }],
        filename: '공지사항'
      },
      'tab-faq': {
        table: 'faqs', orderBy: 'created_at', dateCol: 'created_at',
        map: function (f) { return { category: f.category || '', question: f.question || '', visibility: f.visibility || '', order: f.display_order || 0, created: api.formatDate(f.created_at) }; },
        headers: [{ key: 'category', label: '카테고리' }, { key: 'question', label: '질문' }, { key: 'visibility', label: '공개' }, { key: 'order', label: '순서' }, { key: 'created', label: '등록일' }],
        filename: 'FAQ'
      }
    };
    var c = cfg[tabName];
    if (!c) { alert('이 탭은 엑셀 다운로드를 지원하지 않습니다.'); return; }
    var tab = document.getElementById(tabName);

    // 배너 탭은 전용 필터 사용
    var filters;
    if (tabName === 'tab-banner') {
      filters = [];
      var dateCol = (b.dateType && b.dateType.value) ? b.dateType.value : 'created_at';
      if (b.dateFrom && b.dateFrom.value) filters.push({ column: dateCol, op: 'gte', value: b.dateFrom.value + 'T00:00:00' });
      if (b.dateTo && b.dateTo.value) filters.push({ column: dateCol, op: 'lte', value: b.dateTo.value + 'T23:59:59' });
      if (b.position && b.position.value) filters.push({ column: 'display_position', op: 'eq', value: b.position.value });
      if (b.public && b.public.value) filters.push({ column: 'visibility', op: 'eq', value: b.public.value });
    } else {
      filters = buildTabFilters(tab, c.dateCol);
    }

    var fetchOpts = { filters: filters, orderBy: c.orderBy };
    if (c.ascending !== undefined) fetchOpts.ascending = c.ascending;
    if (tabName === 'tab-banner' && b.searchInput && b.searchInput.value.trim()) {
      fetchOpts.search = { column: 'title', value: b.searchInput.value.trim() };
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

    // ── 나머지 탭(공지/FAQ/약관) — 기존 로직 유지 ──
    var tabs = ['tab-notice', 'tab-faq', 'tab-terms'];
    var loaders = [loadNoticeList, loadFaqList, loadTermsList];
    var pageResets = [function () { nPage = 1; }, function () { fPage = 1; }, function () { tPage = 1; }];

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
        location.href = 'contents.html';
      });
    }
  }

  // ══════════════════════════════════════════
  // C. 공지사항 상세 (content-notice-detail.html)
  // ══════════════════════════════════════════

  function isNoticeDetailPage() {
    return !!document.getElementById('detailNoticeBasic');
  }

  async function loadNoticeDetail() {
    var id = api.getParam('id');
    if (!id) return;
    var result = await api.fetchDetail('notices', id);
    if (result.error || !result.data) { alert('공지사항을 불러올 수 없습니다.'); return; }
    var d = result.data;

    var el = document.getElementById('detailNoticeBasic');
    if (el) {
      api.setHtml(el, '<div class="info-grid">' +
        '<span class="info-grid__label">제목</span><span class="info-grid__value">' + api.escapeHtml(d.title) + '</span>' +
        '<span class="info-grid__label">대상</span><span class="info-grid__value">' + api.escapeHtml(d.target || '') + '</span>' +
        '<span class="info-grid__label">상단 고정</span><span class="info-grid__value">' + (d.is_pinned ? '고정' : '-') + '</span>' +
        '<span class="info-grid__label">공개 상태</span><span class="info-grid__value">' + api.autoBadge(d.visibility) + '</span>' +
        '<span class="info-grid__label">조회수</span><span class="info-grid__value">' + (d.view_count || 0) + '</span>' +
        '<span class="info-grid__label">푸시 발송</span><span class="info-grid__value">' + (d.push_sent ? '발송 완료' : '미발송') + '</span>' +
        '<span class="info-grid__label">등록일시</span><span class="info-grid__value">' + api.formatDate(d.created_at) + '</span>' +
        '</div>');
    }

    var contentEl = document.getElementById('detailNoticeContent');
    if (contentEl) {
      api.setHtml(contentEl, '<div style="white-space:pre-wrap;line-height:1.6;">' + api.escapeHtml(d.content || '') + '</div>');
    }

    // 푸시 발송 모달
    var pushBtn = document.querySelector('#pushModal .modal__btn--confirm-primary');
    if (pushBtn) {
      pushBtn.addEventListener('click', async function () {
        await api.updateRecord('notices', id, { push_sent: true });
        await api.insertAuditLog('푸시발송', 'notices', id, {});
        alert('푸시 발송이 완료되었습니다.');
        location.reload();
      });
    }

    bindContentModals('notices', id, d);
  }

  // ══════════════════════════════════════════
  // D. FAQ 상세 (content-faq-detail.html)
  // ══════════════════════════════════════════

  function isFaqDetailPage() {
    return !!document.getElementById('detailFaqBasic');
  }

  async function loadFaqDetail() {
    var id = api.getParam('id');
    if (!id) return;
    var result = await api.fetchDetail('faqs', id);
    if (result.error || !result.data) { alert('FAQ를 불러올 수 없습니다.'); return; }
    var d = result.data;

    var el = document.getElementById('detailFaqBasic');
    if (el) {
      api.setHtml(el, '<div class="info-grid">' +
        '<span class="info-grid__label">카테고리</span><span class="info-grid__value">' + api.escapeHtml(d.category || '') + '</span>' +
        '<span class="info-grid__label">질문</span><span class="info-grid__value">' + api.escapeHtml(d.question || '') + '</span>' +
        '<span class="info-grid__label">답변</span><span class="info-grid__value"><div style="white-space:pre-wrap;">' + api.escapeHtml(d.answer || '') + '</div></span>' +
        '<span class="info-grid__label">대상</span><span class="info-grid__value">' + api.escapeHtml(d.target || '') + '</span>' +
        '<span class="info-grid__label">노출 순서</span><span class="info-grid__value">' + (d.display_order || '-') + '</span>' +
        '<span class="info-grid__label">공개 상태</span><span class="info-grid__value">' + api.autoBadge(d.visibility) + '</span>' +
        '<span class="info-grid__label">등록일시</span><span class="info-grid__value">' + api.formatDate(d.created_at) + '</span>' +
        '</div>');
    }
    bindContentModals('faqs', id, d);
  }

  // ══════════════════════════════════════════
  // E. 약관 상세 (content-terms-detail.html)
  // ══════════════════════════════════════════

  function isTermsDetailPage() {
    return !!document.getElementById('detailTermsBasic');
  }

  async function loadTermsDetail() {
    var id = api.getParam('id');
    if (!id) return;
    var result = await api.fetchDetail('terms', id);
    if (result.error || !result.data) { alert('약관을 불러올 수 없습니다.'); return; }
    var d = result.data;

    var el = document.getElementById('detailTermsBasic');
    if (el) {
      api.setHtml(el, '<div class="info-grid">' +
        '<span class="info-grid__label">약관명</span><span class="info-grid__value">' + api.escapeHtml(d.title) + '</span>' +
        '<span class="info-grid__label">필수/선택</span><span class="info-grid__value">' + (d.is_required ? '<span style="color:var(--danger);">필수</span>' : '선택') + '</span>' +
        '<span class="info-grid__label">현재 버전</span><span class="info-grid__value">' + api.escapeHtml(d.current_version || '') + '</span>' +
        '<span class="info-grid__label">시행일</span><span class="info-grid__value">' + api.formatDate(d.effective_date, true) + '</span>' +
        '<span class="info-grid__label">공개 상태</span><span class="info-grid__value">' + api.autoBadge(d.visibility) + '</span>' +
        '</div>');
    }

    // 버전 내역 로드
    var vBody = document.getElementById('detailTermsVersions');
    if (vBody) {
      var vResult = await api.fetchList('term_versions', {
        filters: [{ column: 'term_id', op: 'eq', value: id }],
        orderBy: 'effective_date', ascending: false, perPage: 100
      });
      if (vResult.data && vResult.data.length > 0) {
        var html = '';
        for (var i = 0; i < vResult.data.length; i++) {
          var v = vResult.data[i];
          html += '<tr>' +
            '<td>' + api.escapeHtml(v.version_number || '') + '</td>' +
            '<td>' + api.formatDate(v.effective_date, true) + '</td>' +
            '<td>' + (v.end_date ? api.formatDate(v.end_date, true) : '-') + '</td>' +
            '<td>' + api.escapeHtml(v.change_reason || '-') + '</td>' +
            '</tr>';
        }
        vBody.innerHTML = html;
      } else {
        vBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-weak);">버전 내역이 없습니다.</td></tr>';
      }
    }

    // 약관 내용
    var contentEl = document.getElementById('detailTermsContent');
    if (contentEl) {
      // 최신 버전의 내용 표시
      var latestVersion = await api.fetchList('term_versions', {
        filters: [{ column: 'term_id', op: 'eq', value: id }],
        orderBy: 'effective_date', ascending: false, perPage: 1
      });
      if (latestVersion.data && latestVersion.data.length > 0) {
        api.setHtml(contentEl, '<div style="white-space:pre-wrap;line-height:1.6;">' + api.escapeHtml(latestVersion.data[0].content || '') + '</div>');
      }
    }

    // 새 버전 발행 모달
    var versionBtn = document.querySelector('#versionModal .modal__btn--confirm-primary');
    if (versionBtn) {
      versionBtn.addEventListener('click', async function () {
        await api.insertAuditLog('약관버전발행', 'terms', id, {});
        alert('새 버전이 발행되었습니다.');
        location.reload();
      });
    }

    bindContentModals('terms', id, d);
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
        location.href = 'contents.html';
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
        location.href = 'contents.html';
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
    else if (isBannerDetailPage()) loadBannerDetail();
    else if (isNoticeDetailPage()) loadNoticeDetail();
    else if (isFaqDetailPage()) loadFaqDetail();
    else if (isTermsDetailPage()) loadTermsDetail();
  });

})();
