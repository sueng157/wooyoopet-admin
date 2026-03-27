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
  }

  // ── 배너 ──
  async function loadBannerList() {
    if (!bannerBody) return;
    api.showTableLoading(bannerBody, 9);
    var tab = document.getElementById('tab-banner');
    var filters = buildTabFilters(tab, 'start_date');

    var result = await api.fetchList('banners', {
      filters: filters,
      orderBy: 'display_order', ascending: true, page: bPage, perPage: PER_PAGE
    });
    if (result.error) { api.showTableEmpty(bannerBody, 9, '데이터 로드 실패'); return; }
    if (bannerCount) bannerCount.textContent = api.formatNumber(result.count);
    if (!result.data.length) { api.showTableEmpty(bannerBody, 9); return; }

    var html = '';
    for (var i = 0; i < result.data.length; i++) {
      var b = result.data[i];
      html += '<tr>' +
        '<td>' + (b.display_order || (i + 1)) + '</td>' +
        '<td>' + api.escapeHtml(b.title) + '</td>' +
        '<td>' + api.escapeHtml(b.link_type || '') + '</td>' +
        '<td>' + api.escapeHtml(b.display_position || '') + '</td>' +
        '<td>' + api.formatDate(b.start_date, true) + '</td>' +
        '<td>' + api.formatDate(b.end_date, true) + '</td>' +
        '<td>' + api.autoBadge(b.visibility) + '</td>' +
        '<td>' + api.formatDate(b.created_at) + '</td>' +
        '<td>' + api.renderDetailLink('content-banner-detail.html', b.id) + '</td>' +
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

  function bindListEvents() {
    var tabs = ['tab-banner', 'tab-notice', 'tab-faq', 'tab-terms'];
    var loaders = [loadBannerList, loadNoticeList, loadFaqList, loadTermsList];
    var pageResets = [function () { bPage = 1; }, function () { nPage = 1; }, function () { fPage = 1; }, function () { tPage = 1; }];

    for (var i = 0; i < tabs.length; i++) {
      var tab = document.getElementById(tabs[i]);
      if (!tab) continue;
      (function (t, load, resetPage) {
        var btnSearch = t.querySelector('.btn-search');
        if (btnSearch) btnSearch.addEventListener('click', function () { resetPage(); load(); });
        var searchInput = t.querySelector('.filter-input--search');
        if (searchInput) searchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { resetPage(); load(); } });
        var btnExcel = t.querySelector('.btn-excel');
        if (btnExcel) btnExcel.addEventListener('click', function () {
          alert('엑셀 다운로드는 준비 중입니다.');
        });
      })(tab, loaders[i], pageResets[i]);
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
    return !!document.getElementById('detailBannerBasic');
  }

  async function loadBannerDetail() {
    var id = api.getParam('id');
    if (!id) return;
    var result = await api.fetchDetail('banners', id);
    if (result.error || !result.data) { alert('배너를 불러올 수 없습니다.'); return; }
    var d = result.data;

    var el = document.getElementById('detailBannerBasic');
    if (el) {
      api.setHtml(el, '<div class="info-grid">' +
        '<span class="info-grid__label">제목</span><span class="info-grid__value">' + api.escapeHtml(d.title) + '</span>' +
        '<span class="info-grid__label">이미지 URL</span><span class="info-grid__value">' + api.escapeHtml(d.image_url || '') + '</span>' +
        '<span class="info-grid__label">링크 유형</span><span class="info-grid__value">' + api.escapeHtml(d.link_type || '') + '</span>' +
        '<span class="info-grid__label">링크 URL</span><span class="info-grid__value">' + api.escapeHtml(d.link_url || '') + '</span>' +
        '<span class="info-grid__label">노출 위치</span><span class="info-grid__value">' + api.escapeHtml(d.display_position || '') + '</span>' +
        '<span class="info-grid__label">노출 순서</span><span class="info-grid__value">' + (d.display_order || '-') + '</span>' +
        '<span class="info-grid__label">노출 시작일</span><span class="info-grid__value">' + api.formatDate(d.start_date, true) + '</span>' +
        '<span class="info-grid__label">노출 종료일</span><span class="info-grid__value">' + api.formatDate(d.end_date, true) + '</span>' +
        '<span class="info-grid__label">노출 상태</span><span class="info-grid__value">' + api.autoBadge(d.visibility) + '</span>' +
        '<span class="info-grid__label">등록일시</span><span class="info-grid__value">' + api.formatDate(d.created_at) + '</span>' +
        '</div>');
    }
    bindContentModals('banners', id, d);
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
    else if (isBannerDetailPage()) loadBannerDetail();
    else if (isNoticeDetailPage()) loadNoticeDetail();
    else if (isFaqDetailPage()) loadFaqDetail();
    else if (isTermsDetailPage()) loadTermsDetail();
    // Create pages - minimal binding for now
  });

})();
