/**
 * 우유펫 관리자 대시보드 — 공통 JavaScript
 * 모달 시스템, 마스킹 토글, 소개글 토글
 *
 * 계층 구조: common.js → components.js → [페이지전용].js
 * 로드 순서: 모든 HTML에서 </body> 앞에 <script src="js/common.js"></script>
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {

    // ──────────────────────────────────────────
    // 1. 모달 시스템
    // ──────────────────────────────────────────

    // 1-a. 모달 열기: data-modal-open="모달ID"
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('[data-modal-open]');
      if (!trigger) return;

      var modalId = trigger.getAttribute('data-modal-open');
      var modal = document.getElementById(modalId);
      if (modal) modal.classList.add('active');
    });

    // 1-b. 모달 닫기: data-modal-close (취소/닫기 버튼)
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('[data-modal-close]');
      if (!trigger) return;

      var modal = trigger.closest('.modal-overlay');
      if (modal) modal.classList.remove('active');
    });

    // 1-c. 오버레이 클릭으로 닫기 (모달 바깥 영역)
    document.addEventListener('click', function (e) {
      if (e.target.classList.contains('modal-overlay') &&
          e.target.classList.contains('active')) {
        e.target.classList.remove('active');
      }
    });

    // 1-d. ESC 키로 열린 모달 닫기
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var activeModal = document.querySelector('.modal-overlay.active');
        if (activeModal) activeModal.classList.remove('active');
      }
    });

    // ──────────────────────────────────────────
    // 2. textarea/select → 버튼 활성화 연동
    //    data-enables="버튼ID"
    //    복합 조건: data-enables-with="다른입력요소ID"
    // ──────────────────────────────────────────

    function checkEnableCondition(el) {
      var targetBtnId = el.getAttribute('data-enables');
      if (!targetBtnId) return;

      var btn = document.getElementById(targetBtnId);
      if (!btn) return;

      var hasValue = el.value.trim() !== '';

      // 복합 조건 확인 (예: textarea + select 둘 다 필수)
      var withId = el.getAttribute('data-enables-with');
      if (withId) {
        var withEl = document.getElementById(withId);
        hasValue = hasValue && withEl && withEl.value.trim() !== '';
      }

      btn.disabled = !hasValue;
    }

    // input 이벤트 (textarea 타이핑)
    document.addEventListener('input', function (e) {
      checkEnableCondition(e.target);
    });

    // change 이벤트 (select 변경)
    document.addEventListener('change', function (e) {
      checkEnableCondition(e.target);
    });

    // ──────────────────────────────────────────
    // 3. 마스킹 토글 (전체보기/숨기기)
    //    .masked-field__toggle 클릭 시 동작
    //    인접 .masked-field__value에 data-masked, data-raw 필요
    // ──────────────────────────────────────────

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.masked-field__toggle');
      if (!btn) return;

      var valueEl = btn.previousElementSibling;
      if (!valueEl) return;

      var masked = valueEl.getAttribute('data-masked');
      var raw = valueEl.getAttribute('data-raw');
      if (!masked || !raw) return;

      if (valueEl.textContent === masked) {
        valueEl.textContent = raw;
        btn.textContent = '숨기기';
      } else {
        valueEl.textContent = masked;
        btn.textContent = '전체보기';
      }
    });

    // ──────────────────────────────────────────
    // 4. 소개글 더보기/접기 토글
    //    .intro-toggle 클릭 시 동작
    //    바로 앞 .intro-text 요소를 expanded 토글
    // ──────────────────────────────────────────

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.intro-toggle');
      if (!btn) return;

      var introText = btn.previousElementSibling;
      if (!introText || !introText.classList.contains('intro-text')) return;

      introText.classList.toggle('expanded');
      var isExpanded = introText.classList.contains('expanded');
      btn.textContent = isExpanded ? '접기' : '더보기';
    });

  });
})();
