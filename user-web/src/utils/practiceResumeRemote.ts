import { api, request } from '../api/request';
import type { PracticeResumeSnapshot } from './practiceResume';

type RemotePracticeResumeResponse = {
  snapshot: PracticeResumeSnapshot | null;
  updatedAt?: string | null;
};

function sessionUrl(key: string) {
  return `/practice/sessions?key=${encodeURIComponent(key)}`;
}

function normalizeRemoteSnapshot(response: RemotePracticeResumeResponse) {
  if (!response.snapshot) return null;
  return {
    ...response.snapshot,
    updatedAt: response.updatedAt || response.snapshot.updatedAt || ''
  };
}

export async function fetchRemotePracticeResume(key: string) {
  if (!key) return null;
  const response = await api.get<RemotePracticeResumeResponse>(sessionUrl(key));
  return normalizeRemoteSnapshot(response);
}

export async function saveRemotePracticeResume(key: string, snapshot: PracticeResumeSnapshot, options: RequestInit = {}) {
  if (!key) return null;
  const response = await request<RemotePracticeResumeResponse>('/practice/sessions', {
    ...options,
    method: 'PUT',
    body: JSON.stringify({ key, snapshot })
  });
  return normalizeRemoteSnapshot(response);
}

export async function clearRemotePracticeResume(key: string) {
  if (!key) return;
  await api.delete(sessionUrl(key));
}
