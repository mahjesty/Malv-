import { getStoredSession } from "../auth/session";
import { refreshSessionOnce } from "../auth/refreshSession";
import { getApiBaseUrl, mapFetchFailure } from "./http-core";

export type VoiceTestTriggerResponse = {
  ok: boolean;
  transcript: string;
  normalizedTranscript: string;
  matched: boolean;
  replyText: string;
  audioUrl: string | null;
  audioBase64: string | null;
  audioMimeType: string | null;
  playbackMode: "local_asset" | "local_tts" | null;
  error: string | null;
  sttErrorCode: string | null;
  sttRejectedReason: string | null;
  operatorDispatchError: string | null;
};

/**
 * POST /v1/voice/test-trigger — multipart field `audio` (Blob), optional `callSessionId` for operator follow-up.
 */
export async function postVoiceTestTrigger(args: {
  accessToken: string;
  blob: Blob;
  mimeType: string;
  callSessionId?: string | null;
}): Promise<VoiceTestTriggerResponse> {
  const form = new FormData();
  form.append("audio", args.blob, "utterance.webm");
  if (args.callSessionId) {
    form.append("callSessionId", args.callSessionId);
  }

  const doFetch = async (bearer: string | undefined) => {
    return fetch(`${getApiBaseUrl()}/v1/voice/test-trigger`, {
      method: "POST",
      credentials: "include",
      headers: bearer ? { authorization: `Bearer ${bearer}` } : undefined,
      body: form
    });
  };

  let res: Response;
  try {
    res = await doFetch(args.accessToken);
  } catch (e) {
    throw mapFetchFailure(e);
  }

  const hadBearer = Boolean(args.accessToken);
  if (res.status === 401 && hadBearer) {
    const refreshed = await refreshSessionOnce({
      context: "authenticated_request",
      hadActiveSession: true
    });
    if (refreshed) {
      const next = getStoredSession()?.accessToken;
      if (next) {
        try {
          const form2 = new FormData();
          form2.append("audio", args.blob, "utterance.webm");
          if (args.callSessionId) {
            form2.append("callSessionId", args.callSessionId);
          }
          res = await fetch(`${getApiBaseUrl()}/v1/voice/test-trigger`, {
            method: "POST",
            credentials: "include",
            headers: { authorization: `Bearer ${next}` },
            body: form2
          });
        } catch (e) {
          throw mapFetchFailure(e);
        }
      }
    }
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `HTTP ${res.status}`);
  }

  return (await res.json()) as VoiceTestTriggerResponse;
}
