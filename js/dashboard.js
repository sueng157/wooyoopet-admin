/**
 * 우유펫 관리자 대시보드 — 대시보드 페이지 (index.html)
 *
 * 4개 섹션:
 *  1. 오늘의 현황 (6개 카드) → get_dashboard_today_stats RPC
 *  2. 관리자 승인 대기 (7개 항목) → get_dashboard_pending_counts RPC
 *  3. 이달 매출 요약 (7개 항목) → get_dashboard_monthly_sales RPC
 *  4. 최근 활동 로그 (5건) → get_dashboard_recent_activity RPC
 *
 * 로드 순서: supabase-js → supabase-client.js → auth.js → common.js → components.js → api.js → dashboard.js
 */
(function () {
  'use strict';

  var api = window.__api;
  if (!api) {
    console.error('[dashboard] api.js 미로드');
    return;
  }

  // ──────────────────────────────────────────
  // 초기화
  // ──────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    // auth.js 초기화 완료 후 실행
    setTimeout(initDashboard, 300);
  });

  async function initDashboard() {
    // 날짜 표시
    updateDateDisplay();

    // 4개 섹션 병렬 로드
    await Promise.all([
      loadTodayStats(),
      loadPendingCounts(),
      loadMonthlySales(),
      loadRecentActivity()
    ]);
  }

  // ──────────────────────────────────────────
  // 날짜 표시
  // ──────────────────────────────────────────
  function updateDateDisplay() {
    var el = document.getElementById('dashboardDate');
    if (el) {
      var today = new Date();
      var dateStr = api.formatDate(today, true);
      var dayName = api.getDayName(today);
      el.textContent = dateStr + ' (' + dayName + ')';
    }
  }

  // ──────────────────────────────────────────
  // 1. 오늘의 현황
  // ──────────────────────────────────────────
  async function loadTodayStats() {
    var ids = [
      'statNewMembers', 'statNewReservations', 'statCheckinExpected',
      'statInProgress', 'statTodayPayments', 'statTodayCancelRefund'
    ];

    // 로딩 표시
    ids.forEach(function (id) { api.showLoading(document.getElementById(id)); });

    var result = await api.callRpc('get_dashboard_today_stats');
    if (result.error) {
      console.error('[dashboard] 오늘 현황 로드 실패:', result.error);
      ids.forEach(function (id) { api.setTextById(id, '-'); });
      return;
    }

    var d = result.data;
    api.setTextById('statNewMembers', api.formatNumber(d.new_members));
    api.setTextById('statNewReservations', api.formatNumber(d.new_reservations));
    api.setTextById('statCheckinExpected', api.formatNumber(d.checkin_expected));
    api.setTextById('statInProgress', api.formatNumber(d.in_progress));
    api.setTextById('statTodayPayments', api.formatNumber(d.today_payments));
    api.setTextById('statTodayCancelRefund', api.formatNumber(d.today_cancel_refund));
  }

  // ──────────────────────────────────────────
  // 2. 관리자 승인 대기
  // ──────────────────────────────────────────
  async function loadPendingCounts() {
    var map = {
      'pendingAddress': 'address_pending',
      'pendingSettlementNew': 'settlement_new',
      'pendingSettlementFail': 'settlement_fail',
      'pendingRefund': 'refund_pending',
      'pendingReport': 'report_pending',
      'pendingSettlementHold': 'settlement_hold',
      'pendingFeedback': 'feedback_unconfirmed'
    };

    var ids = Object.keys(map);
    ids.forEach(function (id) { api.showLoading(document.getElementById(id)); });

    var result = await api.callRpc('get_dashboard_pending_counts');
    if (result.error) {
      console.error('[dashboard] 승인 대기 로드 실패:', result.error);
      ids.forEach(function (id) { api.setTextById(id, '-'); });
      return;
    }

    var d = result.data;
    ids.forEach(function (id) {
      var key = map[id];
      var count = d[key] || 0;
      var el = document.getElementById(id);
      if (el) {
        el.textContent = count;
        // 0이면 비활성(회색), >0이면 활성(빨강)
        if (count > 0) {
          el.classList.add('approval-item__count--active');
          el.classList.remove('approval-item__count--zero');
        } else {
          el.classList.remove('approval-item__count--active');
          el.classList.add('approval-item__count--zero');
        }
      }
    });
  }

  // ──────────────────────────────────────────
  // 3. 이달 매출 요약
  // ──────────────────────────────────────────
  async function loadMonthlySales() {
    var ids = [
      'salesCarePayment', 'salesPenaltyPayment', 'salesTotalValid',
      'salesPlatformFee', 'salesKgSettlement', 'salesCancelRefund', 'salesChangeRate'
    ];
    ids.forEach(function (id) { api.showLoading(document.getElementById(id)); });

    var result = await api.callRpc('get_dashboard_monthly_sales');
    if (result.error) {
      console.error('[dashboard] 매출 요약 로드 실패:', result.error);
      ids.forEach(function (id) { api.setTextById(id, '-'); });
      return;
    }

    var d = result.data;
    api.setTextById('salesCarePayment', api.formatMoney(d.care_payment));
    api.setTextById('salesPenaltyPayment', api.formatMoney(d.penalty_payment));
    api.setTextById('salesTotalValid', api.formatMoney(d.total_valid));
    api.setTextById('salesPlatformFee', api.formatMoney(d.platform_fee));
    api.setTextById('salesKgSettlement', api.formatMoney(d.kg_settlement));
    api.setTextById('salesCancelRefund', api.formatMoney(d.cancel_refund));

    // 전월 대비 증감
    var changeEl = document.getElementById('salesChangeRate');
    if (changeEl) {
      if (d.change_rate !== null && d.change_rate !== undefined) {
        var isUp = d.change_rate >= 0;
        var arrow = isUp ? '▲' : '▼';
        var cls = isUp ? 'pill--up' : 'pill--down';
        changeEl.innerHTML = '<span class="pill ' + cls + '">' + arrow + ' ' + Math.abs(d.change_rate) + '%</span>';
      } else {
        changeEl.textContent = '데이터 없음';
      }
    }
  }

  // ──────────────────────────────────────────
  // 4. 최근 활동 로그
  // ──────────────────────────────────────────
  var EVENT_TYPE_BADGE = {
    '신규가입': 'blue',
    '예약접수': 'blue',
    '결제완료': 'green',
    '취소요청': 'orange',
    '신고접수': 'red'
  };

  async function loadRecentActivity() {
    var tbody = document.getElementById('activityLogBody');
    if (!tbody) return;

    api.showTableLoading(tbody, 4);

    var result = await api.callRpc('get_dashboard_recent_activity');
    if (result.error) {
      console.error('[dashboard] 활동 로그 로드 실패:', result.error);
      api.showTableEmpty(tbody, 4, '활동 로그를 불러올 수 없습니다.');
      return;
    }

    var logs = result.data;
    if (!logs || logs.length === 0) {
      api.showTableEmpty(tbody, 4, '최근 활동 로그가 없습니다.');
      return;
    }

    var html = '';
    logs.forEach(function (log) {
      var badgeColor = EVENT_TYPE_BADGE[log.event_type] || 'gray';
      var link = log.link_page && log.link_id
        ? '<a href="' + log.link_page + '?id=' + api.escapeHtml(log.link_id) + '" class="log-table__link">바로가기</a>'
        : '-';

      html += '<tr>' +
        '<td class="log-table__time">' + api.formatDate(log.event_at) + '</td>' +
        '<td>' + api.renderBadge(log.event_type, badgeColor) + '</td>' +
        '<td>' + api.escapeHtml(log.summary) + '</td>' +
        '<td>' + link + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;
  }

  // ──────────────────────────────────────────
  // 5. 카드 클릭 → 필터 네비게이션
  // ──────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    // 오늘 현황 카드 클릭 이벤트
    bindCardClick('cardNewMembers', 'members.html', { date_from: api.getToday(), date_to: api.getToday() });
    bindCardClick('cardNewReservations', 'reservations.html', { date_from: api.getToday(), date_to: api.getToday() });
    bindCardClick('cardCheckinExpected', 'reservations.html', { status: '예약확정', date_from: api.getToday(), date_to: api.getToday() });
    bindCardClick('cardInProgress', 'reservations.html', { status: '돌봄진행중' });
    bindCardClick('cardTodayPayments', 'payments.html', { date_from: api.getToday(), date_to: api.getToday() });
    bindCardClick('cardTodayCancelRefund', 'payments.html', { tab: 'refund', date_from: api.getToday(), date_to: api.getToday() });

    // 승인 대기 항목 클릭 이벤트
    bindCardClick('linkPendingAddress', 'members.html', { address_auth: '심사중' });
    bindCardClick('linkPendingSettlementNew', 'settlements.html', { tab: 'info' });
    bindCardClick('linkPendingSettlementFail', 'settlements.html', { tab: 'info', status: '실패' });
    bindCardClick('linkPendingRefund', 'payments.html', { tab: 'refund', status: '환불대기' });
    bindCardClick('linkPendingReport', 'chats.html', { tab: 'report' });
    bindCardClick('linkPendingSettlementHold', 'settlements.html', { status: '정산보류' });
    bindCardClick('linkPendingFeedback', 'settings.html', { tab: 'feedback' });
  });

  function bindCardClick(elementId, page, params) {
    var el = document.getElementById(elementId);
    if (!el) return;
    el.style.cursor = 'pointer';
    el.addEventListener('click', function () {
      window.location.href = api.buildUrl(page, params);
    });
  }

})();
