/**
 * 우유펫 관리자 대시보드 — 돌봄예약관리 (reservations.js)
 *
 * 목록 (reservations.html) + 상세 (reservation-detail.html) 공통 모듈
 * 의존: api.js, auth.js, common.js
 */
(function () {
  'use strict';

  var api = window.__api;
  var auth = window.__auth;
  if (!api || !auth) return;

  var PAGE = 'reservations';
  var PERM_KEY = 'perm_reservations';
  var PER_PAGE = 20;

  /* ══════════════════════════════════════════
     A. 목록 페이지 (reservations.html)
     ══════════════════════════════════════════ */

  function isListPage() {
    return !!document.getElementById('resListBody');
  }

  var filterDateFrom, filterDateTo, filterStatus;
  var filterSearchField, filterSearchInput, btnSearch, btnExcel;
  var resultCount, listBody, pagination;
  var currentPage = 1;

  function cacheListDom() {
    var dates = document.querySelectorAll('.filter-input--date');
    filterDateFrom = dates[0];
    filterDateTo   = dates[1];

    var selects = document.querySelectorAll('.filter-select');
    filterStatus      = selects[0]; // 예약 상태
    filterSearchField = selects[1]; // 검색 기준
    filterSearchInput = document.querySelector('.filter-input--search');
    btnSearch = document.querySelector('.btn-search');
    btnExcel  = document.querySelector('.btn-excel');

    resultCount = document.querySelector('.result-header__count strong');
    listBody    = document.getElementById('resListBody');
    pagination  = document.querySelector('.pagination');
  }

  function buildFilters() {
    var filters = [];

    if (filterDateFrom && filterDateFrom.value) {
      filters.push({ column: 'created_at', op: 'gte', value: filterDateFrom.value + 'T00:00:00' });
    }
    if (filterDateTo && filterDateTo.value) {
      filters.push({ column: 'created_at', op: 'lte', value: filterDateTo.value + 'T23:59:59' });
    }

    if (filterStatus && filterStatus.value !== '전체') {
      filters.push({ column: 'status', op: 'eq', value: filterStatus.value });
    }

    return filters;
  }

  function buildSearch() {
    // 조인 테이블 검색은 orFilters로 처리해야 하므로 여기선 id 검색만
    if (!filterSearchInput || !filterSearchInput.value.trim()) return null;
    var val = filterSearchInput.value.trim();
    var field = filterSearchField ? filterSearchField.value : '예약번호';
    if (field === '예약번호') return { column: 'id', value: val };
    // 나머지 (보호자, 반려동물, 유치원)는 클라이언트 필터링 또는 별도 처리 필요
    return null;
  }

  /** 조인된 데이터에서 이름 추출 헬퍼 */
  function jv(obj, key) { return (obj && obj[key]) ? obj[key] : ''; }

  function renderRow(r, idx, offset) {
    var no = offset + idx + 1;
    var memberName = jv(r.members, 'name');
    var memberPhone = jv(r.members, 'phone');
    var petName = jv(r.pets, 'name');
    var petSize = jv(r.pets, 'size_class') || '소형';
    var kgName = jv(r.kindergartens, 'name');
    var kgAddr = jv(r.kindergartens, 'address_road');
    var pay = Array.isArray(r.payments) ? r.payments[0] : (r.payments || {});
    var payAmount = pay ? (pay.amount || 0) : 0;
    var payId = pay ? pay.id : null;

    var sizeBadge = api.autoBadge(petSize, {
      '소형': 'green', '중형': 'orange', '대형': 'red'
    });
    var pickupBadge = (r.pickup_requested === true)
      ? '<span class="badge badge--c-blue">이용</span>'
      : '<span class="badge badge--c-gray">미이용</span>';
    var statusBadge = api.autoBadge(r.status || '', {
      '수락대기': 'orange', '예약확정': 'blue', '돌봄진행중': 'blue',
      '돌봄완료': 'green', '보호자취소': 'gray', '유치원취소': 'gray',
      '유치원거절': 'red', '노쇼': 'red'
    });

    return '<tr>' +
      '<td>' + no + '</td>' +
      '<td>' + api.formatDate(r.requested_at || r.created_at) + '</td>' +
      '<td>' + api.escapeHtml(memberName) + '</td>' +
      '<td class="masked">' + api.maskPhone(memberPhone) + '</td>' +
      '<td>' + api.escapeHtml(petName) + '</td>' +
      '<td>' + sizeBadge + '</td>' +
      '<td>' + api.escapeHtml(kgName) + '</td>' +
      '<td>' + api.escapeHtml(kgAddr) + '</td>' +
      '<td>' + api.formatDate(r.checkin_scheduled) + '</td>' +
      '<td>' + api.formatDate(r.checkout_scheduled) + '</td>' +
      '<td>' + (r.walk_count || 0) + '회</td>' +
      '<td>' + pickupBadge + '</td>' +
      '<td class="text-right">' + api.formatMoney(payAmount) + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + (payId ? '<a href="payment-detail.html?id=' + payId + '" class="data-table__link">결제상세</a>' : '—') + '</td>' +
      '<td><a href="reservation-detail.html?id=' + r.id + '" class="data-table__link">상세</a></td>' +
      '</tr>';
  }

  async function loadList(page) {
    currentPage = page || 1;
    var offset = (currentPage - 1) * PER_PAGE;

    api.showTableLoading(listBody, 16);

    try {
      var res = await api.fetchList('reservations', {
        select: '*, members:member_id(name, nickname, phone), pets:pet_id(name, size_class), kindergartens:kindergarten_id(name, address_road), payments(id, amount, status, paid_at)',
        filters: buildFilters(),
        search: buildSearch(),
        orderBy: 'created_at',
        ascending: false,
        page: currentPage,
        perPage: PER_PAGE
      });

      if (res.error) {
        console.error('[reservations] list query error:', res.error);
        api.showTableEmpty(listBody, 16, '데이터 로드 실패: ' + (res.error.message || JSON.stringify(res.error)));
        return;
      }

      var rows = res.data || [];
      var total = res.count || 0;

      if (resultCount) resultCount.textContent = api.formatNumber(total);

      if (rows.length === 0) {
        api.showTableEmpty(listBody, 16, '검색 결과가 없습니다.');
        if (pagination) pagination.innerHTML = '';
        return;
      }

      listBody.innerHTML = rows.map(function (r, i) {
        return renderRow(r, i, offset);
      }).join('');

      api.renderPagination(pagination, currentPage, total, PER_PAGE, function (p) {
        loadList(p);
      });
    } catch (err) {
      console.error('[reservations] list exception:', err);
      api.showTableEmpty(listBody, 16, '데이터를 불러오지 못했습니다.');
    }
  }

  function bindListEvents() {
    if (btnSearch) btnSearch.addEventListener('click', function () { loadList(1); });
    if (filterSearchInput) {
      filterSearchInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') loadList(1);
      });
    }
    if (btnExcel) {
      btnExcel.addEventListener('click', function () {
        api.fetchAll('reservations', {
          select: '*, members:member_id(name, phone), pets:pet_id(name, size_class), kindergartens:kindergarten_id(name)',
          filters: buildFilters(),
          search: buildSearch(),
          orderBy: 'created_at',
          ascending: false
        }).then(function (res) {
          var data = (res.data || []).map(function (r) {
            return {
              '예약번호': r.id || '',
              '신청일시': r.requested_at || r.created_at || '',
              '보호자': jv(r.members, 'name'),
              '연락처': jv(r.members, 'phone'),
              '반려동물': jv(r.pets, 'name'),
              '크기': jv(r.pets, 'size_class'),
              '유치원명': jv(r.kindergartens, 'name'),
              '등원일시': r.checkin_scheduled || '',
              '하원일시': r.checkout_scheduled || '',
              '산책': (r.walk_count || 0) + '회',
              '픽업': r.pickup_requested ? '이용' : '미이용',
              '상태': r.status || ''
            };
          });
          api.exportExcel(data, [
            { key: '예약번호', label: '예약번호' }, { key: '신청일시', label: '신청일시' },
            { key: '보호자', label: '보호자' }, { key: '연락처', label: '연락처' },
            { key: '반려동물', label: '반려동물' }, { key: '크기', label: '크기' },
            { key: '유치원명', label: '유치원명' }, { key: '등원일시', label: '등원일시' },
            { key: '하원일시', label: '하원일시' }, { key: '산책', label: '산책' },
            { key: '픽업', label: '픽업' }, { key: '상태', label: '상태' }
          ], '돌봄예약관리');
        });
      });
    }
  }

  function initList() {
    cacheListDom();
    // 날짜 필터 기본값을 동적으로 설정 (HTML 하드코딩 대신)
    if (filterDateTo && (!filterDateTo.value || filterDateTo.value < api.getToday())) {
      filterDateTo.value = api.getToday();
    }
    bindListEvents();
    loadList(1);
  }

  /* ══════════════════════════════════════════
     B. 상세 페이지 (reservation-detail.html)
     ══════════════════════════════════════════ */

  function isDetailPage() {
    return !!document.getElementById('detailResBasic');
  }

  function loadDetail() {
    var id = api.getParam('id');
    if (!id) return;

    api.fetchDetail('reservations', id, '*, members:member_id(name, nickname, phone, address_road), pets:pet_id(name, breed, gender, birth_date, weight, size_class, is_neutered, is_vaccinated), kindergartens:kindergarten_id(name, address_road, members:member_id(name, phone)), payments(id, amount, pg_transaction_id, paid_at, payment_method, card_company, status), refunds(id, refund_amount, penalty_amount, penalty_rate, status, requester, cancel_reason, requested_at), reservation_status_logs(created_at, prev_status, new_status, changed_by, note)').then(function (result) {
      var r = result.data;
      if (!r || result.error) return;

      var m = r.members || {};
      var pet = r.pets || {};
      var kg = r.kindergartens || {};
      var kgOwner = kg.members || {};
      var pay = Array.isArray(r.payments) ? r.payments[0] : (r.payments || {});
      var ref = Array.isArray(r.refunds) ? r.refunds[0] : (r.refunds || null);
      var logs = r.reservation_status_logs || [];

      // 영역 1: 예약 기본정보
      var basic = document.getElementById('detailResBasic');
      if (basic) {
        api.setHtml(basic, [
          ['예약 고유번호', r.id],
          ['신청일시', api.formatDate(r.requested_at || r.created_at)],
          ['현재 예약 상태', api.autoBadge(r.status)],
          ['등원 예정일시', api.formatDate(r.checkin_scheduled)],
          ['하원 예정일시', api.formatDate(r.checkout_scheduled)],
          ['실제 등원일시', api.formatDate(r.checkin_actual) || '—'],
          ['실제 하원일시', api.formatDate(r.checkout_actual) || '—'],
          ['산책 횟수', (r.walk_count || 0) + '회'],
          ['픽업/드랍 여부', (r.pickup_requested ? '<span class="badge badge--c-blue">이용</span>' : '<span class="badge badge--c-gray">미이용</span>')]
        ]);
      }

      // 영역 2: 보호자 정보
      var guardianEl = document.getElementById('detailResGuardian');
      if (guardianEl) {
        api.setHtml(guardianEl, [
          ['보호자 이름', api.escapeHtml(m.name || '')],
          ['보호자 닉네임', api.escapeHtml(m.nickname || '')],
          ['보호자 연락처', api.renderMaskedField(m.phone || '')],
          ['보호자 주소', api.escapeHtml(m.address_road || '')],
          ['보호자 회원번호', r.member_id ? api.renderDetailLink('member-detail.html', r.member_id) : '—']
        ]);
      }

      // 영역 3: 반려동물 정보
      var petEl = document.getElementById('detailResPet');
      if (petEl) {
        api.setHtml(petEl, [
          ['반려동물 이름', api.escapeHtml(pet.name || '')],
          ['견종', api.escapeHtml(pet.breed || '')],
          ['성별', api.autoBadge(pet.gender || '', { '수컷': 'blue', '암컷': 'pink' })],
          ['나이', pet.birth_date ? api.calcPetAge(pet.birth_date) : '—'],
          ['몸무게', (pet.weight || '—') + (pet.weight ? ' kg' : '')],
          ['크기 분류', api.autoBadge(pet.size_class || '', { '소형': 'green', '중형': 'orange', '대형': 'red' })],
          ['중성화 여부', api.autoBadge(pet.is_neutered ? '했어요' : '안했어요', { '했어요': 'green', '안했어요': 'gray' })],
          ['예방접종 여부', api.autoBadge(pet.is_vaccinated ? '했어요' : '안했어요', { '했어요': 'green', '안했어요': 'gray' })],
          ['반려동물 번호', r.pet_id ? api.renderDetailLink('pet-detail.html', r.pet_id) : '—']
        ]);
      }

      // 영역 4: 유치원 정보
      var kgEl = document.getElementById('detailResKg');
      if (kgEl) {
        api.setHtml(kgEl, [
          ['유치원명', api.escapeHtml(kg.name || '')],
          ['운영자 성명', api.escapeHtml(kgOwner.name || '')],
          ['운영자 연락처', api.renderMaskedField(kgOwner.phone || '')],
          ['위치', api.escapeHtml(kg.address_road || '')],
          ['유치원 번호', r.kindergarten_id ? api.renderDetailLink('kindergarten-detail.html', r.kindergarten_id) : '—']
        ]);
      }

      // 영역 5: 금액 상세
      var amountEl = document.getElementById('detailResAmount');
      if (amountEl) {
        var totalAmt = pay.amount || 0;
        amountEl.innerHTML =
          '<div class="stat-cards--4col">' +
          '<div class="stat-card stat-card--highlight"><div class="stat-card__label">총 결제금액</div><div class="stat-card__value">' + api.formatMoney(totalAmt) + '</div></div>' +
          '</div>';
      }

      // 영역 6: 결제 정보
      var payEl = document.getElementById('detailResPayment');
      if (payEl) {
        api.setHtml(payEl, [
          ['결제 고유번호', pay.id ? api.renderDetailLink('payment-detail.html', pay.id) : '—'],
          ['PG사 거래번호', api.escapeHtml(pay.pg_transaction_id || '')],
          ['결제일시', api.formatDate(pay.paid_at)],
          ['결제 수단', api.escapeHtml(pay.payment_method || '')],
          ['카드사', api.escapeHtml(pay.card_company || '')],
          ['결제 상태', api.autoBadge(pay.status || '', { '결제완료': 'green', '결제취소': 'red' })]
        ]);
      }

      // 영역 7: 환불 정보 (조건부)
      var refundEl = document.getElementById('detailResRefund');
      if (refundEl) {
        if (ref && ref.status) {
          refundEl.closest('.detail-card').style.display = '';
          api.setHtml(refundEl, [
            ['취소 요청자', api.autoBadge(ref.requester || '', { '보호자': 'brown', '유치원': 'pink', '관리자': 'red' })],
            ['취소 일시', api.formatDate(ref.requested_at)],
            ['위약금 비율', ref.penalty_rate ? '<span class="refund-penalty-rate--highlighted">' + ref.penalty_rate + '%</span>' : '—'],
            ['위약금 결제금액', api.formatMoney(ref.penalty_amount || 0)],
            ['기존 결제 취소(환불) 금액', api.formatMoney(ref.refund_amount || 0)],
            ['환불 처리 상태', api.autoBadge(ref.status || '', { '완료': 'green', '환불완료': 'green', '환불대기': 'orange', '환불실패': 'red' })],
            ['환불 상세', ref.id ? '<a href="refund-detail.html?id=' + ref.id + '" class="info-grid__value--link">결제관리 &gt; 환불·위약금 상세 &rarr;</a>' : '—']
          ]);
        } else {
          refundEl.closest('.detail-card').style.display = 'none';
        }
      }

      // 영역 8: 거절 정보 (조건부)
      var rejectEl = document.getElementById('detailResReject');
      if (rejectEl) {
        if (r.status === '유치원거절' && r.reject_reason) {
          rejectEl.closest('.detail-card').style.display = '';
          api.setHtml(rejectEl, [
            ['거절 일시', api.formatDate(r.rejected_at)],
            ['거절 사유', '<div class="reject-reason">' + api.escapeHtml(r.reject_reason || '') + '</div>']
          ]);
        } else {
          rejectEl.closest('.detail-card').style.display = 'none';
        }
      }

      // 영역 9: 하원 확인 정보 (조건부)
      var checkoutEl = document.getElementById('detailResCheckout');
      if (checkoutEl) {
        if (r.status === '돌봄완료' && (r.guardian_checkout_confirmed || r.kg_checkout_confirmed)) {
          checkoutEl.closest('.detail-card').style.display = '';
          api.setHtml(checkoutEl, [
            ['보호자 하원 확인', r.guardian_checkout_confirmed ? '<span class="badge badge--c-green">확인</span>' : '<span class="badge badge--c-orange">미확인</span>'],
            ['유치원 하원 확인', r.kg_checkout_confirmed ? '<span class="badge badge--c-green">확인</span>' : '<span class="badge badge--c-orange">미확인</span>']
          ]);
        } else {
          checkoutEl.closest('.detail-card').style.display = 'none';
        }
      }

      // 영역 10: 상태 변경 이력
      var logEl = document.getElementById('detailResLog');
      if (logEl && logs.length > 0) {
        logEl.innerHTML = '<thead><tr><th>변경일시</th><th>이전 상태</th><th>변경 후 상태</th><th>행위자</th><th>비고</th></tr></thead><tbody>' +
          logs.map(function (l) {
            return '<tr>' +
              '<td>' + api.formatDate(l.created_at) + '</td>' +
              '<td>' + (l.prev_status ? api.autoBadge(l.prev_status) : '—') + '</td>' +
              '<td>' + api.autoBadge(l.new_status) + '</td>' +
              '<td>' + api.escapeHtml(l.changed_by || '') + '</td>' +
              '<td>' + api.escapeHtml(l.note || '') + '</td>' +
              '</tr>';
          }).join('') +
          '</tbody>';
      }

    }).catch(function (err) {
      console.error('[reservations] detail load error:', err);
      alert('예약 상세 데이터를 불러오지 못했습니다. 콘솔을 확인하세요.');
    });
  }

  /* ── 상세 페이지 모달 바인딩 ── */

  function bindDetailModals() {
    // 상태 변경 모달
    var statusBtn = document.getElementById('statusBtn');
    if (statusBtn) {
      statusBtn.addEventListener('click', function () {
        var status = document.getElementById('statusSelect').value;
        var reason = document.getElementById('statusReason').value;
        if (!status || !reason) return;

        var id = api.getParam('id');
        api.updateRecord('reservations', id, { status: status }).then(function () {
          api.insertAuditLog('상태변경', 'reservations', id, { status: status, reason: reason });
          location.reload();
        });
      });
    }

    // 강제 취소/환불 모달
    var cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        var reason = document.getElementById('cancelReason').value;
        if (!reason) return;

        var id = api.getParam('id');
        api.updateRecord('reservations', id, { status: '관리자취소' }).then(function () {
          api.insertAuditLog('관리자강제취소', 'reservations', id, { reason: reason });
          location.reload();
        });
      });
    }

    // 노쇼 처리 모달
    var noshowBtn = document.getElementById('noshowBtn');
    if (noshowBtn) {
      noshowBtn.addEventListener('click', function () {
        var reason = document.getElementById('noshowReason').value;
        if (!reason) return;

        var id = api.getParam('id');
        api.updateRecord('reservations', id, { status: '노쇼' }).then(function () {
          api.insertAuditLog('노쇼처리', 'reservations', id, { reason: reason });
          location.reload();
        });
      });
    }
  }

  function initDetail() {
    loadDetail();
    bindDetailModals();
    api.hideIfReadOnly(PERM_KEY);
  }

  /* ══════════════════════════════════════════
     C. 초기화
     ══════════════════════════════════════════ */

  document.addEventListener('DOMContentLoaded', function () {
    if (isListPage()) initList();
    else if (isDetailPage()) initDetail();
  });

})();
