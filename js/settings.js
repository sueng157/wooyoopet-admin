/**
 * 우유펫 관리자 대시보드 — 설정 전용 JavaScript
 * 자동 처리 규칙 동적 추가/삭제
 *
 * 계층 구조: common.js → components.js → settings.js
 * 대상 페이지: settings.html
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {

    // ──────────────────────────────────────────
    // 1. 자동 처리 규칙 추가
    //    #addAutoRuleBtn 클릭 → info-grid에 새 규칙 행 삽입
    // ──────────────────────────────────────────

    var ruleCounter = 0;

    document.addEventListener('click', function (e) {
      // 규칙 추가 버튼
      if (e.target.closest('#addAutoRuleBtn')) {
        ruleCounter++;

        var card = e.target.closest('.detail-card');
        if (!card) return;

        var grid = card.querySelector('.info-grid');
        if (!grid) return;

        // 라벨
        var label = document.createElement('span');
        label.className = 'info-grid__label';
        label.innerHTML = '추가 규칙 ' + ruleCounter +
          ' <button class="stg-rule-delete" style="margin-left:4px;font-size:11px;color:var(--danger);background:none;border:none;cursor:pointer;">삭제</button>';

        // 값
        var value = document.createElement('span');
        value.className = 'info-grid__value';
        value.innerHTML =
          '<div class="stg-input-group">' +
            '<input type="text" class="form-input" style="width:200px;" placeholder="규칙 조건을 입력하세요">' +
            '<input type="number" class="form-input form-input--xs" placeholder="값" min="1">' +
            '<span class="stg-input-suffix">시간</span>' +
          '</div>' +
          '<div class="stg-hint">※ 새로 추가된 자동 처리 규칙</div>';

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
        if (valueEl && valueEl.classList.contains('info-grid__value')) {
          valueEl.remove();
        }
        labelEl.remove();

        return;
      }
    });

  });
})();
