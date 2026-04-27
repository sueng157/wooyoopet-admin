/**
 * 우유펫 관리자 대시보드 — 유치원관리 (kindergartens.js)
 *
 * 목록 (kindergartens.html) + 상세 (kindergarten-detail.html) 공통 모듈
 * 의존: api.js, auth.js, common.js
 *
 * DB 컬럼 매핑 (kindergartens 테이블):
 *   business_status, address_road, address_jibun, address_complex,
 *   address_building_dong, address_building_ho, address_auth_status,
 *   address_auth_date, freshness_current, freshness_initial, photo_urls,
 *   price_small_1h ~ price_large_pickup (12개), inicis_submall_code,
 *   noshow_count, noshow_sanction, member_id(FK→members)
 */
(function () {
  'use strict';

  var api = window.__api;
  var auth = window.__auth;
  if (!api || !auth) return;

  var PERM_KEY = 'perm_kindergartens';
  var PER_PAGE = 20;

  // ══════════════════════════════════════════
  // A. 목록 페이지 (kindergartens.html)
  // ══════════════════════════════════════════

  function isListPage() {
    return !!document.getElementById('kgListBody');
  }

  var filterDateFrom, filterDateTo, filterBizStatus, filterInicis, filterEdu;
  var filterSearchField, filterSearchInput, btnSearch, btnExcel;
  var resultCount, listBody, pagination;
  var currentPage = 1;

  function cacheListDom() {
    var dates = document.querySelectorAll('.filter-input--date');
    filterDateFrom = dates[0];
    filterDateTo   = dates[1];

    var selects = document.querySelectorAll('.filter-select');
    filterBizStatus  = selects[0]; // 영업상태
    filterInicis     = selects[1]; // 이니시스
    filterEdu        = selects[2]; // 교육이수
    filterSearchField = selects[3];
    filterSearchInput = document.querySelector('.filter-input--search');
    btnSearch = document.querySelector('.btn-search');
    btnExcel  = document.querySelector('.btn-excel');

    resultCount = document.querySelector('.result-header__count strong');
    listBody    = document.getElementById('kgListBody');
    pagination  = document.querySelector('.pagination');
  }

  // [C] 필터 — business_status 로 수정
  function buildFilters() {
    var filters = [];

    if (filterDateFrom && filterDateFrom.value) {
      filters.push({ column: 'created_at', op: 'gte', value: filterDateFrom.value + 'T00:00:00' });
    }
    if (filterDateTo && filterDateTo.value) {
      filters.push({ column: 'created_at', op: 'lte', value: filterDateTo.value + 'T23:59:59' });
    }

    if (filterBizStatus) {
      var v = filterBizStatus.value;
      if (v && v !== '영업상태: 전체') filters.push({ column: 'business_status', op: 'eq', value: v });
    }
    if (filterInicis) {
      var v2 = filterInicis.value;
      if (v2 && v2 !== '이니시스: 전체') filters.push({ column: 'inicis_status', op: 'eq', value: v2 });
    }

    return filters;
  }

  // [D] 검색 — 유치원명은 직접 ilike, 운영자 성명은 members 테이블 검색 불가(or 지원 안됨)
  //     → 유치원명만 or 필터로, 운영자 검색은 별도 2단계 조회로 처리
  function buildSearchOr() {
    if (!filterSearchInput || !filterSearchInput.value.trim()) return [];
    var keyword = '%' + filterSearchInput.value.trim() + '%';
    var label = filterSearchField ? filterSearchField.value : '유치원명';

    // 유치원명 검색: 직접 ilike
    if (label === '유치원명') {
      return ['name.ilike.' + keyword];
    }
    // 운영자 성명 검색: Supabase or 필터로 조인 컬럼 검색 불가
    // → 빈 배열 반환, loadKgList에서 별도 처리
    return [];
  }

  /** 신선도 CSS 클래스 */
  function freshnessClass(val) {
    var n = parseFloat(val);
    if (isNaN(n)) return '';
    return n >= 100 ? 'freshness--good' : 'freshness--bad';
  }

  /** 교육이수 상태 뱃지 텍스트 */
  function eduBadge(completed, total) {
    if (!total) return api.renderBadge('미시작', 'gray');
    if (completed >= total) return api.renderBadge('완료', 'green');
    return api.renderBadge('진행중(' + completed + '/' + total + ')', 'orange');
  }

  /** 이미지 썸네일 — photo_urls 배열에서 첫번째 URL */
  function thumbHtml(photoUrls) {
    var url = null;
    if (Array.isArray(photoUrls) && photoUrls.length > 0) url = photoUrls[0];
    if (url) {
      return '<div class="thumb"><img src="' + api.escapeHtml(url) + '" alt="" style="width:100%;height:100%;object-fit:cover;"></div>';
    }
    return '<div class="thumb thumb--placeholder"><svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>';
  }

  // [A] select 쿼리 + [B] 목록 렌더링 — DB 실제 컬럼명으로 전체 수정
  async function loadKgList(page) {
    currentPage = page || 1;
    api.showTableLoading(listBody, 16);

    // 운영자 성명 검색인 경우 2단계 조회
    var operatorFilter = null;
    if (filterSearchField && filterSearchField.value === '운영자 성명' &&
        filterSearchInput && filterSearchInput.value.trim()) {
      operatorFilter = filterSearchInput.value.trim();
    }

    // 운영자 성명 검색: members에서 먼저 member_id 목록 확보
    var memberIdFilter = null;
    if (operatorFilter) {
      var sb = window.__supabase;
      // kindergartens의 member_id와 매칭되는 members 검색
      var memberRes = await sb.from('members')
        .select('id')
        .ilike('name', '%' + operatorFilter + '%');
      if (memberRes.data && memberRes.data.length > 0) {
        memberIdFilter = memberRes.data.map(function (m) { return m.id; });
      } else {
        // 검색 결과 없음
        if (resultCount) resultCount.textContent = 0;
        api.showTableEmpty(listBody, 16);
        renderListPagination(0);
        return;
      }
    }

    var filters = buildFilters();
    if (memberIdFilter) {
      filters.push({ column: 'member_id', op: 'in', value: memberIdFilter });
    }

    var result = await api.fetchList('kindergartens', {
      select: '*, members!member_id(name, phone), education_completions(completed_topics, total_topics)',
      filters: filters,
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

    // 후기 수 / 상주동물 수 집계 (kgId 목록으로 일괄 조회)
    var kgIds = result.data.map(function (kg) { return kg.id; });
    var reviewCounts = {};
    var residentCounts = {};

    var sbClient = window.__supabase;
    // 후기 수 집계
    var revRes = await sbClient.from('kindergarten_reviews')
      .select('kindergarten_id')
      .in('kindergarten_id', kgIds);
    if (revRes.data) {
      revRes.data.forEach(function (r) {
        reviewCounts[r.kindergarten_id] = (reviewCounts[r.kindergarten_id] || 0) + 1;
      });
    }
    // 상주동물 수 집계
    var rpRes = await sbClient.from('kindergarten_resident_pets')
      .select('kindergarten_id')
      .in('kindergarten_id', kgIds);
    if (rpRes.data) {
      rpRes.data.forEach(function (r) {
        residentCounts[r.kindergarten_id] = (residentCounts[r.kindergarten_id] || 0) + 1;
      });
    }

    var startIdx = (currentPage - 1) * PER_PAGE;
    var html = '';

    for (var i = 0; i < result.data.length; i++) {
      var kg = result.data[i];
      var idx = startIdx + i + 1;

      // [B] DB 실제 컬럼명 사용
      var memberInfo = kg.members || {};
      var operatorName = memberInfo.name || '-';
      var operatorPhone = memberInfo.phone || '';

      var loc = ((kg.address_complex || '') + ' ' + (kg.address_building_dong ? kg.address_building_dong + '동' : '')).trim() || '-';
      var freshVal = kg.freshness_current != null ? kg.freshness_current + '%' : '-';
      var freshCls = freshnessClass(kg.freshness_current);

      // 교육이수 — DB 컬럼: completed_topics / total_topics
      var eduComp = kg.education_completions;
      var compCount = 0, totalCount = 0;
      if (Array.isArray(eduComp) && eduComp.length > 0) {
        compCount = eduComp[0].completed_topics || 0;
        totalCount = eduComp[0].total_topics || 0;
      }

      // 후기 수 / 상주동물 수 (집계 결과)
      var revCount = reviewCounts[kg.id] || 0;
      var rpCount = residentCounts[kg.id] || 0;

      html += '<tr>' +
        '<td>' + idx + '</td>' +
        '<td style="font-weight:700;color:var(--text-primary);">' + api.escapeHtml(kg.name) + '</td>' +
        '<td>' + api.escapeHtml(operatorName) + '</td>' +
        '<td class="masked">' + api.maskPhone(operatorPhone) + '</td>' +
        '<td>' + thumbHtml(kg.photo_urls) + '</td>' +
        '<td>' + api.escapeHtml(loc) + '</td>' +
        '<td>' + api.autoBadge(kg.business_status || '-') + '</td>' +
        '<td class="' + freshCls + '">' + freshVal + '</td>' +
        '<td class="text-right">' + api.formatNumber(revCount) + '</td>' +
        '<td class="text-right">' + api.formatNumber(rpCount) + '</td>' +
        '<td>' + eduBadge(compCount, totalCount) + '</td>' +
        '<td>' + api.autoBadge(kg.address_auth_status || '미인증') + '</td>' +
        '<td>' + api.autoBadge(kg.settlement_status || '작성중') + '</td>' +
        '<td>' + api.autoBadge(kg.inicis_status || '미등록') + '</td>' +
        '<td style="color:var(--text-weak);">' + api.formatDate(kg.created_at, true) + '</td>' +
        '<td>' + api.renderDetailLink('kindergarten-detail.html', kg.id) + '</td>' +
        '</tr>';
    }

    listBody.innerHTML = html;
    renderListPagination(result.count);
  }

  function renderListPagination(total) {
    api.renderPagination(pagination, currentPage, total, PER_PAGE, function (p) { loadKgList(p); });
  }

  // [J] 엑셀 내보내기 — DB 컬럼명 반영
  async function exportKgExcel() {
    var result = await api.fetchAll('kindergartens', {
      select: '*, members!member_id(name, phone)',
      filters: buildFilters(),
      orFilters: buildSearchOr(),
      orderBy: 'created_at',
      ascending: false
    });
    if (!result.data || result.data.length === 0) { alert('다운로드할 데이터가 없습니다.'); return; }

    var headers = [
      { key: 'name', label: '유치원명' },
      { key: 'operator_name', label: '운영자' },
      { key: 'phone_masked', label: '운영자 연락처' },
      { key: 'location', label: '위치' },
      { key: 'business_status', label: '영업' },
      { key: 'freshness', label: '신선도' },
      { key: 'address_auth_status', label: '주소인증' },
      { key: 'settlement_status', label: '정산정보' },
      { key: 'inicis_status', label: '이니시스' },
      { key: 'created_date', label: '등록일' }
    ];
    var rows = result.data.map(function (kg) {
      var memberInfo = kg.members || {};
      return {
        name: kg.name,
        operator_name: memberInfo.name || '',
        phone_masked: api.maskPhone(memberInfo.phone),
        location: ((kg.address_complex || '') + ' ' + (kg.address_building_dong ? kg.address_building_dong + '동' : '')).trim() || '-',
        business_status: kg.business_status || '',
        freshness: kg.freshness_current != null ? kg.freshness_current + '%' : '-',
        address_auth_status: kg.address_auth_status || '미인증',
        settlement_status: kg.settlement_status || '작성중',
        inicis_status: kg.inicis_status || '미등록',
        created_date: api.formatDate(kg.created_at, true)
      };
    });
    api.exportExcel(rows, headers, '유치원관리');
  }

  function initListPage() {
    cacheListDom();
    if (filterDateFrom) filterDateFrom.value = api.getMonthStart().slice(0, 4) + '-01-01';
    if (filterDateTo) filterDateTo.value = api.getToday();

    if (btnSearch) btnSearch.addEventListener('click', function () { loadKgList(1); });
    if (filterSearchInput) filterSearchInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') loadKgList(1); });
    if (btnExcel) btnExcel.addEventListener('click', exportKgExcel);

    api.hideIfReadOnly(PERM_KEY, ['.btn-action']);
    loadKgList(1);
  }

  // ══════════════════════════════════════════
  // B. 상세 페이지 (kindergarten-detail.html)
  // ══════════════════════════════════════════

  function isDetailPage() {
    return !!document.getElementById('detailKgInfo');
  }

  // [E] 상세 기본정보 — DB 컬럼 매핑 전체 수정
  async function initDetailPage() {
    var kgId = api.getParam('id');
    if (!kgId) { alert('유치원 ID가 없습니다.'); return; }

    // 상세 조회 + 운영자 정보 조인
    var sb = window.__supabase;
    var detailRes = await sb.from('kindergartens')
      .select('*, members!member_id(name, phone)')
      .eq('id', kgId)
      .single();

    if (detailRes.error || !detailRes.data) { alert('유치원 정보를 불러올 수 없습니다.'); return; }
    var kg = detailRes.data;
    var memberInfo = kg.members || {};

    // 기본정보
    api.setTextById('kgIdText', kg.id ? kg.id.slice(0, 8).toUpperCase() : '-');
    api.setTextById('kgName', kg.name || '-');
    api.setHtmlById('kgBizStatus', api.autoBadge(kg.business_status || '-'));
    api.setTextById('kgCreated', api.formatDate(kg.created_at));

    // 소개글
    var introEl = document.getElementById('introText');
    if (introEl && kg.description) introEl.textContent = kg.description;

    // 사진 — photo_urls (text 배열)
    var gallery = document.getElementById('kgPhotoGallery');
    if (gallery && kg.photo_urls) {
      var imgs = kg.photo_urls;
      if (typeof imgs === 'string') { try { imgs = JSON.parse(imgs); } catch (e) { imgs = []; } }
      if (Array.isArray(imgs) && imgs.length > 0) {
        var gHtml = '';
        imgs.forEach(function (url, idx) {
          gHtml += '<div class="photo-gallery__item"><img src="' + api.escapeHtml(url) + '" style="width:100%;height:100%;object-fit:cover;">' +
            (idx === 0 ? '<span class="photo-gallery__badge">대표</span>' : '') + '</div>';
        });
        gallery.innerHTML = gHtml;
      }
    }

    // 운영자 정보 — members 조인 결과
    api.setTextById('opName', memberInfo.name || '-');
    api.setHtmlById('opPhone', api.renderMaskedField(
      api.maskPhone(memberInfo.phone), api.formatPhone(memberInfo.phone), 'kindergartens', kgId, 'operator_phone'
    ));
    if (kg.member_id) {
      api.setHtmlById('opMemberId', api.renderDetailLink('member-detail.html', kg.member_id, kg.member_id.slice(0, 8).toUpperCase()));
    }

    // 주소 정보 — DB 컬럼명: address_road, address_jibun, address_complex, address_building_dong, address_building_ho
    api.setTextById('kgAddrRoad', kg.address_road || '-');
    api.setTextById('kgAddrJibun', kg.address_jibun || '-');
    api.setTextById('kgAddrComplex', kg.address_complex || '-');
    api.setTextById('kgAddrBuilding', kg.address_building_dong ? kg.address_building_dong + '동' : '-');
    var kgHoVal = kg.address_building_ho || '';
    var kgHoRaw  = kgHoVal ? kgHoVal + '호' : '-';
    var kgHoMask = kgHoVal ? api.maskHo(kgHoVal) + '호' : '-';
    api.setHtmlById('kgAddrHo', api.renderMaskedField(
      kgHoMask, kgHoRaw, 'kindergartens', kgId, 'address_building_ho'
    ));
    api.setHtmlById('kgAddrVerified', api.autoBadge(kg.address_auth_status || '미인증'));
    api.setTextById('kgAddrVerifiedDate', kg.address_auth_date ? api.formatDate(kg.address_auth_date) : '\u2014');

    // 신선도 정보 — freshness_current / freshness_initial
    var freshVal = kg.freshness_current != null ? kg.freshness_current : 100;
    var freshColor = freshVal >= 100 ? '#2ECC71' : '#E05A3A';
    api.setHtmlById('freshCurrent', '<span style="font-size:28px;font-weight:700;color:' + freshColor + ';">' + freshVal + '%</span>');
    api.setTextById('freshInitial', (kg.freshness_initial || 100) + '%');

    // 돌봄 건수, 후기 수, 긍정률 — DB에 직접 컬럼 없으므로 집계 조회
    var careCountRes = await sb.from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('kindergarten_id', kgId)
      .eq('status', '돌봄완료');
    api.setTextById('freshCareCount', (careCountRes.count || 0) + '건');

    var revCountRes = await sb.from('kindergarten_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('kindergarten_id', kgId);
    api.setTextById('freshReviewCount', (revCountRes.count || 0) + '건');

    // 긍정률: '최고예요!' 또는 '좋았어요' 비율
    var revAllRes = await sb.from('kindergarten_reviews')
      .select('satisfaction')
      .eq('kindergarten_id', kgId);
    var positiveRate = 0;
    if (revAllRes.data && revAllRes.data.length > 0) {
      var positiveCount = revAllRes.data.filter(function (r) {
        return r.satisfaction === '최고예요!' || r.satisfaction === '좋았어요';
      }).length;
      positiveRate = Math.round((positiveCount / revAllRes.data.length) * 100);
    }
    api.setTextById('freshPositiveRate', positiveRate + '%');

    // 노쇼 횟수 — noshow_count
    api.setTextById('freshKgNoshow', (kg.noshow_count || 0) + '회');

    // 취소 횟수 — reservations에서 유치원취소 집계
    var cancelRes = await sb.from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('kindergarten_id', kgId)
      .eq('status', '유치원취소');
    api.setTextById('freshKgCancel', (cancelRes.count || 0) + '회');

    // 보호자가 작성한 돌봄후기
    loadGuardianReviews(kgId);

    // 돌봄 후기 태그 집계
    loadKgReviewTags(kgId);

    // 상주 반려동물
    loadResidentPets(kgId);

    // 돌봄비 가격표
    loadPriceTable(kg);

    // 교육이수 정보
    loadEducationInfo(kgId);

    // 정산정보 및 서브몰
    loadSettlementInfo(kgId, kg);

    // 정산 이력 요약
    loadSettlementSummary(kgId);

    // 노쇼 이력
    loadKgNoshows(kgId);

    // 상태 변경 이력
    loadKgStatusLogs(kgId);

    // [K] 액션 버튼 바인딩 — business_status / address_auth_status
    bindKgActions(kgId, kg);
    api.hideIfReadOnly(PERM_KEY, ['.detail-actions', '.btn-action']);
    api.insertAuditLog('유치원조회', 'kindergartens', kgId, { name: kg.name });
  }

  // ── 보호자가 작성한 돌봄후기 ──
  async function loadGuardianReviews(kgId) {
    var tbody = document.getElementById('kgGuardianReviewsBody');
    if (!tbody) return;

    var res = await api.fetchList('guardian_reviews', {
      select: '*, members(name), pets(name), reservations(checkin_scheduled)',
      filters: [{ column: 'kindergarten_id', op: 'eq', value: kgId }],
      orderBy: 'created_at',
      ascending: false,
      page: 1,
      perPage: 5
    });

    if (!res.data || res.data.length === 0) {
      api.showTableEmpty(tbody, 9, '보호자 후기가 없습니다.');
      return;
    }

    var html = '';
    res.data.forEach(function (rv) {
      var guardianName = (rv.members && rv.members.name) || '-';
      var petName = (rv.pets && rv.pets.name) || '-';
      var checkinDate = (rv.reservations && rv.reservations.checkin_scheduled)
        ? api.formatDate(rv.reservations.checkin_scheduled, true) : '-';
      var tags = rv.selected_tags || [];
      if (typeof tags === 'string') { try { tags = JSON.parse(tags); } catch (e) { tags = []; } }
      var tagHtml = tags.map(function (t) {
        return '<span class="review-tag-pill">' + api.escapeHtml(t) + '</span>';
      }).join(' ');
      var satColor = rv.satisfaction === '최고예요!' ? 'green'
                   : rv.satisfaction === '좋았어요' ? 'blue' : 'orange';
      var statusBadge = rv.is_hidden
        ? api.renderBadge('숨김', 'red')
        : api.renderBadge('공개', 'green');

      html += '<tr>' +
        '<td>' + api.formatDate(rv.created_at, true) + '</td>' +
        '<td>' + checkinDate + '</td>' +
        '<td>' + api.escapeHtml(guardianName) + '</td>' +
        '<td>' + api.escapeHtml(petName) + '</td>' +
        '<td>' + api.renderBadge(rv.satisfaction || '-', satColor) + '</td>' +
        '<td>' + (tagHtml || '-') + '</td>' +
        '<td><span class="review-content">' + api.escapeHtml(rv.content || '-') + '</span></td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' + api.renderDetailLink('review-detail.html', rv.id, rv.id.slice(0, 8).toUpperCase()) + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  }

  // ── 돌봄 후기 태그 집계 ──
  async function loadKgReviewTags(kgId) {
    var tbody = document.getElementById('kgTagSummaryBody');
    if (!tbody) return;

    // 7개 항목 고정 정의 (순서 보장)
    var TAG_ITEMS = [
      { label: '상담 친절도',
        positive: '상담이 친절하고 편안했어요',
        negative: '상담이 불친절하고 불편했어요' },
      { label: '일정 준수',
        positive: '예약한 돌봄 일정을 잘 지켜주셨어요',
        negative: '예약한 돌봄 일정이 잘 지켜지지 않았어요' },
      { label: '위생 상태',
        positive: '집(유치원)이 깔끔하고 위생적이었어요',
        negative: '집(유치원)이 지저분하거나 위생이 걱정됐어요' },
      { label: '사진/영상 공유',
        positive: '사진과 영상을 자주 보내주셨어요',
        negative: '사진과 영상 공유가 부족했어요' },
      { label: '요청사항 반영',
        positive: '추가 요청사항을 잘 반영해 주셨어요',
        negative: '추가 요청사항이 제대로 반영되지 않았어요' },
      { label: '반려견 컨디션',
        positive: '반려견이 즐겁고 편안하게 지냈어요',
        negative: '반려견이 편안해 보이지 않았어요' },
      { label: '재이용 의향',
        positive: '다음에도 맡기고 싶어요',
        negative: '다음에는 맡기고 싶지 않아요' }
    ];

    // guardian_reviews에서 이 유치원의 모든 selected_tags 조회
    var res = await api.fetchAll('guardian_reviews', {
      select: 'selected_tags',
      filters: [{ column: 'kindergarten_id', op: 'eq', value: kgId }]
    });

    // 태그별 건수 집계
    var tagCounts = {};
    if (res.data) {
      res.data.forEach(function (rv) {
        var tags = rv.selected_tags || [];
        if (typeof tags === 'string') {
          try { tags = JSON.parse(tags); } catch (e) { tags = []; }
        }
        tags.forEach(function (t) {
          tagCounts[t] = (tagCounts[t] || 0) + 1;
        });
      });
    }

    // 7개 항목 고정 순서로 렌더링
    var html = '';
    TAG_ITEMS.forEach(function (item) {
      var posCount = tagCounts[item.positive] || 0;
      var negCount = tagCounts[item.negative] || 0;

      html += '<tr>' +
        '<td style="font-weight:600;">' + api.escapeHtml(item.label) + '</td>' +
        '<td style="text-align:center;font-weight:700;color:#2ECC71;">' + posCount + '건</td>' +
        '<td style="text-align:center;font-weight:700;color:#E05A3A;">' + negCount + '건</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  }

  async function loadResidentPets(kgId) {
    var tbody = document.getElementById('residentPetsBody');
    if (!tbody) return;

    var res = await api.fetchList('kindergarten_resident_pets', {
      select: '*, pets!pet_id(name, breed, gender, birth_date, weight, is_neutered, id)',
      filters: [{ column: 'kindergarten_id', op: 'eq', value: kgId }],
      perPage: 50
    });

    if (!res.data || res.data.length === 0) {
      api.showTableEmpty(tbody, 7, '상주 반려동물이 없습니다.');
      return;
    }

    var html = '';
    res.data.forEach(function (rp) {
      var p = rp.pets || {};
      html += '<tr>' +
        '<td>' + api.escapeHtml(p.name || '-') + '</td>' +
        '<td>' + api.escapeHtml(p.breed || '-') + '</td>' +
        '<td>' + api.escapeHtml(p.gender || '-') + '</td>' +
        '<td>' + api.calcPetAge(p.birth_date) + '</td>' +
        '<td>' + (p.weight ? p.weight + 'kg' : '-') + '</td>' +
        '<td>' + api.autoBadge(p.is_neutered ? '했어요' : '안 했어요') + '</td>' +
        '<td>' + (p.id ? api.renderDetailLink('pet-detail.html', p.id, p.id.slice(0, 8).toUpperCase()) : '-') + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  }

  // [F] 가격표 — 개별 12컬럼에서 직접 접근
  function loadPriceTable(kg) {
    var tbody = document.getElementById('priceTableBody');
    if (!tbody) return;

    var naSpan = '<span class="na">\u2014</span>';
    var html = '';

    // 소형
    html += '<tr>' +
      '<td>소형</td>' +
      '<td>' + (kg.price_small_1h != null ? api.formatMoney(kg.price_small_1h) : naSpan) + '</td>' +
      '<td>' + (kg.price_small_24h != null ? api.formatMoney(kg.price_small_24h) : naSpan) + '</td>' +
      '<td>' + (kg.price_small_walk != null ? api.formatMoney(kg.price_small_walk) : naSpan) + '</td>' +
      '<td>' + (kg.price_small_pickup != null ? api.formatMoney(kg.price_small_pickup) : naSpan) + '</td>' +
      '</tr>';

    // 중형
    html += '<tr>' +
      '<td>중형</td>' +
      '<td>' + (kg.price_medium_1h != null ? api.formatMoney(kg.price_medium_1h) : naSpan) + '</td>' +
      '<td>' + (kg.price_medium_24h != null ? api.formatMoney(kg.price_medium_24h) : naSpan) + '</td>' +
      '<td>' + (kg.price_medium_walk != null ? api.formatMoney(kg.price_medium_walk) : naSpan) + '</td>' +
      '<td>' + (kg.price_medium_pickup != null ? api.formatMoney(kg.price_medium_pickup) : naSpan) + '</td>' +
      '</tr>';

    // 대형
    html += '<tr>' +
      '<td>대형</td>' +
      '<td>' + (kg.price_large_1h != null ? api.formatMoney(kg.price_large_1h) : naSpan) + '</td>' +
      '<td>' + (kg.price_large_24h != null ? api.formatMoney(kg.price_large_24h) : naSpan) + '</td>' +
      '<td>' + (kg.price_large_walk != null ? api.formatMoney(kg.price_large_walk) : naSpan) + '</td>' +
      '<td>' + (kg.price_large_pickup != null ? api.formatMoney(kg.price_large_pickup) : naSpan) + '</td>' +
      '</tr>';

    tbody.innerHTML = html;
  }

  // [G] 교육이수 — completed_topics / total_topics / all_completed_at
  async function loadEducationInfo(kgId) {
    var sb = window.__supabase;
    var res = await sb.from('education_completions')
      .select('*')
      .eq('kindergarten_id', kgId)
      .limit(1)
      .maybeSingle();

    var edu = res.data;
    if (edu) {
      var isComplete = edu.completed_topics >= edu.total_topics;
      api.setHtmlById('eduStatus', isComplete ? api.renderBadge('이수완료', 'green') : api.renderBadge('진행중', 'orange'));

      var pct = edu.total_topics ? Math.round((edu.completed_topics / edu.total_topics) * 100) : 0;
      api.setHtmlById('eduProgress',
        '<div class="progress-bar"><div class="progress-bar__track"><div class="progress-bar__fill" style="width:' + pct + '%;"></div></div>' +
        '<span class="progress-bar__text">' + edu.completed_topics + ' / ' + edu.total_topics + '</span></div>');

      api.setTextById('eduCompletedDate', edu.all_completed_at ? api.formatDate(edu.all_completed_at) : '\u2014');
    } else {
      api.setHtmlById('eduStatus', api.renderBadge('미시작', 'gray'));
      api.setHtmlById('eduProgress', '<div class="progress-bar"><div class="progress-bar__track"><div class="progress-bar__fill" style="width:0%;"></div></div><span class="progress-bar__text">0 / 0</span></div>');
      api.setTextById('eduCompletedDate', '\u2014');
    }

    // [I] 서약서 동의 — apply_status = '현재 적용중'
    var pledgeRes = await sb.from('pledges')
      .select('id')
      .eq('apply_status', '현재 적용중')
      .limit(1)
      .maybeSingle();

    // 서약서 동의 여부: education_completions에 pledge_agreed 컬럼 확인
    if (edu && edu.pledge_agreed) {
      api.setHtmlById('pledgeStatus', api.renderBadge('동의완료', 'green'));
      api.setTextById('pledgeDate', edu.pledge_agreed_at ? api.formatDate(edu.pledge_agreed_at) : '\u2014');
    } else {
      api.setHtmlById('pledgeStatus', api.renderBadge('미동의', 'gray'));
      api.setTextById('pledgeDate', '\u2014');
    }
  }

  // 정산정보 — inicis_submall_code
  async function loadSettlementInfo(kgId, kg) {
    api.setHtmlById('settlementReview', api.autoBadge(kg.settlement_status || '작성중'));
    api.setHtmlById('settlementInicis', api.autoBadge(kg.inicis_status || '미등록'));
    api.setTextById('settlementInicisCode', kg.inicis_submall_code || '-');
    api.setTextById('settlementSellerId', kg.seller_id || '-');
  }

  // 정산 요약 — payments 테이블에 kindergarten_id 컬럼 존재 확인됨
  // payments.payment_type으로 돌봄/위약금 구분 조회
  async function loadSettlementSummary(kgId) {
    var sb = window.__supabase;

    // 누적 돌봄 결제금액 — payments에서 돌봄 결제만 집계
    var careRes = await sb.from('payments')
      .select('amount')
      .eq('kindergarten_id', kgId)
      .eq('status', '결제완료')
      .eq('payment_type', '돌봄');
    var careTotal = 0;
    if (careRes.data) careRes.data.forEach(function (r) { careTotal += (r.amount || 0); });

    // 위약금은 payments.payment_type='위약금'으로 직접 조회
    var penRes = await sb.from('payments')
      .select('amount')
      .eq('kindergarten_id', kgId)
      .eq('status', '결제완료')
      .eq('payment_type', '위약금');
    var penTotal = 0;
    if (penRes.data) penRes.data.forEach(function (r) { penTotal += (r.amount || 0); });

    var totalValid = careTotal + penTotal;
    var platformFee = Math.round(totalValid * 0.2);
    var kgSettlement = totalValid - platformFee;

    // 정산 완료 금액
    var settledRes = await sb.from('settlements')
      .select('settlement_amount')
      .eq('kindergarten_id', kgId)
      .eq('status', '정산완료');
    var settledTotal = 0;
    if (settledRes.data) settledRes.data.forEach(function (r) { settledTotal += (r.settlement_amount || 0); });

    var pending = kgSettlement - settledTotal;

    api.setTextById('sumCarePay', api.formatNumber(careTotal));
    api.setTextById('sumPenaltyPay', api.formatNumber(penTotal));
    api.setTextById('sumTotalValid', api.formatNumber(totalValid));
    api.setTextById('sumPlatformFee', api.formatNumber(platformFee));
    api.setTextById('sumKgSettlement', api.formatNumber(kgSettlement));
    api.setTextById('sumPending', api.formatNumber(pending > 0 ? pending : 0));
  }

  // [H] 노쇼 이력 — noshow_records에 kindergarten_id 없음
  //     → reservation_id → reservations.kindergarten_id 경유 조회
  async function loadKgNoshows(kgId) {
    var sb = window.__supabase;

    // 1단계: 이 유치원의 reservation_id 목록 확보
    var resRes = await sb.from('reservations')
      .select('id')
      .eq('kindergarten_id', kgId);
    var reservationIds = (resRes.data || []).map(function (r) { return r.id; });

    if (reservationIds.length === 0) {
      api.setHtmlById('kgNoshowCount', '<span style="color:#E05A3A;font-weight:700;">0회</span>');
      var tbody = document.getElementById('kgNoshowBody');
      if (tbody) api.showTableEmpty(tbody, 5, '노쇼 기록이 없습니다.');
      return;
    }

    // 2단계: noshow_records에서 해당 reservation_id로 조회
    var res = await sb.from('noshow_records')
      .select('*', { count: 'exact' })
      .in('reservation_id', reservationIds);

    var count = res.count || 0;
    api.setHtmlById('kgNoshowCount', '<span style="color:#E05A3A;font-weight:700;">' + count + '회</span>');

    var tbody = document.getElementById('kgNoshowBody');
    if (!tbody) return;

    if (!res.data || res.data.length === 0) {
      api.showTableEmpty(tbody, 5, '노쇼 기록이 없습니다.');
      return;
    }

    var html = '';
    res.data.forEach(function (n) {
      html += '<tr>' +
        '<td>' + api.formatDate(n.created_at, true) + '</td>' +
        '<td>' + (n.reservation_id ? api.renderDetailLink('reservation-detail.html', n.reservation_id, n.reservation_id.slice(0, 8).toUpperCase()) : '-') + '</td>' +
        '<td>' + api.escapeHtml(n.counterpart_name || '-') + '</td>' +
        '<td>' + api.autoBadge(n.appeal_status || '미소명') + '</td>' +
        '<td>' + (n.appeal_status === '소명접수' ?
          '<button class="btn-action btn-action--success" style="padding:4px 10px;font-size:12px;">소명 인정</button> ' +
          '<button class="btn-action btn-action--danger" style="padding:4px 10px;font-size:12px;">소명 거부</button>' :
          '<span style="color:var(--text-weak);font-size:12px;">처리 완료</span>') + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  }

  async function loadKgStatusLogs(kgId) {
    var tbody = document.getElementById('kgStatusLogBody');
    if (!tbody) return;

    var res = await api.fetchList('kindergarten_status_logs', {
      filters: [{ column: 'kindergarten_id', op: 'eq', value: kgId }],
      orderBy: 'created_at',
      ascending: false,
      perPage: 20
    });

    if (!res.data || res.data.length === 0) {
      api.showTableEmpty(tbody, 6, '상태 변경 이력이 없습니다.');
      return;
    }

    var html = '';
    res.data.forEach(function (log) {
      html += '<tr>' +
        '<td>' + api.formatDate(log.created_at) + '</td>' +
        '<td>' + api.escapeHtml(log.changed_field || '-') + '</td>' +
        '<td>' + api.autoBadge(log.prev_value) + '</td>' +
        '<td>' + api.autoBadge(log.new_value) + '</td>' +
        '<td>' + api.escapeHtml(log.changed_by || '-') + '</td>' +
        '<td>' + api.escapeHtml(log.note || '-') + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  }

  // [K] 액션 버튼 — business_status / address_auth_status
  function bindKgActions(kgId, kg) {
    // 영업상태 변경
    var btnBizStatus = document.getElementById('btnBizStatus');
    if (btnBizStatus) {
      btnBizStatus.addEventListener('click', async function () {
        var newStatus = kg.business_status === '영업중' ? '방학중' : '영업중';
        if (!confirm('영업 상태를 "' + newStatus + '"로 변경하시겠습니까?')) return;
        await api.updateRecord('kindergartens', kgId, { business_status: newStatus });
        var admin = auth.getAdmin();
        await api.insertRecord('kindergarten_status_logs', {
          kindergarten_id: kgId,
          changed_field: '영업상태',
          prev_value: kg.business_status,
          new_value: newStatus,
          changed_by: admin ? '관리자 (' + admin.name + ')' : '관리자',
          note: '관리자 수동 변경'
        });
        api.insertAuditLog('상태변경', 'kindergartens', kgId, { field: '영업상태', from: kg.business_status, to: newStatus });
        alert('영업 상태가 변경되었습니다.');
        location.reload();
      });
    }

    // 주소 인증 승인/거절
    var btnAddrApprove = document.getElementById('btnKgAddrApprove');
    var btnAddrReject = document.getElementById('btnKgAddrReject');
    if (btnAddrApprove) {
      btnAddrApprove.addEventListener('click', async function () {
        if (!confirm('주소 인증을 승인하시겠습니까?')) return;
        await api.updateRecord('kindergartens', kgId, { address_auth_status: '인증완료', address_auth_date: new Date().toISOString() });
        api.insertAuditLog('주소인증승인', 'kindergartens', kgId, {});
        alert('승인되었습니다.');
        location.reload();
      });
    }
    if (btnAddrReject) {
      btnAddrReject.addEventListener('click', async function () {
        if (!confirm('주소 인증을 거절하시겠습니까?')) return;
        await api.updateRecord('kindergartens', kgId, { address_auth_status: '미인증' });
        api.insertAuditLog('주소인증거절', 'kindergartens', kgId, {});
        alert('거절되었습니다.');
        location.reload();
      });
    }

    // ──── 서류 확인 버튼 ────
    var btnDocView = document.getElementById('btnDocView');
    if (btnDocView) {
      btnDocView.addEventListener('click', async function (e) {
        e.preventDefault();
        var overlay = document.getElementById('modalDocOverlay');
        var body = document.getElementById('modalDocBody');
        if (!overlay || !body) return;

        // 모달 열기
        overlay.classList.add('active');
        body.innerHTML = '<p style="text-align:center;color:var(--text-weak);padding:40px 0;">불러오는 중...</p>';

        // address_doc_urls 조회 (select에 포함되지 않았을 수 있으므로 별도 조회)
        var sb = window.__supabase;
        var docRes = await sb.from('kindergartens')
          .select('address_doc_urls')
          .eq('id', kgId)
          .single();

        var docUrls = (docRes.data && docRes.data.address_doc_urls) || [];
        if (typeof docUrls === 'string') { try { docUrls = JSON.parse(docUrls); } catch (ex) { docUrls = []; } }

        if (!Array.isArray(docUrls) || docUrls.length === 0) {
          body.innerHTML = '<div style="text-align:center;padding:60px 0;color:var(--text-weak);">' +
            '<svg width="48" height="48" viewBox="0 0 24 24" fill="#ccc"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>' +
            '<p style="margin-top:12px;font-size:14px;">제출된 서류가 없습니다.</p></div>';
          return;
        }

        var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">';
        docUrls.forEach(function (url, idx) {
          var ext = url.split('.').pop().toLowerCase();
          var isPdf = ext === 'pdf';
          if (isPdf) {
            html += '<a href="' + api.escapeHtml(url) + '" target="_blank" class="doc-item" style="display:flex;align-items:center;justify-content:center;border:1px solid #e0e0e0;border-radius:8px;padding:20px;text-decoration:none;color:var(--text-primary);">' +
              '<svg width="32" height="32" viewBox="0 0 24 24" fill="#E05A3A"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 9h-2v2h2v2h-2v2H9v-2H7v-2h2v-2H7V9h2V7h2v2h2v2zm-1-5V3.5L17.5 9H13z"/></svg>' +
              '<span style="margin-left:8px;">서류 ' + (idx + 1) + ' (PDF)</span></a>';
          } else {
            html += '<div style="border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">' +
              '<a href="' + api.escapeHtml(url) + '" target="_blank">' +
              '<img src="' + api.escapeHtml(url) + '" alt="서류 ' + (idx + 1) + '" style="width:100%;height:auto;display:block;">' +
              '</a></div>';
          }
        });
        html += '</div>';
        body.innerHTML = html;

        api.insertAuditLog('서류확인', 'kindergartens', kgId, { doc_count: docUrls.length });
      });
    }

    // 모달 닫기 핸들러 (서류 확인 모달)
    var modalOverlay = document.getElementById('modalDocOverlay');
    if (modalOverlay) {
      // 닫기 버튼
      modalOverlay.querySelectorAll('[data-modal-close]').forEach(function (btn) {
        btn.addEventListener('click', function () { modalOverlay.classList.remove('active'); });
      });
      // 오버레이 클릭으로 닫기
      modalOverlay.addEventListener('click', function (e) {
        if (e.target === modalOverlay) modalOverlay.classList.remove('active');
      });
    }

    // ──── 서브몰 재등록 요청 버튼 ────
    var btnSubmallReregister = document.getElementById('btnSubmallReregister');
    if (btnSubmallReregister) {
      btnSubmallReregister.addEventListener('click', async function () {
        if (kg.inicis_status === '등록요청') {
          alert('이미 서브몰 등록 요청 상태입니다.');
          return;
        }
        if (!confirm('이니시스 서브몰 재등록을 요청하시겠습니까?\n현재 상태: ' + (kg.inicis_status || '미등록'))) return;

        var prevStatus = kg.inicis_status || '미등록';
        await api.updateRecord('kindergartens', kgId, { inicis_status: '등록요청' });

        // 상태 변경 이력 기록
        var admin = auth.getAdmin();
        await api.insertRecord('kindergarten_status_logs', {
          kindergarten_id: kgId,
          changed_field: '이니시스 상태',
          prev_value: prevStatus,
          new_value: '등록요청',
          changed_by: admin ? '관리자 (' + admin.name + ')' : '관리자',
          note: '서브몰 재등록 요청'
        });
        api.insertAuditLog('서브몰재등록요청', 'kindergartens', kgId, { from: prevStatus, to: '등록요청' });
        alert('서브몰 재등록이 요청되었습니다.');
        location.reload();
      });
    }

    // ──── 정산정보 보기 버튼 ────
    // settlement_infos 테이블에서 해당 유치원의 정산정보 레코드를 찾아 상세 페이지로 이동
    var btnGoSettlement = document.getElementById('btnGoSettlement');
    if (btnGoSettlement) {
      btnGoSettlement.addEventListener('click', async function (e) {
        e.preventDefault();
        var sb = window.__supabase;
        var siRes = await sb.from('settlement_infos')
          .select('id')
          .eq('kindergarten_id', kgId)
          .limit(1)
          .maybeSingle();

        if (siRes.data && siRes.data.id) {
          window.location.href = 'settlement-info-detail.html?id=' + encodeURIComponent(siRes.data.id);
        } else {
          alert('해당 유치원의 정산정보가 아직 등록되지 않았습니다.');
        }
      });
    }

    // ──── 정산내역 전체 보기 버튼 ────
    // settlements는 유치원당 N건이므로 정산관리 목록(정산내역 탭)에서 유치원으로 필터링하여 표시
    var btnGoSettlementHistory = document.getElementById('btnGoSettlementHistory');
    if (btnGoSettlementHistory) {
      btnGoSettlementHistory.addEventListener('click', function () {
        window.location.href = 'settlements.html?kindergarten_id=' + encodeURIComponent(kgId) + '&tab=history';
      });
    }

    // ──── 유치원 삭제 버튼 ────
    var btnDeleteKg = document.getElementById('btnDeleteKg');
    var modalDeleteOverlay = document.getElementById('modalDeleteKgOverlay');
    var btnDeleteKgConfirm = document.getElementById('btnDeleteKgConfirm');

    if (btnDeleteKg && modalDeleteOverlay) {
      // [삭제] 버튼 클릭 → 모달 열기
      btnDeleteKg.addEventListener('click', function () {
        modalDeleteOverlay.classList.add('active');
      });

      // 오버레이 클릭 → 모달 닫기
      modalDeleteOverlay.addEventListener('click', function (e) {
        if (e.target === modalDeleteOverlay) modalDeleteOverlay.classList.remove('active');
      });

      // 모달 내 닫기 버튼 (data-modal-close) → common.js 공통 핸들러에서 처리

      // 삭제 확인 버튼 → RPC 호출로 DB 완전 삭제
      btnDeleteKgConfirm.addEventListener('click', async function () {
        btnDeleteKgConfirm.disabled = true;
        btnDeleteKgConfirm.textContent = '삭제 중...';

        try {
          var result = await api.callRpc('delete_kindergarten_completely', { p_kg_id: kgId });

          if (result.error) {
            alert('삭제 실패: ' + (result.error.message || '알 수 없는 오류'));
            btnDeleteKgConfirm.disabled = false;
            btnDeleteKgConfirm.textContent = '삭제';
            return;
          }

          // 감사 로그 (유치원이 이미 삭제되었으므로 별도 테이블에 기록)
          api.insertAuditLog('유치원삭제', 'kindergartens', kgId, { name: kg.name });

          alert('유치원이 삭제되었습니다.');
          window.location.href = 'kindergartens.html';
        } catch (err) {
          alert('삭제 중 오류가 발생했습니다: ' + err.message);
          btnDeleteKgConfirm.disabled = false;
          btnDeleteKgConfirm.textContent = '삭제';
        }
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
