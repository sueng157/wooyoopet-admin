/**
 * 우유펫 관리자 대시보드 — 채팅관리 (chats.js)
 *
 * 채팅내역 탭 + 신고접수 탭 목록 (chats.html)
 * 채팅내역 상세 (chat-detail.html)
 * 신고접수 상세 (report-detail.html)
 * 의존: api.js, auth.js, common.js
 */
(function () {
  'use strict';

  var api = window.__api;
  var auth = window.__auth;
  if (!api || !auth) return;

  var PERM_KEY = 'perm_chats';
  var PER_PAGE = 20;

  /* ══════════════════════════════════════════
     A. 목록 페이지 (chats.html)
     ══════════════════════════════════════════ */

  function isListPage() {
    return !!document.getElementById('chatListBody');
  }

  /* ── A-1: 채팅내역 탭 ── */
  var chatDateFrom, chatDateTo, chatStatus, chatReported, chatSearchInput;
  var chatBtnSearch, chatBtnExcel, chatResultCount, chatListBody, chatPagination;
  var chatPage = 1;

  function cacheChatDom() {
    var tab = document.getElementById('tab-chat-history');
    if (!tab) return;
    var dates = tab.querySelectorAll('.filter-input--date');
    chatDateFrom = dates[0];
    chatDateTo   = dates[1];

    var selects = tab.querySelectorAll('.filter-select');
    chatStatus   = selects[0]; // 채팅방 상태
    chatReported = selects[1]; // 신고 여부

    chatSearchInput = tab.querySelector('.filter-input--search');
    chatBtnSearch   = tab.querySelector('.btn-search');
    chatBtnExcel    = tab.querySelector('.btn-excel');

    chatResultCount = tab.querySelector('.result-header__count strong');
    chatListBody    = document.getElementById('chatListBody');
    chatPagination  = tab.querySelector('.pagination');
  }

  function buildChatFilters() {
    var f = [];
    if (chatDateFrom && chatDateFrom.value) f.push({ column: 'created_at', op: 'gte', value: chatDateFrom.value + 'T00:00:00' });
    if (chatDateTo && chatDateTo.value) f.push({ column: 'created_at', op: 'lte', value: chatDateTo.value + 'T23:59:59' });
    if (chatStatus && chatStatus.value !== '전체') f.push({ column: 'status', op: 'eq', value: chatStatus.value });
    if (chatReported && chatReported.value === '신고있음') f.push({ column: 'has_report', op: 'eq', value: true });
    if (chatReported && chatReported.value === '신고없음') f.push({ column: 'has_report', op: 'eq', value: false });
    return f;
  }

  function buildChatSearch() {
    if (!chatSearchInput || !chatSearchInput.value.trim()) return null;
    return { column: 'guardian_nickname,kindergarten_name', value: chatSearchInput.value.trim() };
  }

  function renderChatRow(r, idx, offset) {
    var no = offset + idx + 1;
    var reportTag = r.has_report
      ? '<span class="report-yes">있음</span>'
      : '<span class="report-no">없음</span>';
    var statusBadge = api.autoBadge(r.status || '', { '활성': 'green', '비활성': 'gray' });

    return '<tr>' +
      '<td>' + no + '</td>' +
      '<td>' + api.escapeHtml(r.chat_room_number || '') + '</td>' +
      '<td>' + api.escapeHtml(r.guardian_nickname || '') + '</td>' +
      '<td>' + api.escapeHtml(r.kindergarten_name || '') + '</td>' +
      '<td><span class="message-preview">' + api.escapeHtml(r.last_message || '') + '</span></td>' +
      '<td>' + api.formatDate(r.last_message_at) + '</td>' +
      '<td>' + (r.message_count || 0) + '</td>' +
      '<td>' + (r.reservation_number ? '<a href="reservation-detail.html?id=' + r.reservation_number + '" class="data-table__link">' + api.escapeHtml(r.reservation_number) + '</a>' : '—') + '</td>' +
      '<td>' + reportTag + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + api.formatDate(r.created_at, 'date') + '</td>' +
      '<td><a href="chat-detail.html?id=' + (r.id || r.chat_room_number || '') + '" class="data-table__link">상세</a></td>' +
      '</tr>';
  }

  function loadChatList(page) {
    chatPage = page || 1;
    var offset = (chatPage - 1) * PER_PAGE;
    api.showTableLoading(chatListBody, 12);

    api.fetchList('chat_rooms', {
      filters: buildChatFilters(),
      search: buildChatSearch(),
      order: { column: 'last_message_at', ascending: false },
      page: chatPage, perPage: PER_PAGE
    }).then(function (res) {
      var rows = res.data || [], total = res.count || 0;
      chatResultCount.textContent = api.formatNumber(total);
      if (!rows.length) { api.showTableEmpty(chatListBody, 12, '검색 결과가 없습니다.'); chatPagination.innerHTML = ''; return; }
      chatListBody.innerHTML = rows.map(function (r, i) { return renderChatRow(r, i, offset); }).join('');
      api.renderPagination(chatPagination, chatPage, Math.ceil(total / PER_PAGE), loadChatList);
    }).catch(function () { api.showTableEmpty(chatListBody, 12, '데이터를 불러오지 못했습니다.'); });
  }

  function bindChatEvents() {
    if (chatBtnSearch) chatBtnSearch.addEventListener('click', function () { loadChatList(1); });
    if (chatSearchInput) chatSearchInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') loadChatList(1); });
    if (chatBtnExcel) chatBtnExcel.addEventListener('click', function () {
      api.fetchAll('chat_rooms', { filters: buildChatFilters(), search: buildChatSearch(), order: { column: 'last_message_at', ascending: false } }).then(function (rows) {
        api.exportExcel(rows.map(function (r) {
          return { '채팅방번호': r.chat_room_number || '', '보호자': r.guardian_nickname || '', '유치원명': r.kindergarten_name || '', '마지막메시지': r.last_message || '', '메시지수': r.message_count || 0, '신고여부': r.has_report ? '있음' : '없음', '상태': r.status || '', '생성일': r.created_at || '' };
        }), '채팅내역');
      });
    });
  }

  /* ── A-2: 신고접수 탭 ── */
  var rptDateFrom, rptDateTo, rptStatus, rptReporter, rptSearchInput;
  var rptBtnSearch, rptBtnExcel, rptResultCount, rptListBody, rptPagination;
  var rptPage = 1;

  function cacheRptDom() {
    var tab = document.getElementById('tab-reports');
    if (!tab) return;
    var dates = tab.querySelectorAll('.filter-input--date');
    rptDateFrom = dates[0];
    rptDateTo   = dates[1];

    var selects = tab.querySelectorAll('.filter-select');
    rptStatus   = selects[0]; // 처리상태
    rptReporter = selects[1]; // 신고자 유형

    rptSearchInput = tab.querySelector('.filter-input--search');
    rptBtnSearch   = tab.querySelector('.btn-search');
    rptBtnExcel    = tab.querySelector('.btn-excel');

    rptResultCount = tab.querySelector('.result-header__count strong');
    rptListBody    = document.getElementById('rptListBody');
    rptPagination  = tab.querySelector('.pagination');
  }

  function buildRptFilters() {
    var f = [];
    if (rptDateFrom && rptDateFrom.value) f.push({ column: 'reported_at', op: 'gte', value: rptDateFrom.value + 'T00:00:00' });
    if (rptDateTo && rptDateTo.value) f.push({ column: 'reported_at', op: 'lte', value: rptDateTo.value + 'T23:59:59' });
    if (rptStatus && rptStatus.value !== '전체') f.push({ column: 'report_status', op: 'eq', value: rptStatus.value });
    if (rptReporter && rptReporter.value !== '전체') f.push({ column: 'reporter_type', op: 'eq', value: rptReporter.value });
    return f;
  }

  function buildRptSearch() {
    if (!rptSearchInput || !rptSearchInput.value.trim()) return null;
    return { column: 'reporter_nickname,reported_nickname', value: rptSearchInput.value.trim() };
  }

  function renderRptRow(r, idx, offset) {
    var no = offset + idx + 1;
    var reporterBadge = api.autoBadge(r.reporter_type || '', { '보호자': 'brown', '유치원': 'pink' });
    var reportedBadge = api.autoBadge(r.reported_type || '', { '보호자': 'brown', '유치원': 'pink' });
    var statusBadge = api.autoBadge(r.report_status || '', { '접수': 'orange', '처리중': 'blue', '처리완료': 'green', '기각': 'gray' });

    return '<tr>' +
      '<td>' + no + '</td>' +
      '<td>' + api.formatDate(r.reported_at) + '</td>' +
      '<td>' + api.escapeHtml(r.reporter_nickname || '') + '</td>' +
      '<td>' + reporterBadge + '</td>' +
      '<td>' + api.escapeHtml(r.reported_nickname || '') + '</td>' +
      '<td>' + reportedBadge + '</td>' +
      '<td>' + api.escapeHtml(r.report_reason || '') + '</td>' +
      '<td>' + (r.chat_room_number ? '<a href="chat-detail.html?id=' + r.chat_room_id + '" class="data-table__link">' + api.escapeHtml(r.chat_room_number) + '</a>' : '—') + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + (api.formatDate(r.processed_at) || '—') + '</td>' +
      '<td><a href="report-detail.html?id=' + (r.id || r.report_number || '') + '" class="data-table__link">상세</a></td>' +
      '</tr>';
  }

  function loadRptList(page) {
    rptPage = page || 1;
    var offset = (rptPage - 1) * PER_PAGE;
    api.showTableLoading(rptListBody, 11);

    api.fetchList('reports', {
      filters: buildRptFilters(),
      search: buildRptSearch(),
      order: { column: 'reported_at', ascending: false },
      page: rptPage, perPage: PER_PAGE
    }).then(function (res) {
      var rows = res.data || [], total = res.count || 0;
      rptResultCount.textContent = api.formatNumber(total);
      if (!rows.length) { api.showTableEmpty(rptListBody, 11, '검색 결과가 없습니다.'); rptPagination.innerHTML = ''; return; }
      rptListBody.innerHTML = rows.map(function (r, i) { return renderRptRow(r, i, offset); }).join('');
      api.renderPagination(rptPagination, rptPage, Math.ceil(total / PER_PAGE), loadRptList);
    }).catch(function () { api.showTableEmpty(rptListBody, 11, '데이터를 불러오지 못했습니다.'); });
  }

  function bindRptEvents() {
    if (rptBtnSearch) rptBtnSearch.addEventListener('click', function () { loadRptList(1); });
    if (rptSearchInput) rptSearchInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') loadRptList(1); });
    if (rptBtnExcel) rptBtnExcel.addEventListener('click', function () {
      api.fetchAll('reports', { filters: buildRptFilters(), search: buildRptSearch(), order: { column: 'reported_at', ascending: false } }).then(function (rows) {
        api.exportExcel(rows.map(function (r) {
          return { '신고번호': r.report_number || '', '신고일시': r.reported_at || '', '신고자': r.reporter_nickname || '', '신고자유형': r.reporter_type || '', '피신고자': r.reported_nickname || '', '사유': r.report_reason || '', '채팅방': r.chat_room_number || '', '상태': r.report_status || '' };
        }), '신고접수');
      });
    });
  }

  function initList() {
    cacheChatDom();
    cacheRptDom();
    bindChatEvents();
    bindRptEvents();
    loadChatList(1);
    loadRptList(1);
  }

  /* ══════════════════════════════════════════
     B. 채팅내역 상세 (chat-detail.html)
     ══════════════════════════════════════════ */

  function isChatDetail() {
    return !!document.getElementById('detailChatBasic');
  }

  function loadChatDetail() {
    var id = api.getParam('id');
    if (!id) return;
    api.showLoading(true);

    api.fetchDetail('chat_rooms', id).then(function (r) {
      if (!r) { api.showLoading(false); return; }

      // 영역 1: 채팅방 기본정보
      var basic = document.getElementById('detailChatBasic');
      if (basic) {
        api.setHtml(basic, [
          ['채팅방 고유번호', r.chat_room_number || r.id],
          ['생성일', api.formatDate(r.created_at, 'date')],
          ['채팅방 상태', api.autoBadge(r.status || '', { '활성': 'green', '비활성': 'gray' })],
          ['총 메시지 수', (r.message_count || 0) + '건']
        ]);
      }

      // 영역 2: 참여자 정보 — 보호자
      var guardian = document.getElementById('detailChatGuardian');
      if (guardian) {
        api.setHtml(guardian, [
          ['보호자 이름', api.escapeHtml(r.guardian_name || '')],
          ['보호자 닉네임', api.escapeHtml(r.guardian_nickname || '')],
          ['보호자 연락처', api.renderMaskedField(r.guardian_phone)],
          ['회원번호', r.guardian_id ? api.renderDetailLink('member-detail.html', r.guardian_id) : '—']
        ]);
      }

      // 영역 3: 참여자 정보 — 유치원
      var kg = document.getElementById('detailChatKg');
      if (kg) {
        api.setHtml(kg, [
          ['유치원명', api.escapeHtml(r.kindergarten_name || '')],
          ['운영자 성명', api.escapeHtml(r.operator_name || '')],
          ['운영자 연락처', api.renderMaskedField(r.operator_phone)],
          ['유치원번호', r.kindergarten_id ? api.renderDetailLink('kindergarten-detail.html', r.kindergarten_id) : '—']
        ]);
      }

      // 영역 4: 연동 예약 목록
      var resList = document.getElementById('detailChatReservations');
      if (resList && r.reservations && r.reservations.length > 0) {
        resList.innerHTML = '<thead><tr><th>예약번호</th><th>예약 상태</th><th>등원 예정일시</th><th>결제금액</th></tr></thead><tbody>' +
          r.reservations.map(function (rv) {
            return '<tr>' +
              '<td><a href="reservation-detail.html?id=' + (rv.id || rv.reservation_number) + '" class="mini-table__link">' + api.escapeHtml(rv.reservation_number || '') + '</a></td>' +
              '<td>' + api.autoBadge(rv.status || '') + '</td>' +
              '<td>' + api.formatDate(rv.checkin_datetime) + '</td>' +
              '<td class="text-right">' + api.formatMoney(rv.payment_amount) + '</td>' +
              '</tr>';
          }).join('') + '</tbody>';
      }

      // 영역 5: 메시지 내역
      var msgArea = document.getElementById('detailChatMessages');
      if (msgArea && r.messages && r.messages.length > 0) {
        var html = '';
        var currentDate = '';
        r.messages.forEach(function (m) {
          var dateStr = (m.sent_at || '').substring(0, 10);
          if (dateStr && dateStr !== currentDate) {
            currentDate = dateStr;
            html += '<div class="chat-date-divider">' + dateStr + '</div>';
          }
          var timeStr = (m.sent_at || '').substring(11, 16);
          if (m.sender_type === '시스템' || m.sender_type === 'system') {
            html += '<div class="chat-bubble-wrap chat-bubble-wrap--system"><div class="chat-bubble chat-bubble--system">' + api.escapeHtml(m.content || '') + '</div><div class="chat-meta" style="justify-content:center;"><span>시스템 · ' + timeStr + '</span></div></div>';
          } else if (m.sender_type === '보호자' || m.sender_type === 'guardian') {
            html += '<div class="chat-bubble-wrap chat-bubble-wrap--guardian"><div class="chat-bubble chat-bubble--guardian">' + api.escapeHtml(m.content || '') + '</div><div class="chat-meta"><span>' + api.escapeHtml(m.sender_nickname || '') + '</span><span>' + timeStr + '</span><span class="chat-meta__' + (m.is_read ? 'read' : 'unread') + '">' + (m.is_read ? '읽음' : '안읽음') + '</span></div></div>';
          } else {
            html += '<div class="chat-bubble-wrap chat-bubble-wrap--kindergarten"><div class="chat-bubble chat-bubble--kindergarten">' + api.escapeHtml(m.content || '') + '</div><div class="chat-meta chat-meta--right"><span class="chat-meta__' + (m.is_read ? 'read' : 'unread') + '">' + (m.is_read ? '읽음' : '안읽음') + '</span><span>' + timeStr + '</span><span>' + api.escapeHtml(m.sender_nickname || '') + '</span></div></div>';
          }
        });
        msgArea.innerHTML = html;
      }

      // 영역 6: 신고 이력
      var report = document.getElementById('detailChatReport');
      if (report) {
        api.setHtml(report, [
          ['신고 여부', r.has_report ? '<span class="report-yes">있음</span>' : '<span class="report-no">없음</span>'],
          ['신고 건수', (r.report_count || 0) + '건'],
          ['최근 신고일시', api.formatDate(r.latest_report_at) || '—'],
          ['신고 상세', r.latest_report_id ? '<a href="report-detail.html?id=' + r.latest_report_id + '" class="info-grid__value--link">신고 상세 보기 &rarr;</a>' : '—']
        ]);
      }

      api.showLoading(false);
    }).catch(function () { api.showLoading(false); });
  }

  function bindChatDetailModals() {
    // 채팅방 강제 비활성화
    var deactivateBtn = document.getElementById('deactivateBtn');
    if (deactivateBtn) {
      deactivateBtn.addEventListener('click', function () {
        var reason = document.getElementById('deactivateReason').value;
        if (!reason) return;
        var id = api.getParam('id');
        api.updateRecord('chat_rooms', id, { status: '비활성' }).then(function () {
          api.insertAuditLog('chat_rooms', id, '채팅방 강제 비활성화', reason);
          location.reload();
        });
      });
    }
  }

  function initChatDetail() {
    loadChatDetail();
    bindChatDetailModals();
    api.hideIfReadOnly(PERM_KEY);
  }

  /* ══════════════════════════════════════════
     C. 신고접수 상세 (report-detail.html)
     ══════════════════════════════════════════ */

  function isReportDetail() {
    return !!document.getElementById('detailRptBasic');
  }

  function loadReportDetail() {
    var id = api.getParam('id');
    if (!id) return;
    api.showLoading(true);

    api.fetchDetail('reports', id).then(function (r) {
      if (!r) { api.showLoading(false); return; }

      // 영역 1: 신고 기본정보
      var basic = document.getElementById('detailRptBasic');
      if (basic) {
        api.setHtml(basic, [
          ['신고 고유번호', r.report_number || r.id],
          ['신고일시', api.formatDate(r.reported_at)],
          ['신고 사유', api.escapeHtml(r.report_reason || '')],
          ['신고 상세 내용', api.escapeHtml(r.description || '')],
          ['처리상태', api.autoBadge(r.report_status || '', { '접수': 'orange', '처리중': 'blue', '처리완료': 'green', '기각': 'gray' })],
          ['처리일시', api.formatDate(r.processed_at) || '—']
        ]);
      }

      // 영역 2: 신고자 정보
      var reporter = document.getElementById('detailRptReporter');
      if (reporter) {
        api.setHtml(reporter, [
          ['이름', api.escapeHtml(r.reporter_name || '')],
          ['닉네임', api.escapeHtml(r.reporter_nickname || '')],
          ['유형', api.autoBadge(r.reporter_type || '', { '보호자': 'brown', '유치원': 'pink' })],
          ['연락처', api.renderMaskedField(r.reporter_phone)],
          ['회원번호', r.reporter_id ? api.renderDetailLink('member-detail.html', r.reporter_id) : '—']
        ]);
      }

      // 영역 3: 피신고자 정보
      var reported = document.getElementById('detailRptReported');
      if (reported) {
        api.setHtml(reported, [
          ['이름', api.escapeHtml(r.reported_name || '')],
          ['닉네임', api.escapeHtml(r.reported_nickname || '')],
          ['유형', api.autoBadge(r.reported_type || '', { '보호자': 'brown', '유치원': 'pink' })],
          ['연락처', api.renderMaskedField(r.reported_phone)],
          ['회원번호', r.reported_id ? api.renderDetailLink('member-detail.html', r.reported_id) : '—']
        ]);
      }

      // 영역 4: 관련 채팅방
      var chatInfo = document.getElementById('detailRptChat');
      if (chatInfo) {
        api.setHtml(chatInfo, [
          ['채팅방 번호', r.chat_room_id ? '<a href="chat-detail.html?id=' + r.chat_room_id + '" class="data-table__link">' + api.escapeHtml(r.chat_room_number || '') + '</a>' : '—'],
          ['마지막 메시지 일시', api.formatDate(r.last_message_at) || '—'],
          ['총 메시지 수', (r.message_count || 0) + '건']
        ]);
      }

      // 영역 5: 처리 내역
      var proc = document.getElementById('detailRptProc');
      if (proc) {
        api.setHtml(proc, [
          ['처리 결과', r.process_result ? api.autoBadge(r.process_result) : '—'],
          ['제재 유형', r.sanction_type ? api.escapeHtml(r.sanction_type) : '—'],
          ['제재 기간', r.sanction_period || '—'],
          ['처리 사유', api.escapeHtml(r.process_reason || '') || '—'],
          ['처리 관리자', api.escapeHtml(r.process_admin || '') || '—']
        ]);
      }

      // 처리 이력 테이블
      var log = document.getElementById('detailRptLog');
      if (log && r.status_logs && r.status_logs.length > 0) {
        log.innerHTML = '<thead><tr><th>변경일시</th><th>이전 상태</th><th>변경 상태</th><th>처리자</th><th>비고</th></tr></thead><tbody>' +
          r.status_logs.map(function (l) {
            return '<tr>' +
              '<td>' + api.formatDate(l.changed_at) + '</td>' +
              '<td>' + (l.prev_status ? api.autoBadge(l.prev_status) : '—') + '</td>' +
              '<td>' + api.autoBadge(l.new_status) + '</td>' +
              '<td>' + api.autoBadge(l.actor || '', { '시스템': 'gray', '관리자': 'red' }) + '</td>' +
              '<td>' + api.escapeHtml(l.note || '') + '</td>' +
              '</tr>';
          }).join('') +
          '</tbody>';
      }

      api.showLoading(false);
    }).catch(function () { api.showLoading(false); });
  }

  function bindReportDetailModals() {
    // 처리상태 변경
    var statusConfirm = document.querySelector('#statusChangeModal .modal__btn--confirm-primary');
    if (statusConfirm) {
      statusConfirm.addEventListener('click', function () {
        var status = document.getElementById('statusSelect').value;
        if (!status) return;
        var statusMap = { 'processing': '처리중', 'completed': '처리완료' };
        var newStatus = statusMap[status] || status;
        var id = api.getParam('id');
        api.updateRecord('reports', id, { report_status: newStatus }).then(function () {
          api.insertAuditLog('reports', id, '처리상태 변경: ' + newStatus, '');
          location.reload();
        });
      });
    }

    // 제재 적용
    var sanctionBtn = document.getElementById('sanctionBtn');
    if (sanctionBtn) {
      sanctionBtn.addEventListener('click', function () {
        var type = document.getElementById('sanctionType').value;
        var reason = document.getElementById('sanctionReason').value;
        if (!type || !reason) return;
        var typeMap = { 'warning': '경고', '7d': '7일 정지', '30d': '30일 정지', 'permanent': '영구 정지' };
        var id = api.getParam('id');
        api.updateRecord('reports', id, {
          report_status: '처리완료',
          sanction_type: typeMap[type] || type,
          process_reason: reason
        }).then(function () {
          api.insertAuditLog('reports', id, '제재 적용: ' + (typeMap[type] || type), reason);
          location.reload();
        });
      });
    }

    // 기각 처리
    var dismissBtn = document.getElementById('dismissBtn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function () {
        var reason = document.getElementById('dismissReason').value;
        if (!reason) return;
        var id = api.getParam('id');
        api.updateRecord('reports', id, { report_status: '기각', process_reason: reason }).then(function () {
          api.insertAuditLog('reports', id, '기각 처리', reason);
          location.reload();
        });
      });
    }
  }

  function initReportDetail() {
    loadReportDetail();
    bindReportDetailModals();
    api.hideIfReadOnly(PERM_KEY);
  }

  /* ══════════════════════════════════════════
     D. 초기화
     ══════════════════════════════════════════ */

  document.addEventListener('DOMContentLoaded', function () {
    if (isListPage()) initList();
    else if (isChatDetail()) initChatDetail();
    else if (isReportDetail()) initReportDetail();
  });

})();
