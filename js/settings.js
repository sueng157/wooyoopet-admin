/**
 * 우유펫 관리자 대시보드 — 설정 (settings.js)
 *
 * 목록 (settings.html — 3 tabs: 앱설정/관리자계정/의견피드백)
 * + 관리자 상세/등록 + 피드백 상세
 * 의존: api.js, auth.js, common.js, components.js
 *
 * NOTE: 기존 UI 인터랙션(자동처리 규칙 동적 추가/삭제)은 이 파일에서 통합 관리합니다.
 */
(function () {
  'use strict';

  var api = window.__api;
  var auth = window.__auth;
  if (!api || !auth) return;

  var PERM_KEY = 'perm_settings';
  var PER_PAGE = 20;

  // ══════════════════════════════════════════
  // A. 목록 페이지 (settings.html)
  // ══════════════════════════════════════════

  function isListPage() {
    return !!document.getElementById('adminListBody');
  }

  var adminBody, feedbackBody;
  var adminCount, feedbackCount;
  var aPage = 1, fbPage = 1;
  // 앱 설정 이력 tbodies
  var maintenanceLogBody, feeLogBody, refundLogBody, noshowLogBody;

  function cacheListDom() {
    adminBody = document.getElementById('adminListBody');
    feedbackBody = document.getElementById('feedbackListBody');
    maintenanceLogBody = document.getElementById('maintenanceLogBody');
    feeLogBody = document.getElementById('feeLogBody');
    refundLogBody = document.getElementById('refundLogBody');
    noshowLogBody = document.getElementById('noshowLogBody');

    var tab2 = document.getElementById('tab-admin');
    if (tab2) adminCount = tab2.querySelector('.result-header__count strong');
    var tab3 = document.getElementById('tab-feedback');
    if (tab3) feedbackCount = tab3.querySelector('.result-header__count strong');
  }

  // ── 앱 설정 이력 로드 ──
  async function loadSettingLogs() {
    var categories = [
      { body: maintenanceLogBody, cat: '서비스 점검', cols: 4 },
      { body: feeLogBody, cat: '수수료 설정', cols: 4 },
      { body: refundLogBody, cat: '환불 규정 설정', cols: 4 },
      { body: noshowLogBody, cat: '노쇼 제재 설정', cols: 4 }
    ];

    for (var c = 0; c < categories.length; c++) {
      var cfg = categories[c];
      if (!cfg.body) continue;
      api.showTableLoading(cfg.body, cfg.cols);

      var result = await api.fetchList('setting_change_logs', {
        filters: [{ column: 'category', op: 'eq', value: cfg.cat }],
        orderBy: 'created_at',
        ascending: false,
        perPage: 50
      });

      if (result.error || !result.data.length) {
        api.showTableEmpty(cfg.body, cfg.cols, '변경 이력이 없습니다.');
        continue;
      }

      var html = '';
      for (var i = 0; i < result.data.length; i++) {
        var log = result.data[i];
        html += '<tr>' +
          '<td>' + api.formatDate(log.created_at) + '</td>' +
          '<td>' + api.escapeHtml(log.prev_value || '') + '</td>' +
          '<td>' + api.escapeHtml(log.new_value || '') + '</td>' +
          '<td>' + api.escapeHtml(log.change_reason || '') + '</td>' +
          '</tr>';
      }
      cfg.body.innerHTML = html;
    }
  }

  // ── 앱 설정 저장 모달 ──
  function bindAppSettingModals() {
    var modals = ['saveVersionModal', 'saveMaintenanceModal', 'saveFeeModal', 'saveRefundModal', 'saveNoshowModal', 'saveAutoModal'];
    for (var i = 0; i < modals.length; i++) {
      var modal = document.getElementById(modals[i]);
      if (!modal) continue;
      var btn = modal.querySelector('.modal__btn--confirm-primary');
      if (btn) {
        (function (modalId) {
          btn.addEventListener('click', async function () {
            await api.insertAuditLog('앱설정변경', 'settings', null, { modal: modalId });
            alert('설정이 저장되었습니다.');
            var overlay = document.getElementById(modalId);
            if (overlay) overlay.classList.remove('modal-overlay--active');
            location.reload();
          });
        })(modals[i]);
      }
    }
  }

  // ── 관리자 계정 목록 ──
  async function loadAdminList() {
    if (!adminBody) return;
    api.showTableLoading(adminBody, 10);

    var tab = document.getElementById('tab-admin');
    var filters = [];
    if (tab) {
      var sels = tab.querySelectorAll('.filter-select');
      if (sels[0]) {
        var role = sels[0].value;
        if (role && !role.includes('전체') && !role.includes(':')) filters.push({ column: 'role', op: 'eq', value: role });
      }
      if (sels[1]) {
        var status = sels[1].value;
        if (status && !status.includes('전체') && !status.includes(':')) filters.push({ column: 'status', op: 'eq', value: status });
      }
    }

    var result = await api.fetchList('admin_accounts', {
      filters: filters,
      orderBy: 'created_at',
      page: aPage,
      perPage: PER_PAGE
    });

    if (result.error) { api.showTableEmpty(adminBody, 10, '데이터 로드 실패'); return; }
    if (adminCount) adminCount.textContent = api.formatNumber(result.count);
    if (!result.data.length) { api.showTableEmpty(adminBody, 10); return; }

    var html = '';
    var start = (aPage - 1) * PER_PAGE;
    for (var i = 0; i < result.data.length; i++) {
      var a = result.data[i];
      html += '<tr>' +
        '<td>' + (start + i + 1) + '</td>' +
        '<td>' + api.escapeHtml(a.admin_login_id || '') + '</td>' +
        '<td>' + api.escapeHtml(a.name || '') + '</td>' +
        '<td>' + api.maskPhone(a.phone) + '</td>' +
        '<td>' + api.escapeHtml(a.email || '') + '</td>' +
        '<td>' + api.autoBadge(a.role) + '</td>' +
        '<td>' + api.autoBadge(a.status) + '</td>' +
        '<td>' + api.formatDate(a.last_login_at) + '</td>' +
        '<td>' + api.formatDate(a.created_at) + '</td>' +
        '<td>' + api.renderDetailLink('setting-admin-detail.html', a.id) + '</td>' +
        '</tr>';
    }
    adminBody.innerHTML = html;

    var pagination = tab ? tab.querySelector('.pagination') : null;
    if (pagination) api.renderPagination(pagination, aPage, result.count, PER_PAGE, function (p) { aPage = p; loadAdminList(); });
  }

  // ── 의견/피드백 목록 ──
  async function loadFeedbackList() {
    if (!feedbackBody) return;
    api.showTableLoading(feedbackBody, 9);

    var tab = document.getElementById('tab-feedback');
    var filters = [];
    if (tab) {
      var sels = tab.querySelectorAll('.filter-select');
      if (sels[0]) {
        var type = sels[0].value;
        if (type && !type.includes('전체') && !type.includes(':')) filters.push({ column: 'feedback_type', op: 'eq', value: type });
      }
      if (sels[1]) {
        var confirmed = sels[1].value;
        if (confirmed === '확인') filters.push({ column: 'is_confirmed', op: 'eq', value: true });
        if (confirmed === '미확인') filters.push({ column: 'is_confirmed', op: 'eq', value: false });
      }
    }

    var result = await api.fetchList('feedbacks', {
      filters: filters,
      orderBy: 'created_at',
      page: fbPage,
      perPage: PER_PAGE
    });

    if (result.error) { api.showTableEmpty(feedbackBody, 9, '데이터 로드 실패'); return; }
    if (feedbackCount) feedbackCount.textContent = api.formatNumber(result.count);
    if (!result.data.length) { api.showTableEmpty(feedbackBody, 9); return; }

    var html = '';
    var start = (fbPage - 1) * PER_PAGE;
    for (var i = 0; i < result.data.length; i++) {
      var f = result.data[i];
      html += '<tr>' +
        '<td>' + (start + i + 1) + '</td>' +
        '<td>' + api.autoBadge(f.feedback_type) + '</td>' +
        '<td>' + api.escapeHtml(f.writer_name || '') + '</td>' +
        '<td>' + api.escapeHtml(f.writer_nickname || '') + '</td>' +
        '<td>' + api.autoBadge(f.writer_type || '') + '</td>' +
        '<td>' + api.escapeHtml((f.title || f.content || '').substring(0, 30)) + '</td>' +
        '<td>' + api.formatDate(f.written_at || f.created_at) + '</td>' +
        '<td>' + (f.is_confirmed ? '<span style="color:var(--success)">확인</span>' : '<span style="color:var(--text-weak)">미확인</span>') + '</td>' +
        '<td>' + api.renderDetailLink('setting-feedback-detail.html', f.id) + '</td>' +
        '</tr>';
    }
    feedbackBody.innerHTML = html;

    var pagination = tab ? tab.querySelector('.pagination') : null;
    if (pagination) api.renderPagination(pagination, fbPage, result.count, PER_PAGE, function (p) { fbPage = p; loadFeedbackList(); });
  }

  function bindListEvents() {
    var tab2 = document.getElementById('tab-admin');
    if (tab2) {
      var btn2 = tab2.querySelector('.btn-search');
      if (btn2) btn2.addEventListener('click', function () { aPage = 1; loadAdminList(); });
    }
    var tab3 = document.getElementById('tab-feedback');
    if (tab3) {
      var btn3 = tab3.querySelector('.btn-search');
      if (btn3) btn3.addEventListener('click', function () { fbPage = 1; loadFeedbackList(); });
    }
  }

  function initList() {
    cacheListDom();
    bindListEvents();
    bindAppSettingModals();
    bindAutoRuleUI();
    api.hideIfReadOnly(PERM_KEY, ['.btn-action', '.btn-add-new']);
    loadSettingLogs();
    loadAdminList();
    loadFeedbackList();
  }

  // ══════════════════════════════════════════
  // B. 관리자 상세 (setting-admin-detail.html)
  // ══════════════════════════════════════════

  function isAdminDetailPage() {
    return !!document.getElementById('detailAdminBasic');
  }

  async function loadAdminDetail() {
    var id = api.getParam('id');
    if (!id) return;

    var result = await api.fetchDetail('admin_accounts', id);
    if (result.error || !result.data) { alert('관리자 정보를 불러올 수 없습니다.'); return; }
    var d = result.data;

    var basicEl = document.getElementById('detailAdminBasic');
    if (basicEl) {
      api.setHtml(basicEl, '<div class="info-grid">' +
        '<span class="info-grid__label">로그인 ID</span><span class="info-grid__value">' + api.escapeHtml(d.admin_login_id || '') + '</span>' +
        '<span class="info-grid__label">이름</span><span class="info-grid__value">' + api.escapeHtml(d.name || '') + '</span>' +
        '<span class="info-grid__label">연락처</span><span class="info-grid__value"><span class="masked-field">' + api.renderMaskedField(api.maskPhone(d.phone), api.formatPhone(d.phone), 'admin_accounts', id, 'phone') + '</span></span>' +
        '<span class="info-grid__label">이메일</span><span class="info-grid__value">' + api.escapeHtml(d.email || '') + '</span>' +
        '<span class="info-grid__label">역할</span><span class="info-grid__value">' + api.autoBadge(d.role) + '</span>' +
        '<span class="info-grid__label">상태</span><span class="info-grid__value">' + api.autoBadge(d.status) + '</span>' +
        '<span class="info-grid__label">마지막 로그인</span><span class="info-grid__value">' + api.formatDate(d.last_login_at) + '</span>' +
        '<span class="info-grid__label">등록일시</span><span class="info-grid__value">' + api.formatDate(d.created_at) + '</span>' +
        '</div>');
    }

    // 권한 정보
    var permEl = document.getElementById('detailAdminPerm');
    if (permEl) {
      var permKeys = ['perm_members', 'perm_kindergartens', 'perm_pets', 'perm_reservations', 'perm_payments', 'perm_settlements', 'perm_chats', 'perm_reviews', 'perm_educations', 'perm_contents', 'perm_settings'];
      var permLabels = ['회원관리', '유치원관리', '반려동물관리', '돌봄예약관리', '결제관리', '정산관리', '채팅관리', '후기관리', '교육관리', '콘텐츠관리', '설정'];
      var html = '<div class="info-grid">';
      for (var i = 0; i < permKeys.length; i++) {
        html += '<span class="info-grid__label">' + permLabels[i] + '</span><span class="info-grid__value">' + api.escapeHtml(d[permKeys[i]] || '-') + '</span>';
      }
      html += '</div>';
      api.setHtml(permEl, html);
    }

    // 모달: 저장, 비밀번호 초기화, 비활성화, 삭제
    var saveBtn = document.querySelector('#saveAdminModal .modal__btn--confirm-primary');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        await api.insertAuditLog('관리자수정', 'admin_accounts', id, {});
        alert('저장되었습니다.');
        location.reload();
      });
    }

    var resetPwBtn = document.querySelector('#resetPwModal .modal__btn--confirm-warning, #resetPwModal .modal__btn--confirm-primary');
    if (resetPwBtn) {
      resetPwBtn.addEventListener('click', async function () {
        await api.insertAuditLog('비밀번호초기화', 'admin_accounts', id, {});
        alert('비밀번호가 초기화되었습니다.');
        location.reload();
      });
    }

    var deactivateBtn = document.querySelector('#deactivateModal .modal__btn--delete, #deactivateModal .modal__btn--confirm-danger');
    if (deactivateBtn) {
      deactivateBtn.addEventListener('click', async function () {
        await api.updateRecord('admin_accounts', id, { status: '비활성' });
        await api.insertAuditLog('관리자비활성화', 'admin_accounts', id, {});
        alert('비활성화되었습니다.');
        location.reload();
      });
    }

    var deleteBtn = document.querySelector('#deleteModal .modal__btn--delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async function () {
        await api.deleteRecord('admin_accounts', id);
        await api.insertAuditLog('관리자삭제', 'admin_accounts', id, {});
        alert('삭제되었습니다.');
        location.href = 'settings.html';
      });
    }

    api.hideIfReadOnly(PERM_KEY, ['.btn-action', '.detail-actions']);
  }

  // ══════════════════════════════════════════
  // C. 관리자 등록 (setting-admin-create.html)
  // ══════════════════════════════════════════

  function isAdminCreatePage() {
    return !!document.getElementById('detailAdminCreate');
  }

  function bindAdminCreate() {
    var registerBtn = document.querySelector('#registerModal .modal__btn--confirm-primary');
    if (registerBtn) {
      registerBtn.addEventListener('click', async function () {
        await api.insertAuditLog('관리자등록', 'admin_accounts', null, {});
        alert('관리자가 등록되었습니다.');
        location.href = 'settings.html';
      });
    }
  }

  // ══════════════════════════════════════════
  // D. 피드백 상세 (setting-feedback-detail.html)
  // ══════════════════════════════════════════

  function isFeedbackDetailPage() {
    return !!document.getElementById('detailFeedbackBasic');
  }

  async function loadFeedbackDetail() {
    var id = api.getParam('id');
    if (!id) return;

    var result = await api.fetchDetail('feedbacks', id);
    if (result.error || !result.data) { alert('피드백을 불러올 수 없습니다.'); return; }
    var d = result.data;

    var basicEl = document.getElementById('detailFeedbackBasic');
    if (basicEl) {
      var html = '<div class="info-grid">' +
        '<span class="info-grid__label">유형</span><span class="info-grid__value">' + api.autoBadge(d.feedback_type) + '</span>' +
        '<span class="info-grid__label">작성자 이름</span><span class="info-grid__value">' + api.escapeHtml(d.writer_name || '') + '</span>' +
        '<span class="info-grid__label">작성자 닉네임</span><span class="info-grid__value">' + api.escapeHtml(d.writer_nickname || '') + '</span>' +
        '<span class="info-grid__label">작성자 유형</span><span class="info-grid__value">' + api.autoBadge(d.writer_type || '') + '</span>' +
        '<span class="info-grid__label">연락처</span><span class="info-grid__value"><span class="masked-field">' + api.renderMaskedField(api.maskPhone(d.writer_phone), api.formatPhone(d.writer_phone), 'feedbacks', id, 'phone') + '</span></span>' +
        '<span class="info-grid__label">작성일시</span><span class="info-grid__value">' + api.formatDate(d.written_at || d.created_at) + '</span>' +
        '<span class="info-grid__label">확인 여부</span><span class="info-grid__value">' + (d.is_confirmed ? '<span style="color:var(--success)">확인완료</span> (' + api.formatDate(d.confirmed_at) + ')' : '<span style="color:var(--text-weak)">미확인</span>') + '</span>' +
        '</div>';
      api.setHtml(basicEl, html);
    }

    var contentEl = document.getElementById('detailFeedbackContent');
    if (contentEl) {
      var cHtml = '<div class="info-grid">';
      if (d.title) cHtml += '<span class="info-grid__label">제목</span><span class="info-grid__value">' + api.escapeHtml(d.title) + '</span>';
      cHtml += '<span class="info-grid__label">내용</span><span class="info-grid__value"><div style="white-space:pre-wrap;">' + api.escapeHtml(d.content || '') + '</div></span>';
      if (d.feedback_type === '탈퇴사유') {
        cHtml += '<span class="info-grid__label">탈퇴 카테고리</span><span class="info-grid__value">' + api.escapeHtml(d.withdrawal_category || '-') + '</span>';
        cHtml += '<span class="info-grid__label">탈퇴 상세</span><span class="info-grid__value">' + api.escapeHtml(d.withdrawal_detail || '-') + '</span>';
        cHtml += '<span class="info-grid__label">탈퇴일시</span><span class="info-grid__value">' + api.formatDate(d.withdrawn_at) + '</span>';
      }
      if (d.admin_memo) cHtml += '<span class="info-grid__label">관리자 메모</span><span class="info-grid__value">' + api.escapeHtml(d.admin_memo) + '</span>';
      cHtml += '</div>';
      api.setHtml(contentEl, cHtml);
    }

    // 확인 처리 모달
    var confirmBtn = document.querySelector('#confirmModal .modal__btn--confirm-primary');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async function () {
        await api.updateRecord('feedbacks', id, { is_confirmed: true, confirmed_at: new Date().toISOString() });
        await api.insertAuditLog('피드백확인', 'feedbacks', id, {});
        alert('확인 처리되었습니다.');
        location.reload();
      });
    }

    // 메모 저장 모달
    var memoBtn = document.querySelector('#saveMemoModal .modal__btn--confirm-primary');
    if (memoBtn) {
      memoBtn.addEventListener('click', async function () {
        var memoTextarea = document.querySelector('#saveMemoModal textarea');
        var memo = memoTextarea ? memoTextarea.value.trim() : '';
        await api.updateRecord('feedbacks', id, { admin_memo: memo });
        await api.insertAuditLog('피드백메모', 'feedbacks', id, { memo: memo });
        alert('메모가 저장되었습니다.');
        location.reload();
      });
    }

    api.hideIfReadOnly(PERM_KEY, ['.btn-action', '.detail-actions']);
  }

  // ══════════════════════════════════════════
  // E. 기존 UI — 자동 처리 규칙 동적 추가/삭제
  // ══════════════════════════════════════════

  function bindAutoRuleUI() {
    var ruleCounter = 0;

    document.addEventListener('click', function (e) {
      // 규칙 추가 버튼
      if (e.target.closest('#addAutoRuleBtn')) {
        ruleCounter++;
        var card = e.target.closest('.detail-card');
        if (!card) return;
        var grid = card.querySelector('.info-grid');
        if (!grid) return;

        var label = document.createElement('span');
        label.className = 'info-grid__label';
        label.innerHTML = '추가 규칙 ' + ruleCounter +
          ' <button class="stg-rule-delete" style="margin-left:4px;font-size:11px;color:var(--danger);background:none;border:none;cursor:pointer;">삭제</button>';

        var value = document.createElement('span');
        value.className = 'info-grid__value';
        value.innerHTML =
          '<div class="stg-input-group">' +
            '<input type="text" class="form-input" style="width:200px;" placeholder="규칙 조건을 입력하세요">' +
            '<input type="number" class="form-input form-input--xs" placeholder="값" min="1">' +
            '<span class="stg-input-suffix">시간</span>' +
          '</div>' +
          '<div class="stg-hint">\u203B 새로 추가된 자동 처리 규칙</div>';

        grid.appendChild(label);
        grid.appendChild(value);
        return;
      }

      // 규칙 삭제 버튼
      if (e.target.closest('.stg-rule-delete')) {
        var deleteBtn = e.target.closest('.stg-rule-delete');
        var labelEl = deleteBtn.closest('.info-grid__label');
        if (!labelEl) return;
        var valueEl = labelEl.nextElementSibling;
        if (valueEl && valueEl.classList.contains('info-grid__value')) valueEl.remove();
        labelEl.remove();
        return;
      }
    });
  }

  // ══════════════════════════════════════════
  // 초기화
  // ══════════════════════════════════════════

  document.addEventListener('DOMContentLoaded', function () {
    if (isListPage()) initList();
    else if (isAdminDetailPage()) loadAdminDetail();
    else if (isAdminCreatePage()) bindAdminCreate();
    else if (isFeedbackDetailPage()) loadFeedbackDetail();
    else {
      // settings pages that aren't the list page but are on settings.html sub-pages
      bindAutoRuleUI();
    }
  });

})();
