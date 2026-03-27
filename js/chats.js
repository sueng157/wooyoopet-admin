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
    chatStatus   = selects[0];
    chatReported = selects[1];

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

  function renderChatRow(r, idx, offset) {
    var no = offset + idx + 1;
    var guardianNick = (r.guardian && r.guardian.nickname) || '';
    var kgName = (r.kindergartens && r.kindergartens.name) || '';
    var reportTag = r.has_report
      ? '<span class="report-yes">있음</span>'
      : '<span class="report-no">없음</span>';
    var statusBadge = api.autoBadge(r.status || '', { '활성': 'green', '비활성': 'gray' });

    return '<tr>' +
      '<td>' + no + '</td>' +
      '<td>' + api.escapeHtml(r.id ? String(r.id).substring(0, 8) : '') + '</td>' +
      '<td>' + api.escapeHtml(guardianNick) + '</td>' +
      '<td>' + api.escapeHtml(kgName) + '</td>' +
      '<td><span class="message-preview">' + api.escapeHtml(r.last_message || '') + '</span></td>' +
      '<td>' + api.formatDate(r.last_message_at) + '</td>' +
      '<td>' + (r.total_message_count || 0) + '</td>' +
      '<td>—</td>' +
      '<td>' + reportTag + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + api.formatDate(r.created_at, true) + '</td>' +
      '<td><a href="chat-detail.html?id=' + (r.id || '') + '" class="data-table__link">상세</a></td>' +
      '</tr>';
  }

  function loadChatList(page) {
    chatPage = page || 1;
    var offset = (chatPage - 1) * PER_PAGE;
    api.showTableLoading(chatListBody, 12);

    api.fetchList('chat_rooms', {
      select: '*, guardian:guardian_id(name, nickname, phone), kindergartens:kindergarten_id(name)',
      filters: buildChatFilters(),
      order: { column: 'last_message_at', ascending: false },
      page: chatPage, perPage: PER_PAGE
    }).then(function (res) {
      var rows = res.data || [], total = res.count || 0;
      chatResultCount.textContent = api.formatNumber(total);
      if (!rows.length) { api.showTableEmpty(chatListBody, 12, '검색 결과가 없습니다.'); chatPagination.innerHTML = ''; return; }
      chatListBody.innerHTML = rows.map(function (r, i) { return renderChatRow(r, i, offset); }).join('');
      api.renderPagination(chatPagination, chatPage, total, PER_PAGE, loadChatList);
    }).catch(function () { api.showTableEmpty(chatListBody, 12, '데이터를 불러오지 못했습니다.'); });
  }

  function bindChatEvents() {
    if (chatBtnSearch) chatBtnSearch.addEventListener('click', function () { loadChatList(1); });
    if (chatSearchInput) chatSearchInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') loadChatList(1); });
    if (chatBtnExcel) chatBtnExcel.addEventListener('click', function () {
      api.fetchAll('chat_rooms', { select: '*, guardian:guardian_id(nickname), kindergartens:kindergarten_id(name)', filters: buildChatFilters(), order: { column: 'last_message_at', ascending: false } }).then(function (res) {
        var rows = res.data || [];
        api.exportExcel(rows.map(function (r) {
          return { '채팅방번호': r.id ? String(r.id).substring(0, 8) : '', '보호자': (r.guardian && r.guardian.nickname) || '', '유치원명': (r.kindergartens && r.kindergartens.name) || '', '마지막메시지': r.last_message || '', '메시지수': r.total_message_count || 0, '신고여부': r.has_report ? '있음' : '없음', '상태': r.status || '', '생성일': r.created_at || '' };
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
    rptStatus   = selects[0];
    rptReporter = selects[1];

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
    if (rptStatus && rptStatus.value !== '전체') f.push({ column: 'status', op: 'eq', value: rptStatus.value });
    if (rptReporter && rptReporter.value !== '전체') f.push({ column: 'reporter_type', op: 'eq', value: rptReporter.value });
    return f;
  }

  function renderRptRow(r, idx, offset) {
    var no = offset + idx + 1;
    var reporterNick = (r.reporter && r.reporter.nickname) || '';
    var reportedNick = (r.reported && r.reported.nickname) || '';
    var reporterBadge = api.autoBadge(r.reporter_type || '', { '보호자': 'brown', '유치원': 'pink' });
    var reportedBadge = api.autoBadge(r.reported_type || '', { '보호자': 'brown', '유치원': 'pink' });
    var statusBadge = api.autoBadge(r.status || '', { '접수': 'orange', '처리중': 'blue', '처리완료': 'green', '기각': 'gray' });

    return '<tr>' +
      '<td>' + no + '</td>' +
      '<td>' + api.formatDate(r.reported_at) + '</td>' +
      '<td>' + api.escapeHtml(reporterNick) + '</td>' +
      '<td>' + reporterBadge + '</td>' +
      '<td>' + api.escapeHtml(reportedNick) + '</td>' +
      '<td>' + reportedBadge + '</td>' +
      '<td>' + api.escapeHtml(r.reason_category || '') + '</td>' +
      '<td>' + (r.chat_room_id ? '<a href="chat-detail.html?id=' + r.chat_room_id + '" class="data-table__link">채팅방</a>' : '—') + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + (api.formatDate(r.processed_at) || '—') + '</td>' +
      '<td><a href="report-detail.html?id=' + (r.id || '') + '" class="data-table__link">상세</a></td>' +
      '</tr>';
  }

  function loadRptList(page) {
    rptPage = page || 1;
    var offset = (rptPage - 1) * PER_PAGE;
    api.showTableLoading(rptListBody, 11);

    api.fetchList('reports', {
      select: '*, reporter:reporter_id(name, nickname), reported:reported_id(name, nickname)',
      filters: buildRptFilters(),
      order: { column: 'reported_at', ascending: false },
      page: rptPage, perPage: PER_PAGE
    }).then(function (res) {
      var rows = res.data || [], total = res.count || 0;
      rptResultCount.textContent = api.formatNumber(total);
      if (!rows.length) { api.showTableEmpty(rptListBody, 11, '검색 결과가 없습니다.'); rptPagination.innerHTML = ''; return; }
      rptListBody.innerHTML = rows.map(function (r, i) { return renderRptRow(r, i, offset); }).join('');
      api.renderPagination(rptPagination, rptPage, total, PER_PAGE, loadRptList);
    }).catch(function () { api.showTableEmpty(rptListBody, 11, '데이터를 불러오지 못했습니다.'); });
  }

  function bindRptEvents() {
    if (rptBtnSearch) rptBtnSearch.addEventListener('click', function () { loadRptList(1); });
    if (rptSearchInput) rptSearchInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') loadRptList(1); });
    if (rptBtnExcel) rptBtnExcel.addEventListener('click', function () {
      api.fetchAll('reports', { select: '*, reporter:reporter_id(nickname), reported:reported_id(nickname)', filters: buildRptFilters(), order: { column: 'reported_at', ascending: false } }).then(function (res) {
        var rows = res.data || [];
        api.exportExcel(rows.map(function (r) {
          return { '신고번호': r.id || '', '신고일시': r.reported_at || '', '신고자': (r.reporter && r.reporter.nickname) || '', '신고자유형': r.reporter_type || '', '피신고자': (r.reported && r.reported.nickname) || '', '사유': r.reason_category || '', '상태': r.status || '' };
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

    api.fetchDetail('chat_rooms', id, '*, guardian:guardian_id(name, nickname, phone), kindergartens:kindergarten_id(name, member_id, members:member_id(name, phone)), chat_messages(sender_type, sender_id, content, is_read, created_at)').then(function (result) {
      var r = result.data;
      if (!r || result.error) return;

      var guardianData = r.guardian || {};
      var kgData = r.kindergartens || {};
      var kgOwner = kgData.members || {};

      // 영역 1: 채팅방 기본정보
      var basic = document.getElementById('detailChatBasic');
      if (basic) {
        api.setHtml(basic, [
          ['채팅방 고유번호', r.id],
          ['생성일', api.formatDate(r.created_at, true)],
          ['채팅방 상태', api.autoBadge(r.status || '', { '활성': 'green', '비활성': 'gray' })],
          ['총 메시지 수', (r.total_message_count || 0) + '건']
        ]);
      }

      // 영역 2: 참여자 정보 — 보호자
      var guardian = document.getElementById('detailChatGuardian');
      if (guardian) {
        api.setHtml(guardian, [
          ['보호자 이름', api.escapeHtml(guardianData.name || '')],
          ['보호자 닉네임', api.escapeHtml(guardianData.nickname || '')],
          ['보호자 연락처', api.renderMaskedField(api.maskPhone(guardianData.phone || ''), api.formatPhone(guardianData.phone || ''), 'chat_rooms', id, 'guardian_phone')],
          ['회원번호', r.guardian_id ? api.renderDetailLink('member-detail.html', r.guardian_id) : '—']
        ]);
      }

      // 영역 3: 참여자 정보 — 유치원
      var kg = document.getElementById('detailChatKg');
      if (kg) {
        api.setHtml(kg, [
          ['유치원명', api.escapeHtml(kgData.name || '')],
          ['운영자 성명', api.escapeHtml(kgOwner.name || '')],
          ['운영자 연락처', api.renderMaskedField(api.maskPhone(kgOwner.phone || ''), api.formatPhone(kgOwner.phone || ''), 'chat_rooms', id, 'kg_phone')],
          ['유치원번호', r.kindergarten_id ? api.renderDetailLink('kindergarten-detail.html', r.kindergarten_id) : '—']
        ]);
      }

      // 영역 4: 메시지 내역
      var msgArea = document.getElementById('detailChatMessages');
      var messages = r.chat_messages || [];
      if (msgArea && messages.length > 0) {
        var html = '';
        var currentDate = '';
        messages.forEach(function (m) {
          var dateStr = (m.created_at || '').substring(0, 10);
          if (dateStr && dateStr !== currentDate) {
            currentDate = dateStr;
            html += '<div class="chat-date-divider">' + dateStr + '</div>';
          }
          var timeStr = (m.created_at || '').substring(11, 16);
          if (m.sender_type === '시스템' || m.sender_type === 'system') {
            html += '<div class="chat-bubble-wrap chat-bubble-wrap--system"><div class="chat-bubble chat-bubble--system">' + api.escapeHtml(m.content || '') + '</div><div class="chat-meta" style="justify-content:center;"><span>시스템 · ' + timeStr + '</span></div></div>';
          } else if (m.sender_type === '보호자' || m.sender_type === 'guardian') {
            html += '<div class="chat-bubble-wrap chat-bubble-wrap--guardian"><div class="chat-bubble chat-bubble--guardian">' + api.escapeHtml(m.content || '') + '</div><div class="chat-meta"><span>' + api.escapeHtml(guardianData.nickname || '보호자') + '</span><span>' + timeStr + '</span><span class="chat-meta__' + (m.is_read ? 'read' : 'unread') + '">' + (m.is_read ? '읽음' : '안읽음') + '</span></div></div>';
          } else {
            html += '<div class="chat-bubble-wrap chat-bubble-wrap--kindergarten"><div class="chat-bubble chat-bubble--kindergarten">' + api.escapeHtml(m.content || '') + '</div><div class="chat-meta chat-meta--right"><span class="chat-meta__' + (m.is_read ? 'read' : 'unread') + '">' + (m.is_read ? '읽음' : '안읽음') + '</span><span>' + timeStr + '</span><span>' + api.escapeHtml(kgData.name || '유치원') + '</span></div></div>';
          }
        });
        msgArea.innerHTML = html;
      }

      // 영역 5: 신고 이력
      var report = document.getElementById('detailChatReport');
      if (report) {
        api.setHtml(report, [
          ['신고 여부', r.has_report ? '<span class="report-yes">있음</span>' : '<span class="report-no">없음</span>'],
          ['신고 건수', '—'],
          ['최근 신고일시', '—'],
          ['신고 상세', '—']
        ]);
      }

    }).catch(function (err) { console.error('[chats] detail error:', err); });
  }

  function bindChatDetailModals() {
    var deactivateBtn = document.getElementById('deactivateBtn');
    if (deactivateBtn) {
      deactivateBtn.addEventListener('click', function () {
        var reason = document.getElementById('deactivateReason').value;
        if (!reason) return;
        var id = api.getParam('id');
        api.updateRecord('chat_rooms', id, { status: '비활성' }).then(function () {
          api.insertAuditLog('채팅방비활성화', 'chat_rooms', id, { reason: reason });
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

    api.fetchDetail('reports', id, '*, reporter:reporter_id(name, nickname, phone), reported:reported_id(name, nickname, phone)').then(function (result) {
      var r = result.data;
      if (!r || result.error) return;

      var reporterData = r.reporter || {};
      var reportedData = r.reported || {};

      // 영역 1: 신고 기본정보
      var basic = document.getElementById('detailRptBasic');
      if (basic) {
        api.setHtml(basic, [
          ['신고 고유번호', r.id],
          ['신고일시', api.formatDate(r.reported_at)],
          ['신고 사유', api.escapeHtml(r.reason_category || '')],
          ['신고 상세 내용', api.escapeHtml(r.reason_detail || '')],
          ['처리상태', api.autoBadge(r.status || '', { '접수': 'orange', '처리중': 'blue', '처리완료': 'green', '기각': 'gray' })],
          ['처리일시', api.formatDate(r.processed_at) || '—']
        ]);
      }

      // 영역 2: 신고자 정보
      var reporter = document.getElementById('detailRptReporter');
      if (reporter) {
        api.setHtml(reporter, [
          ['이름', api.escapeHtml(reporterData.name || '')],
          ['닉네임', api.escapeHtml(reporterData.nickname || '')],
          ['유형', api.autoBadge(r.reporter_type || '', { '보호자': 'brown', '유치원': 'pink' })],
          ['연락처', api.renderMaskedField(api.maskPhone(reporterData.phone || ''), api.formatPhone(reporterData.phone || ''), 'reports', r.id, 'reporter_phone')],
          ['회원번호', r.reporter_id ? api.renderDetailLink('member-detail.html', r.reporter_id) : '—']
        ]);
      }

      // 영역 3: 피신고자 정보
      var reported = document.getElementById('detailRptReported');
      if (reported) {
        api.setHtml(reported, [
          ['이름', api.escapeHtml(reportedData.name || '')],
          ['닉네임', api.escapeHtml(reportedData.nickname || '')],
          ['유형', api.autoBadge(r.reported_type || '', { '보호자': 'brown', '유치원': 'pink' })],
          ['연락처', api.renderMaskedField(api.maskPhone(reportedData.phone || ''), api.formatPhone(reportedData.phone || ''), 'reports', r.id, 'reported_phone')],
          ['회원번호', r.reported_id ? api.renderDetailLink('member-detail.html', r.reported_id) : '—']
        ]);
      }

      // 영역 4: 관련 채팅방
      var chatInfo = document.getElementById('detailRptChat');
      if (chatInfo) {
        api.setHtml(chatInfo, [
          ['채팅방 번호', r.chat_room_id ? '<a href="chat-detail.html?id=' + r.chat_room_id + '" class="data-table__link">' + api.escapeHtml(String(r.chat_room_id).substring(0, 8)) + '</a>' : '—'],
          ['마지막 메시지 일시', '—'],
          ['총 메시지 수', '—']
        ]);
      }

      // 영역 5: 처리 내역
      var proc = document.getElementById('detailRptProc');
      if (proc) {
        api.setHtml(proc, [
          ['처리 결과', r.sanction_result ? api.autoBadge(r.sanction_result) : '—'],
          ['제재 유형', r.sanction_type ? api.escapeHtml(r.sanction_type) : '—'],
          ['제재 기간', '—'],
          ['처리 사유', api.escapeHtml(r.process_reason || '') || '—'],
          ['처리 관리자', api.escapeHtml(r.processed_by || '') || '—']
        ]);
      }

    }).catch(function (err) { console.error('[chats] report detail error:', err); });
  }

  function bindReportDetailModals() {
    var statusConfirm = document.querySelector('#statusChangeModal .modal__btn--confirm-primary');
    if (statusConfirm) {
      statusConfirm.addEventListener('click', function () {
        var status = document.getElementById('statusSelect').value;
        if (!status) return;
        var statusMap = { 'processing': '처리중', 'completed': '처리완료' };
        var newStatus = statusMap[status] || status;
        var id = api.getParam('id');
        api.updateRecord('reports', id, { status: newStatus }).then(function () {
          api.insertAuditLog('처리상태변경', 'reports', id, { status: newStatus });
          location.reload();
        });
      });
    }

    var sanctionBtn = document.getElementById('sanctionBtn');
    if (sanctionBtn) {
      sanctionBtn.addEventListener('click', function () {
        var type = document.getElementById('sanctionType').value;
        var reason = document.getElementById('sanctionReason').value;
        if (!type || !reason) return;
        var typeMap = { 'warning': '경고', '7d': '7일 정지', '30d': '30일 정지', 'permanent': '영구 정지' };
        var id = api.getParam('id');
        api.updateRecord('reports', id, {
          status: '처리완료',
          sanction_type: typeMap[type] || type,
          process_reason: reason
        }).then(function () {
          api.insertAuditLog('제재적용', 'reports', id, { type: typeMap[type] || type, reason: reason });
          location.reload();
        });
      });
    }

    var dismissBtn = document.getElementById('dismissBtn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function () {
        var reason = document.getElementById('dismissReason').value;
        if (!reason) return;
        var id = api.getParam('id');
        api.updateRecord('reports', id, { status: '기각', process_reason: reason }).then(function () {
          api.insertAuditLog('기각처리', 'reports', id, { reason: reason });
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
