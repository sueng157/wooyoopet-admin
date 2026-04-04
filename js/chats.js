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
  var chatFilterBar, chatStatus, chatReported, chatSearchField, chatSearchInput;
  var chatBtnReset, chatBtnSearch, chatBtnExcel, chatResultCount, chatListBody, chatPagination;
  var chatPage = 1;

  function cacheChatDom() {
    var tab = document.getElementById('tab-chat-history');
    if (!tab) return;
    chatFilterBar   = tab.querySelector('.filter-bar');
    chatStatus      = document.getElementById('chatStatus');
    chatReported    = document.getElementById('chatReported');
    chatSearchField = document.getElementById('chatSearchField');
    chatSearchInput = document.getElementById('chatSearchInput');
    chatBtnReset    = document.getElementById('chatBtnReset');
    chatBtnSearch   = document.getElementById('chatBtnSearch');
    chatBtnExcel    = tab.querySelector('.btn-excel');

    chatResultCount = tab.querySelector('.result-header__count strong');
    chatListBody    = document.getElementById('chatListBody');
    chatPagination  = tab.querySelector('.pagination');
  }

  /** RPC 파라미터 조립 (search_chat_rooms) */
  function buildChatRpcParams(page, perPage) {
    var params = {
      p_status:         (chatStatus && chatStatus.value) ? chatStatus.value : null,
      p_has_report:     (chatReported && chatReported.value) ? chatReported.value : null,
      p_search_type:    null,
      p_search_keyword: null,
      p_page:           page || 1,
      p_per_page:       perPage || PER_PAGE
    };

    if (chatSearchInput && chatSearchInput.value.trim()) {
      params.p_search_type = chatSearchField ? chatSearchField.value : '보호자 닉네임';
      params.p_search_keyword = chatSearchInput.value.trim();
    }

    return params;
  }

  /** RPC 결과 파싱 (문자열 방어) */
  function parseChatRpcResult(raw) {
    if (!raw) return { data: [], count: 0 };
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch (e) { return { data: [], count: 0 }; }
    }
    return raw;
  }

  function renderChatRow(r, idx, offset) {
    var no = offset + idx + 1;
    var guardianNick = (r.guardian && r.guardian.nickname) || '';
    var kgName = (r.kindergartens && r.kindergartens.name) || '';

    // 연동 예약번호: RPC의 reservations 배열 (requested_at DESC 정렬 완료) → 최신 1건
    var resLink = '—';
    var resList = r.reservations;
    if (resList && resList.length > 0) {
      var latestRes = resList[0];
      if (latestRes.id) {
        resLink = '<a href="reservation-detail.html?id=' + latestRes.id + '" class="data-table__link">'
          + api.escapeHtml(String(latestRes.id).substring(0, 8)) + '</a>';
      }
    }

    // 신고 여부: has_report boolean 직접 사용 (DB 트리거가 자동 갱신)
    var reportTag = r.has_report
      ? '<span class="report-yes">있음</span>'
      : '<span class="report-no">없음</span>';

    var statusBadge = api.autoBadge(r.status || '', { '활성': 'green', '비활성': 'gray' });

    return '<tr>' +
      '<td>' + no + '</td>' +
      '<td>' + api.escapeHtml(guardianNick) + '</td>' +
      '<td>' + api.escapeHtml(kgName) + '</td>' +
      '<td><span class="message-preview">' + api.escapeHtml(r.last_message || '') + '</span></td>' +
      '<td>' + api.formatDate(r.last_message_at) + '</td>' +
      '<td>' + resLink + '</td>' +
      '<td>' + reportTag + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + api.formatDate(r.created_at, true) + '</td>' +
      '<td><a href="chat-detail.html?id=' + (r.id || '') + '" class="data-table__link">상세</a></td>' +
      '</tr>';
  }

  async function loadChatList(page) {
    chatPage = page || 1;
    var offset = (chatPage - 1) * PER_PAGE;
    api.showTableLoading(chatListBody, 10);

    try {
      var rpcResult = await window.__supabase.rpc('search_chat_rooms', buildChatRpcParams(chatPage));

      if (rpcResult.error) {
        console.error('[chats] RPC error:', rpcResult.error);
        api.showTableEmpty(chatListBody, 10, '데이터 로드 실패: ' + (rpcResult.error.message || JSON.stringify(rpcResult.error)));
        return;
      }

      var result = parseChatRpcResult(rpcResult.data);
      var rows = result.data || [];
      var total = result.count || 0;

      if (chatResultCount) chatResultCount.textContent = api.formatNumber(total);

      if (!rows.length) {
        api.showTableEmpty(chatListBody, 10, '검색 결과가 없습니다.');
        if (chatPagination) chatPagination.innerHTML = '';
        return;
      }

      chatListBody.innerHTML = rows.map(function (r, i) { return renderChatRow(r, i, offset); }).join('');
      api.renderPagination(chatPagination, chatPage, total, PER_PAGE, loadChatList);
    } catch (err) {
      console.error('[chats] list error:', err);
      api.showTableEmpty(chatListBody, 10, '데이터를 불러오지 못했습니다.');
    }
  }

  function bindChatEvents() {
    if (chatBtnSearch) chatBtnSearch.addEventListener('click', function () { loadChatList(1); });
    if (chatSearchInput) chatSearchInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') loadChatList(1); });
    if (chatBtnReset) chatBtnReset.addEventListener('click', function () {
      if (window.__resetFilters) window.__resetFilters(chatFilterBar);
    });
    if (chatBtnExcel) chatBtnExcel.addEventListener('click', function () {
      var params = buildChatRpcParams(1, 10000);
      window.__supabase.rpc('search_chat_rooms', params).then(function (rpcResult) {
        if (rpcResult.error) { alert('다운로드 실패'); return; }
        var result = parseChatRpcResult(rpcResult.data);
        var rows = result.data || [];
        api.exportExcel(rows.map(function (r) {
          return {
            '보호자 닉네임': (r.guardian && r.guardian.nickname) || '',
            '유치원명': (r.kindergartens && r.kindergartens.name) || '',
            '마지막 메시지': r.last_message || '',
            '마지막 메시지 일시': r.last_message_at || '',
            '신고 여부': r.has_report ? '있음' : '없음',
            '채팅방 상태': r.status || '',
            '생성일': r.created_at || ''
          };
        }), '채팅내역');
      });
    });
  }

  /* ── A-2: 신고접수 탭 ── */
  var rptFilterBar, rptDateFrom, rptDateTo, rptStatus, rptReporterType, rptReasonCategory, rptSanctionType;
  var rptSearchField, rptSearchInput;
  var rptBtnReset, rptBtnSearch, rptBtnExcel, rptResultCount, rptListBody, rptPagination;
  var rptPage = 1;

  function cacheRptDom() {
    var tab = document.getElementById('tab-reports');
    if (!tab) return;
    rptFilterBar     = tab.querySelector('.filter-bar');
    rptDateFrom      = document.getElementById('rptDateFrom');
    rptDateTo        = document.getElementById('rptDateTo');
    rptStatus        = document.getElementById('rptStatus');
    rptReporterType  = document.getElementById('rptReporterType');
    rptReasonCategory = document.getElementById('rptReasonCategory');
    rptSanctionType  = document.getElementById('rptSanctionType');
    rptSearchField   = document.getElementById('rptSearchField');
    rptSearchInput   = document.getElementById('rptSearchInput');
    rptBtnReset      = document.getElementById('rptBtnReset');
    rptBtnSearch     = document.getElementById('rptBtnSearch');
    rptBtnExcel      = tab.querySelector('.btn-excel');

    rptResultCount = tab.querySelector('.result-header__count strong');
    rptListBody    = document.getElementById('rptListBody');
    rptPagination  = tab.querySelector('.pagination');
  }

  /** RPC 파라미터 조립 (search_reports) */
  function buildRptRpcParams(page, perPage) {
    var params = {
      p_date_from:       (rptDateFrom && rptDateFrom.value) ? rptDateFrom.value : null,
      p_date_to:         (rptDateTo && rptDateTo.value) ? rptDateTo.value : null,
      p_status:          (rptStatus && rptStatus.value) ? rptStatus.value : null,
      p_reporter_type:   (rptReporterType && rptReporterType.value) ? rptReporterType.value : null,
      p_reason_category: (rptReasonCategory && rptReasonCategory.value) ? rptReasonCategory.value : null,
      p_sanction_type:   (rptSanctionType && rptSanctionType.value) ? rptSanctionType.value : null,
      p_search_type:     null,
      p_search_keyword:  null,
      p_page:            page || 1,
      p_per_page:        perPage || PER_PAGE
    };

    if (rptSearchInput && rptSearchInput.value.trim()) {
      params.p_search_type = rptSearchField ? rptSearchField.value : 'reporter';
      params.p_search_keyword = rptSearchInput.value.trim();
    }

    return params;
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
      '<td>' + (r.sanction_type ? api.escapeHtml(r.sanction_type) : '—') + '</td>' +
      '<td>' + (api.formatDate(r.processed_at) || '—') + '</td>' +
      '<td><a href="report-detail.html?id=' + (r.id || '') + '" class="data-table__link">상세</a></td>' +
      '</tr>';
  }

  async function loadRptList(page) {
    rptPage = page || 1;
    var offset = (rptPage - 1) * PER_PAGE;
    api.showTableLoading(rptListBody, 12);

    try {
      var rpcResult = await window.__supabase.rpc('search_reports', buildRptRpcParams(rptPage));

      if (rpcResult.error) {
        console.error('[chats] reports RPC error:', rpcResult.error);
        api.showTableEmpty(rptListBody, 12, '데이터 로드 실패: ' + (rpcResult.error.message || JSON.stringify(rpcResult.error)));
        return;
      }

      var result = parseChatRpcResult(rpcResult.data);
      var rows = result.data || [];
      var total = result.count || 0;

      if (rptResultCount) rptResultCount.textContent = api.formatNumber(total);

      if (!rows.length) {
        api.showTableEmpty(rptListBody, 12, '검색 결과가 없습니다.');
        if (rptPagination) rptPagination.innerHTML = '';
        return;
      }

      rptListBody.innerHTML = rows.map(function (r, i) { return renderRptRow(r, i, offset); }).join('');
      api.renderPagination(rptPagination, rptPage, total, PER_PAGE, loadRptList);
    } catch (err) {
      console.error('[chats] reports list error:', err);
      api.showTableEmpty(rptListBody, 12, '데이터를 불러오지 못했습니다.');
    }
  }

  function bindRptEvents() {
    if (rptBtnSearch) rptBtnSearch.addEventListener('click', function () { loadRptList(1); });
    if (rptSearchInput) rptSearchInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') loadRptList(1); });

    // 초기화 버튼: 필터값만 리셋, 데이터테이블 갱신 안함
    if (rptBtnReset) rptBtnReset.addEventListener('click', function () {
      if (window.__resetFilters) window.__resetFilters(rptFilterBar);
      // 기간 버튼을 '전체'로 복원
      var tab = document.getElementById('tab-reports');
      if (tab) {
        tab.querySelectorAll('.filter-period-btn').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-period') === 'all');
        });
      }
    });

    // 엑셀 다운로드 → search_reports RPC 사용
    if (rptBtnExcel) rptBtnExcel.addEventListener('click', function () {
      var params = buildRptRpcParams(1, 10000);
      window.__supabase.rpc('search_reports', params).then(function (rpcResult) {
        if (rpcResult.error) { alert('다운로드 실패'); return; }
        var result = parseChatRpcResult(rpcResult.data);
        var rows = result.data || [];
        api.exportExcel(rows.map(function (r) {
          return {
            '신고일시': r.reported_at || '',
            '신고자': (r.reporter && r.reporter.nickname) || '',
            '신고자 유형': r.reporter_type || '',
            '피신고자': (r.reported && r.reported.nickname) || '',
            '피신고자 유형': r.reported_type || '',
            '신고사유': r.reason_category || '',
            '처리상태': r.status || '',
            '제재 유형': r.sanction_type || '',
            '처리일시': r.processed_at || ''
          };
        }), '신고접수');
      });
    });
  }

  /** 신고접수 탭 기간 퀵버튼 이벤트 바인딩 */
  function bindRptPeriodButtons() {
    var tab = document.getElementById('tab-reports');
    if (!tab) return;
    var btns = tab.querySelectorAll('.filter-period-btn');

    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        // 모든 기간 버튼 비활성 → 현재만 활성
        btns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');

        var period = btn.getAttribute('data-period');
        var now = new Date();
        var from = '';
        var to = '';

        if (period === 'all') {
          from = '';
          to = '';
        } else if (period === 'this-month') {
          from = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
          to = api.getToday();
        } else if (period === '1month') {
          var d1 = new Date();
          d1.setMonth(d1.getMonth() - 1);
          from = d1.getFullYear() + '-' + String(d1.getMonth() + 1).padStart(2, '0') + '-' + String(d1.getDate()).padStart(2, '0');
          to = api.getToday();
        } else if (period === '1week') {
          var d7 = new Date();
          d7.setDate(d7.getDate() - 7);
          from = d7.getFullYear() + '-' + String(d7.getMonth() + 1).padStart(2, '0') + '-' + String(d7.getDate()).padStart(2, '0');
          to = api.getToday();
        }

        if (rptDateFrom) rptDateFrom.value = from;
        if (rptDateTo) rptDateTo.value = to;
        // 버튼 클릭 시 자동 검색하지 않음 (날짜만 세팅)
      });
    });

    // 날짜 입력 수동 변경 시 기간 버튼 active 해제
    [rptDateFrom, rptDateTo].forEach(function (el) {
      if (!el) return;
      el.addEventListener('change', function () {
        btns.forEach(function (b) { b.classList.remove('active'); });
      });
    });
  }

  function initList() {
    cacheChatDom();
    cacheRptDom();
    bindChatEvents();
    bindRptEvents();
    bindRptPeriodButtons();
    loadChatList(1);
    loadRptList(1);
  }

  /* ══════════════════════════════════════════
     B. 채팅내역 상세 (chat-detail.html)
     ══════════════════════════════════════════ */

  function isChatDetail() {
    return !!document.getElementById('detailChatBasic');
  }

  /** 상세 영역 에러 표시 — payments.js showDetailError 패턴 */
  function showChatDetailError(msg) {
    var ids = ['detailChatBasic', 'detailChatGuardian', 'detailChatKg'];
    ids.forEach(function (elId) {
      var el = document.getElementById(elId);
      if (el) el.innerHTML = '<span style="color:var(--danger);padding:12px;">' + api.escapeHtml(msg) + '</span>';
    });
    var resBody = document.querySelector('#detailChatReservations tbody');
    if (resBody) resBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--danger);padding:12px;">' + api.escapeHtml(msg) + '</td></tr>';
    var msgArea = document.getElementById('detailChatMessages');
    if (msgArea) msgArea.innerHTML = '<div style="text-align:center;color:var(--danger);padding:24px;">' + api.escapeHtml(msg) + '</div>';
  }

  /** 상세 영역 로딩 플레이스홀더 — HTML 더미 제거 */
  function showChatDetailLoading() {
    var loadingHtml = '<span class="info-grid__label" style="color:var(--text-weak);">로딩 중...</span><span class="info-grid__value"></span>';
    ['detailChatBasic', 'detailChatGuardian', 'detailChatKg'].forEach(function (elId) {
      var el = document.getElementById(elId);
      if (el) el.innerHTML = loadingHtml;
    });
    var resBody = document.querySelector('#detailChatReservations tbody');
    if (resBody) resBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-weak);padding:24px 0;">로딩 중...</td></tr>';
    var msgArea = document.getElementById('detailChatMessages');
    if (msgArea) msgArea.innerHTML = '<div style="text-align:center;color:var(--text-weak);padding:24px;">메시지를 불러오는 중...</div>';
    var rptStatus = document.getElementById('detailChatReportStatus');
    if (rptStatus) rptStatus.innerHTML = '<span class="info-grid__label">신고 여부</span><span class="info-grid__value" style="color:var(--text-weak);">로딩 중...</span>';
    var rptBody = document.querySelector('#detailChatReportTable tbody');
    if (rptBody) rptBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-weak);padding:24px 0;">로딩 중...</td></tr>';
  }

  async function loadChatDetail() {
    console.log('[chats] loadChatDetail START');
    var id = api.getParam('id');
    console.log('[chats] id from URL:', id);

    if (!id) {
      console.warn('[chats] id가 URL에 없습니다. 로딩 중단.');
      showChatDetailError('채팅방 ID가 URL에 없습니다.');
      return;
    }

    // HTML 더미 데이터 즉시 제거 → 로딩 상태 표시
    showChatDetailLoading();

    try {
      var selectStr = '*, ' +
        'guardian:guardian_id(name, nickname, phone), ' +
        'kindergartens:kindergarten_id(name, member_id, members:member_id(name, phone)), ' +
        'chat_messages(sender_type, sender_id, content, is_read, created_at), ' +
        'chat_room_reservations(reservations:reservation_id(id, status, checkin_scheduled, requested_at, payments(amount)))';
      console.log('[chats] fetching chat_rooms data...');
      var result = await api.fetchDetail('chat_rooms', id, selectStr);
      console.log('[chats] fetchDetail result:', result);

      if (result.error) {
        console.error('[chats] fetchDetail error:', result.error);
        showChatDetailError('데이터를 불러오지 못했습니다. (코드: ' + (result.error.code || result.error.message || 'unknown') + ')');
        return;
      }

      var r = result.data;
      if (!r) {
        console.error('[chats] 채팅방 데이터가 없습니다. id:', id);
        showChatDetailError('채팅방 데이터를 찾을 수 없습니다.');
        return;
      }

      console.log('[chats] 채팅방 데이터 로드 성공:', r.id);

      var guardianData = r.guardian || {};
      var kgData = r.kindergartens || {};
      var kgOwner = kgData.members || {};

      // 영역 1: 채팅방 기본정보
      var basic = document.getElementById('detailChatBasic');
      if (basic) {
        api.setHtml(basic, [
          ['채팅방 고유번호', r.id],
          ['생성일', api.formatDate(r.created_at, true)],
          ['채팅방 상태', api.autoBadge(r.status || '', { '활성': 'green', '비활성': 'gray' })]
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

      // 영역 4: 연동 예약 목록 (chat_room_reservations → reservations 조인)
      var resTable = document.getElementById('detailChatReservations');
      if (resTable) {
        var resBody = resTable.querySelector('tbody');
        var resList = r.chat_room_reservations || [];
        console.log('[chats] 연동 예약 수:', resList.length);
        if (resList.length > 0) {
          var sorted = resList.slice().sort(function (a, b) {
            var ra = a.reservations || a;
            var rb = b.reservations || b;
            return (rb.requested_at || '').localeCompare(ra.requested_at || '');
          });
          var resHtml = '';
          for (var ri = 0; ri < sorted.length; ri++) {
            var res = sorted[ri].reservations || sorted[ri];
            var resId = res.id || '';
            var shortId = String(resId).substring(0, 8);
            var resStatus = api.autoBadge(res.status || '', { '예약확정': 'blue', '돌봄완료': 'green', '예약취소': 'gray', '예약대기': 'orange' });
            var checkIn = api.formatDate(res.checkin_scheduled) || '—';
            var payArr = Array.isArray(res.payments) ? res.payments : [];
            var payAmount = payArr.length > 0 ? payArr[0].amount : null;
            var amount = payAmount ? api.formatNumber(payAmount) + '원' : '—';
            resHtml += '<tr>' +
              '<td><a href="reservation-detail.html?id=' + encodeURIComponent(resId) + '" class="mini-table__link">' + api.escapeHtml(shortId) + '</a></td>' +
              '<td>' + resStatus + '</td>' +
              '<td>' + checkIn + '</td>' +
              '<td class="text-right">' + amount + '</td>' +
              '</tr>';
          }
          if (resBody) resBody.innerHTML = resHtml;
        } else {
          if (resBody) resBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-weak);padding:24px 0;">연동된 예약이 없습니다.</td></tr>';
        }
      }

      // 영역 5: 메시지 내역
      var msgArea = document.getElementById('detailChatMessages');
      var messages = r.chat_messages || [];
      console.log('[chats] 메시지 수:', messages.length);
      if (msgArea) {
        if (messages.length > 0) {
          var msgHtml = '';
          var currentDate = '';
          messages.forEach(function (m) {
            var dateStr = (m.created_at || '').substring(0, 10);
            if (dateStr && dateStr !== currentDate) {
              currentDate = dateStr;
              msgHtml += '<div class="chat-date-divider">' + dateStr + '</div>';
            }
            var timeStr = (m.created_at || '').substring(11, 16);
            if (m.sender_type === '시스템' || m.sender_type === 'system') {
              msgHtml += '<div class="chat-bubble-wrap chat-bubble-wrap--system"><div class="chat-bubble chat-bubble--system">' + api.escapeHtml(m.content || '') + '</div><div class="chat-meta" style="justify-content:center;"><span>시스템 · ' + timeStr + '</span></div></div>';
            } else if (m.sender_type === '보호자' || m.sender_type === 'guardian') {
              msgHtml += '<div class="chat-bubble-wrap chat-bubble-wrap--guardian"><div class="chat-bubble chat-bubble--guardian">' + api.escapeHtml(m.content || '') + '</div><div class="chat-meta"><span>' + api.escapeHtml(guardianData.nickname || '보호자') + '</span><span>' + timeStr + '</span><span class="chat-meta__' + (m.is_read ? 'read' : 'unread') + '">' + (m.is_read ? '읽음' : '안읽음') + '</span></div></div>';
            } else {
              msgHtml += '<div class="chat-bubble-wrap chat-bubble-wrap--kindergarten"><div class="chat-bubble chat-bubble--kindergarten">' + api.escapeHtml(m.content || '') + '</div><div class="chat-meta chat-meta--right"><span class="chat-meta__' + (m.is_read ? 'read' : 'unread') + '">' + (m.is_read ? '읽음' : '안읽음') + '</span><span>' + timeStr + '</span><span>' + api.escapeHtml(kgData.name || '유치원') + '</span></div></div>';
            }
          });
          msgArea.innerHTML = msgHtml;
        } else {
          msgArea.innerHTML = '<div style="text-align:center;color:var(--text-weak);padding:24px;">메시지가 없습니다.</div>';
        }
      }

      // 영역 6: 신고 이력 — 신고 여부 (has_report 직접 사용)
      var reportStatus = document.getElementById('detailChatReportStatus');
      if (reportStatus) {
        api.setHtml(reportStatus, [
          ['신고 여부', r.has_report ? '<span class="report-yes">있음</span>' : '<span class="report-no">없음</span>']
        ]);
      }

      // 영역 6-2: 신고 이력 테이블 — 별도 쿼리 (reports → members FK 중복 방지, HANDOVER 5-14)
      loadChatReportHistory(id);

    } catch (err) {
      console.error('[chats] detail error:', err);
      showChatDetailError('데이터를 불러오는 중 오류가 발생했습니다. (' + (err.message || err) + ')');
    }
  }

  /**
   * 신고 이력 테이블 로드 — FK 중복(reporter_id, reported_id → members) 방지를 위해 별도 쿼리 분리
   * HANDOVER.md 5-14 패턴 준수: reports에서 members 조인 제거, reporter 정보는 별도 members 쿼리로 취득
   */
  function loadChatReportHistory(chatRoomId) {
    var tableEl = document.getElementById('detailChatReportTable');
    if (!tableEl) return;
    var tbody = tableEl.querySelector('tbody');
    if (!tbody) return;

    // 1단계: reports 조회 (members 조인 없이 — PGRST201 방지)
    api.fetchList('reports', {
      select: '*',
      filters: [{ column: 'chat_room_id', op: 'eq', value: chatRoomId }],
      order: { column: 'reported_at', ascending: false },
      page: 1, perPage: 100
    }).then(function (res) {
      var rows = res.data || [];
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-weak);padding:24px 0;">신고 이력이 없습니다.</td></tr>';
        return;
      }

      // 2단계: 신고자 ID 수집 후 members 별도 조회
      var reporterIds = [];
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].reporter_id && reporterIds.indexOf(rows[i].reporter_id) === -1) {
          reporterIds.push(rows[i].reporter_id);
        }
      }

      if (!reporterIds.length) {
        renderReportTable(tbody, rows, {});
        return;
      }

      // members 쿼리 — nickname + kindergartens(name) 조인
      window.__supabase.from('members').select('id, nickname, kindergartens(name)').in('id', reporterIds).then(function (mRes) {
        var memberMap = {};
        var mData = (mRes && mRes.data) || [];
        for (var j = 0; j < mData.length; j++) {
          var m = mData[j];
          var kgName = '';
          if (m.kindergartens && m.kindergartens.length > 0) {
            kgName = m.kindergartens[0].name || '';
          } else if (m.kindergartens && m.kindergartens.name) {
            kgName = m.kindergartens.name;
          }
          memberMap[m.id] = { nickname: m.nickname || '', kgName: kgName };
        }
        renderReportTable(tbody, rows, memberMap);
      });
    }).catch(function () {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-weak);padding:24px 0;">신고 이력을 불러오지 못했습니다.</td></tr>';
    });
  }

  function renderReportTable(tbody, rows, memberMap) {
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var rpt = rows[i];
      var reporterInfo = memberMap[rpt.reporter_id] || {};
      // 신고자명: 보호자면 nickname, 유치원이면 kgName
      var reporterName = '';
      if (rpt.reporter_type === '유치원') {
        reporterName = reporterInfo.kgName || reporterInfo.nickname || '';
      } else {
        reporterName = reporterInfo.nickname || '';
      }
      var reporterBadge = api.autoBadge(rpt.reporter_type || '', { '보호자': 'brown', '유치원': 'pink' });
      var statusBadge = api.autoBadge(rpt.status || '', { '접수': 'orange', '처리중': 'blue', '처리완료': 'green', '기각': 'gray' });
      var shortId = String(rpt.id || '').substring(0, 8);
      var reportLink = '<a href="report-detail.html?id=' + encodeURIComponent(rpt.id || '') + '" class="mini-table__link">' + api.escapeHtml(shortId) + '</a>';

      html += '<tr>' +
        '<td>' + (api.formatDate(rpt.reported_at) || '—') + '</td>' +
        '<td>' + api.escapeHtml(reporterName) + '</td>' +
        '<td>' + reporterBadge + '</td>' +
        '<td>' + reportLink + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '</tr>';
    }
    tbody.innerHTML = html;
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

  /** 현재 신고 데이터 저장 (모달에서 prev_status 참조용) */
  var currentReport = null;

  /**
   * 신고접수 상세 로드
   * processed_by가 uuid FK → admin_accounts.id 이므로 admin:processed_by(id,name) 조인
   * reporter_id, reported_id → members FK 조인 (FK 각 1개씩, PGRST201 미발생)
   */
  async function loadReportDetail() {
    var id = api.getParam('id');
    if (!id) return;

    try {
      var result = await api.fetchDetail('reports', id,
        '*, reporter:reporter_id(name, nickname, phone), reported:reported_id(name, nickname, phone), admin:processed_by(id, name)');

      if (result.error || !result.data) {
        console.error('[chats] report detail fetch error:', result.error);
        return;
      }

      var r = result.data;
      currentReport = r;  // 모달에서 참조

      var reporterData = r.reporter || {};
      var reportedData = r.reported || {};
      var adminData = r.admin || {};

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

      // 영역 4: 관련 채팅방 (총 메시지 수 삭제)
      var chatInfo = document.getElementById('detailRptChat');
      if (chatInfo) {
        api.setHtml(chatInfo, [
          ['채팅방 번호', r.chat_room_id ? '<a href="chat-detail.html?id=' + r.chat_room_id + '" class="data-table__link">' + api.escapeHtml(String(r.chat_room_id).substring(0, 8)) + '</a>' : '—'],
          ['마지막 메시지 일시', '—']
        ]);
      }

      // 영역 5: 처리 내역
      var proc = document.getElementById('detailRptProc');
      if (proc) {
        api.setHtml(proc, [
          ['처리 상태', api.autoBadge(r.status || '', { '접수': 'orange', '처리중': 'blue', '처리완료': 'green', '기각': 'gray' })],
          ['제재 유형', r.sanction_type ? api.escapeHtml(r.sanction_type) : '—'],
          ['제재 시작일', r.sanction_start ? api.formatDate(r.sanction_start, true) : '—'],
          ['제재 종료일', r.sanction_end ? api.formatDate(r.sanction_end, true) : '—'],
          ['처리 사유', api.escapeHtml(r.process_reason || '') || '—'],
          ['처리 관리자', adminData.name ? api.escapeHtml(adminData.name) : '—']
        ]);
      }

      // 영역 5-2: 처리 이력 테이블 로드
      loadReportLogs(id);

    } catch (err) {
      console.error('[chats] report detail error:', err);
    }
  }

  /**
   * 처리 이력 테이블 로드 (report_logs)
   * processed_by가 uuid FK → admin_accounts.id 이므로 admin:processed_by(name) 조인
   * 6열: 변경일시 / 이전 상태 / 변경 상태 / 제재 유형 / 처리자 / 비고
   */
  function loadReportLogs(reportId) {
    var tableEl = document.getElementById('detailRptLog');
    if (!tableEl) return;
    var tbody = tableEl.querySelector('tbody');
    if (!tbody) return;

    api.fetchList('report_logs', {
      select: '*, admin:processed_by(name)',
      filters: [{ column: 'report_id', op: 'eq', value: reportId }],
      order: { column: 'created_at', ascending: true },
      page: 1, perPage: 100
    }).then(function (res) {
      var rows = res.data || [];
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-weak);padding:24px 0;">처리 이력이 없습니다.</td></tr>';
        return;
      }

      var html = '';
      for (var i = 0; i < rows.length; i++) {
        var log = rows[i];
        var prevBadge = log.prev_status ? api.autoBadge(log.prev_status, { '접수': 'orange', '처리중': 'blue', '처리완료': 'green', '기각': 'gray' }) : '—';
        var newBadge = api.autoBadge(log.new_status || '', { '접수': 'orange', '처리중': 'blue', '처리완료': 'green', '기각': 'gray' });
        var sanctionText = log.sanction_type ? api.escapeHtml(log.sanction_type) : '—';

        // 처리자: processed_by가 NULL이면 시스템, 있으면 admin.name
        var processor = '';
        if (log.processed_by === null) {
          processor = '<span class="badge badge--c-gray">시스템</span>';
        } else {
          var adminInfo = log.admin || {};
          processor = adminInfo.name ? api.escapeHtml(adminInfo.name) : '—';
        }

        html += '<tr>' +
          '<td>' + api.formatDate(log.created_at) + '</td>' +
          '<td>' + prevBadge + '</td>' +
          '<td>' + newBadge + '</td>' +
          '<td>' + sanctionText + '</td>' +
          '<td>' + processor + '</td>' +
          '<td>' + api.escapeHtml(log.note || '') + '</td>' +
          '</tr>';
      }
      tbody.innerHTML = html;
    }).catch(function (err) {
      console.error('[chats] report logs error:', err);
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-weak);padding:24px 0;">처리 이력을 불러오지 못했습니다.</td></tr>';
    });
  }

  function bindReportDetailModals() {
    // 처리상태 변경 모달
    var statusConfirm = document.querySelector('#statusChangeModal .modal__btn--confirm-primary');
    if (statusConfirm) {
      statusConfirm.addEventListener('click', async function () {
        var status = document.getElementById('statusSelect').value;
        if (!status) return;
        var statusMap = { 'processing': '처리중', 'completed': '처리완료' };
        var newStatus = statusMap[status] || status;
        var id = api.getParam('id');
        var admin = window.__auth ? window.__auth.getAdmin() : null;
        var adminId = admin ? admin.id : null;
        var prevStatus = (currentReport && currentReport.status) || '';

        try {
          await api.updateRecord('reports', id, {
            status: newStatus,
            processed_by: adminId,
            processed_at: new Date().toISOString()
          });
          // report_logs INSERT
          await api.insertRecord('report_logs', {
            report_id: id,
            prev_status: prevStatus,
            new_status: newStatus,
            processed_by: adminId,
            sanction_type: null,
            note: '상태 변경: ' + newStatus
          });
          // audit_logs (기존 유지)
          api.insertAuditLog('처리상태변경', 'reports', id, { status: newStatus });
          location.reload();
        } catch (err) {
          console.error('[chats] status change error:', err);
          alert('처리상태 변경 중 오류가 발생했습니다.');
        }
      });
    }

    // 제재 적용 모달
    var sanctionBtn = document.getElementById('sanctionBtn');
    if (sanctionBtn) {
      sanctionBtn.addEventListener('click', async function () {
        var type = document.getElementById('sanctionType').value;
        var reason = document.getElementById('sanctionReason').value;
        if (!type || !reason) return;
        var typeMap = { 'warning': '경고', '7d': '7일 이용정지', '30d': '30일 이용정지', 'permanent': '영구정지' };
        var id = api.getParam('id');
        var admin = window.__auth ? window.__auth.getAdmin() : null;
        var adminId = admin ? admin.id : null;
        var prevStatus = (currentReport && currentReport.status) || '';

        try {
          await api.updateRecord('reports', id, {
            status: '처리완료',
            sanction_type: typeMap[type] || type,
            process_reason: reason,
            processed_by: adminId,
            processed_at: new Date().toISOString()
          });
          // report_logs INSERT (제재 유형 포함)
          await api.insertRecord('report_logs', {
            report_id: id,
            prev_status: prevStatus,
            new_status: '처리완료',
            processed_by: adminId,
            sanction_type: typeMap[type] || type,
            note: reason
          });
          // audit_logs (기존 유지)
          api.insertAuditLog('제재적용', 'reports', id, { type: typeMap[type] || type, reason: reason });
          location.reload();
        } catch (err) {
          console.error('[chats] sanction apply error:', err);
          alert('제재 적용 중 오류가 발생했습니다.');
        }
      });
    }

    // 기각 처리 모달
    var dismissBtn = document.getElementById('dismissBtn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', async function () {
        var reason = document.getElementById('dismissReason').value;
        if (!reason) return;
        var id = api.getParam('id');
        var admin = window.__auth ? window.__auth.getAdmin() : null;
        var adminId = admin ? admin.id : null;
        var prevStatus = (currentReport && currentReport.status) || '';

        try {
          await api.updateRecord('reports', id, {
            status: '기각',
            process_reason: reason,
            processed_by: adminId,
            processed_at: new Date().toISOString()
          });
          // report_logs INSERT
          await api.insertRecord('report_logs', {
            report_id: id,
            prev_status: prevStatus,
            new_status: '기각',
            processed_by: adminId,
            sanction_type: null,
            note: reason
          });
          // audit_logs (기존 유지)
          api.insertAuditLog('기각처리', 'reports', id, { reason: reason });
          location.reload();
        } catch (err) {
          console.error('[chats] dismiss error:', err);
          alert('기각 처리 중 오류가 발생했습니다.');
        }
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
