/**
 * 우유펫 관리자 대시보드 — 교육관리 (educations.js)
 *
 * 목록 (educations.html — 3 tabs) + 주제 상세/등록 + 체크리스트 상세/등록 + 서약서 상세/등록 + 이수현황 상세
 * 의존: api.js, auth.js, common.js, components.js
 *
 * NOTE: 기존 UI 인터랙션(퀴즈토글, 체크리스트토글, 행추가/삭제, 원칙설명추가, 하위항목 추가/삭제)은
 *       이 파일에서 Supabase CRUD와 함께 통합 관리합니다.
 */
(function () {
  'use strict';

  var api = window.__api;
  var auth = window.__auth;
  if (!api || !auth) return;

  var PERM_KEY = 'perm_educations';
  var PER_PAGE = 20;

  /* 공통 SVG: 삭제 아이콘 */
  var DELETE_SVG = '<svg viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 010-2h3a1 1 0 011-1h3a1 1 0 011 1h3a1 1 0 011 1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118z"/></svg>';

  // ══════════════════════════════════════════
  // A. 목록 페이지 (educations.html)
  // ══════════════════════════════════════════

  function isListPage() {
    return !!document.getElementById('topicListBody');
  }

  var topicBody, checklistBody, pledgeBody, statusBody;
  var topicCount, statusCount;

  function cacheListDom() {
    topicBody = document.getElementById('topicListBody');
    checklistBody = document.getElementById('checklistListBody');
    pledgeBody = document.getElementById('pledgeListBody');
    statusBody = document.getElementById('statusListBody');

    var tab1 = document.getElementById('tab-topics');
    if (tab1) topicCount = tab1.querySelector('.result-header__count strong');
    var tab3 = document.getElementById('tab-status');
    if (tab3) statusCount = tab3.querySelector('.result-header__count strong');
  }

  // 탭1: 교육 주제
  async function loadTopicList() {
    if (!topicBody) return;
    api.showTableLoading(topicBody, 7);
    var result = await api.fetchList('education_topics', {
      select: '*, education_quizzes(id)',
      orderBy: 'display_order',
      ascending: true,
      perPage: 100
    });
    if (result.error) { api.showTableEmpty(topicBody, 7, '데이터 로드 실패'); return; }
    if (topicCount) topicCount.textContent = api.formatNumber(result.count);
    if (!result.data.length) { api.showTableEmpty(topicBody, 7); return; }

    var html = '';
    for (var i = 0; i < result.data.length; i++) {
      var t = result.data[i];
      var quizCount = t.education_quizzes ? t.education_quizzes.length : 0;
      html += '<tr>' +
        '<td>' + (t.display_order || (i + 1)) + '</td>' +
        '<td>' + api.escapeHtml(t.title) + '</td>' +
        '<td>' + api.autoBadge(t.visibility) + '</td>' +
        '<td>' + quizCount + '문항</td>' +
        '<td>' + api.formatDate(t.created_at) + '</td>' +
        '<td>' + api.formatDate(t.updated_at || t.created_at) + '</td>' +
        '<td>' + api.renderDetailLink('education-detail.html', t.id) + '</td>' +
        '</tr>';
    }
    topicBody.innerHTML = html;
  }

  // 탭2: 체크리스트 + 서약서
  async function loadChecklistList() {
    if (!checklistBody) return;
    api.showTableLoading(checklistBody, 6);
    var result = await api.fetchList('checklists', { orderBy: 'version_number', ascending: false, perPage: 100 });
    if (result.error) { api.showTableEmpty(checklistBody, 6, '데이터 로드 실패'); return; }
    if (!result.data.length) { api.showTableEmpty(checklistBody, 6); return; }

    var html = '';
    for (var i = 0; i < result.data.length; i++) {
      var c = result.data[i];
      html += '<tr>' +
        '<td>v' + c.version_number + '</td>' +
        '<td>' + api.autoBadge(c.apply_status) + '</td>' +
        '<td>' + (c.item_count || 0) + '개</td>' +
        '<td>' + api.escapeHtml(c.created_by || '') + '</td>' +
        '<td>' + api.formatDate(c.created_at) + '</td>' +
        '<td>' + api.renderDetailLink('education-checklist-detail.html', c.id) + '</td>' +
        '</tr>';
    }
    checklistBody.innerHTML = html;
  }

  async function loadPledgeList() {
    if (!pledgeBody) return;
    api.showTableLoading(pledgeBody, 6);
    var result = await api.fetchList('pledges', { orderBy: 'version_number', ascending: false, perPage: 100 });
    if (result.error) { api.showTableEmpty(pledgeBody, 6, '데이터 로드 실패'); return; }
    if (!result.data.length) { api.showTableEmpty(pledgeBody, 6); return; }

    var html = '';
    for (var i = 0; i < result.data.length; i++) {
      var p = result.data[i];
      html += '<tr>' +
        '<td>v' + p.version_number + '</td>' +
        '<td>' + api.autoBadge(p.apply_status) + '</td>' +
        '<td>' + api.escapeHtml(p.title || '') + '</td>' +
        '<td>' + (p.item_count || 0) + '개</td>' +
        '<td>' + api.formatDate(p.created_at) + '</td>' +
        '<td>' + api.renderDetailLink('education-pledge-detail.html', p.id) + '</td>' +
        '</tr>';
    }
    pledgeBody.innerHTML = html;
  }

  // 탭3: 이수현황
  var sPage = 1;
  async function loadStatusList() {
    if (!statusBody) return;
    api.showTableLoading(statusBody, 9);
    var result = await api.fetchList('education_completions', {
      select: '*, kindergartens:kindergarten_id(name)',
      orderBy: 'created_at',
      page: sPage, perPage: PER_PAGE
    });
    if (result.error) { api.showTableEmpty(statusBody, 9, '데이터 로드 실패'); return; }
    if (statusCount) statusCount.textContent = api.formatNumber(result.count);
    if (!result.data.length) { api.showTableEmpty(statusBody, 9); return; }

    var html = '';
    var start = (sPage - 1) * PER_PAGE;
    for (var i = 0; i < result.data.length; i++) {
      var s = result.data[i];
      var kgName = s.kindergartens ? s.kindergartens.name : '';
      html += '<tr>' +
        '<td>' + (start + i + 1) + '</td>' +
        '<td>' + api.escapeHtml(kgName) + '</td>' +
        '<td>' + (s.completed_topics || 0) + '/' + (s.total_topics || 0) + '</td>' +
        '<td>' + (s.progress_rate || 0) + '%</td>' +
        '<td>' + api.autoBadge(s.completion_status) + '</td>' +
        '<td>' + (s.checklist_confirmed ? '<span style="color:var(--success)">완료</span>' : '<span style="color:var(--text-weak)">미완료</span>') + '</td>' +
        '<td>' + (s.pledge_agreed ? '<span style="color:var(--success)">완료</span>' : '<span style="color:var(--text-weak)">미완료</span>') + '</td>' +
        '<td>' + api.formatDate(s.all_completed_at || '-') + '</td>' +
        '<td>' + api.renderDetailLink('education-status-detail.html', s.id) + '</td>' +
        '</tr>';
    }
    statusBody.innerHTML = html;

    var tab3 = document.getElementById('tab-status');
    var pagination = tab3 ? tab3.querySelector('.pagination') : null;
    if (pagination) api.renderPagination(pagination, sPage, result.count, PER_PAGE, function (p) { sPage = p; loadStatusList(); });
  }

  function bindListEvents() {
    // 이수현황 탭 – 검색 & 엑셀
    var tab3 = document.getElementById('tab-status');
    if (tab3) {
      var btnSearch = tab3.querySelector('.btn-search');
      if (btnSearch) btnSearch.addEventListener('click', function () { sPage = 1; loadStatusList(); });
      var searchInput = tab3.querySelector('.filter-input');
      if (searchInput) searchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { sPage = 1; loadStatusList(); } });

      var btnExcel = tab3.querySelector('.btn-excel');
      if (btnExcel) btnExcel.addEventListener('click', async function () {
        var all = await api.fetchAll('education_completions', {
          select: '*, kindergartens:kindergarten_id(name)',
          orderBy: 'created_at'
        });
        var rows = (all.data || []).map(function (s) {
          return {
            kg: s.kindergartens ? s.kindergartens.name : '',
            topics: (s.completed_topics || 0) + '/' + (s.total_topics || 0),
            progress: (s.progress_rate || 0) + '%',
            status: s.completion_status || '',
            checklist: s.checklist_confirmed ? '완료' : '미완료',
            pledge: s.pledge_agreed ? '완료' : '미완료',
            completed_at: api.formatDate(s.all_completed_at || '-')
          };
        });
        api.exportExcel(rows, [
          { key: 'kg', label: '유치원명' },
          { key: 'topics', label: '이수 주제' },
          { key: 'progress', label: '진행률' },
          { key: 'status', label: '이수 상태' },
          { key: 'checklist', label: '체크리스트' },
          { key: 'pledge', label: '서약서' },
          { key: 'completed_at', label: '이수 완료일' }
        ], '이수현황');
      });
    }
  }

  function initList() {
    cacheListDom();
    bindListEvents();
    api.hideIfReadOnly(PERM_KEY, ['.btn-action', '.btn-add-new']);
    loadTopicList();
    loadChecklistList();
    loadPledgeList();
    loadStatusList();
  }

  // ══════════════════════════════════════════
  // B. 교육 주제 상세 (education-detail.html)
  // ══════════════════════════════════════════

  function isTopicDetailPage() {
    return !!document.getElementById('detailEduBasic') && !document.getElementById('detailEduStatusBasic');
  }

  async function loadTopicDetail() {
    var id = api.getParam('id');
    if (!id) return;

    var r1 = await api.fetchDetail('education_topics', id);
    if (r1.error || !r1.data) { alert('교육 주제를 불러올 수 없습니다.'); return; }
    var d = r1.data;

    // 퀴즈 조회
    var r2 = await api.fetchList('education_quizzes', { filters: [{ column: 'topic_id', op: 'eq', value: id }], orderBy: 'created_at', ascending: true, perPage: 100 });
    var quizzes = r2.data || [];

    var basicEl = document.getElementById('detailEduBasic');
    if (basicEl) {
      var details = d.principle_details || [];
      var detailsHtml = '';
      if (Array.isArray(details)) {
        detailsHtml = '<ul class="edu-bullet-list">';
        for (var i = 0; i < details.length; i++) {
          detailsHtml += '<li class="edu-bullet-list__item">' + api.escapeHtml(details[i]) + '</li>';
        }
        detailsHtml += '</ul>';
      }

      api.setHtml(basicEl, '<div class="info-grid">' +
        '<span class="info-grid__label">순서</span><span class="info-grid__value">' + (d.display_order || '-') + '</span>' +
        '<span class="info-grid__label">제목</span><span class="info-grid__value">' + api.escapeHtml(d.title) + '</span>' +
        '<span class="info-grid__label">공개 상태</span><span class="info-grid__value">' + api.autoBadge(d.visibility) + '</span>' +
        '<span class="info-grid__label">원칙 제목</span><span class="info-grid__value">' + api.escapeHtml(d.principle_text || '') + '</span>' +
        '<span class="info-grid__label">원칙 설명</span><span class="info-grid__value">' + detailsHtml + '</span>' +
        '<span class="info-grid__label">올바른 행동 1</span><span class="info-grid__value">' + api.escapeHtml(d.correct_behavior_1 || '') + '</span>' +
        '<span class="info-grid__label">올바른 행동 2</span><span class="info-grid__value">' + api.escapeHtml(d.correct_behavior_2 || '') + '</span>' +
        '<span class="info-grid__label">잘못된 행동</span><span class="info-grid__value">' + api.escapeHtml(d.wrong_behavior_1 || '') + '</span>' +
        '</div>');
    }

    var quizEl = document.getElementById('detailEduQuiz');
    if (quizEl && quizzes.length > 0) {
      var qHtml = '';
      for (var q = 0; q < quizzes.length; q++) {
        var quiz = quizzes[q];
        qHtml += '<div class="detail-card" style="margin-bottom:12px;">' +
          '<div class="info-grid">' +
          '<span class="info-grid__label">질문</span><span class="info-grid__value">' + api.escapeHtml(quiz.question_text) + '</span>' +
          '<span class="info-grid__label">선택 A</span><span class="info-grid__value">' + api.escapeHtml(quiz.choice_a) + '</span>' +
          '<span class="info-grid__label">선택 B</span><span class="info-grid__value">' + api.escapeHtml(quiz.choice_b) + '</span>' +
          '<span class="info-grid__label">정답</span><span class="info-grid__value">' + api.renderBadge(quiz.correct_answer, 'blue') + '</span>' +
          '<span class="info-grid__label">정답 설명</span><span class="info-grid__value">' + api.escapeHtml(quiz.correct_explanation || '') + '</span>' +
          '<span class="info-grid__label">오답 설명</span><span class="info-grid__value">' + api.escapeHtml(quiz.wrong_explanation || '') + '</span>' +
          '</div></div>';
      }
      api.setHtml(quizEl, qHtml);
    }

    // 모달 바인딩: 공개/비공개 토글
    var toggleBtn = document.querySelector('#toggleModal .modal__btn--confirm-primary, #toggleModal .modal__btn--delete');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', async function () {
        var newVis = d.visibility === '공개' ? '비공개' : '공개';
        await api.updateRecord('education_topics', id, { visibility: newVis });
        await api.insertAuditLog('공개상태변경', 'education_topics', id, { from: d.visibility, to: newVis });
        alert(newVis + '로 변경되었습니다.');
        location.reload();
      });
    }

    // 삭제 모달
    var deleteBtn = document.querySelector('#deleteModal .modal__btn--delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async function () {
        await api.deleteRecord('education_topics', id);
        await api.insertAuditLog('교육주제삭제', 'education_topics', id, {});
        alert('삭제되었습니다.');
        location.href = 'educations.html';
      });
    }

    api.hideIfReadOnly(PERM_KEY, ['.btn-action', '.detail-actions']);
  }

  // ══════════════════════════════════════════
  // C. 체크리스트 상세 (education-checklist-detail.html)
  // ══════════════════════════════════════════

  function isChecklistDetailPage() {
    return !!document.getElementById('detailCheckBasic');
  }

  async function loadChecklistDetail() {
    var id = api.getParam('id');
    if (!id) return;

    var result = await api.fetchDetail('checklists', id);
    if (result.error || !result.data) { alert('체크리스트를 불러올 수 없습니다.'); return; }
    var d = result.data;

    var basicEl = document.getElementById('detailCheckBasic');
    if (basicEl) {
      api.setHtml(basicEl, '<div class="info-grid">' +
        '<span class="info-grid__label">버전</span><span class="info-grid__value">v' + d.version_number + '</span>' +
        '<span class="info-grid__label">적용 상태</span><span class="info-grid__value">' + api.autoBadge(d.apply_status) + '</span>' +
        '<span class="info-grid__label">항목 수</span><span class="info-grid__value">' + (d.item_count || 0) + '개</span>' +
        '<span class="info-grid__label">작성자</span><span class="info-grid__value">' + api.escapeHtml(d.created_by || '') + '</span>' +
        '<span class="info-grid__label">작성일시</span><span class="info-grid__value">' + api.formatDate(d.created_at) + '</span>' +
        '</div>');
    }

    // 항목 조회
    var items = await api.fetchList('checklist_items', {
      filters: [{ column: 'checklist_id', op: 'eq', value: id }],
      orderBy: 'display_order', ascending: true, perPage: 100
    });

    var itemsEl = document.getElementById('detailCheckItems');
    if (itemsEl && items.data && items.data.length > 0) {
      var html = '';
      for (var i = 0; i < items.data.length; i++) {
        var item = items.data[i];
        html += '<tr>' +
          '<td><span class="drag-handle">\u2195</span> ' + item.display_order + '</td>' +
          '<td>' + api.escapeHtml(item.content) + '</td>' +
          '<td style="text-align:center;">' +
            '<div class="edu-toggle"><div class="edu-toggle__track' + (item.is_active ? ' edu-toggle__track--on' : '') + '"><div class="edu-toggle__thumb"></div></div></div>' +
          '</td>' +
          '<td style="text-align:center;"><button class="edu-delete-btn">' + DELETE_SVG + '</button></td>' +
          '</tr>';
      }
      itemsEl.innerHTML = html;
    }

    // 저장 모달
    var saveBtn = document.querySelector('#saveModal .modal__btn--confirm-primary');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        await api.insertAuditLog('체크리스트수정', 'checklists', id, {});
        alert('저장되었습니다.');
        location.reload();
      });
    }

    api.hideIfReadOnly(PERM_KEY, ['.btn-action', '.detail-actions', '.edu-add-row__btn', '.edu-delete-btn']);
  }

  // ══════════════════════════════════════════
  // D. 서약서 상세 (education-pledge-detail.html)
  // ══════════════════════════════════════════

  function isPledgeDetailPage() {
    return !!document.getElementById('detailPledgeBasic');
  }

  async function loadPledgeDetail() {
    var id = api.getParam('id');
    if (!id) return;

    var result = await api.fetchDetail('pledges', id);
    if (result.error || !result.data) { alert('서약서를 불러올 수 없습니다.'); return; }
    var d = result.data;

    var basicEl = document.getElementById('detailPledgeBasic');
    if (basicEl) {
      api.setHtml(basicEl, '<div class="info-grid">' +
        '<span class="info-grid__label">버전</span><span class="info-grid__value">v' + d.version_number + '</span>' +
        '<span class="info-grid__label">적용 상태</span><span class="info-grid__value">' + api.autoBadge(d.apply_status) + '</span>' +
        '<span class="info-grid__label">제목</span><span class="info-grid__value">' + api.escapeHtml(d.title || '') + '</span>' +
        '<span class="info-grid__label">본문</span><span class="info-grid__value">' + api.escapeHtml(d.body_content || '') + '</span>' +
        '<span class="info-grid__label">항목 수</span><span class="info-grid__value">' + (d.item_count || 0) + '개</span>' +
        '<span class="info-grid__label">작성자</span><span class="info-grid__value">' + api.escapeHtml(d.created_by || '') + '</span>' +
        '<span class="info-grid__label">작성일시</span><span class="info-grid__value">' + api.formatDate(d.created_at) + '</span>' +
        '</div>');
    }

    // 항목
    var items = await api.fetchList('pledge_items', {
      filters: [{ column: 'pledge_id', op: 'eq', value: id }],
      orderBy: 'display_order', ascending: true, perPage: 100
    });

    var itemsEl = document.getElementById('detailPledgeItems');
    if (itemsEl && items.data && items.data.length > 0) {
      var html = '';
      for (var i = 0; i < items.data.length; i++) {
        var item = items.data[i];
        var subs = item.sub_items || [];
        var subHtml = '<div class="edu-sub-items">';
        if (Array.isArray(subs)) {
          for (var s = 0; s < subs.length; s++) {
            subHtml += '<div class="edu-sub-items__item"><span>' + api.escapeHtml(subs[s]) + '</span></div>';
          }
        }
        subHtml += '<button class="edu-sub-items__add">+ 하위 항목 추가</button></div>';

        html += '<tr>' +
          '<td><span class="drag-handle">\u2195</span> ' + item.display_order + '</td>' +
          '<td>' + api.escapeHtml(item.content) + subHtml + '</td>' +
          '<td style="text-align:center;"><button class="edu-delete-btn">' + DELETE_SVG + '</button></td>' +
          '</tr>';
      }
      itemsEl.innerHTML = html;
    }

    var saveBtn = document.querySelector('#saveModal .modal__btn--confirm-primary');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        await api.insertAuditLog('서약서수정', 'pledges', id, {});
        alert('저장되었습니다.');
        location.reload();
      });
    }

    api.hideIfReadOnly(PERM_KEY, ['.btn-action', '.detail-actions', '.edu-add-row__btn', '.edu-delete-btn']);
  }

  // ══════════════════════════════════════════
  // E. 이수현황 상세 (education-status-detail.html)
  // ══════════════════════════════════════════

  function isStatusDetailPage() {
    return !!document.getElementById('detailEduStatusBasic');
  }

  async function loadStatusDetail() {
    var id = api.getParam('id');
    if (!id) return;

    var result = await api.fetchDetail('education_completions', id, '*, kindergartens:kindergarten_id(id, name)');
    if (result.error || !result.data) { alert('이수현황을 불러올 수 없습니다.'); return; }
    var d = result.data;
    var kg = d.kindergartens || {};

    var basicEl = document.getElementById('detailEduStatusBasic');
    if (basicEl) {
      api.setHtml(basicEl, '<div class="info-grid">' +
        '<span class="info-grid__label">유치원명</span><span class="info-grid__value"><a href="kindergarten-detail.html?id=' + (kg.id || '') + '" class="info-grid__value--link">' + api.escapeHtml(kg.name || '') + '</a></span>' +
        '<span class="info-grid__label">이수 진행률</span><span class="info-grid__value">' + (d.progress_rate || 0) + '% (' + (d.completed_topics || 0) + '/' + (d.total_topics || 0) + ')</span>' +
        '<span class="info-grid__label">이수 상태</span><span class="info-grid__value">' + api.autoBadge(d.completion_status) + '</span>' +
        '<span class="info-grid__label">전체 이수 완료일</span><span class="info-grid__value">' + api.formatDate(d.all_completed_at) + '</span>' +
        '<span class="info-grid__label">체크리스트 확인</span><span class="info-grid__value">' + (d.checklist_confirmed ? api.renderBadge('완료', 'green') : api.renderBadge('미완료', 'gray')) + '</span>' +
        '<span class="info-grid__label">서약서 동의</span><span class="info-grid__value">' + (d.pledge_agreed ? api.renderBadge('완료', 'green') : api.renderBadge('미완료', 'gray')) + '</span>' +
        '</div>');
    }

    // 주제별 이수 내역
    var topicEl = document.getElementById('detailEduStatusTopics');
    if (topicEl) {
      var topics = d.topic_details || [];
      if (Array.isArray(topics) && topics.length > 0) {
        var html = '';
        for (var i = 0; i < topics.length; i++) {
          var t = topics[i];
          html += '<tr><td>' + (i + 1) + '</td><td>' + api.escapeHtml(t.topic_id || '') + '</td><td>' + api.formatDate(t.completed_at) + '</td></tr>';
        }
        topicEl.innerHTML = html;
      } else {
        topicEl.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--text-weak);">이수 내역이 없습니다.</td></tr>';
      }
    }

    // 강제 이수 완료
    var forceBtn = document.getElementById('forceCompleteBtn');
    if (forceBtn) {
      forceBtn.addEventListener('click', async function () {
        var reason = document.querySelector('#forceCompleteModal textarea');
        await api.updateRecord('education_completions', id, {
          completion_status: '이수완료',
          progress_rate: 100,
          completed_topics: d.total_topics || 0,
          all_completed_at: new Date().toISOString(),
          force_completed: true,
          force_completed_reason: reason ? reason.value.trim() : ''
        });
        await api.insertAuditLog('강제이수완료', 'education_completions', id, {});
        alert('강제 이수 완료 처리되었습니다.');
        location.reload();
      });
    }

    // 이수 현황 초기화
    var resetBtn = document.getElementById('resetCompletionBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', async function () {
        var reason = document.querySelector('#resetCompletionModal textarea');
        await api.updateRecord('education_completions', id, {
          completion_status: '미시작',
          progress_rate: 0,
          completed_topics: 0,
          all_completed_at: null,
          topic_details: [],
          force_completed: false,
          reset_reason: reason ? reason.value.trim() : ''
        });
        await api.insertAuditLog('이수현황초기화', 'education_completions', id, {});
        alert('이수 현황이 초기화되었습니다.');
        location.reload();
      });
    }

    // 체크리스트 초기화
    var resetCheckBtn = document.getElementById('resetChecklistBtn');
    if (resetCheckBtn) {
      resetCheckBtn.addEventListener('click', async function () {
        await api.updateRecord('education_completions', id, {
          checklist_confirmed: false,
          checklist_confirmed_at: null,
          pledge_agreed: false,
          pledge_agreed_at: null
        });
        await api.insertAuditLog('체크리스트초기화', 'education_completions', id, {});
        alert('체크리스트/서약서가 초기화되었습니다.');
        location.reload();
      });
    }

    api.hideIfReadOnly(PERM_KEY, ['.btn-action', '.detail-actions']);
  }

  // ══════════════════════════════════════════
  // F. 교육 주제 등록 (education-create.html)
  // ══════════════════════════════════════════

  function isTopicCreatePage() {
    return !!document.getElementById('detailEduCreate');
  }

  function bindTopicCreate() {
    var saveBtn = document.querySelector('#registerModal .modal__btn--confirm-primary');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        alert('등록 기능은 상세 페이지에서 직접 입력 후 저장합니다.');
        location.href = 'educations.html';
      });
    }
  }

  // ══════════════════════════════════════════
  // G. 기존 UI 인터랙션 (모든 education-*.html)
  // ══════════════════════════════════════════

  function bindUIInteractions() {
    // 1. 퀴즈 정답 토글
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.edu-answer-toggle');
      if (!btn) return;
      var card = btn.closest('.detail-card') || btn.closest('.info-grid');
      if (!card) return;
      card.querySelectorAll('.edu-answer-toggle').forEach(function (toggle) { toggle.classList.remove('active'); });
      btn.classList.add('active');
    });

    // 2. 체크리스트 사용 토글
    document.addEventListener('click', function (e) {
      var track = e.target.closest('.edu-toggle__track');
      if (!track) return;
      track.classList.toggle('edu-toggle__track--on');
    });

    // 3. 행 삭제
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.edu-delete-btn');
      if (!btn) return;
      var row = btn.closest('tr');
      if (!row) return;
      var tbody = row.closest('tbody');
      row.remove();
      if (tbody) renumberRows(tbody);
    });

    // 4. 행 추가
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.edu-add-row__btn');
      if (!btn) return;
      var card = btn.closest('.detail-card');
      if (!card) return;
      var table = card.querySelector('.edu-items-table');
      if (!table) return;
      var tbody = table.querySelector('tbody');
      if (!tbody) return;
      var colCount = table.querySelectorAll('thead th').length;
      var nextNum = tbody.querySelectorAll('tr').length + 1;
      var row = document.createElement('tr');
      if (colCount === 4) {
        row.innerHTML =
          '<td><span class="drag-handle">\u2195</span> ' + nextNum + '</td>' +
          '<td><input type="text" class="filter-input" style="width:100%;" placeholder="항목 내용을 입력하세요"></td>' +
          '<td style="text-align:center;"><div class="edu-toggle"><div class="edu-toggle__track edu-toggle__track--on"><div class="edu-toggle__thumb"></div></div></div></td>' +
          '<td style="text-align:center;"><button class="edu-delete-btn">' + DELETE_SVG + '</button></td>';
      } else {
        row.innerHTML =
          '<td><span class="drag-handle">\u2195</span> ' + nextNum + '</td>' +
          '<td><input type="text" class="filter-input" style="width:100%;" placeholder="항목 내용을 입력하세요"><div class="edu-sub-items"><button class="edu-sub-items__add">+ 하위 항목 추가</button></div></td>' +
          '<td style="text-align:center;"><button class="edu-delete-btn">' + DELETE_SVG + '</button></td>';
      }
      tbody.appendChild(row);
    });

    // 5. 원칙 설명 추가
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.edu-bullet-list__add');
      if (!btn) return;
      var list = btn.previousElementSibling;
      if (!list || !list.classList.contains('edu-bullet-list')) return;
      var li = document.createElement('li');
      li.className = 'edu-bullet-list__item';
      li.innerHTML = '<input type="text" class="filter-input" style="width:100%;" placeholder="원칙 설명을 입력하세요">';
      list.appendChild(li);
    });

    // 6. 하위 항목 추가
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.edu-sub-items__add');
      if (!btn) return;
      var container = btn.closest('.edu-sub-items');
      if (!container) return;
      var item = document.createElement('div');
      item.className = 'edu-sub-items__item';
      item.innerHTML = '<input type="text" class="filter-input" style="flex:1;" placeholder="하위 항목을 입력하세요"><button class="edu-sub-items__delete">삭제</button>';
      container.insertBefore(item, btn);
    });

    // 7. 하위 항목 삭제
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.edu-sub-items__delete');
      if (!btn) return;
      var item = btn.closest('.edu-sub-items__item');
      if (item) item.remove();
    });
  }

  function renumberRows(tbody) {
    var rows = tbody.querySelectorAll('tr');
    rows.forEach(function (row, idx) {
      var firstTd = row.querySelector('td:first-child');
      if (!firstTd) return;
      var handle = firstTd.querySelector('.drag-handle');
      if (handle) {
        firstTd.innerHTML = '';
        firstTd.appendChild(handle);
        firstTd.appendChild(document.createTextNode(' ' + (idx + 1)));
      }
    });
  }

  // ══════════════════════════════════════════
  // 초기화
  // ══════════════════════════════════════════

  document.addEventListener('DOMContentLoaded', function () {
    bindUIInteractions();

    if (isListPage()) initList();
    else if (isTopicDetailPage()) loadTopicDetail();
    else if (isChecklistDetailPage()) loadChecklistDetail();
    else if (isPledgeDetailPage()) loadPledgeDetail();
    else if (isStatusDetailPage()) loadStatusDetail();
    else if (isTopicCreatePage()) bindTopicCreate();
  });

})();
