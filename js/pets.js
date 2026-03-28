/**
 * 우유펫 관리자 대시보드 — 반려동물관리 (pets.js)
 *
 * 목록 (pets.html) + 상세 (pet-detail.html) 공통 모듈
 * 의존: api.js, auth.js, common.js
 */
(function () {
  'use strict';

  var api = window.__api;
  var auth = window.__auth;
  if (!api || !auth) return;

  var PERM_KEY = 'perm_pets';
  var PER_PAGE = 20;

  // ══════════════════════════════════════════
  // A. 목록 페이지 (pets.html)
  // ══════════════════════════════════════════

  function isListPage() {
    return !!document.getElementById('petListBody');
  }

  var filterDateFrom, filterDateTo, filterSize, filterSearchField, filterSearchInput;
  var btnSearch, btnExcel, resultCount, listBody, pagination;
  var currentPage = 1;

  function cacheListDom() {
    var dates = document.querySelectorAll('.filter-input--date');
    filterDateFrom = dates[0];
    filterDateTo   = dates[1];

    var selects = document.querySelectorAll('.filter-select');
    filterSize = selects[0];         // 크기 분류
    filterSearchField = selects[1];  // 검색 대상
    filterSearchInput = document.querySelector('.filter-input--search');
    btnSearch = document.querySelector('.btn-search');
    btnExcel  = document.querySelector('.btn-excel');

    resultCount = document.querySelector('.result-header__count strong');
    listBody    = document.getElementById('petListBody');
    pagination  = document.querySelector('.pagination');
  }

  /** 크기 분류 판별 */
  function sizeLabel(weight) {
    if (weight == null) return '-';
    var w = parseFloat(weight);
    if (isNaN(w)) return '-';
    if (w < 10) return '소형';
    if (w < 25) return '중형';
    return '대형';
  }

  function sizeBadgeColor(label) {
    return label === '소형' ? 'green' : label === '중형' ? 'orange' : label === '대형' ? 'red' : 'gray';
  }

  function buildFilters() {
    var filters = [];
    if (filterDateFrom && filterDateFrom.value) {
      filters.push({ column: 'created_at', op: 'gte', value: filterDateFrom.value + 'T00:00:00' });
    }
    if (filterDateTo && filterDateTo.value) {
      filters.push({ column: 'created_at', op: 'lte', value: filterDateTo.value + 'T23:59:59' });
    }
    // 크기 분류 필터 — weight 범위로 변환
    if (filterSize) {
      var sizeVal = filterSize.value;
      if (sizeVal === '소형') {
        filters.push({ column: 'weight', op: 'lt', value: 10 });
      } else if (sizeVal === '중형') {
        filters.push({ column: 'weight', op: 'gte', value: 10 });
        filters.push({ column: 'weight', op: 'lt', value: 25 });
      } else if (sizeVal === '대형') {
        filters.push({ column: 'weight', op: 'gte', value: 25 });
      }
    }
    return filters;
  }

  function buildSearchOr() {
    if (!filterSearchInput || !filterSearchInput.value.trim()) return [];
    var keyword = '%' + filterSearchInput.value.trim() + '%';
    var fieldMap = {
      '반려동물 이름': 'name.ilike.' + keyword,
      '견종':         'breed.ilike.' + keyword
    };
    var label = filterSearchField ? filterSearchField.value : '반려동물 이름';
    return [fieldMap[label] || fieldMap['반려동물 이름']];
  }

  /** 이미지 썸네일 */
  function thumbHtml(url) {
    if (url) {
      return '<div class="thumb"><img src="' + api.escapeHtml(url) + '" alt="" style="width:100%;height:100%;object-fit:cover;"></div>';
    }
    return '<div class="thumb thumb--placeholder"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>';
  }

  async function loadPetList(page) {
    currentPage = page || 1;
    api.showTableLoading(listBody, 16);

    var result = await api.fetchList('pets', {
      select: '*, members(nickname, phone)',
      filters: buildFilters(),
      orFilters: buildSearchOr(),
      orderBy: 'created_at',
      ascending: false,
      page: currentPage,
      perPage: PER_PAGE
    });

    if (result.error) {
      api.showTableEmpty(listBody, 16, '데이터를 불러오지 못했습니다.');
      return;
    }

    if (resultCount) resultCount.textContent = result.count;

    if (!result.data || result.data.length === 0) {
      api.showTableEmpty(listBody, 16);
      renderListPagination(0);
      return;
    }

    // 돌봄횟수 집계: 현재 페이지 pet_id 목록으로 reservations(돌봄완료) 조회
    var petIds = result.data.map(function (p) { return p.id; });
    var careCountMap = {};
    var careRes = await api.fetchAll('reservations', {
      select: 'pet_id',
      filters: [
        { column: 'pet_id', op: 'in', value: petIds },
        { column: 'status', op: 'eq', value: '돌봄완료' }
      ]
    });
    if (careRes.data) {
      careRes.data.forEach(function (r) {
        careCountMap[r.pet_id] = (careCountMap[r.pet_id] || 0) + 1;
      });
    }

    var startIdx = (currentPage - 1) * PER_PAGE;
    var html = '';

    for (var i = 0; i < result.data.length; i++) {
      var p = result.data[i];
      var idx = startIdx + i + 1;
      var owner = p.members || {};
      var size = sizeLabel(p.weight);
      var genderColor = p.gender === '수컷' ? 'blue' : p.gender === '암컷' ? 'red' : 'gray';

      html += '<tr>' +
        '<td>' + idx + '</td>' +
        '<td>' + api.escapeHtml(p.name) + '</td>' +
        '<td>' + api.escapeHtml(owner.nickname || '-') + '</td>' +
        '<td class="masked">' + api.maskPhone(owner.phone || p.owner_phone) + '</td>' +
        '<td>' + thumbHtml(Array.isArray(p.photo_urls) && p.photo_urls.length > 0 ? p.photo_urls[0] : null) + '</td>' +
        '<td>' + api.escapeHtml(p.breed || '-') + '</td>' +
        '<td>' + api.renderBadge(p.gender || '-', genderColor) + '</td>' +
        '<td>' + api.calcPetAge(p.birth_date) + '</td>' +
        '<td>' + (p.weight ? p.weight + 'kg' : '-') + '</td>' +
        '<td>' + api.renderBadge(size, sizeBadgeColor(size)) + '</td>' +
        '<td>' + api.autoBadge(p.is_neutered ? '했어요' : '안 했어요') + '</td>' +
        '<td>' + api.autoBadge(p.is_vaccinated ? '했어요' : '안 했어요') + '</td>' +
        '<td>' + (p.is_representative ? api.renderBadge('대표', 'blue') : api.renderBadge('일반', 'gray')) + '</td>' +
        '<td>' + (careCountMap[p.id] || 0) + '회</td>' +
        '<td>' + api.formatDate(p.created_at, true) + '</td>' +
        '<td>' + api.renderDetailLink('pet-detail.html', p.id) + '</td>' +
        '</tr>';
    }

    listBody.innerHTML = html;
    renderListPagination(result.count);
  }

  function renderListPagination(total) {
    api.renderPagination(pagination, currentPage, total, PER_PAGE, function (p) { loadPetList(p); });
  }

  async function exportPetExcel() {
    var result = await api.fetchAll('pets', {
      select: '*, members(nickname, phone)',
      filters: buildFilters(),
      orFilters: buildSearchOr(),
      orderBy: 'created_at',
      ascending: false
    });
    if (!result.data || result.data.length === 0) { alert('다운로드할 데이터가 없습니다.'); return; }

    // 돌봄횟수 집계: 전체 pet_id로 reservations(돌봄완료) 조회
    var petIds = result.data.map(function (p) { return p.id; });
    var careCountMap = {};
    var careRes = await api.fetchAll('reservations', {
      select: 'pet_id',
      filters: [
        { column: 'pet_id', op: 'in', value: petIds },
        { column: 'status', op: 'eq', value: '돌봄완료' }
      ]
    });
    if (careRes.data) {
      careRes.data.forEach(function (r) {
        careCountMap[r.pet_id] = (careCountMap[r.pet_id] || 0) + 1;
      });
    }

    var headers = [
      { key: 'name', label: '반려동물 이름' },
      { key: 'owner', label: '보호자 닉네임' },
      { key: 'phone', label: '보호자 연락처' },
      { key: 'breed', label: '견종' },
      { key: 'gender', label: '성별' },
      { key: 'age', label: '나이' },
      { key: 'weight', label: '몸무게' },
      { key: 'size', label: '크기' },
      { key: 'neutered', label: '중성화' },
      { key: 'vaccinated', label: '예방접종' },
      { key: 'representative', label: '대표' },
      { key: 'care_count', label: '돌봄 횟수' },
      { key: 'created_date', label: '등록일' }
    ];
    var rows = result.data.map(function (p) {
      var owner = p.members || {};
      return {
        name: p.name,
        owner: owner.nickname || '',
        phone: api.maskPhone(owner.phone || p.owner_phone),
        breed: p.breed || '',
        gender: p.gender || '',
        age: api.calcPetAge(p.birth_date),
        weight: p.weight ? p.weight + 'kg' : '-',
        size: sizeLabel(p.weight),
        neutered: p.is_neutered ? '했어요' : '안 했어요',
        vaccinated: p.is_vaccinated ? '했어요' : '안 했어요',
        representative: p.is_representative ? '대표' : '일반',
        care_count: careCountMap[p.id] || 0,
        created_date: api.formatDate(p.created_at, true)
      };
    });
    api.exportExcel(rows, headers, '반려동물관리');
  }

  function initListPage() {
    cacheListDom();
    if (filterDateFrom) filterDateFrom.value = api.getMonthStart().slice(0, 4) + '-01-01';
    if (filterDateTo) filterDateTo.value = api.getToday();

    if (btnSearch) btnSearch.addEventListener('click', function () { loadPetList(1); });
    if (filterSearchInput) filterSearchInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') loadPetList(1); });
    if (btnExcel) btnExcel.addEventListener('click', exportPetExcel);

    api.hideIfReadOnly(PERM_KEY, ['.btn-action']);
    loadPetList(1);
  }

  // ══════════════════════════════════════════
  // B. 상세 페이지 (pet-detail.html)
  // ══════════════════════════════════════════

  function isDetailPage() {
    return !!document.getElementById('detailPetInfo');
  }

  async function initDetailPage() {
    var petId = api.getParam('id');
    if (!petId) { alert('반려동물 ID가 없습니다.'); return; }

    var res = await api.fetchDetail('pets', petId, '*, members(id, name, nickname, phone, address_road, address_complex, address_building_dong, address_building_ho)');
    if (res.error || !res.data) { alert('반려동물 정보를 불러올 수 없습니다.'); return; }
    var p = res.data;
    var owner = p.members || {};

    // ① 기본정보
    api.setTextById('petIdText', p.id ? p.id.slice(0, 8).toUpperCase() : '-');
    api.setTextById('petName', p.name || '-');
    api.setTextById('petBreed', p.breed || '-');

    var genderColor = p.gender === '수컷' ? 'blue' : p.gender === '암컷' ? 'red' : 'gray';
    api.setHtmlById('petGender', api.renderBadge(p.gender || '-', genderColor));
    api.setTextById('petBirth', api.formatDate(p.birth_date, true));
    api.setTextById('petAge', api.calcPetAge(p.birth_date));
    api.setTextById('petWeight', p.weight ? p.weight + ' kg' : '-');

    var size = sizeLabel(p.weight);
    api.setHtmlById('petSize', api.renderBadge(size, sizeBadgeColor(size)));
    api.setHtmlById('petNeutered', api.autoBadge(p.is_neutered ? '했어요' : '안 했어요'));
    api.setHtmlById('petVaccinated', api.autoBadge(p.is_vaccinated ? '했어요' : '안 했어요'));
    api.setHtmlById('petRepresentative', p.is_representative ? api.renderBadge('대표', 'blue') : api.renderBadge('일반', 'gray'));
    api.setTextById('petCreated', api.formatDate(p.created_at));

    // 소개글
    var introEl = document.getElementById('introText');
    if (introEl && p.description) introEl.textContent = p.description;

    // 사진 갤러리
    var gallery = document.getElementById('petPhotoGallery');
    if (gallery && p.photo_urls) {
      var imgs = [];
      try { imgs = typeof p.photo_urls === 'string' ? JSON.parse(p.photo_urls) : (Array.isArray(p.photo_urls) ? p.photo_urls : []); } catch (e) {}
      if (Array.isArray(imgs) && imgs.length > 0) {
        var gHtml = '';
        imgs.forEach(function (url, idx) {
          gHtml += '<div class="photo-gallery__item"><div class="photo-gallery__img"><img src="' + api.escapeHtml(url) + '" style="width:100%;height:100%;object-fit:cover;"></div>' +
            (idx === 0 ? '<span class="photo-gallery__badge">대표</span>' : '') + '</div>';
        });
        gallery.innerHTML = gHtml;
      }
    }

    // ② 보호자 정보
    api.setTextById('ownerName', owner.name || '-');
    api.setTextById('ownerNickname', owner.nickname || '-');
    api.setHtmlById('ownerPhone', api.renderMaskedField(
      api.maskPhone(owner.phone), api.formatPhone(owner.phone), 'pets', petId, 'owner_phone'
    ));
    api.setTextById('ownerAddress', ((owner.address_road || '') + ' ' + (owner.address_complex || '') + ' ' + (owner.address_building_dong || '') + ' ' + (owner.address_building_ho || '')).trim() || '-');
    if (owner.id) {
      api.setHtmlById('ownerMemberId', api.renderDetailLink('member-detail.html', owner.id, owner.id.slice(0, 8).toUpperCase()));
    }

    // ③ 돌봄 이용 이력
    loadCareHistory(petId);

    // ④ 유치원이 작성한 돌봄 후기
    loadPetReviews(petId);

    // ⑤ 후기 태그 집계
    loadReviewTags(petId);

    // 액션 버튼 바인딩
    bindPetActions(petId, p);
    api.hideIfReadOnly(PERM_KEY, ['.detail-actions', '.btn-action']);
    api.insertAuditLog('반려동물조회', 'pets', petId, { name: p.name });
  }

  async function loadCareHistory(petId) {
    var tbody = document.getElementById('careHistoryBody');
    if (!tbody) return;

    var res = await api.fetchList('reservations', {
      select: '*, kindergartens(name), payments(amount)',
      filters: [{ column: 'pet_id', op: 'eq', value: petId }],
      orderBy: 'checkin_scheduled',
      ascending: false,
      page: 1,
      perPage: 5
    });

    if (!res.data || res.data.length === 0) {
      api.showTableEmpty(tbody, 5, '돌봄 이용 이력이 없습니다.');
      return;
    }

    var html = '';
    res.data.forEach(function (r) {
      var kgName = (r.kindergartens && r.kindergartens.name) || '-';
      var paymentAmount = (r.payments && r.payments.length > 0) ? r.payments[0].amount : 0;
      html += '<tr>' +
        '<td>' + api.formatCareRange(r.checkin_scheduled, r.checkout_scheduled) + '</td>' +
        '<td>' + api.escapeHtml(kgName) + '</td>' +
        '<td>' + api.autoBadge(r.status) + '</td>' +
        '<td class="text-right">' + api.formatMoney(paymentAmount) + '</td>' +
        '<td>' + api.renderDetailLink('reservation-detail.html', r.id, r.id.slice(0, 8).toUpperCase()) + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  }

  async function loadPetReviews(petId) {
    var tbody = document.getElementById('petReviewsBody');
    if (!tbody) return;

    var res = await api.fetchList('kindergarten_reviews', {
      select: '*, kindergartens(name)',
      filters: [{ column: 'pet_id', op: 'eq', value: petId }],
      orderBy: 'created_at',
      ascending: false,
      page: 1,
      perPage: 5
    });

    if (!res.data || res.data.length === 0) {
      api.showTableEmpty(tbody, 7, '후기가 없습니다.');
      return;
    }

    var html = '';
    res.data.forEach(function (rv) {
      var kgName = (rv.kindergartens && rv.kindergartens.name) || '-';
      var tags = rv.selected_tags || [];
      if (typeof tags === 'string') { try { tags = JSON.parse(tags); } catch (e) { tags = []; } }
      var tagHtml = tags.map(function (t) { return '<span class="review-tag-pill">' + api.escapeHtml(t) + '</span>'; }).join(' ');

      var satColor = rv.satisfaction === '최고예요!' ? 'green' : rv.satisfaction === '좋았어요' ? 'blue' : 'orange';

      html += '<tr>' +
        '<td>' + api.formatDate(rv.created_at, true) + '</td>' +
        '<td>' + api.escapeHtml(kgName) + '</td>' +
        '<td>' + api.renderBadge(rv.satisfaction || '-', satColor) + '</td>' +
        '<td>' + (tagHtml || '-') + '</td>' +
        '<td><span class="review-content">' + api.escapeHtml(rv.content || '-') + '</span></td>' +
        '<td>' + (rv.is_guardian_only ? api.renderBadge('예', 'orange') : api.renderBadge('아니오', 'gray')) + '</td>' +
        '<td>' + api.renderDetailLink('review-kg-detail.html', rv.id, rv.id.slice(0, 8).toUpperCase()) + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  }

  async function loadReviewTags(petId) {
    var container = document.getElementById('tagSummary');
    if (!container) return;

    // 모든 후기의 태그를 가져와서 집계
    var res = await api.fetchAll('kindergarten_reviews', {
      select: 'selected_tags',
      filters: [{ column: 'pet_id', op: 'eq', value: petId }]
    });

    if (!res.data || res.data.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--text-weak);">후기 태그 데이터가 없습니다.</div>';
      return;
    }

    var tagCounts = {};
    res.data.forEach(function (rv) {
      var tags = rv.selected_tags || [];
      if (typeof tags === 'string') { try { tags = JSON.parse(tags); } catch (e) { tags = []; } }
      tags.forEach(function (t) {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    });

    var sorted = Object.entries(tagCounts).sort(function (a, b) { return b[1] - a[1]; });
    if (sorted.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--text-weak);">후기 태그 데이터가 없습니다.</div>';
      return;
    }

    var html = '';
    sorted.forEach(function (pair) {
      html += '<div class="stat-card"><div class="stat-card__label">' + api.escapeHtml(pair[0]) + '</div>' +
        '<div class="stat-card__value">' + pair[1] + '건</div></div>';
    });
    container.innerHTML = html;
  }

  function bindPetActions(petId, pet) {
    // 삭제 버튼
    var deleteBtn = document.getElementById('deleteBtn');
    var deleteReason = document.getElementById('deleteReason');

    if (deleteBtn && deleteReason) {
      deleteBtn.addEventListener('click', async function () {
        var reason = deleteReason.value.trim();
        if (!reason) { alert('삭제 사유를 입력해주세요.'); return; }
        if (!confirm('정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;

        await api.deleteRecord('pets', petId);
        api.insertAuditLog('반려동물삭제', 'pets', petId, { name: pet.name, reason: reason });
        alert('삭제되었습니다.');
        window.location.href = 'pets.html';
      });
    }
  }

  // ══════════════════════════════════════════
  // C. 초기화
  // ══════════════════════════════════════════

  function init() {
    if (isListPage()) initListPage();
    else if (isDetailPage()) initDetailPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
