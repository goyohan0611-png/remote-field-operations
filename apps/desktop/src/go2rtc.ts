import { useEffect, type RefObject } from 'react';
import type { SiteConnectionContext } from '@fieldlink/shared';

// 영상 장비·중계 프로그램에 접속하지 않고 기존 모니터링 UI를 유지한다.
export function useGoRtcSiteStream(_site: SiteConnectionContext, setError: (error: string) => void) {
  useEffect(() => { setError('데모 · 실제 영상 스트림은 연결하지 않습니다.'); }, [setError]);
  return false;
}
export function useGoRtcStream(_name: string, _video: RefObject<HTMLVideoElement | null>, setError: (error: string) => void, _muted: RefObject<boolean>, _enabled = true) {
  useEffect(() => { setError('데모 · 실제 영상 스트림은 연결하지 않습니다.'); }, [setError]);
}
