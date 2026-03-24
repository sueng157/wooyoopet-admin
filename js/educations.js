/**
 * 우유펫 관리자 대시보드 — 교육관리 전용 JavaScript
 * 퀴즈 정답 토글, 체크리스트 사용 토글, 항목 동적 추가/삭제
 *
 * 계층 구조: common.js → components.js → educations.js
 * 대상 페이지: education-*.html (7개)
 */
(function () {
  'use strict';

  /* 공통 SVG: 삭제 아이콘 (edu-delete-btn 내부) */
  var DELETE_SVG = '<svg viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 010-2h3a1 1 0 011-1h3a1 1 0 011 1h3a1 1 0 011 1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118z"/></svg>';

  document.addEventListener('DOMContentLoaded', function () {

    // ──────────────────────────────────────────
    // 1. 퀴즈 정답 토글 (A/B 중 하나만 활성화)
    //    .edu-answer-toggle 클릭 시 동작
    //    같은 퀴즈 블록(info-grid) 안에서 하나만 active
    // ──────────────────────────────────────────

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.edu-answer-toggle');
      if (!btn) return;

      // 같은 퀴즈 영역 안의 모든 정답 토글을 찾아 비활성화
      var card = btn.closest('.detail-card') || btn.closest('.info-grid');
      if (!card) return;

      card.querySelectorAll('.edu-answer-toggle').forEach(function (toggle) {
        toggle.classList.remove('active');
      });
      btn.classList.add('active');
    });

    // ──────────────────────────────────────────
    // 2. 체크리스트 사용 토글
    //    .edu-toggle__track 클릭 시 --on 토글
    // ──────────────────────────────────────────

    document.addEventListener('click', function (e) {
      var track = e.target.closest('.edu-toggle__track');
      if (!track) return;

      track.classList.toggle('edu-toggle__track--on');
    });

    // ──────────────────────────────────────────
    // 3. 행 삭제 (체크리스트/서약서 테이블)
    //    .edu-delete-btn 클릭 → 부모 tr 제거 → 순서 재정렬
    // ──────────────────────────────────────────

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.edu-delete-btn');
      if (!btn) return;

      var row = btn.closest('tr');
      if (!row) return;

      var tbody = row.closest('tbody');
      row.remove();

      // 순서 번호 재정렬
      if (tbody) renumberRows(tbody);
    });

    // ──────────────────────────────────────────
    // 4. 행 추가 (체크리스트 / 서약서 테이블)
    //    .edu-add-row__btn 클릭 → tbody에 새 행 추가
    //    테이블 구조를 자동 감지 (체크리스트 = 4열, 서약서 = 3열)
    // ──────────────────────────────────────────

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
        // 체크리스트: 순서 | 항목내용(input) | 사용(토글) | 삭제
        row.innerHTML =
          '<td><span class="drag-handle">↕</span> ' + nextNum + '</td>' +
          '<td><input type="text" class="filter-input" style="width:100%;" placeholder="항목 내용을 입력하세요"></td>' +
          '<td style="text-align:center;">' +
            '<div class="edu-toggle">' +
              '<div class="edu-toggle__track edu-toggle__track--on"><div class="edu-toggle__thumb"></div></div>' +
            '</div>' +
          '</td>' +
          '<td style="text-align:center;">' +
            '<button class="edu-delete-btn">' + DELETE_SVG + '</button>' +
          '</td>';
      } else {
        // 서약서: 순서 | 항목내용(input + 하위항목) | 삭제
        row.innerHTML =
          '<td><span class="drag-handle">↕</span> ' + nextNum + '</td>' +
          '<td>' +
            '<input type="text" class="filter-input" style="width:100%;" placeholder="항목 내용을 입력하세요">' +
            '<div class="edu-sub-items">' +
              '<button class="edu-sub-items__add">+ 하위 항목 추가</button>' +
            '</div>' +
          '</td>' +
          '<td style="text-align:center;">' +
            '<button class="edu-delete-btn">' + DELETE_SVG + '</button>' +
          '</td>';
      }

      tbody.appendChild(row);
    });

    // ──────────────────────────────────────────
    // 5. 원칙 설명 글머리 항목 추가
    //    .edu-bullet-list__add 클릭 → 같은 값 영역의 ul에 li 추가
    // ──────────────────────────────────────────

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

    // ──────────────────────────────────────────
    // 6. 하위 항목 추가 (서약서)
    //    .edu-sub-items__add 클릭 → 앞에 새 하위 항목 삽입
    // ──────────────────────────────────────────

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.edu-sub-items__add');
      if (!btn) return;

      var container = btn.closest('.edu-sub-items');
      if (!container) return;

      var item = document.createElement('div');
      item.className = 'edu-sub-items__item';
      item.innerHTML =
        '<input type="text" class="filter-input" style="flex:1;" placeholder="하위 항목을 입력하세요">' +
        '<button class="edu-sub-items__delete">삭제</button>';

      // 추가 버튼 앞에 삽입
      container.insertBefore(item, btn);
    });

    // ──────────────────────────────────────────
    // 7. 하위 항목 삭제 (서약서)
    //    .edu-sub-items__delete 클릭 → 해당 항목 제거
    // ──────────────────────────────────────────

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.edu-sub-items__delete');
      if (!btn) return;

      var item = btn.closest('.edu-sub-items__item');
      if (item) item.remove();
    });

    // ──────────────────────────────────────────
    // 유틸리티
    // ──────────────────────────────────────────

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

  });
})();
