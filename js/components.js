/**
 * 우유펫 관리자 대시보드 — 컴포넌트 JavaScript
 * 탭 전환, 전체선택 체크박스, 순서 화살표, 버전 유효성 검사, 글자 수 카운터
 *
 * 계층 구조: common.js → components.js → [페이지전용].js
 * 로드 순서: common.js 뒤에 <script src="js/components.js"></script>
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {

    // ──────────────────────────────────────────
    // 1. 탭 전환 시스템
    //    data-tab-target="탭콘텐츠ID"
    //    (.tab-bar__item 에 부여)
    // ──────────────────────────────────────────

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-tab-target]');
      if (!btn) return;

      var targetId = btn.getAttribute('data-tab-target');
      var tabBar = btn.closest('.tab-bar');
      if (!tabBar) return;

      // 같은 탭 바 내의 버튼만 토글
      tabBar.querySelectorAll('.tab-bar__item').forEach(function (item) {
        item.classList.remove('active');
      });
      btn.classList.add('active');

      // 탭 콘텐츠 전환 (같은 부모 컨테이너 내)
      var container = tabBar.parentElement;
      container.querySelectorAll('.tab-content').forEach(function (content) {
        content.classList.remove('active');
      });

      var targetTab = document.getElementById(targetId);
      if (targetTab) targetTab.classList.add('active');
    });

    // ──────────────────────────────────────────
    // 2. 전체선택 체크박스
    //    <th class="data-table__checkbox"> 안의 checkbox = 전체선택
    //    같은 테이블의 <td class="data-table__checkbox"> 안의 checkbox = 개별
    // ──────────────────────────────────────────

    document.addEventListener('change', function (e) {
      var checkbox = e.target;
      if (checkbox.type !== 'checkbox') return;

      var th = checkbox.closest('th.data-table__checkbox');
      if (!th) return;

      // 전체선택 checkbox가 변경됨
      var table = th.closest('table');
      if (!table) return;

      var rowCheckboxes = table.querySelectorAll('td.data-table__checkbox input[type="checkbox"]');
      rowCheckboxes.forEach(function (cb) {
        cb.checked = checkbox.checked;
      });
    });

    // 개별 체크박스 해제 시 전체선택 체크박스 동기화
    document.addEventListener('change', function (e) {
      var checkbox = e.target;
      if (checkbox.type !== 'checkbox') return;

      var td = checkbox.closest('td.data-table__checkbox');
      if (!td) return;

      var table = td.closest('table');
      if (!table) return;

      var headerCheckbox = table.querySelector('th.data-table__checkbox input[type="checkbox"]');
      if (!headerCheckbox) return;

      var rowCheckboxes = table.querySelectorAll('td.data-table__checkbox input[type="checkbox"]');
      var allChecked = true;
      rowCheckboxes.forEach(function (cb) {
        if (!cb.checked) allChecked = false;
      });
      headerCheckbox.checked = allChecked;
    });

    // ──────────────────────────────────────────
    // 3. 순서 변경 화살표 (▲ / ▼)
    //    .order-arrows__btn 클릭 시 행(tr) 위/아래 교환
    //    순서 번호(.order-arrows 안의 span)도 함께 교환
    // ──────────────────────────────────────────

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.order-arrows__btn');
      if (!btn) return;

      var isUp = btn.textContent.trim() === '▲';
      var currentRow = btn.closest('tr');
      if (!currentRow) return;

      var tbody = currentRow.closest('tbody');
      if (!tbody) return;

      var targetRow;
      if (isUp) {
        targetRow = currentRow.previousElementSibling;
      } else {
        targetRow = currentRow.nextElementSibling;
      }

      if (!targetRow) return; // 맨 위/맨 아래면 무시

      // 행 위치 교환
      if (isUp) {
        tbody.insertBefore(currentRow, targetRow);
      } else {
        tbody.insertBefore(targetRow, currentRow);
      }

      // 순서 번호 업데이트
      var rows = tbody.querySelectorAll('tr');
      rows.forEach(function (row, index) {
        var orderSpan = row.querySelector('.order-arrows > span');
        if (orderSpan) orderSpan.textContent = index + 1;
      });
    });

    // ──────────────────────────────────────────
    // 4. 앱 버전 유효성 검사
    //    data-validate="version" 속성이 있는 input
    //    x.x.x 형식 확인 (숫자.숫자.숫자)
    // ──────────────────────────────────────────

    var VERSION_REGEX = /^\d+\.\d+\.\d+$/;

    document.addEventListener('input', function (e) {
      var input = e.target.closest('[data-validate="version"]');
      if (!input) return;

      var value = input.value.trim();
      if (value === '') {
        input.classList.remove('is-invalid', 'is-valid');
        removeValidationMessage(input);
        return;
      }

      if (VERSION_REGEX.test(value)) {
        input.classList.remove('is-invalid');
        input.classList.add('is-valid');
        removeValidationMessage(input);
      } else {
        input.classList.remove('is-valid');
        input.classList.add('is-invalid');
        showValidationMessage(input, '버전 형식: x.x.x (예: 3.2.1)');
      }
    });

    // ──────────────────────────────────────────
    // 5. 글자 수 카운터
    //    data-maxlength="숫자" 속성이 있는 textarea
    //    현재 글자수/최대치 표시
    // ──────────────────────────────────────────

    // 초기화: 기존 textarea에 카운터 표시
    var countTargets = document.querySelectorAll('[data-maxlength]');
    countTargets.forEach(function (el) {
      createCounter(el);
      updateCounter(el);
    });

    document.addEventListener('input', function (e) {
      var el = e.target.closest('[data-maxlength]');
      if (!el) return;
      updateCounter(el);
    });

    // ──────────────────────────────────────────
    // 유틸리티 함수
    // ──────────────────────────────────────────

    function showValidationMessage(input, message) {
      var existingMsg = input.parentElement.querySelector('.validation-message');
      if (existingMsg) {
        existingMsg.textContent = message;
        return;
      }
      var msg = document.createElement('span');
      msg.className = 'validation-message';
      msg.textContent = message;
      input.parentElement.appendChild(msg);
    }

    function removeValidationMessage(input) {
      var existingMsg = input.parentElement.querySelector('.validation-message');
      if (existingMsg) existingMsg.remove();
    }

    function createCounter(el) {
      var existingCounter = el.parentElement.querySelector('.char-counter');
      if (existingCounter) return;

      var counter = document.createElement('span');
      counter.className = 'char-counter';
      el.parentElement.appendChild(counter);
    }

    function updateCounter(el) {
      var maxLen = parseInt(el.getAttribute('data-maxlength'), 10);
      var currentLen = el.value.length;
      var counter = el.parentElement.querySelector('.char-counter');
      if (!counter) return;

      counter.textContent = currentLen + ' / ' + maxLen;

      if (currentLen > maxLen) {
        counter.classList.add('is-over');
      } else {
        counter.classList.remove('is-over');
      }
    }

  });
})();
