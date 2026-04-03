import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { MicInteractionMode, VoiceRoute } from "../voice/voiceAssistantTypes";
import {
  defaultMalvChatComposerSettings,
  loadMalvChatComposerSettings,
  persistMalvChatComposerSettings,
  type MalvChatComposerSettings,
  type MalvReplyMode,
  type VoiceSubmitMode
} from "./malvChatComposerSettingsTypes";

type MalvChatComposerSettingsContextValue = MalvChatComposerSettings & {
  setVoiceInputMode: (m: MicInteractionMode) => void;
  setVoiceSubmitMode: (m: VoiceSubmitMode) => void;
  setAssistantRoute: (r: VoiceRoute) => void;
  setReplyMode: (r: MalvReplyMode) => void;
};

const MalvChatComposerSettingsContext = createContext<MalvChatComposerSettingsContextValue | null>(null);

export function MalvChatComposerSettingsProvider(props: { children: ReactNode }) {
  const [state, setState] = useState<MalvChatComposerSettings>(() => loadMalvChatComposerSettings());

  useEffect(() => {
    persistMalvChatComposerSettings(state);
  }, [state]);

  const setVoiceInputMode = useCallback((voiceInputMode: MicInteractionMode) => {
    setState((s) => ({ ...s, voiceInputMode }));
  }, []);

  const setVoiceSubmitMode = useCallback((voiceSubmitMode: VoiceSubmitMode) => {
    setState((s) => ({ ...s, voiceSubmitMode }));
  }, []);

  const setAssistantRoute = useCallback((assistantRoute: VoiceRoute) => {
    setState((s) => ({ ...s, assistantRoute }));
  }, []);

  const setReplyMode = useCallback((replyMode: MalvReplyMode) => {
    setState((s) => ({ ...s, replyMode }));
  }, []);

  const value = useMemo<MalvChatComposerSettingsContextValue>(
    () => ({
      ...state,
      setVoiceInputMode,
      setVoiceSubmitMode,
      setAssistantRoute,
      setReplyMode
    }),
    [state, setVoiceInputMode, setVoiceSubmitMode, setAssistantRoute, setReplyMode]
  );

  return (
    <MalvChatComposerSettingsContext.Provider value={value}>{props.children}</MalvChatComposerSettingsContext.Provider>
  );
}

export function useMalvChatComposerSettings(): MalvChatComposerSettingsContextValue {
  const ctx = useContext(MalvChatComposerSettingsContext);
  if (!ctx) {
    return {
      ...defaultMalvChatComposerSettings(),
      setVoiceInputMode: () => {},
      setVoiceSubmitMode: () => {},
      setAssistantRoute: () => {},
      setReplyMode: () => {}
    };
  }
  return ctx;
}
