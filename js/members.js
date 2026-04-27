/**
 * 우유펫 관리자 대시보드 — 회원관리 (members.js)
 *
 * 목록 (members.html) + 상세 (member-detail.html) 공통 모듈
 * 의존: api.js, auth.js, common.js
 */
(function () {
  'use strict';

  var api = window.__api;
  var auth = window.__auth;
  if (!api || !auth) return;

  var PAGE = 'members';
  var PERM_KEY = 'perm_members';
  var PER_PAGE = 20;

  // ══════════════════════════════════════════
  // A. 목록 페이지 (members.html)
  // ══════════════════════════════════════════

  function isListPage() {
    return !!document.getElementById('memberListBody');
  }

  // ── 필터 요소 참조 ──
  var filterDateFrom, filterDateTo, filterStatus, filterMode, filterAddress;
  var filterSearchField, filterSearchInput, btnSearch, btnExcel;
  var resultCount, listBody, pagination;

  var currentPage = 1;

  function cacheListDom() {
    var dates = document.querySelectorAll('.filter-input--date');
    filterDateFrom = dates[0];
    filterDateTo   = dates[1];

    var selects = document.querySelectorAll('.filter-select');
    filterStatus   = selects[0]; // 회원상태
    filterMode     = selects[1]; // 모드
    filterAddress  = selects[2]; // 주소인증
    filterSearchField = selects[3]; // 검색 필드 선택
    filterSearchInput = document.querySelector('.filter-input--search');
    btnSearch = document.querySelector('.btn-search');
    btnExcel  = document.querySelector('.btn-excel');

    resultCount = document.querySelector('.result-header__count strong');
    listBody    = document.getElementById('memberListBody');
    pagination  = document.querySelector('.pagination');
  }

  function buildFilters() {
    var filters = [];

    // 기간 필터 (가입일)
    if (filterDateFrom && filterDateFrom.value) {
      filters.push({ column: 'created_at', op: 'gte', value: filterDateFrom.value + 'T00:00:00' });
    }
    if (filterDateTo && filterDateTo.value) {
      filters.push({ column: 'created_at', op: 'lte', value: filterDateTo.value + 'T23:59:59' });
    }

    // 회원상태
    if (filterStatus) {
      var statusVal = filterStatus.value;
      if (statusVal && statusVal !== '회원상태: 전체') {
        filters.push({ column: 'status', op: 'eq', value: statusVal });
      }
    }

    // 모드
    if (filterMode) {
      var modeVal = filterMode.value;
      if (modeVal && modeVal !== '모드: 전체') {
        filters.push({ column: 'current_mode', op: 'eq', value: modeVal });
      }
    }

    // 주소인증
    if (filterAddress) {
      var addrVal = filterAddress.value;
      if (addrVal && addrVal !== '주소인증: 전체') {
        filters.push({ column: 'address_auth_status', op: 'eq', value: addrVal });
      }
    }

    return filters;
  }

  function buildSearchOr() {
    if (!filterSearchInput || !filterSearchInput.value.trim()) return [];
    var keyword = '%' + filterSearchInput.value.trim() + '%';
    var fieldMap = {
      '이름':       'name.ilike.' + keyword,
      '닉네임':     'nickname.ilike.' + keyword,
      '휴대폰번호': 'phone.ilike.' + keyword
    };
    var fieldLabel = filterSearchField ? filterSearchField.value : '이름';
    var filter = fieldMap[fieldLabel] || fieldMap['이름'];
    return [filter];
  }

  async function loadMemberList(page) {
    currentPage = page || 1;
    api.showTableLoading(listBody, 15);

    var result = await api.fetchList('members', {
      select: '*',
      filters: buildFilters(),
      orFilters: buildSearchOr(),
      orderBy: 'created_at',
      ascending: false,
      page: currentPage,
      perPage: PER_PAGE
    });

    if (result.error) {
      api.showTableEmpty(listBody, 15, '데이터를 불러오지 못했습니다: ' + (result.error.message || ''));
      return;
    }

    if (resultCount) resultCount.textContent = result.count;

    if (!result.data || result.data.length === 0) {
      api.showTableEmpty(listBody, 15);
      renderListPagination(0);
      return;
    }

    var rows = result.data;

    // 해당 페이지 회원들의 결제 건수/금액 집계
    var memberIds = rows.map(function (r) { return r.id; });
    var payMap = {};
    if (memberIds.length > 0) {
      var sb = window.__supabase;
      var payRes = await sb.from('payments')
        .select('member_id, amount')
        .in('member_id', memberIds)
        .eq('status', '결제완료')
        .eq('payment_type', '돌봄');
      if (payRes.data) {
        payRes.data.forEach(function (p) {
          if (!payMap[p.member_id]) payMap[p.member_id] = { count: 0, amount: 0 };
          payMap[p.member_id].count += 1;
          payMap[p.member_id].amount += (p.amount || 0);
        });
      }
    }

    var startIdx = (currentPage - 1) * PER_PAGE;
    var html = '';

    for (var i = 0; i < rows.length; i++) {
      var m = rows[i];
      var pay = payMap[m.id] || { count: 0, amount: 0 };
      var idx = startIdx + i + 1;
      var addrShort = (m.address_complex || '') + ' ' + (m.address_building_dong ? m.address_building_dong + '동' : '');
      addrShort = addrShort.trim() || '-';

      html += '<tr>' +
        '<td>' + idx + '</td>' +
        '<td>' + api.escapeHtml(m.name) + '</td>' +
        '<td>' + api.escapeHtml(m.nickname || '-') + '</td>' +
        '<td>' + api.formatBirthShort(m.birth_date) + '</td>' +
        '<td>' + api.escapeHtml(m.carrier || '-') + '</td>' +
        '<td class="masked">' + api.maskPhone(m.phone) + '</td>' +
        '<td>' + api.escapeHtml(addrShort) + '</td>' +
        '<td>' + api.autoBadge(m.address_auth_status || '미인증') + '</td>' +
        '<td>' + api.autoBadge(m.identity_verified ? '완료' : '미완료') + '</td>' +
        '<td>' + api.autoBadge(m.current_mode || '-') + '</td>' +
        '<td>' + api.autoBadge(m.status) + '</td>' +
        '<td class="text-right">' + api.formatNumber(pay.count) + '</td>' +
        '<td class="text-right">' + api.formatMoney(pay.amount, false) + '</td>' +
        '<td>' + api.formatDate(m.created_at, true) + '</td>' +
        '<td>' + api.renderDetailLink('member-detail.html', m.id) + '</td>' +
        '</tr>';
    }

    listBody.innerHTML = html;
    renderListPagination(result.count);
  }

  function renderListPagination(totalCount) {
    api.renderPagination(pagination, currentPage, totalCount, PER_PAGE, function (page) {
      loadMemberList(page);
    });
  }

  // ── 엑셀 다운로드 ──
  async function exportMemberExcel() {
    var result = await api.fetchAll('members', {
      filters: buildFilters(),
      orFilters: buildSearchOr(),
      orderBy: 'created_at',
      ascending: false
    });

    if (!result.data || result.data.length === 0) {
      alert('다운로드할 데이터가 없습니다.');
      return;
    }

    // 전체 회원의 결제 건수/금액 집계
    var allIds = result.data.map(function (r) { return r.id; });
    var payMap = {};
    if (allIds.length > 0) {
      var sb = window.__supabase;
      var payRes = await sb.from('payments')
        .select('member_id, amount')
        .in('member_id', allIds)
        .eq('status', '결제완료')
        .eq('payment_type', '돌봄');
      if (payRes.data) {
        payRes.data.forEach(function (p) {
          if (!payMap[p.member_id]) payMap[p.member_id] = { count: 0, amount: 0 };
          payMap[p.member_id].count += 1;
          payMap[p.member_id].amount += (p.amount || 0);
        });
      }
    }

    var headers = [
      { key: 'name', label: '이름' },
      { key: 'nickname', label: '닉네임' },
      { key: 'birth_date', label: '생년월일' },
      { key: 'carrier', label: '통신사' },
      { key: 'phone_masked', label: '휴대폰번호' },
      { key: 'address_short', label: '등록 주소' },
      { key: 'address_verified', label: '주소인증' },
      { key: 'identity_status', label: '본인인증' },
      { key: 'role', label: '모드' },
      { key: 'status', label: '상태' },
      { key: 'payment_count', label: '결제건수' },
      { key: 'payment_amount', label: '결제금액' },
      { key: 'created_date', label: '가입일' }
    ];

    var rows = result.data.map(function (m) {
      var pay = payMap[m.id] || { count: 0, amount: 0 };
      return {
        name: m.name,
        nickname: m.nickname || '',
        birth_date: api.formatBirthShort(m.birth_date),
        carrier: m.carrier || '',
        phone_masked: api.maskPhone(m.phone),
        address_short: ((m.address_complex || '') + ' ' + (m.address_building_dong ? m.address_building_dong + '동' : '')).trim() || '-',
        address_verified: m.address_auth_status || '미인증',
        identity_status: m.identity_verified ? '완료' : '미완료',
        role: m.current_mode || '',
        status: m.status || '',
        payment_count: pay.count,
        payment_amount: pay.amount,
        created_date: api.formatDate(m.created_at, true)
      };
    });

    api.exportExcel(rows, headers, '회원관리');
  }

  function initListPage() {
    cacheListDom();

    // 초기 날짜 설정
    if (filterDateFrom) filterDateFrom.value = api.getMonthStart().slice(0, 4) + '-01-01';
    if (filterDateTo) filterDateTo.value = api.getToday();

    // URL 파라미터에서 필터 값 받기 (대시보드에서 클릭)
    var paramStatus = api.getParam('status');
    if (paramStatus && filterStatus) {
      filterStatus.value = paramStatus;
    }

    if (btnSearch) {
      btnSearch.addEventListener('click', function () { loadMemberList(1); });
    }
    if (filterSearchInput) {
      filterSearchInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') loadMemberList(1);
      });
    }
    if (btnExcel) {
      btnExcel.addEventListener('click', exportMemberExcel);
    }

    // 수정 권한 없으면 액션 숨기기
    api.hideIfReadOnly(PERM_KEY, ['.btn-action']);

    loadMemberList(1);
  }

  // ══════════════════════════════════════════
  // B. 상세 페이지 (member-detail.html)
  // ══════════════════════════════════════════

  function isDetailPage() {
    return !!document.getElementById('detailBasicInfo');
  }

  async function initDetailPage() {
    var memberId = api.getParam('id');
    if (!memberId) {
      alert('회원 ID가 없습니다.');
      return;
    }

    // ── ① 기본정보 ──
    var res = await api.fetchDetail('members', memberId);
    if (res.error || !res.data) {
      alert('회원 정보를 불러올 수 없습니다.');
      return;
    }
    var m = res.data;

    api.setTextById('memberIdText', m.id ? m.id.slice(0, 8).toUpperCase() : '-');
    api.setTextById('memberName', m.name || '-');
    api.setTextById('memberNickname', (m.nickname || '-'));
    api.setTextById('memberBirth', api.formatDate(m.birth_date, true));
    api.setTextById('memberGender', m.gender || '-');
    api.setTextById('memberCarrier', m.carrier || '-');
    api.setHtmlById('memberPhone', api.renderMaskedField(
      api.maskPhone(m.phone), api.formatPhone(m.phone), 'members', memberId, 'phone'
    ));
    api.setHtmlById('memberMode', api.autoBadge(m.current_mode));
    api.setHtmlById('memberStatus', api.autoBadge(m.status));
    api.setTextById('memberCreated', api.formatDate(m.created_at));

    // 프로필 이미지
    if (m.profile_image) {
      var imgEl = document.getElementById('memberProfileImg');
      if (imgEl) imgEl.innerHTML = '<img src="' + api.escapeHtml(m.profile_image) + '" style="width:64px;height:64px;object-fit:cover;border-radius:8px;">';
    }

    // ── ② 본인인증 정보 ──
    api.setHtmlById('identityStatus', api.autoBadge(m.identity_verified ? '완료' : '미완료'));
    api.setTextById('identityMethod', m.identity_method || '-');
    api.setTextById('identityDate', api.formatDate(m.identity_verified_at));
    api.setTextById('identityCarrier', m.identity_carrier || '-');

    // ── ③ 주소 정보 ──
    api.setTextById('addressRoad', m.address_road || '-');
    api.setTextById('addressComplex', m.address_complex || '-');
    api.setTextById('addressBuilding', m.address_building_dong ? m.address_building_dong + '동' : '-');
    var hoVal = m.address_building_ho || '';
    var hoRaw  = hoVal ? hoVal + '호' : '-';
    var hoMask = hoVal ? api.maskHo(hoVal) + '호' : '-';
    api.setHtmlById('addressHo', api.renderMaskedField(
      hoMask, hoRaw, 'members', memberId, 'address_building_ho'
    ));
    api.setHtmlById('addressVerified', api.autoBadge(m.address_auth_status || '미인증'));
    api.setTextById('addressVerifiedDate', m.address_auth_date ? api.formatDate(m.address_auth_date) : '\u2014');

    // 유치원 모드 전용 섹션 표시/숨김
    var kgSection = document.getElementById('sectionKindergarten');
    if (kgSection) {
      if (m.current_mode === '유치원') {
        kgSection.style.display = '';
        loadMemberKindergarten(memberId);
      } else {
        kgSection.style.display = 'none';
      }
    }

    // ── ④ 약관 동의 내역 ──
    loadTermAgreements(memberId);

    // ── ⑤ 반려동물 목록 ──
    loadMemberPets(memberId);

    // ── ⑥⑦ 결제 이력 ──
    loadPaymentSummary(memberId);
    loadRecentPayments(memberId);

    // ── ⑧⑨ 노쇼 이력 ──
    loadNoshowHistory(memberId);

    // ── ⑩ 차단 이력 ──
    loadBlockHistory(memberId);

    // ── ⑫ 상태 변경 이력 ──
    loadStatusLogs(memberId);

    // ── 액션 버튼 바인딩 ──
    bindDetailActions(memberId, m);

    // 권한 체크 → 수정 불가 시 액션 숨김
    api.hideIfReadOnly(PERM_KEY, ['.detail-actions', '.btn-action']);

    // 개인정보 조회 감사 로그
    api.insertAuditLog('개인정보조회', 'members', memberId, { name: m.name });
  }

  // ── 약관 동의 내역 ──
  async function loadTermAgreements(memberId) {
    var tbody = document.getElementById('termAgreementsBody');
    if (!tbody) return;

    var res = await api.fetchList('member_term_agreements', {
      select: '*',
      filters: [{ column: 'member_id', op: 'eq', value: memberId }],
      orderBy: 'created_at',
      ascending: true,
      perPage: 50
    });

    if (!res.data || res.data.length === 0) {
      api.showTableEmpty(tbody, 4, '약관 동의 내역이 없습니다.');
      return;
    }

    var html = '';
    res.data.forEach(function (a) {
      html += '<tr>' +
        '<td>' + api.escapeHtml(a.term_title || '-') + '</td>' +
        '<td>' + (a.is_required ? api.renderBadge('필수', 'blue') : api.renderBadge('선택', 'gray')) + '</td>' +
        '<td>' + (a.is_agreed ? '<span class="text-agreed">동의</span>' : '<span class="text-disagreed">미동의</span>') + '</td>' +
        '<td>' + (a.agreed_at ? api.formatDate(a.agreed_at) : '<span style="color:var(--text-weak);">\u2014</span>') + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  }

  // ── 반려동물 목록 ──
  async function loadMemberPets(memberId) {
    var tbody = document.getElementById('petListBody');
    if (!tbody) return;

    var res = await api.fetchList('pets', {
      filters: [{ column: 'member_id', op: 'eq', value: memberId }],
      orderBy: 'created_at',
      ascending: true,
      perPage: 50
    });

    if (!res.data || res.data.length === 0) {
      api.showTableEmpty(tbody, 8, '등록된 반려동물이 없습니다.');
      return;
    }

    var html = '';
    res.data.forEach(function (p) {
      html += '<tr>' +
        '<td>' + api.escapeHtml(p.name) + '</td>' +
        '<td>' + api.escapeHtml(p.breed || '-') + '</td>' +
        '<td>' + api.escapeHtml(p.gender || '-') + '</td>' +
        '<td>' + api.calcPetAge(p.birth_date) + '</td>' +
        '<td>' + (p.weight ? p.weight + 'kg' : '-') + '</td>' +
        '<td>' + api.autoBadge(p.is_neutered ? '했어요' : '안 했어요') + '</td>' +
        '<td>' + (p.is_representative ? api.renderBadge('★ 대표', 'blue') : '<span style="color:var(--text-weak);">일반</span>') + '</td>' +
        '<td>' + api.renderDetailLink('pet-detail.html', p.id, p.id.slice(0, 8).toUpperCase()) + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  }

  // ── 결제 이력 요약 ──
  async function loadPaymentSummary(memberId) {
    var sb = window.__supabase;

    // 총 결제 건수/금액
    var payRes = await sb.from('payments')
      .select('amount', { count: 'exact' })
      .eq('member_id', memberId)
      .eq('status', '결제완료')
      .eq('payment_type', '돌봄');

    var payCount = payRes.count || 0;
    var payTotal = 0;
    if (payRes.data) payRes.data.forEach(function (r) { payTotal += (r.amount || 0); });

    // 환불 건수/금액
    var refRes = await sb.from('refunds')
      .select('refund_amount, penalty_amount', { count: 'exact' })
      .eq('member_id', memberId);

    var refCount = refRes.count || 0;
    var refTotal = 0;
    if (refRes.data) refRes.data.forEach(function (r) { refTotal += (r.refund_amount || 0); });

    // 위약금 금액 (refunds 테이블의 penalty_amount 합산)
    var penTotal = 0;
    if (refRes.data) refRes.data.forEach(function (r) { penTotal += (r.penalty_amount || 0); });

    api.setTextById('statPayCount', payCount);
    api.setTextById('statPayAmount', api.formatNumber(payTotal));
    api.setTextById('statRefundCount', refCount);
    api.setTextById('statRefundAmount', api.formatNumber(refTotal));
    api.setTextById('statPenaltyAmount', api.formatNumber(penTotal));
  }

  // ── 최근 결제 내역 ──
  async function loadRecentPayments(memberId) {
    var tbody = document.getElementById('recentPaymentsBody');
    if (!tbody) return;

    var res = await api.fetchList('payments', {
      select: '*, kindergartens(name)',
      filters: [
        { column: 'member_id', op: 'eq', value: memberId },
        { column: 'payment_type', op: 'eq', value: '돌봄' }
      ],
      orderBy: 'created_at',
      ascending: false,
      page: 1,
      perPage: 5
    });

    if (!res.data || res.data.length === 0) {
      api.showTableEmpty(tbody, 5, '결제 내역이 없습니다.');
      return;
    }

    var html = '';
    res.data.forEach(function (p) {
      var kgName = (p.kindergartens && p.kindergartens.name) || '-';
      html += '<tr>' +
        '<td>' + api.formatDate(p.created_at) + '</td>' +
        '<td>' + api.escapeHtml(kgName) + '</td>' +
        '<td class="text-right">' + api.formatMoney(p.amount) + '</td>' +
        '<td>' + api.autoBadge(p.status) + '</td>' +
        '<td>' + api.renderDetailLink('payment-detail.html', p.id, p.id.slice(0, 8).toUpperCase()) + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  }

  // ── 노쇼 이력 ──
  async function loadNoshowHistory(memberId) {
    // 노쇼 요약
    var sb = window.__supabase;
    var noshowRes = await sb.from('noshow_records')
      .select('*', { count: 'exact' })
      .eq('member_id', memberId);

    var noshowCount = noshowRes.count || 0;
    api.setHtmlById('noshowCount', '<span style="color:#E05A3A;font-weight:700;">' + noshowCount + '회</span>');

    // 현재 제재 상태
    var memberRes = await api.fetchDetail('members', memberId, 'noshow_count, noshow_sanction, noshow_sanction_end');
    if (memberRes.data) {
      var d = memberRes.data;
      api.setHtmlById('noshowSanction', d.noshow_sanction ? api.autoBadge(d.noshow_sanction) : api.renderBadge('제재없음', 'gray'));
      api.setTextById('noshowSanctionEnd', d.noshow_sanction_end ? api.formatDate(d.noshow_sanction_end, true) : '\u2014');
    }

    // 노쇼 상세 기록
    var tbody = document.getElementById('noshowDetailBody');
    if (!tbody) return;

    if (!noshowRes.data || noshowRes.data.length === 0) {
      api.showTableEmpty(tbody, 8, '노쇼 기록이 없습니다.');
      return;
    }

    var html = '';
    noshowRes.data.forEach(function (n) {
      var hasAppeal = n.appeal_status && n.appeal_status !== '미소명';
      html += '<tr>' +
        '<td>' + api.formatDate(n.created_at, true) + '</td>' +
        '<td>' + (n.reservation_id ? api.renderDetailLink('reservation-detail.html', n.reservation_id, n.reservation_id.slice(0, 8).toUpperCase()) : '-') + '</td>' +
        '<td>' + api.escapeHtml(n.counterpart_name || '-') + '</td>' +
        '<td>' + api.autoBadge(n.sanction_type || '-') + '</td>' +
        '<td>' + api.autoBadge(n.appeal_status || '미소명') + '</td>' +
        '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">' + api.escapeHtml(n.appeal_content || '-') + '</td>' +
        '<td>' + (n.appeal_doc_urls && n.appeal_doc_urls.length > 0 ? '<span class="mini-table__link">서류 확인</span>' : '<span style="color:var(--text-weak);">\u2014</span>') + '</td>' +
        '<td>' + (hasAppeal && n.appeal_status === '소명접수' ?
          '<button class="btn-action btn-action--success btn-noshow-approve" data-id="' + n.id + '" style="padding:4px 10px;font-size:12px;">소명 인정</button> ' +
          '<button class="btn-action btn-action--danger btn-noshow-reject" data-id="' + n.id + '" style="padding:4px 10px;font-size:12px;">소명 거부</button>' :
          '<span style="color:var(--text-weak);font-size:12px;">처리 완료</span>') + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  }

  // ── 차단 이력 ──
  async function loadBlockHistory(memberId) {
    var tbody = document.getElementById('blockHistoryBody');
    if (!tbody) return;

    var res = await api.fetchList('member_blocks', {
      select: '*, blocked:members!blocked_id(name)',
      filters: [{ column: 'blocker_id', op: 'eq', value: memberId }],
      orderBy: 'blocked_at',
      ascending: false,
      perPage: 50
    });

    if (!res.data || res.data.length === 0) {
      api.showTableEmpty(tbody, 3, '차단 이력이 없습니다.');
      return;
    }

    var html = '';
    res.data.forEach(function (b) {
      var blockedName = (b.blocked && b.blocked.name) || '-';
      html += '<tr>' +
        '<td>' + api.escapeHtml(blockedName) + '</td>' +
        '<td>' + api.formatDate(b.blocked_at) + '</td>' +
        '<td>' + (b.unblocked_at ?
          api.formatDate(b.unblocked_at) :
          '<span style="color:#E05A3A;font-weight:500;">차단 중</span>') + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  }

  // ── 유치원 정보 (유치원 모드 전용) ──
  async function loadMemberKindergarten(memberId) {
    var sb = window.__supabase;
    var res = await sb.from('kindergartens')
      .select('id, name, business_status, inicis_status')
      .eq('member_id', memberId)
      .limit(1)
      .single();

    if (res.data) {
      var kg = res.data;
      api.setTextById('kgName', kg.name || '-');
      api.setHtmlById('kgNumber', api.renderDetailLink('kindergarten-detail.html', kg.id, kg.id.slice(0, 8).toUpperCase()));
      api.setHtmlById('kgStatus', api.autoBadge(kg.business_status || '-'));
      api.setHtmlById('kgInicis', api.autoBadge(kg.inicis_status || '미등록'));
    }
  }

  // ── 상태 변경 이력 ──
  async function loadStatusLogs(memberId) {
    var tbody = document.getElementById('statusLogBody');
    if (!tbody) return;

    var res = await api.fetchList('member_status_logs', {
      filters: [{ column: 'member_id', op: 'eq', value: memberId }],
      orderBy: 'created_at',
      ascending: false,
      perPage: 20
    });

    if (!res.data || res.data.length === 0) {
      api.showTableEmpty(tbody, 5, '상태 변경 이력이 없습니다.');
      return;
    }

    var html = '';
    res.data.forEach(function (log) {
      html += '<tr>' +
        '<td>' + api.formatDate(log.created_at) + '</td>' +
        '<td>' + api.autoBadge(log.prev_status) + '</td>' +
        '<td>' + api.autoBadge(log.new_status) + '</td>' +
        '<td>' + api.escapeHtml(log.changed_by || '-') + '</td>' +
        '<td>' + api.escapeHtml(log.note || '-') + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  }

  // ── 액션 버튼 ──
  function bindDetailActions(memberId, member) {
    var btnSuspend = document.getElementById('btnSuspend');
    var btnRelease = document.getElementById('btnRelease');

    if (btnSuspend) {
      // 이미 정지 상태면 숨기기
      if (member.status === '이용정지') btnSuspend.style.display = 'none';

      btnSuspend.addEventListener('click', async function () {
        if (!confirm('이 회원을 이용정지하시겠습니까?')) return;
        var reason = prompt('정지 사유를 입력하세요:');
        if (!reason) return;

        await api.updateRecord('members', memberId, { status: '이용정지' });

        // 상태 변경 로그 기록
        var admin = auth.getAdmin();
        await api.insertRecord('member_status_logs', {
          member_id: memberId,
          prev_status: member.status,
          new_status: '이용정지',
          changed_by: admin ? '관리자 (' + admin.name + ')' : '관리자',
          note: reason
        });

        api.insertAuditLog('상태변경', 'members', memberId, { from: member.status, to: '이용정지', reason: reason });
        alert('이용정지 처리되었습니다.');
        location.reload();
      });
    }

    if (btnRelease) {
      // 정상 상태면 숨기기
      if (member.status !== '이용정지') btnRelease.style.display = 'none';

      btnRelease.addEventListener('click', async function () {
        if (!confirm('이 회원의 이용정지를 해제하시겠습니까?')) return;

        await api.updateRecord('members', memberId, { status: '정상' });

        var admin = auth.getAdmin();
        await api.insertRecord('member_status_logs', {
          member_id: memberId,
          prev_status: '이용정지',
          new_status: '정상',
          changed_by: admin ? '관리자 (' + admin.name + ')' : '관리자',
          note: '관리자 수동 해제'
        });

        api.insertAuditLog('상태변경', 'members', memberId, { from: '이용정지', to: '정상' });
        alert('정지가 해제되었습니다.');
        location.reload();
      });
    }

    // 주소 인증 승인/거절
    var btnAddrApprove = document.getElementById('btnAddrApprove');
    var btnAddrReject  = document.getElementById('btnAddrReject');

    if (btnAddrApprove) {
      btnAddrApprove.addEventListener('click', async function () {
        if (!confirm('주소 인증을 승인하시겠습니까?')) return;
        await api.updateRecord('members', memberId, {
          address_auth_status: '인증완료',
          address_auth_date: new Date().toISOString()
        });
        api.insertAuditLog('주소인증승인', 'members', memberId, {});
        alert('주소 인증이 승인되었습니다.');
        location.reload();
      });
    }
    if (btnAddrReject) {
      btnAddrReject.addEventListener('click', async function () {
        if (!confirm('주소 인증을 거절하시겠습니까?')) return;
        await api.updateRecord('members', memberId, { address_auth_status: '미인증' });
        api.insertAuditLog('주소인증거절', 'members', memberId, {});
        alert('주소 인증이 거절되었습니다.');
        location.reload();
      });
    }
    // ──── 서류 확인 버튼 ────
    var btnMemberDocView = document.getElementById('btnMemberDocView');
    if (btnMemberDocView) {
      btnMemberDocView.addEventListener('click', async function (e) {
        e.preventDefault();
        var overlay = document.getElementById('modalMemberDocOverlay');
        var body = document.getElementById('modalMemberDocBody');
        if (!overlay || !body) return;

        // 모달 열기
        overlay.classList.add('active');
        body.innerHTML = '<p style="text-align:center;color:var(--text-weak);padding:40px 0;">불러오는 중...</p>';

        // address_doc_urls 조회
        var sb = window.__supabase;
        var docRes = await sb.from('members')
          .select('address_doc_urls')
          .eq('id', memberId)
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

        api.insertAuditLog('서류확인', 'members', memberId, { doc_count: docUrls.length });
      });
    }

    // 모달 닫기 핸들러 (서류 확인 모달)
    var memberDocOverlay = document.getElementById('modalMemberDocOverlay');
    if (memberDocOverlay) {
      memberDocOverlay.querySelectorAll('[data-modal-close]').forEach(function (btn) {
        btn.addEventListener('click', function () { memberDocOverlay.classList.remove('active'); });
      });
      memberDocOverlay.addEventListener('click', function (e) {
        if (e.target === memberDocOverlay) memberDocOverlay.classList.remove('active');
      });
    }

    // ──── 회원 삭제 버튼 ────
    var btnDeleteMember = document.getElementById('btnDeleteMember');
    var modalDeleteMemberOverlay = document.getElementById('modalDeleteMemberOverlay');
    var btnDeleteMemberConfirm = document.getElementById('btnDeleteMemberConfirm');

    if (btnDeleteMember && modalDeleteMemberOverlay) {
      // [삭제] 버튼 클릭 → 모달 열기
      btnDeleteMember.addEventListener('click', function () {
        modalDeleteMemberOverlay.classList.add('active');
      });

      // 오버레이 클릭 → 모달 닫기
      modalDeleteMemberOverlay.addEventListener('click', function (e) {
        if (e.target === modalDeleteMemberOverlay) modalDeleteMemberOverlay.classList.remove('active');
      });

      // 모달 내 닫기 버튼 (data-modal-close) → common.js 공통 핸들러에서 처리

      // 삭제 확인 버튼 → RPC 호출로 DB 완전 삭제
      btnDeleteMemberConfirm.addEventListener('click', async function () {
        btnDeleteMemberConfirm.disabled = true;
        btnDeleteMemberConfirm.textContent = '삭제 중...';

        try {
          var result = await api.callRpc('delete_member_completely', { p_member_id: memberId });

          if (result.error) {
            alert('삭제 실패: ' + (result.error.message || '알 수 없는 오류'));
            btnDeleteMemberConfirm.disabled = false;
            btnDeleteMemberConfirm.textContent = '삭제';
            return;
          }

          // 감사 로그
          api.insertAuditLog('회원삭제', 'members', memberId, { name: member.name });

          alert('회원이 삭제되었습니다.');
          window.location.href = 'members.html';
        } catch (err) {
          alert('삭제 중 오류가 발생했습니다: ' + err.message);
          btnDeleteMemberConfirm.disabled = false;
          btnDeleteMemberConfirm.textContent = '삭제';
        }
      });
    }
  }

  // ══════════════════════════════════════════
  // C. 초기화
  // ══════════════════════════════════════════

  function init() {
    if (isListPage()) {
      initListPage();
    } else if (isDetailPage()) {
      initDetailPage();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
