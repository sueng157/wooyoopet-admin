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
  // ── 탭 2: 유치원 후기 ──
  var k = {};
  var gPage = 1, kPage = 1;

  function cacheListDom() {
    var tab1 = document.getElementById('tab-guardian');
    var tab2 = document.getElementById('tab-kindergarten');

    if (tab1) {
      var dates1 = tab1.querySelectorAll('.filter-input--date');
      var sels1 = tab1.querySelectorAll('.filter-select');
      g.dateFrom = dates1[0]; g.dateTo = dates1[1];
      g.satisfaction = sels1[0];
      g.searchInput = tab1.querySelector('.filter-input--search');
      g.btnSearch = tab1.querySelector('.btn-search');
      g.btnExcel = tab1.querySelector('.btn-excel');
      g.resultCount = tab1.querySelector('.result-header__count strong');
      g.body = document.getElementById('guardianListBody');
      g.pagination = tab1.querySelector('.pagination');
    }

    if (tab2) {
      var dates2 = tab2.querySelectorAll('.filter-input--date');
      var sels2 = tab2.querySelectorAll('.filter-select');
      k.dateFrom = dates2[0]; k.dateTo = dates2[1];
      k.satisfaction = sels2[0];
      k.guardianOnly = sels2[1];
      k.searchInput = tab2.querySelector('.filter-input--search');
      k.btnSearch = tab2.querySelector('.btn-search');
      k.btnExcel = tab2.querySelector('.btn-excel');
      k.resultCount = tab2.querySelector('.result-header__count strong');
      k.body = document.getElementById('kgReviewListBody');
      k.pagination = tab2.querySelector('.pagination');
    }
  }

  // ── 보호자 후기 필터 ──
  function buildGuardianFilters() {
    var filters = [];
    if (g.dateFrom && g.dateFrom.value) filters.push({ column: 'written_at', op: 'gte', value: g.dateFrom.value + 'T00:00:00' });
    if (g.dateTo && g.dateTo.value) filters.push({ column: 'written_at', op: 'lte', value: g.dateTo.value + 'T23:59:59' });
    if (g.satisfaction) {
      var v = g.satisfaction.value;
      if (v && v !== '전체') filters.push({ column: 'satisfaction', op: 'eq', value: v });
    }
    return filters;
  }

  function buildGuardianSearch() {
    if (!g.searchInput || !g.searchInput.value.trim()) return [];
    var q = '%' + g.searchInput.value.trim() + '%';
    return ['content.ilike.' + q];
  }

  function renderGuardianRow(r, idx) {
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
      '<td>' + idx + '</td>' +
      '<td>' + api.formatDate(r.written_at) + '</td>' +
      '<td>' + api.escapeHtml(memberNick) + '</td>' +
      '<td>' + api.escapeHtml(kgName) + '</td>' +
      '<td>' + api.escapeHtml(petName) + '</td>' +
      '<td>' + api.autoBadge(r.satisfaction) + '</td>' +
      '<td>' + (tagHtml || '-') + '</td>' +
      '<td><span class="review-content">' + api.escapeHtml(preview) + '</span></td>' +
      '<td><span class="' + imgClass + '">' + imgCount + '장</span></td>' +
      '<td>' + (r.reservation_id ? api.renderDetailLink('reservation-detail.html', r.reservation_id, 'R-' + String(r.reservation_id).substring(0, 8)) : '-') + '</td>' +
      '<td>' + api.renderDetailLink('review-detail.html', r.id) + '</td>' +
      '</tr>';
  }

  async function loadGuardianList() {
    if (!g.body) return;
    api.showTableLoading(g.body, 11);

    var result = await api.fetchList('guardian_reviews', {
      select: '*, members:member_id(nickname), kindergartens:kindergarten_id(name), pets:pet_id(name)',
      filters: buildGuardianFilters(),
      orFilters: buildGuardianSearch(),
      orderBy: 'written_at',
      page: gPage,
      perPage: PER_PAGE
    });

    if (result.error) {
      api.showTableEmpty(g.body, 11, '데이터 로드 실패: ' + result.error.message);
      return;
    }
    if (g.resultCount) g.resultCount.textContent = api.formatNumber(result.count);
    if (!result.data.length) { api.showTableEmpty(g.body, 11); return; }

    var html = '';
    var start = (gPage - 1) * PER_PAGE;
    for (var i = 0; i < result.data.length; i++) {
      html += renderGuardianRow(result.data[i], start + i + 1);
    }
    g.body.innerHTML = html;

    api.renderPagination(g.pagination, gPage, result.count, PER_PAGE, function (p) {
      gPage = p; loadGuardianList();
    });
  }

  // ── 유치원 후기 필터 ──
  function buildKgFilters() {
    var filters = [];
    if (k.dateFrom && k.dateFrom.value) filters.push({ column: 'written_at', op: 'gte', value: k.dateFrom.value + 'T00:00:00' });
    if (k.dateTo && k.dateTo.value) filters.push({ column: 'written_at', op: 'lte', value: k.dateTo.value + 'T23:59:59' });
    if (k.satisfaction) {
      var v = k.satisfaction.value;
      if (v && v !== '전체') filters.push({ column: 'satisfaction', op: 'eq', value: v });
    }
    if (k.guardianOnly) {
      var go = k.guardianOnly.value;
      if (go === '전용') filters.push({ column: 'is_guardian_only', op: 'eq', value: true });
      if (go === '공개') filters.push({ column: 'is_guardian_only', op: 'eq', value: false });
    }
    return filters;
  }

  function buildKgSearch() {
    if (!k.searchInput || !k.searchInput.value.trim()) return [];
    var q = '%' + k.searchInput.value.trim() + '%';
    return ['content.ilike.' + q];
  }

  function renderKgRow(r, idx) {
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
      '<td>' + idx + '</td>' +
      '<td>' + api.formatDate(r.written_at) + '</td>' +
      '<td>' + api.escapeHtml(kgName) + '</td>' +
      '<td>' + api.escapeHtml(memberNick) + '</td>' +
      '<td>' + api.escapeHtml(petName) + '</td>' +
      '<td>' + api.autoBadge(r.satisfaction) + '</td>' +
      '<td>' + (tagHtml || '-') + '</td>' +
      '<td><span class="review-content">' + api.escapeHtml(preview) + '</span></td>' +
      '<td>' + api.autoBadge(guardianOnly) + '</td>' +
      '<td>' + (r.reservation_id ? api.renderDetailLink('reservation-detail.html', r.reservation_id, 'R-' + String(r.reservation_id).substring(0, 8)) : '-') + '</td>' +
      '<td>' + api.renderDetailLink('review-kg-detail.html', r.id) + '</td>' +
      '</tr>';
  }

  async function loadKgList() {
    if (!k.body) return;
    api.showTableLoading(k.body, 11);

    var result = await api.fetchList('kindergarten_reviews', {
      select: '*, kindergartens:kindergarten_id(name), members:member_id(nickname), pets:pet_id(name)',
      filters: buildKgFilters(),
      orFilters: buildKgSearch(),
      orderBy: 'written_at',
      page: kPage,
      perPage: PER_PAGE
    });

    if (result.error) {
      api.showTableEmpty(k.body, 11, '데이터 로드 실패: ' + result.error.message);
      return;
    }
    if (k.resultCount) k.resultCount.textContent = api.formatNumber(result.count);
    if (!result.data.length) { api.showTableEmpty(k.body, 11); return; }

    var html = '';
    var start = (kPage - 1) * PER_PAGE;
    for (var i = 0; i < result.data.length; i++) {
      html += renderKgRow(result.data[i], start + i + 1);
    }
    k.body.innerHTML = html;

    api.renderPagination(k.pagination, kPage, result.count, PER_PAGE, function (p) {
      kPage = p; loadKgList();
    });
  }

  // ── 목록 이벤트 바인딩 ──
  function bindListEvents() {
    if (g.btnSearch) g.btnSearch.addEventListener('click', function () { gPage = 1; loadGuardianList(); });
    if (g.searchInput) g.searchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { gPage = 1; loadGuardianList(); } });
    if (g.btnExcel) g.btnExcel.addEventListener('click', async function () {
      var all = await api.fetchAll('guardian_reviews', { select: '*, members:member_id(nickname), kindergartens:kindergarten_id(name), pets:pet_id(name)', filters: buildGuardianFilters(), orFilters: buildGuardianSearch(), orderBy: 'written_at' });
      var rows = (all.data || []).map(function (r) {
        return { written_at: api.formatDate(r.written_at), nickname: r.members ? r.members.nickname : '', kg: r.kindergartens ? r.kindergartens.name : '', pet: r.pets ? r.pets.name : '', satisfaction: r.satisfaction, tags: (r.selected_tags || []).join(', '), content: r.content || '' };
      });
      api.exportExcel(rows, [
        { key: 'written_at', label: '작성일시' }, { key: 'nickname', label: '보호자 닉네임' },
        { key: 'kg', label: '유치원명' }, { key: 'pet', label: '반려동물명' },
        { key: 'satisfaction', label: '만족도' }, { key: 'tags', label: '선택 태그' },
        { key: 'content', label: '내용' }
      ], '보호자후기');
    });

    if (k.btnSearch) k.btnSearch.addEventListener('click', function () { kPage = 1; loadKgList(); });
    if (k.searchInput) k.searchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { kPage = 1; loadKgList(); } });
    if (k.btnExcel) k.btnExcel.addEventListener('click', async function () {
      var all = await api.fetchAll('kindergarten_reviews', { select: '*, kindergartens:kindergarten_id(name), members:member_id(nickname), pets:pet_id(name)', filters: buildKgFilters(), orFilters: buildKgSearch(), orderBy: 'written_at' });
      var rows = (all.data || []).map(function (r) {
        return { written_at: api.formatDate(r.written_at), kg: r.kindergartens ? r.kindergartens.name : '', nickname: r.members ? r.members.nickname : '', pet: r.pets ? r.pets.name : '', satisfaction: r.satisfaction, tags: (r.selected_tags || []).join(', '), content: r.content || '', guardian_only: r.is_guardian_only ? '전용' : '공개' };
      });
      api.exportExcel(rows, [
        { key: 'written_at', label: '작성일시' }, { key: 'kg', label: '유치원명' },
        { key: 'nickname', label: '보호자 닉네임' }, { key: 'pet', label: '반려동물명' },
        { key: 'satisfaction', label: '만족도' }, { key: 'tags', label: '선택 태그' },
        { key: 'content', label: '내용' }, { key: 'guardian_only', label: '보호자 전용' }
      ], '유치원후기');
    });
  }

  function initList() {
    cacheListDom();
    bindListEvents();
    api.hideIfReadOnly(PERM_KEY, ['.btn-action']);
    loadGuardianList();
    loadKgList();
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

    var result = await api.fetchDetail('guardian_reviews', id, '*, members:member_id(*), kindergartens:kindergarten_id(id, name, member_id, members:member_id(name)), pets:pet_id(id, name), reservations:reservation_id(id, checkin_datetime, checkout_datetime)');
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
        '<span class="info-grid__label">등원일시</span><span class="info-grid__value">' + api.formatDate(res.checkin_datetime) + '</span>' +
        '<span class="info-grid__label">하원일시</span><span class="info-grid__value">' + api.formatDate(res.checkout_datetime) + '</span>' +
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

    var result = await api.fetchDetail('kindergarten_reviews', id, '*, kindergartens:kindergarten_id(id, name, member_id, members:member_id(name, phone)), pets:pet_id(id, name, breed, size_category), members:member_id(id, name, nickname), reservations:reservation_id(id, checkin_datetime, checkout_datetime)');
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
        '<span class="info-grid__label">크기 구분</span><span class="info-grid__value">' + api.escapeHtml(pet.size_category || '') + '</span>' +
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
        '<span class="info-grid__label">등원일시</span><span class="info-grid__value">' + api.formatDate(res.checkin_datetime) + '</span>' +
        '<span class="info-grid__label">하원일시</span><span class="info-grid__value">' + api.formatDate(res.checkout_datetime) + '</span>' +
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
