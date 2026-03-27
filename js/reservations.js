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
    if (!filterSearchInput || !filterSearchInput.value.trim()) return null;
    var fieldMap = {
      '보호자 이름': 'guardian_name',
      '반려동물 이름': 'pet_name',
      '유치원명': 'kindergarten_name',
      '예약번호': 'reservation_number'
    };
    var col = fieldMap[filterSearchField ? filterSearchField.value : '보호자 이름'] || 'guardian_name';
    return { column: col, value: filterSearchInput.value.trim() };
  }

  function renderRow(r, idx, offset) {
    var no = offset + idx + 1;
    var sizeBadge = api.autoBadge(r.size_category || '소형', {
      '소형': 'green', '중형': 'orange', '대형': 'red'
    });
    var pickupBadge = (r.pickup_drop === true || r.pickup_drop === '이용')
      ? '<span class="badge badge--c-blue">이용</span>'
      : '<span class="badge badge--c-gray">미이용</span>';
    var statusBadge = api.autoBadge(r.status || '', {
      '수락대기': 'orange', '예약확정': 'blue', '돌봄진행중': 'blue',
      '돌봄완료': 'green', '보호자취소': 'gray', '유치원취소': 'gray',
      '유치원거절': 'red', '노쇼': 'red'
    });

    return '<tr>' +
      '<td>' + no + '</td>' +
      '<td>' + api.formatDate(r.created_at) + '</td>' +
      '<td>' + api.escapeHtml(r.guardian_name || '') + '</td>' +
      '<td class="masked">' + api.maskPhone(r.guardian_phone || '') + '</td>' +
      '<td>' + api.escapeHtml(r.pet_name || '') + '</td>' +
      '<td>' + sizeBadge + '</td>' +
      '<td>' + api.escapeHtml(r.kindergarten_name || '') + '</td>' +
      '<td>' + api.escapeHtml(r.location || '') + '</td>' +
      '<td>' + api.formatDate(r.checkin_datetime) + '</td>' +
      '<td>' + api.formatDate(r.checkout_datetime) + '</td>' +
      '<td>' + (r.walk_count || 0) + '회</td>' +
      '<td>' + pickupBadge + '</td>' +
      '<td class="text-right">' + api.formatMoney(r.payment_amount) + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + (r.payment_number ? '<a href="payment-detail.html?id=' + r.payment_number + '" class="data-table__link">' + api.escapeHtml(r.payment_number) + '</a>' : '—') + '</td>' +
      '<td><a href="reservation-detail.html?id=' + (r.id || r.reservation_number || '') + '" class="data-table__link">상세</a></td>' +
      '</tr>';
  }

  function loadList(page) {
    currentPage = page || 1;
    var offset = (currentPage - 1) * PER_PAGE;

    api.showTableLoading(listBody, 16);

    api.fetchList('reservations', {
      filters: buildFilters(),
      search: buildSearch(),
      order: { column: 'created_at', ascending: false },
      page: currentPage,
      perPage: PER_PAGE
    }).then(function (res) {
      var rows = res.data || [];
      var total = res.count || 0;

      resultCount.textContent = api.formatNumber(total);

      if (rows.length === 0) {
        api.showTableEmpty(listBody, 16, '검색 결과가 없습니다.');
        pagination.innerHTML = '';
        return;
      }

      listBody.innerHTML = rows.map(function (r, i) {
        return renderRow(r, i, offset);
      }).join('');

      api.renderPagination(pagination, currentPage, Math.ceil(total / PER_PAGE), function (p) {
        loadList(p);
      });
    }).catch(function () {
      api.showTableEmpty(listBody, 16, '데이터를 불러오지 못했습니다.');
    });
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
          filters: buildFilters(),
          search: buildSearch(),
          order: { column: 'created_at', ascending: false }
        }).then(function (rows) {
          var data = rows.map(function (r) {
            return {
              '예약번호': r.reservation_number || '',
              '신청일시': r.created_at || '',
              '보호자': r.guardian_name || '',
              '연락처': r.guardian_phone || '',
              '반려동물': r.pet_name || '',
              '크기': r.size_category || '',
              '유치원명': r.kindergarten_name || '',
              '등원일시': r.checkin_datetime || '',
              '하원일시': r.checkout_datetime || '',
              '산책': (r.walk_count || 0) + '회',
              '픽업': r.pickup_drop ? '이용' : '미이용',
              '결제금액': r.payment_amount || 0,
              '상태': r.status || ''
            };
          });
          api.exportExcel(data, '돌봄예약관리');
        });
      });
    }
  }

  function initList() {
    cacheListDom();
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

    api.showLoading(true);

    api.fetchDetail('reservations', id).then(function (r) {
      if (!r) { api.showLoading(false); return; }

      // 영역 1: 예약 기본정보
      var basic = document.getElementById('detailResBasic');
      if (basic) {
        api.setHtml(basic, [
          ['예약 고유번호', r.reservation_number || r.id],
          ['신청일시', api.formatDate(r.created_at)],
          ['현재 예약 상태', api.autoBadge(r.status)],
          ['등원 예정일시', api.formatDate(r.checkin_datetime)],
          ['하원 예정일시', api.formatDate(r.checkout_datetime)],
          ['실제 등원일시', api.formatDate(r.actual_checkin) || '—'],
          ['실제 하원일시', api.formatDate(r.actual_checkout) || '—'],
          ['산책 횟수', (r.walk_count || 0) + '회'],
          ['픽업/드랍 여부', (r.pickup_drop ? '<span class="badge badge--c-blue">이용</span>' : '<span class="badge badge--c-gray">미이용</span>')]
        ]);
      }

      // 영역 2: 보호자 정보
      var guardian = document.getElementById('detailResGuardian');
      if (guardian) {
        api.setHtml(guardian, [
          ['보호자 이름', api.escapeHtml(r.guardian_name || '')],
          ['보호자 닉네임', api.escapeHtml(r.guardian_nickname || '')],
          ['보호자 연락처', api.renderMaskedField(r.guardian_phone)],
          ['보호자 주소', api.escapeHtml(r.guardian_address || '')],
          ['보호자 회원번호', r.guardian_id ? api.renderDetailLink('member-detail.html', r.guardian_id) : '—']
        ]);
      }

      // 영역 3: 반려동물 정보
      var pet = document.getElementById('detailResPet');
      if (pet) {
        api.setHtml(pet, [
          ['반려동물 이름', api.escapeHtml(r.pet_name || '')],
          ['견종', api.escapeHtml(r.breed || '')],
          ['성별', api.autoBadge(r.pet_gender || '', { '수컷': 'blue', '암컷': 'pink' })],
          ['나이', (r.pet_age || '—') + (r.pet_age ? '세' : '')],
          ['몸무게', (r.pet_weight || '—') + (r.pet_weight ? ' kg' : '')],
          ['크기 분류', api.autoBadge(r.size_category || '', { '소형': 'green', '중형': 'orange', '대형': 'red' })],
          ['중성화 여부', api.autoBadge(r.neutered ? '했어요' : '안했어요', { '했어요': 'green', '안했어요': 'gray' })],
          ['예방접종 여부', api.autoBadge(r.vaccinated ? '했어요' : '안했어요', { '했어요': 'green', '안했어요': 'gray' })],
          ['반려동물 번호', r.pet_id ? api.renderDetailLink('pet-detail.html', r.pet_id) : '—']
        ]);
      }

      // 영역 4: 유치원 정보
      var kg = document.getElementById('detailResKg');
      if (kg) {
        api.setHtml(kg, [
          ['유치원명', api.escapeHtml(r.kindergarten_name || '')],
          ['운영자 성명', api.escapeHtml(r.operator_name || '')],
          ['운영자 연락처', api.renderMaskedField(r.operator_phone)],
          ['위치', api.escapeHtml(r.location || '')],
          ['유치원 번호', r.kindergarten_id ? api.renderDetailLink('kindergarten-detail.html', r.kindergarten_id) : '—']
        ]);
      }

      // 영역 5: 금액 상세
      var amount = document.getElementById('detailResAmount');
      if (amount) {
        amount.innerHTML =
          '<div class="stat-cards--4col">' +
          '<div class="stat-card"><div class="stat-card__label">돌봄비</div><div class="stat-card__value">' + api.formatMoney(r.care_fee || 0) + '</div></div>' +
          '<div class="stat-card"><div class="stat-card__label">산책비 (' + (r.walk_count || 0) + '회)</div><div class="stat-card__value">' + api.formatMoney(r.walk_fee || 0) + '</div></div>' +
          '<div class="stat-card"><div class="stat-card__label">픽업/드랍비</div><div class="stat-card__value">' + api.formatMoney(r.pickup_fee || 0) + '</div></div>' +
          '<div class="stat-card stat-card--highlight"><div class="stat-card__label">총 결제금액</div><div class="stat-card__value">' + api.formatMoney(r.payment_amount || 0) + '</div></div>' +
          '</div>';
      }

      // 영역 6: 결제 정보
      var pay = document.getElementById('detailResPayment');
      if (pay) {
        api.setHtml(pay, [
          ['결제 고유번호', r.payment_number ? api.renderDetailLink('payment-detail.html', r.payment_number) : '—'],
          ['PG사 거래번호', api.escapeHtml(r.pg_transaction_id || '')],
          ['결제일시', api.formatDate(r.payment_datetime)],
          ['결제 수단', api.escapeHtml(r.payment_method || '')],
          ['카드사', api.escapeHtml(r.card_company || '')],
          ['결제 상태', api.autoBadge(r.payment_status || '', { '결제완료': 'green', '결제취소': 'red' })]
        ]);
      }

      // 영역 7: 환불 정보 (조건부)
      var refund = document.getElementById('detailResRefund');
      if (refund) {
        if (r.refund_status) {
          refund.closest('.detail-card').style.display = '';
          api.setHtml(refund, [
            ['취소 요청자', api.autoBadge(r.cancel_requester || '', { '보호자': 'brown', '유치원': 'pink', '관리자': 'red' })],
            ['취소 일시', api.formatDate(r.cancel_datetime)],
            ['위약금 비율', r.penalty_rate ? '<span class="refund-penalty-rate--highlighted">' + r.penalty_rate + '%</span>' : '—'],
            ['위약금 결제금액', api.formatMoney(r.penalty_amount || 0)],
            ['기존 결제 취소(환불) 금액', api.formatMoney(r.refund_amount || 0)],
            ['환불 처리 상태', api.autoBadge(r.refund_status || '', { '완료': 'green', '환불완료': 'green', '환불대기': 'orange', '환불실패': 'red' })],
            ['환불 상세', r.refund_id ? '<a href="refund-detail.html?id=' + r.refund_id + '" class="info-grid__value--link">결제관리 &gt; 환불·위약금 상세 &rarr;</a>' : '—']
          ]);
        } else {
          refund.closest('.detail-card').style.display = 'none';
        }
      }

      // 영역 8: 거절 정보 (조건부)
      var reject = document.getElementById('detailResReject');
      if (reject) {
        if (r.status === '유치원거절' && r.reject_reason) {
          reject.closest('.detail-card').style.display = '';
          api.setHtml(reject, [
            ['거절 일시', api.formatDate(r.reject_datetime)],
            ['거절 사유', '<div class="reject-reason">' + api.escapeHtml(r.reject_reason || '') + '</div>']
          ]);
        } else {
          reject.closest('.detail-card').style.display = 'none';
        }
      }

      // 영역 9: 하원 확인 정보 (조건부)
      var checkout = document.getElementById('detailResCheckout');
      if (checkout) {
        if (r.status === '돌봄완료' && r.checkout_confirmed) {
          checkout.closest('.detail-card').style.display = '';
          api.setHtml(checkout, [
            ['하원 확인 상태', api.autoBadge(r.checkout_confirm_status || '확인완료', { '확인완료': 'green', '미확인': 'orange' })],
            ['확인자', api.escapeHtml(r.checkout_confirmer || '')],
            ['확인 일시', api.formatDate(r.checkout_confirm_datetime)]
          ]);
        } else {
          checkout.closest('.detail-card').style.display = 'none';
        }
      }

      // 영역 10: 상태 변경 이력
      var log = document.getElementById('detailResLog');
      if (log && r.status_logs && r.status_logs.length > 0) {
        log.innerHTML = '<thead><tr><th>변경일시</th><th>이전 상태</th><th>변경 후 상태</th><th>행위자</th><th>비고</th></tr></thead><tbody>' +
          r.status_logs.map(function (l) {
            return '<tr>' +
              '<td>' + api.formatDate(l.changed_at) + '</td>' +
              '<td>' + (l.prev_status ? api.autoBadge(l.prev_status) : '—') + '</td>' +
              '<td>' + api.autoBadge(l.new_status) + '</td>' +
              '<td>' + api.autoBadge(l.actor || '', { '시스템': 'gray', '보호자': 'brown', '유치원': 'pink', '관리자': 'red' }) + '</td>' +
              '<td>' + api.escapeHtml(l.note || '') + '</td>' +
              '</tr>';
          }).join('') +
          '</tbody>';
      }

      api.showLoading(false);
    }).catch(function () {
      api.showLoading(false);
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
          api.insertAuditLog('reservations', id, '상태변경: ' + status, reason);
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
          api.insertAuditLog('reservations', id, '관리자 강제취소/환불', reason);
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
          api.insertAuditLog('reservations', id, '노쇼 처리', reason);
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
