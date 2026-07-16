import { useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

/**
 * Google 로그인 세션 관리.
 * - 세션은 Firebase가 브라우저(indexedDB)에 지속 저장하므로 최초 1회 로그인 후
 *   재실행/탭 종료에도 유지된다(명시적 로그아웃 전까지). → onAuthStateChanged가 복원.
 * - 로그인은 팝업 방식으로 통일한다. 리다이렉트 방식은 authDomain이 앱과 다른 도메인일 때
 *   모바일 브라우저의 서드파티 저장소 차단으로 실패하는 경우가 많다. 팝업이 막힌 환경에서만
 *   리다이렉트로 폴백한다.
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!auth) {
      setReady(true); // Firebase 미설정(로컬 전용) 시 게이트 없이 통과
      return;
    }
    // 모바일 리다이렉트 로그인에서 복귀한 경우 결과 처리(에러는 조용히 무시)
    getRedirectResult(auth).catch(() => {});
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);
    });
  }, []);

  const login = async () => {
    if (!auth) return;
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      // 사용자가 팝업을 닫은 경우는 정상 취소로 간주
      if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') return;
      // 팝업이 막히거나 지원되지 않는 환경이면 리다이렉트로 폴백
      if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') {
        try { await signInWithRedirect(auth, googleProvider); return; } catch {}
      }
      console.error('[auth] 로그인 실패:', e);
      alert('로그인에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const logout = () => auth && signOut(auth);

  return { user, ready, login, logout };
}
