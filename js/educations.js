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
    api.showTableLoading(topicBody, 6);

    // 필터/검색 조건 수집
    var filters = [];
    var visibilityEl = document.getElementById('topicVisibility');
    if (visibilityEl && visibilityEl.value) {
      filters.push({ column: 'visibility', op: 'eq', value: visibilityEl.value });
    }

    var searchOpts = {};
    var searchInput = document.getElementById('topicSearchInput');
    if (searchInput && searchInput.value.trim()) {
      searchOpts = { column: 'title', value: searchInput.value.trim() };
    }

    var result = await api.fetchList('education_topics', {
      select: '*',
      filters: filters,
      search: searchOpts,
      orderBy: 'display_order',
      ascending: true,
      perPage: 100
    });
    if (result.error) { api.showTableEmpty(topicBody, 6, '데이터 로드 실패'); return; }
    if (topicCount) topicCount.textContent = api.formatNumber(result.count);
    if (!result.data.length) { api.showTableEmpty(topicBody, 6); return; }

    var html = '';
    var totalRows = result.data.length;
    for (var i = 0; i < totalRows; i++) {
      var t = result.data[i];
      var order = t.display_order || (i + 1);
      var upDisabled = (i === 0) ? ' disabled' : '';
      var downDisabled = (i === totalRows - 1) ? ' disabled' : '';

      html += '<tr data-id="' + t.id + '" data-order="' + order + '">' +
        '<td>' +
          '<span class="order-arrows">' +
            '<button class="order-arrows__btn order-up"' + upDisabled + '>&#9650;</button>' +
            '<span>' + order + '</span>' +
            '<button class="order-arrows__btn order-down"' + downDisabled + '>&#9660;</button>' +
          '</span>' +
        '</td>' +
        '<td>' + api.escapeHtml(t.title) + '</td>' +
        '<td>' + api.autoBadge(t.visibility) + '</td>' +
        '<td>' + api.formatDate(t.created_at, true) + '</td>' +
        '<td>' + api.formatDate(t.updated_at || t.created_at, true) + '</td>' +
        '<td>' + api.renderDetailLink('education-detail.html', t.id) + '</td>' +
        '</tr>';
    }
    topicBody.innerHTML = html;
    updateArrowStates(topicBody);
  }

  // 교육순서 ↑↓ disabled 상태 재계산
  function updateArrowStates(tbody) {
    var rows = tbody.querySelectorAll('tr');
    rows.forEach(function (row, idx) {
      var upBtn = row.querySelector('.order-up');
      var downBtn = row.querySelector('.order-down');
      if (upBtn) upBtn.disabled = (idx === 0);
      if (downBtn) downBtn.disabled = (idx === rows.length - 1);
    });
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
    // 교육주제 탭 – 검색 & 초기화 & 교육순서 swap
    var tab1 = document.getElementById('tab-topics');
    if (tab1) {
      var topicBtnSearch = document.getElementById('topicBtnSearch');
      var topicSearchInput = document.getElementById('topicSearchInput');
      var topicBtnReset = document.getElementById('topicBtnReset');

      if (topicBtnSearch) topicBtnSearch.addEventListener('click', function () { loadTopicList(); });
      if (topicSearchInput) topicSearchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') loadTopicList();
      });
      if (topicBtnReset) topicBtnReset.addEventListener('click', function () {
        var vis = document.getElementById('topicVisibility');
        if (vis) vis.value = '';
        if (topicSearchInput) topicSearchInput.value = '';
        loadTopicList();
      });

      // 교육순서 ↑↓ swap (이벤트 위임)
      tab1.addEventListener('click', async function (e) {
        var btn = e.target.closest('.order-up, .order-down');
        if (!btn || btn.disabled) return;

        var row = btn.closest('tr');
        var tbody = row.closest('tbody');
        if (!row || !tbody) return;

        var isUp = btn.classList.contains('order-up');
        var siblingRow = isUp ? row.previousElementSibling : row.nextElementSibling;
        if (!siblingRow) return;

        // DOM 위치 교환
        if (isUp) {
          tbody.insertBefore(row, siblingRow);
        } else {
          tbody.insertBefore(siblingRow, row);
        }

        // 순서 번호 재계산
        var rows = tbody.querySelectorAll('tr');
        rows.forEach(function (r, idx) {
          var orderSpan = r.querySelector('.order-arrows > span');
          if (orderSpan) orderSpan.textContent = idx + 1;
          r.setAttribute('data-order', idx + 1);
        });

        // ↑↓ disabled 상태 재계산
        updateArrowStates(tbody);

        // DB 반영: swap된 2개 행의 display_order 업데이트
        var rowId = row.getAttribute('data-id');
        var siblingId = siblingRow.getAttribute('data-id');
        var rowNewOrder = parseInt(row.getAttribute('data-order'), 10);
        var siblingNewOrder = parseInt(siblingRow.getAttribute('data-order'), 10);

        await api.updateRecord('education_topics', rowId, { display_order: rowNewOrder });
        await api.updateRecord('education_topics', siblingId, { display_order: siblingNewOrder });
      });
    }

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

  /* ── 보기/편집 모드 전환 ── */
  function toggleViewEdit(isViewMode) {
    var pairs = [['viewBasic', 'editBasic'], ['viewDesc', 'editDesc'], ['viewQuiz', 'editQuiz']];
    for (var i = 0; i < pairs.length; i++) {
      var vEl = document.getElementById(pairs[i][0]);
      var eEl = document.getElementById(pairs[i][1]);
      if (vEl) vEl.style.display = isViewMode ? '' : 'none';
      if (eEl) eEl.style.display = isViewMode ? 'none' : '';
    }
  }

  /* ── 모달 열기 유틸 ── */
  function openModal(modalId) {
    var modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
  }

  /* ── 폼 값 세팅 유틸 ── */
  function setElHtml(elId, value) {
    var el = document.getElementById(elId);
    if (el) el.innerHTML = value || '';
  }
  function setInputVal(elId, value) {
    var el = document.getElementById(elId);
    if (el) el.value = (value != null) ? value : '';
  }

  /* ── 상세 페이지 메인 로드 ── */
  async function loadTopicDetail() {
    var id = api.getParam('id');
    if (!id) return;

    var r1 = await api.fetchDetail('education_topics', id);
    if (r1.error || !r1.data) { alert('교육 주제를 불러올 수 없습니다.'); return; }
    var d = r1.data;

    // 퀴즈 조회
    var r2 = await api.fetchList('education_quizzes', {
      filters: [{ column: 'topic_id', op: 'eq', value: id }],
      orderBy: 'created_at', ascending: true, perPage: 100
    });
    var quizzes = r2.data || [];
    var quiz = quizzes.length > 0 ? quizzes[0] : null;

    // ── ① 기본정보 보기 모드 ──
    var viewBasic = document.getElementById('viewBasic');
    if (viewBasic) {
      viewBasic.innerHTML =
        '<span class="info-grid__label">교육 고유번호</span><span class="info-grid__value">' + api.escapeHtml(d.id || '-') + '</span>' +
        '<span class="info-grid__label">교육순서</span><span class="info-grid__value">' + (d.display_order || '-') + '</span>' +
        '<span class="info-grid__label">교육주제</span><span class="info-grid__value">' + api.escapeHtml(d.title) + '</span>' +
        '<span class="info-grid__label">공개 상태</span><span class="info-grid__value">' + api.autoBadge(d.visibility) + '</span>' +
        '<span class="info-grid__label">등록일</span><span class="info-grid__value">' + api.formatDate(d.created_at, true) + '</span>' +
        '<span class="info-grid__label">수정일</span><span class="info-grid__value">' + api.formatDate(d.updated_at || d.created_at, true) + '</span>';
    }

    // ── ② 설명 페이지 보기 모드 ──
    var viewDesc = document.getElementById('viewDesc');
    if (viewDesc) {
      var topImgHtml = d.top_image_url
        ? '<img src="' + api.escapeHtml(d.top_image_url) + '" alt="상단 이미지">'
        : IMG_PLACEHOLDER;

      var details = d.principle_details || [];
      var detailsHtml = '';
      if (Array.isArray(details) && details.length > 0) {
        detailsHtml = '<ul class="edu-bullet-list">';
        for (var i = 0; i < details.length; i++) {
          detailsHtml += '<li class="edu-bullet-list__item">' + api.escapeHtml(details[i]) + '</li>';
        }
        detailsHtml += '</ul>';
      } else {
        detailsHtml = '<span style="color:var(--text-weak);">-</span>';
      }

      viewDesc.innerHTML =
        '<span class="info-grid__label">상단 이미지</span><span class="info-grid__value"><div class="edu-img-preview">' + topImgHtml + '</div></span>' +
        '<span class="info-grid__label">원칙 문장</span><span class="info-grid__value" style="font-weight:600;">' + api.escapeHtml(d.principle_text || '-') + '</span>' +
        '<span class="info-grid__label">원칙 설명</span><span class="info-grid__value">' + detailsHtml + '</span>' +
        '<span class="info-grid__label">올바른 행동 ①</span><span class="info-grid__value">' + api.escapeHtml(d.correct_behavior_1 || '-') + '</span>' +
        '<span class="info-grid__label">올바른 행동 ②</span><span class="info-grid__value">' + api.escapeHtml(d.correct_behavior_2 || '-') + '</span>' +
        '<span class="info-grid__label">잘못된 행동 ①</span><span class="info-grid__value' + (d.wrong_behavior_1 ? ' text-danger' : '') + '">' + api.escapeHtml(d.wrong_behavior_1 || '-') + '</span>';
    }

    // ── ③ 퀴즈 보기 모드 ──
    var viewQuiz = document.getElementById('viewQuiz');
    if (viewQuiz) {
      if (quiz) {
        var quizImgHtml = quiz.question_image_url
          ? '<img src="' + api.escapeHtml(quiz.question_image_url) + '" alt="질문 이미지">'
          : IMG_PLACEHOLDER;
        var aIsCorrect = quiz.correct_answer === 'A';

        viewQuiz.innerHTML =
          '<span class="info-grid__label">질문 텍스트</span><span class="info-grid__value">' + api.escapeHtml(quiz.question_text) + '</span>' +
          '<span class="info-grid__label">질문 이미지</span><span class="info-grid__value"><div class="edu-img-preview">' + quizImgHtml + '</div></span>' +
          '<span class="info-grid__label">선택지 A</span><span class="info-grid__value"><div class="edu-choice-row"><span class="edu-answer-toggle' + (aIsCorrect ? ' active' : '') + '">정답</span><span class="edu-choice-row__text">' + api.escapeHtml(quiz.choice_a) + '</span></div></span>' +
          '<span class="info-grid__label">선택지 B</span><span class="info-grid__value"><div class="edu-choice-row"><span class="edu-answer-toggle' + (!aIsCorrect ? ' active' : '') + '">정답</span><span class="edu-choice-row__text">' + api.escapeHtml(quiz.choice_b) + '</span></div></span>' +
          '<span class="info-grid__label">선택지 A 해설</span><span class="info-grid__value"><div class="edu-explanation edu-explanation--' + (aIsCorrect ? 'correct' : 'wrong') + '">' + api.escapeHtml(quiz.choice_a_explanation || '-') + '</div></span>' +
          '<span class="info-grid__label">선택지 B 해설</span><span class="info-grid__value"><div class="edu-explanation edu-explanation--' + (!aIsCorrect ? 'correct' : 'wrong') + '">' + api.escapeHtml(quiz.choice_b_explanation || '-') + '</div></span>';
      } else {
        viewQuiz.innerHTML = '<p style="color:var(--text-weak);padding:12px 0;">등록된 퀴즈가 없습니다.</p>';
      }
    }

    // ── 비공개 전환 버튼 텍스트 동적 세팅 ──
    var btnToggle = document.getElementById('btnToggleVisibility');
    if (btnToggle) {
      btnToggle.textContent = d.visibility === '공개' ? '비공개 전환' : '공개 전환';
    }

    // ── 버튼 이벤트 바인딩 ──
    bindDetailActions(id, d, quiz);

    api.hideIfReadOnly(PERM_KEY, ['.btn-action', '.detail-actions']);
  }

  /* ── 상세 페이지 액션 바인딩 ── */
  function bindDetailActions(id, topicData, quizData) {
    var d = topicData;
    var quiz = quizData;

    // 편집 모드에서 사용할 이미지 URL 변수
    var editTopImgUrl = d.top_image_url || null;
    var editQuizImgUrl = (quiz && quiz.question_image_url) || null;
    // 원본 URL (취소 시 복원 및 고아 파일 정리용)
    var origTopImgUrl = editTopImgUrl;
    var origQuizImgUrl = editQuizImgUrl;
    var detailEditSaved = false; // 저장 완료 플래그
    var isInEditMode = false;    // 편집 모드 플래그

    // 편집 모드에서 페이지 이탈 시 고아 이미지 정리
    function cleanupDetailOrphanImages() {
      if (detailEditSaved || !isInEditMode) return;
      if (editTopImgUrl && editTopImgUrl !== origTopImgUrl) {
        try { deleteImageFromStorage(editTopImgUrl); } catch (e) { /* ignore */ }
      }
      if (editQuizImgUrl && editQuizImgUrl !== origQuizImgUrl) {
        try { deleteImageFromStorage(editQuizImgUrl); } catch (e) { /* ignore */ }
      }
    }
    window.addEventListener('beforeunload', cleanupDetailOrphanImages);
    window.addEventListener('pagehide', cleanupDetailOrphanImages);

    // ── [수정] 버튼 → 편집 모드 진입 ──
    var btnEdit = document.getElementById('btnEditMode');
    if (btnEdit) {
      btnEdit.addEventListener('click', function () {
        isInEditMode = true;
        document.getElementById('detailViewActions').style.display = 'none';
        document.getElementById('detailEditActions').style.display = '';
        toggleViewEdit(false);

        // 기본정보 폼 채우기
        setElHtml('editId', api.escapeHtml(d.id || '-'));
        setInputVal('editOrder', d.display_order);
        setInputVal('editTitle', d.title);
        setElHtml('editVisibility', api.autoBadge(d.visibility));
        setElHtml('editCreatedAt', api.formatDate(d.created_at, true));
        setElHtml('editUpdatedAt', api.formatDate(d.updated_at || d.created_at, true));

        // 설명 페이지 폼 채우기
        setInputVal('editPrinciple', d.principle_text || '');
        setInputVal('editCorrect1', d.correct_behavior_1 || '');
        setInputVal('editCorrect2', d.correct_behavior_2 || '');
        setInputVal('editWrong1', d.wrong_behavior_1 || '');

        // 원칙 설명 목록
        var listEl = document.getElementById('editPrincipleList');
        if (listEl) {
          listEl.innerHTML = '';
          var details = d.principle_details || [];
          if (Array.isArray(details)) {
            for (var i = 0; i < details.length; i++) {
              var li = document.createElement('li');
              li.className = 'edu-bullet-list__item';
              li.innerHTML = '<input type="text" class="filter-input" style="width:100%;" value="' + api.escapeHtml(details[i]) + '">';
              listEl.appendChild(li);
            }
          }
        }

        // 상단 이미지 프리뷰 및 버튼 상태
        var topPreview = document.getElementById('editTopImgPreview');
        if (topPreview) {
          topPreview.innerHTML = editTopImgUrl
            ? '<img src="' + api.escapeHtml(editTopImgUrl) + '" alt="미리보기">'
            : IMG_PLACEHOLDER;
        }
        var topActions = document.getElementById('editTopImgActions');
        if (topActions) {
          topActions.innerHTML = editTopImgUrl
            ? '<button class="edu-img-actions__btn" id="editTopImgBtn">이미지 교체</button><button class="edu-img-actions__btn edu-img-actions__btn--delete" id="editTopImgBtnDel">삭제</button>'
            : '<button class="edu-img-actions__btn" id="editTopImgBtn">이미지 업로드</button>';
        }

        // 퀴즈 필드 채우기
        if (quiz) {
          setInputVal('editQuizQuestion', quiz.question_text || '');
          setInputVal('editChoiceA', quiz.choice_a || '');
          setInputVal('editChoiceB', quiz.choice_b || '');
          setInputVal('editExplainA', quiz.choice_a_explanation || '');
          setInputVal('editExplainB', quiz.choice_b_explanation || '');
          var aBtn = document.getElementById('editAnswerA');
          var bBtn = document.getElementById('editAnswerB');
          if (aBtn) aBtn.classList.toggle('active', quiz.correct_answer === 'A');
          if (bBtn) bBtn.classList.toggle('active', quiz.correct_answer === 'B');
        }

        // 퀴즈 이미지 프리뷰 및 버튼 상태
        var quizPreview = document.getElementById('editQuizImgPreview');
        if (quizPreview) {
          quizPreview.innerHTML = editQuizImgUrl
            ? '<img src="' + api.escapeHtml(editQuizImgUrl) + '" alt="미리보기">'
            : IMG_PLACEHOLDER;
        }
        var quizActions = document.getElementById('editQuizImgActions');
        if (quizActions) {
          quizActions.innerHTML = editQuizImgUrl
            ? '<button class="edu-img-actions__btn" id="editQuizImgBtn">이미지 교체</button><button class="edu-img-actions__btn edu-img-actions__btn--delete" id="editQuizImgBtnDel">삭제</button>'
            : '<button class="edu-img-actions__btn" id="editQuizImgBtn">이미지 업로드</button>';
        }

        // 이미지 업로드 바인딩
        bindImageUpload({
          uploadBtnId: 'editTopImgBtn',
          fileInputId: 'editTopImgFile',
          previewId: 'editTopImgPreview',
          actionsId: 'editTopImgActions',
          folder: 'topImg',
          getCurrentUrl: function () { return editTopImgUrl; },
          setUrl: function (url) { editTopImgUrl = url; }
        });
        bindImageUpload({
          uploadBtnId: 'editQuizImgBtn',
          fileInputId: 'editQuizImgFile',
          previewId: 'editQuizImgPreview',
          actionsId: 'editQuizImgActions',
          folder: 'quizImg',
          getCurrentUrl: function () { return editQuizImgUrl; },
          setUrl: function (url) { editQuizImgUrl = url; }
        });
      });
    }

    // ── [취소] 버튼 → 보기 모드 복원 + 고아 파일 정리 ──
    var btnCancel = document.getElementById('btnEditCancel');
    if (btnCancel) {
      btnCancel.addEventListener('click', async function () {
        // 편집 중 업로드된 새 이미지가 원본과 다르면 Storage에서 삭제
        if (editTopImgUrl && editTopImgUrl !== origTopImgUrl) {
          try { await deleteImageFromStorage(editTopImgUrl); } catch (e) { /* ignore */ }
        }
        if (editQuizImgUrl && editQuizImgUrl !== origQuizImgUrl) {
          try { await deleteImageFromStorage(editQuizImgUrl); } catch (e) { /* ignore */ }
        }
        // URL 변수 원본으로 복원
        editTopImgUrl = origTopImgUrl;
        editQuizImgUrl = origQuizImgUrl;
        isInEditMode = false;

        document.getElementById('detailViewActions').style.display = '';
        document.getElementById('detailEditActions').style.display = 'none';
        toggleViewEdit(true);
      });
    }

    // ── [저장] 버튼 → 저장 모달 열기 ──
    var btnSave = document.getElementById('btnEditSave');
    if (btnSave) {
      btnSave.addEventListener('click', function () {
        openModal('saveModal');
      });
    }

    // ── 저장 모달 확인 ──
    var btnSaveConfirm = document.getElementById('btnSaveConfirm');
    if (btnSaveConfirm) {
      btnSaveConfirm.addEventListener('click', async function () {
        var titleEl = document.getElementById('editTitle');
        if (!titleEl || !titleEl.value.trim()) {
          alert('교육주제를 입력하세요.');
          if (titleEl) titleEl.focus();
          return;
        }

        // 원칙 설명 수집
        var principleDetails = [];
        document.querySelectorAll('#editPrincipleList .edu-bullet-list__item input').forEach(function (inp) {
          var val = inp.value.trim();
          if (val) principleDetails.push(val);
        });

        // 원본과 다른 이전 이미지 Storage 정리 (새 이미지로 교체된 경우 원본 삭제)
        if (origTopImgUrl && editTopImgUrl !== origTopImgUrl) {
          try { await deleteImageFromStorage(origTopImgUrl); } catch (e) { /* ignore */ }
        }
        if (origQuizImgUrl && editQuizImgUrl !== origQuizImgUrl) {
          try { await deleteImageFromStorage(origQuizImgUrl); } catch (e) { /* ignore */ }
        }

        var topicUpdate = {
          title: titleEl.value.trim(),
          top_image_url: editTopImgUrl || null,
          principle_text: (document.getElementById('editPrinciple') || {}).value ? document.getElementById('editPrinciple').value.trim() || null : null,
          principle_details: principleDetails.length > 0 ? principleDetails : null,
          correct_behavior_1: (document.getElementById('editCorrect1') || {}).value ? document.getElementById('editCorrect1').value.trim() || null : null,
          correct_behavior_2: (document.getElementById('editCorrect2') || {}).value ? document.getElementById('editCorrect2').value.trim() || null : null,
          wrong_behavior_1: (document.getElementById('editWrong1') || {}).value ? document.getElementById('editWrong1').value.trim() || null : null
        };

        var res1 = await api.updateRecord('education_topics', id, topicUpdate);
        if (res1.error) {
          alert('저장 실패: ' + res1.error.message);
          return;
        }

        // 퀴즈 업데이트
        if (quiz) {
          var answerA = document.getElementById('editAnswerA');
          var correctAnswer = (answerA && answerA.classList.contains('active')) ? 'A' : 'B';

          var quizUpdate = {
            question_text: document.getElementById('editQuizQuestion') ? document.getElementById('editQuizQuestion').value.trim() || null : null,
            question_image_url: editQuizImgUrl || null,
            choice_a: document.getElementById('editChoiceA') ? document.getElementById('editChoiceA').value.trim() || null : null,
            choice_b: document.getElementById('editChoiceB') ? document.getElementById('editChoiceB').value.trim() || null : null,
            correct_answer: correctAnswer,
            choice_a_explanation: document.getElementById('editExplainA') ? document.getElementById('editExplainA').value.trim() || null : null,
            choice_b_explanation: document.getElementById('editExplainB') ? document.getElementById('editExplainB').value.trim() || null : null
          };
          await api.updateRecord('education_quizzes', quiz.id, quizUpdate);
        }

        await api.insertAuditLog('교육주제수정', 'education_topics', id, {});
        detailEditSaved = true; // beforeunload 정리 방지
        alert('저장되었습니다.');
        location.reload();
      });
    }

    // ── [비공개 전환] 버튼 → 토글 모달 ──
    var btnToggleVis = document.getElementById('btnToggleVisibility');
    if (btnToggleVis) {
      btnToggleVis.addEventListener('click', function () {
        var newVis = d.visibility === '공개' ? '비공개' : '공개';
        var msgEl = document.getElementById('toggleModalMessage');
        var confirmEl = document.getElementById('btnToggleConfirm');
        if (msgEl) {
          msgEl.innerHTML = newVis === '비공개'
            ? '이 교육 주제를 비공개로 전환하면 앱에서 더 이상 노출되지 않습니다.<br>비공개로 전환하시겠습니까?'
            : '이 교육 주제를 공개로 전환하면 앱에서 노출됩니다.<br>공개로 전환하시겠습니까?';
        }
        if (confirmEl) confirmEl.textContent = newVis + ' 전환';
        openModal('toggleModal');
      });
    }

    // ── 토글 모달 확인 ──
    var btnToggleConfirm = document.getElementById('btnToggleConfirm');
    if (btnToggleConfirm) {
      btnToggleConfirm.addEventListener('click', async function () {
        var newVis = d.visibility === '공개' ? '비공개' : '공개';
        await api.updateRecord('education_topics', id, { visibility: newVis });
        await api.insertAuditLog('공개상태변경', 'education_topics', id, { from: d.visibility, to: newVis });
        alert(newVis + '로 변경되었습니다.');
        location.reload();
      });
    }

    // ── [삭제] 버튼 → 삭제 모달 ──
    var btnDeleteOpen = document.getElementById('btnDeleteOpen');
    if (btnDeleteOpen) {
      btnDeleteOpen.addEventListener('click', function () {
        openModal('deleteModal');
      });
    }

    // ── 삭제 모달 확인 ──
    var btnDeleteConfirm = document.getElementById('btnDeleteConfirm');
    if (btnDeleteConfirm) {
      btnDeleteConfirm.addEventListener('click', async function () {
        // 연관 퀴즈 먼저 삭제
        if (quiz) {
          await api.deleteRecord('education_quizzes', quiz.id);
        }
        // Storage 이미지 정리
        if (d.top_image_url) {
          try { await deleteImageFromStorage(d.top_image_url); } catch (e) { /* ignore */ }
        }
        if (quiz && quiz.question_image_url) {
          try { await deleteImageFromStorage(quiz.question_image_url); } catch (e) { /* ignore */ }
        }
        await api.deleteRecord('education_topics', id);
        await api.insertAuditLog('교육주제삭제', 'education_topics', id, {});
        alert('삭제되었습니다.');
        location.href = 'educations.html';
      });
    }
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

  /* ── Supabase Storage 이미지 업로드 유틸 ── */
  var BUCKET = 'education-images';

  async function uploadImage(file, folder) {
    var sb = window.__supabase;
    var ext = file.name.split('.').pop().toLowerCase();
    var fileName = folder + '/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    var res = await sb.storage.from(BUCKET).upload(fileName, file, { cacheControl: '3600', upsert: false });
    if (res.error) throw res.error;
    var pub = sb.storage.from(BUCKET).getPublicUrl(fileName);
    return pub.data.publicUrl;
  }

  async function deleteImageFromStorage(url) {
    if (!url) return;
    var sb = window.__supabase;
    var m = url.match(new RegExp(BUCKET + '/(.+)$'));
    if (!m) return;
    await sb.storage.from(BUCKET).remove([m[1]]);
  }

  var IMG_PLACEHOLDER =
    '<div class="edu-img-preview__placeholder">' +
    '<svg viewBox="0 0 24 24"><path d="M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>' +
    '320 \u00d7 180px</div>';

  /**
   * 이미지 업로드 바인딩 (범용)
   * @param {object} opts - { uploadBtnId, fileInputId, previewId, actionsId, folder, getCurrentUrl, setUrl }
   */
  function bindImageUpload(opts) {
    var fileInput = document.getElementById(opts.fileInputId);
    var preview = document.getElementById(opts.previewId);
    var actions = document.getElementById(opts.actionsId);
    if (!fileInput || !preview || !actions) return;

    function renderUploadBtn() {
      actions.innerHTML = '<button class="edu-img-actions__btn" id="' + opts.uploadBtnId + '">이미지 업로드</button>';
      document.getElementById(opts.uploadBtnId).addEventListener('click', function () { fileInput.click(); });
    }

    function renderReplaceDeleteBtns() {
      actions.innerHTML =
        '<button class="edu-img-actions__btn" id="' + opts.uploadBtnId + '">이미지 교체</button>' +
        '<button class="edu-img-actions__btn edu-img-actions__btn--delete" id="' + opts.uploadBtnId + 'Del">삭제</button>';
      document.getElementById(opts.uploadBtnId).addEventListener('click', function () { fileInput.click(); });
      document.getElementById(opts.uploadBtnId + 'Del').addEventListener('click', async function () {
        try { await deleteImageFromStorage(opts.getCurrentUrl()); } catch (e) { /* ignore */ }
        opts.setUrl(null);
        preview.innerHTML = IMG_PLACEHOLDER;
        renderUploadBtn();
      });
    }

    // 초기 바인딩
    var initBtn = document.getElementById(opts.uploadBtnId);
    if (initBtn) initBtn.addEventListener('click', function () { fileInput.click(); });

    fileInput.addEventListener('change', async function () {
      var file = fileInput.files[0];
      if (!file) return;
      try {
        // 교체 시 기존 이미지 삭제
        var prevUrl = opts.getCurrentUrl();
        if (prevUrl) {
          await deleteImageFromStorage(prevUrl);
        }
        var url = await uploadImage(file, opts.folder);
        opts.setUrl(url);
        preview.innerHTML = '<img src="' + url + '" alt="미리보기">';
        renderReplaceDeleteBtns();
      } catch (err) {
        alert('이미지 업로드 실패: ' + (err.message || err));
      }
      fileInput.value = '';
    });
  }

  /* ── 등록 페이지 메인 바인딩 ── */
  var topImageUrl = null;
  var quizImageUrl = null;
  var createSaved = false; // 등록 완료 플래그 (beforeunload 정리 방지)

  async function bindTopicCreate() {
    // 페이지 이탈 시 미저장 이미지 Storage 정리 (최선 노력 방식)
    function cleanupOrphanImages() {
      if (createSaved) return;
      if (topImageUrl) { try { deleteImageFromStorage(topImageUrl); } catch (e) { /* ignore */ } }
      if (quizImageUrl) { try { deleteImageFromStorage(quizImageUrl); } catch (e) { /* ignore */ } }
    }
    window.addEventListener('beforeunload', cleanupOrphanImages);
    window.addEventListener('pagehide', cleanupOrphanImages);

    // 교육순서 디폴트값: MAX(display_order) + 1
    var orderInput = document.getElementById('createOrder');
    if (orderInput) {
      try {
        var sb = window.__supabase;
        var maxRes = await sb.from('education_topics')
          .select('display_order')
          .order('display_order', { ascending: false })
          .limit(1);
        var maxOrder = (maxRes.data && maxRes.data.length > 0) ? (maxRes.data[0].display_order || 0) : 0;
        orderInput.value = maxOrder + 1;
      } catch (e) {
        orderInput.value = 1;
      }
    }

    // 이미지 업로드 바인딩
    bindImageUpload({
      uploadBtnId: 'topImgUploadBtn',
      fileInputId: 'topImgFileInput',
      previewId: 'topImgPreview',
      actionsId: 'topImgActions',
      folder: 'topImg',
      getCurrentUrl: function () { return topImageUrl; },
      setUrl: function (url) { topImageUrl = url; }
    });
    bindImageUpload({
      uploadBtnId: 'quizImgUploadBtn',
      fileInputId: 'quizImgFileInput',
      previewId: 'quizImgPreview',
      actionsId: 'quizImgActions',
      folder: 'quizImg',
      getCurrentUrl: function () { return quizImageUrl; },
      setUrl: function (url) { quizImageUrl = url; }
    });

    // 등록 모달 확인 버튼
    var saveBtn = document.querySelector('#registerModal .modal__btn--confirm-primary');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        // 1단계: 필수 입력값 검증
        var title = document.getElementById('createTitle');
        var principle = document.getElementById('createPrinciple');
        var quizQuestion = document.getElementById('createQuizQuestion');
        var choiceA = document.getElementById('createChoiceA');
        var choiceB = document.getElementById('createChoiceB');
        var answerABtn = document.getElementById('createAnswerA');
        var answerBBtn = document.getElementById('createAnswerB');

        var checks = [
          { el: title, msg: '교육주제를 입력하세요.' },
          { el: principle, msg: '원칙 문장을 입력하세요.' },
          { el: quizQuestion, msg: '퀴즈 질문을 입력하세요.' },
          { el: choiceA, msg: '선택지 A를 입력하세요.' },
          { el: choiceB, msg: '선택지 B를 입력하세요.' }
        ];
        for (var i = 0; i < checks.length; i++) {
          if (!checks[i].el || !checks[i].el.value.trim()) {
            alert(checks[i].msg);
            if (checks[i].el) checks[i].el.focus();
            return;
          }
        }

        // 정답 선택 검증
        var correctAnswer = null;
        if (answerABtn && answerABtn.classList.contains('active')) correctAnswer = 'A';
        else if (answerBBtn && answerBBtn.classList.contains('active')) correctAnswer = 'B';
        if (!correctAnswer) {
          alert('정답을 선택하세요 (선택지 A 또는 B의 [정답] 버튼을 클릭하세요).');
          return;
        }

        // 원칙 설명 수집 (JSON 배열)
        var principleDetails = [];
        document.querySelectorAll('.edu-bullet-list .edu-bullet-list__item input').forEach(function (inp) {
          var val = inp.value.trim();
          if (val) principleDetails.push(val);
        });

        // 2단계: education_topics insert
        var correct1El = document.getElementById('createCorrect1');
        var correct2El = document.getElementById('createCorrect2');
        var wrong1El = document.getElementById('createWrong1');

        var topicData = {
          display_order: parseInt(orderInput.value, 10),
          title: title.value.trim(),
          visibility: '비공개',
          top_image_url: topImageUrl || null,
          principle_text: principle.value.trim(),
          principle_details: principleDetails.length > 0 ? principleDetails : null,
          correct_behavior_1: correct1El ? correct1El.value.trim() || null : null,
          correct_behavior_2: correct2El ? correct2El.value.trim() || null : null,
          wrong_behavior_1: wrong1El ? wrong1El.value.trim() || null : null
        };

        var topicRes = await api.insertRecord('education_topics', topicData);
        if (topicRes.error || !topicRes.data || !topicRes.data[0]) {
          alert('교육 주제 등록 실패: ' + (topicRes.error ? topicRes.error.message : '알 수 없는 오류'));
          return;
        }
        var newTopicId = topicRes.data[0].id;

        // 3단계: education_quizzes insert
        var explainAEl = document.getElementById('createExplainA');
        var explainBEl = document.getElementById('createExplainB');

        var quizData = {
          topic_id: newTopicId,
          question_text: quizQuestion.value.trim(),
          question_image_url: quizImageUrl || null,
          choice_a: choiceA.value.trim(),
          choice_b: choiceB.value.trim(),
          correct_answer: correctAnswer,
          choice_a_explanation: explainAEl ? explainAEl.value.trim() || null : null,
          choice_b_explanation: explainBEl ? explainBEl.value.trim() || null : null
        };

        var quizRes = await api.insertRecord('education_quizzes', quizData);
        if (quizRes.error) {
          alert('퀴즈 등록 실패: ' + quizRes.error.message + '\n교육 주제는 등록되었습니다.');
        }

        // 4단계: 감사 로그 + 이동
        await api.insertAuditLog('교육주제등록', 'education_topics', newTopicId, {});
        createSaved = true; // beforeunload 정리 방지
        alert('교육 주제가 등록되었습니다.');
        location.href = 'educations.html';
      });
    }
  }

  // ══════════════════════════════════════════
  // G. 기존 UI 인터랙션 (모든 education-*.html)
  // ══════════════════════════════════════════

  function bindUIInteractions() {
    // 1. 퀴즈 정답 토글 (보기 모드 #viewQuiz 내부에서는 동작하지 않음)
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.edu-answer-toggle');
      if (!btn) return;
      // 보기 모드 영역 내부의 토글은 클릭 무시
      if (btn.closest('#viewQuiz')) return;
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
    else if (isTopicCreatePage()) {
      bindTopicCreate().catch(function (err) {
        console.error('[educations] 등록 페이지 초기화 실패:', err);
      });
    }
  });

})();
