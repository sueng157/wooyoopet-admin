/**
 * 우유펫 관리자 대시보드 — Supabase 클라이언트 초기화
 *
 * 로드 순서: supabase-js CDN → supabase-client.js → auth.js → common.js → components.js
 * CDN: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://ieeodlkvfnjikdpcumfa.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9kbGt2Zm5qaWtkcGN1bWZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTEzNTUsImV4cCI6MjA5MDA4NzM1NX0.EKNy8u80uueaKI-AG-wsw0AssVrHKw635Chaf5I9oIE';

  // supabase-js CDN이 window.supabase에 createClient를 노출
  if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
    console.error('[supabase-client] supabase-js CDN이 로드되지 않았습니다.');
    return;
  }

  window.__supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
