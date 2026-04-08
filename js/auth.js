/**
 * 우유펫 관리자 대시보드 — 인증·세션·권한 관리
 *
 * 로드 순서: supabase-js CDN → supabase-client.js → auth.js → common.js → components.js
 *
 * 기능:
 *  - 로그인 (login.html 전용)
 *  - 세션 체크 (모든 페이지)
 *  - 사이드바 프로필 동적 표시
 *  - 메뉴 접근 권한 제어
 *  - 로그아웃
 */
(function () {
  'use strict';

  // ──────────────────────────────────────────
  // 0. Supabase 클라이언트 참조
  // ──────────────────────────────────────────
  var sb = window.__supabase;
  if (!sb) {
    console.error('[auth] Supabase 클라이언트가 초기화되지 않았습니다.');
    return;
  }

  // ──────────────────────────────────────────
  // 1. 상수 정의
  // ──────────────────────────────────────────
  var LOGIN_PAGE = 'login.html';
  var DASHBOARD_PAGE = 'index.html';
  var SESSION_KEY = 'wooyoopet_admin';

  // 페이지 파일명 → 필요 권한 매핑
  var PAGE_PERM_MAP = {
    'members.html':                'perm_members',
    'member-detail.html':          'perm_members',
    'kindergartens.html':          'perm_kindergartens',
    'kindergarten-detail.html':    'perm_kindergartens',
    'pets.html':                   'perm_pets',
    'pet-detail.html':             'perm_pets',
    'reservations.html':           'perm_reservations',
    'reservation-detail.html':     'perm_reservations',
    'payments.html':               'perm_payments',
    'payment-detail.html':         'perm_payments',
    'refund-detail.html':          'perm_payments',
    'settlements.html':            'perm_settlements',
    'settlement-detail.html':      'perm_settlements',
    'settlement-info-detail.html': 'perm_settlements',
    'chats.html':                  'perm_chats',
    'chat-detail.html':            'perm_chats',
    'report-detail.html':          'perm_chats',
    'reviews.html':                'perm_reviews',
    'review-detail.html':          'perm_reviews',
    'review-kg-detail.html':       'perm_reviews',
    'educations.html':             'perm_educations',
    'education-detail.html':       'perm_educations',
    'education-create.html':       'perm_educations',
    'education-checklist-detail.html': 'perm_educations',
    'education-checklist-create.html': 'perm_educations',
    'education-pledge-detail.html':    'perm_educations',
    'education-pledge-create.html':    'perm_educations',
    'education-status-detail.html':    'perm_educations',
    'contents.html':               'perm_contents',
    'content-banner-detail.html':  'perm_contents',
    'content-banner-create.html':  'perm_contents',
    'content-notice-detail.html':  'perm_contents',
    'content-notice-create.html':  'perm_contents',
    'content-faq-detail.html':     'perm_contents',
    'content-faq-create.html':     'perm_contents',
    'content-terms-detail.html':   'perm_contents',
    'content-terms-create.html':   'perm_contents',
    'content-terms-version-create.html': 'perm_contents',
    'settings.html':               'perm_settings',
    'setting-admin-detail.html':   'perm_settings',
    'setting-admin-create.html':   'perm_settings',
    'setting-feedback-detail.html':'perm_settings'
  };

  // 사이드바 메뉴 권한은 HTML의 data-perm 속성으로 관리
  // 예: <a href="members.html" class="sidebar__menu-item" data-perm="perm_members">회원관리</a>

  // ──────────────────────────────────────────
  // 2. 유틸리티 함수
  // ──────────────────────────────────────────

  /** 현재 파일명 추출 (예: "members.html") */
  function getCurrentPage() {
    var path = window.location.pathname;
    var parts = path.split('/');
    var page = parts[parts.length - 1] || DASHBOARD_PAGE;
    // URL에 파일명이 없으면 (/ 로 끝나면) index.html
    if (page === '' || page === '/') page = DASHBOARD_PAGE;
    return page;
  }

  /** 로그인 페이지인지 확인 */
  function isLoginPage() {
    return getCurrentPage() === LOGIN_PAGE;
  }

  /** 리다이렉트 */
  function redirectTo(page) {
    window.location.href = page;
  }

  /** sessionStorage에 관리자 정보 캐시 */
  function cacheAdmin(admin) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(admin));
    } catch (e) { /* sessionStorage 불가 시 무시 */ }
  }

  /** sessionStorage에서 관리자 정보 읽기 */
  function getCachedAdmin() {
    try {
      var data = sessionStorage.getItem(SESSION_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) { return null; }
  }

  /** sessionStorage 클리어 */
  function clearCache() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* 무시 */ }
  }

  // ──────────────────────────────────────────
  // 3. 관리자 정보 조회 (admin_accounts)
  // ──────────────────────────────────────────

  /**
   * auth.uid()에 해당하는 관리자 정보를 DB에서 조회
   * @param {string} authUserId - auth.users의 id
   * @returns {Promise<object|null>}
   */
  async function fetchAdminByAuthId(authUserId) {
    var result = await sb
      .from('admin_accounts')
      .select('id, admin_login_id, name, phone, email, role, status, perm_members, perm_kindergartens, perm_pets, perm_reservations, perm_payments, perm_settlements, perm_chats, perm_reviews, perm_educations, perm_contents, perm_settings, last_login_at')
      .eq('auth_user_id', authUserId)
      .single();

    if (result.error || !result.data) return null;
    return result.data;
  }

  // ──────────────────────────────────────────
  // 4. 로그인 로그 기록
  // ──────────────────────────────────────────

  async function insertLoginLog(adminId, resultText) {
    if (!adminId) return;
    try {
      await sb.from('admin_login_logs').insert({
        admin_id: adminId,
        login_at: new Date().toISOString(),
        ip_address: '0.0.0.0',  // 클라이언트에서는 실제 IP 취득 불가, 서버사이드 보완 필요
        result: resultText,
        created_at: new Date().toISOString()
      });
    } catch (e) { /* 로그 실패는 무시 */ }
  }

  async function updateLastLogin(adminId) {
    if (!adminId) return;
    try {
      await sb.from('admin_accounts')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', adminId);
    } catch (e) { /* 무시 */ }
  }

  // ──────────────────────────────────────────
  // 5. 로그인 처리 (login.html에서만 호출)
  // ──────────────────────────────────────────

  /**
   * 로그인 실행
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{success: boolean, error: string}>}
   */
  async function doLogin(email, password) {
    // 5-1. Supabase Auth 로그인 시도
    var authResult = await sb.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (authResult.error) {
      // 로그인 실패
      return { success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' };
    }

    var authUser = authResult.data.user;

    // 5-2. admin_accounts에서 관리자 정보 조회
    var admin = await fetchAdminByAuthId(authUser.id);

    if (!admin) {
      // Auth는 성공했지만 관리자 테이블에 없음 → 로그아웃 처리
      await sb.auth.signOut();
      return { success: false, error: '관리자 계정이 등록되어 있지 않습니다.' };
    }

    // 5-3. 비활성 계정 체크
    if (admin.status === '비활성') {
      await insertLoginLog(admin.id, '실패');
      await sb.auth.signOut();
      return { success: false, error: '비활성화된 계정입니다. 관리자에게 문의하세요.' };
    }

    // 5-4. 로그인 성공 처리
    await insertLoginLog(admin.id, '성공');
    await updateLastLogin(admin.id);
    cacheAdmin(admin);

    return { success: true, error: '' };
  }

  // ──────────────────────────────────────────
  // 6. 로그아웃
  // ──────────────────────────────────────────

  async function doLogout() {
    clearCache();
    await sb.auth.signOut();
    redirectTo(LOGIN_PAGE);
  }

  // ──────────────────────────────────────────
  // 7. 사이드바 프로필 동적 업데이트
  // ──────────────────────────────────────────

  function updateSidebarProfile(admin) {
    if (!admin) return;

    // 사이드바 프로필
    var nameEl = document.querySelector('.sidebar__admin-name');
    var roleEl = document.querySelector('.sidebar__admin-role');

    if (nameEl) nameEl.textContent = admin.name;
    if (roleEl) roleEl.textContent = admin.role;

    // 헤더 프로필 ("홍길동 관리자" → "이름 역할")
    var headerNameEl = document.querySelector('.header__admin-name');
    if (headerNameEl) headerNameEl.textContent = admin.name + ' ' + admin.role;
  }

  // ──────────────────────────────────────────
  // 8. 메뉴 접근 권한 제어
  // ──────────────────────────────────────────

  function applyPermissions(admin) {
    if (!admin) return;

    // 8-1. 사이드바 메뉴 숨김 처리 (data-perm 속성 기반)
    var menuItems = document.querySelectorAll('.sidebar__menu-item[data-perm]');
    menuItems.forEach(function (item) {
      var permKey = item.getAttribute('data-perm');
      if (!permKey) return;

      var permValue = admin[permKey];
      if (permValue === '접근불가') {
        item.style.display = 'none';
      }
    });

    // 8-2. 현재 페이지 접근 차단 체크
    var currentPage = getCurrentPage();
    var requiredPerm = PAGE_PERM_MAP[currentPage];

    // 대시보드 또는 매핑 없는 페이지 → 접근 허용
    if (!requiredPerm) return;

    var currentPermValue = admin[requiredPerm];
    if (currentPermValue === '접근불가') {
      redirectTo(DASHBOARD_PAGE);
    }
  }

  // ──────────────────────────────────────────
  // 9. 페이지 로드 시 세션 체크 (메인 진입점)
  // ──────────────────────────────────────────

  async function initAuth() {
    var currentPage = getCurrentPage();

    // 9-1. Supabase 세션 확인
    var sessionResult = await sb.auth.getSession();
    var session = sessionResult.data.session;

    // 9-2. 로그인 페이지인 경우
    if (isLoginPage()) {
      if (session) {
        // 이미 로그인됨 → 대시보드로
        redirectTo(DASHBOARD_PAGE);
      }
      // 로그인 페이지에서는 여기서 종료 (로그인 폼 JS가 별도 처리)
      return;
    }

    // 9-3. 로그인 페이지가 아닌데 세션 없음 → 로그인으로
    if (!session) {
      clearCache();
      redirectTo(LOGIN_PAGE);
      return;
    }

    // 9-4. 관리자 정보 확보 (캐시 → DB 조회)
    var admin = getCachedAdmin();

    if (!admin) {
      admin = await fetchAdminByAuthId(session.user.id);
      if (!admin || admin.status === '비활성') {
        await doLogout();
        return;
      }
      cacheAdmin(admin);
    }

    // 9-5. UI 적용
    updateSidebarProfile(admin);
    applyPermissions(admin);

    // 9-6. 로그아웃 버튼 이벤트 바인딩 (사이드바 + 헤더)
    var logoutBtns = document.querySelectorAll('.sidebar__logout, .header__logout');
    logoutBtns.forEach(function (btn) {
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        doLogout();
      });
    });
  }

  // ──────────────────────────────────────────
  // 10. Auth 상태 변경 리스너 (토큰 만료 등)
  // ──────────────────────────────────────────

  sb.auth.onAuthStateChange(function (event, session) {
    if (event === 'SIGNED_OUT' && !isLoginPage()) {
      clearCache();
      redirectTo(LOGIN_PAGE);
    }
  });

  // ──────────────────────────────────────────
  // 11. 전역 노출 (login.html에서 doLogin 호출 필요)
  // ──────────────────────────────────────────

  window.__auth = {
    doLogin: doLogin,
    doLogout: doLogout,
    getAdmin: getCachedAdmin
  };

  // ──────────────────────────────────────────
  // 12. DOMContentLoaded에서 초기화
  // ──────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
  } else {
    initAuth();
  }

})();
