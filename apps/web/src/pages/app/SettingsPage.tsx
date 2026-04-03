import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ModuleShell } from "./common/ModuleShell";
import { StatusChip, Button, SegmentedControl, Switch } from "@malv/ui";
import { SettingsSection, SettingsToolbar } from "../../components/settings";
import { useMalvChatComposerSettings } from "../../lib/settings/MalvChatComposerSettingsContext";
import type { MalvReplyMode } from "../../lib/settings/malvChatComposerSettingsTypes";
import type { MicInteractionMode, VoiceRoute, VoiceSubmitMode } from "../../lib/voice/voiceAssistantTypes";

type BeastLevel = "Passive" | "Smart" | "Advanced" | "Beast";
type Density = "compact" | "comfortable";

const beastOptions: Array<{ value: BeastLevel; label: string }> = [
  { value: "Passive", label: "Passive" },
  { value: "Smart", label: "Smart" },
  { value: "Advanced", label: "Advanced" },
  { value: "Beast", label: "Beast" }
];

const densityOptions: Array<{ value: Density; label: string }> = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" }
];

const voiceInputOptions: Array<{ value: MicInteractionMode; label: string }> = [
  { value: "toggle", label: "Tap to record" },
  { value: "press", label: "Hold to record" }
];

const voiceSubmitOptions: Array<{ value: VoiceSubmitMode; label: string }> = [
  { value: "manual", label: "Manual send" },
  { value: "auto", label: "Auto-send after transcription" }
];

const assistantRouteOptions: Array<{ value: VoiceRoute; label: string }> = [
  { value: "chat", label: "Chat" },
  { value: "operator", label: "Operator" }
];

const replyModeOptions: Array<{ value: MalvReplyMode; label: string }> = [
  { value: "text", label: "Text" },
  { value: "voice", label: "Voice" },
  { value: "text_and_voice", label: "Text + voice" }
];

export function SettingsPage() {
  const navigate = useNavigate();
  const composer = useMalvChatComposerSettings();
  const [presence, setPresence] = useState(true);
  const [vaultCapture, setVaultCapture] = useState(true);
  const [beastDefault, setBeastDefault] = useState<BeastLevel>("Smart");
  const [density, setDensity] = useState<Density>("comfortable");
  const [saveBusy, setSaveBusy] = useState(false);
  const [lastSynced, setLastSynced] = useState<number | null>(null);

  const onSave = useCallback(() => {
    if (saveBusy) return;
    setSaveBusy(true);
    window.setTimeout(() => {
      setSaveBusy(false);
      setLastSynced(Date.now());
    }, 650);
  }, [saveBusy]);

  const headerRight =
    lastSynced !== null ? (
      <StatusChip label="Synced locally" status="success" />
    ) : (
      <StatusChip label="Not persisted" status="neutral" />
    );

  return (
    <ModuleShell
      kicker="Control plane"
      title="Preferences"
      subtitle="Calibrate presence, Beast defaults, vault capture, and layout density. Changes stay on this device until the API syncs preferences."
      maxWidth="narrow"
      flush
      right={headerRight}
    >
      <div className="space-y-5 sm:space-y-6">
        <SettingsSection
          title="Identity & presence"
          description="How MALV signals availability and tone in the operator channel."
          badge={<StatusChip label="Private" status="success" />}
        >
          <Switch
            checked={presence}
            onChange={setPresence}
            label="Presence signals"
            description="When on, MALV can reflect availability and continuity across sessions on trusted devices."
          />
        </SettingsSection>

        <SettingsSection
          title="Intelligence & Beast"
          description="Default reasoning depth for new tasks. Heavy work still routes through your GPU worker when policy allows."
        >
          <div>
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-brand mb-3">Default level</p>
            <SegmentedControl
              value={beastDefault}
              onChange={setBeastDefault}
              options={beastOptions}
              className="w-full sm:w-auto justify-center"
            />
            <p className="text-xs text-malv-muted mt-4 leading-relaxed">
              Higher levels increase proactive suggestions and synthesis. Beast tier may queue sandbox or GPU jobs.
            </p>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Privacy & memory"
          description="Vault capture during realtime sessions — isolated from normal chat memory."
        >
          <Switch
            checked={vaultCapture}
            onChange={setVaultCapture}
            label="Vault triggers during calls"
            description="Allow secret-phrase and identity-verified vault hooks while voice or video is active. Requires policy approval server-side."
          />
        </SettingsSection>

        <SettingsSection
          title="Chat & voice"
          description="Composer stays minimal; mic behavior, routing, and spoken replies are controlled here. Applies to the operator chat channel."
        >
          <div className="space-y-6">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-brand mb-3">Voice input</p>
              <SegmentedControl
                value={composer.voiceInputMode}
                onChange={composer.setVoiceInputMode}
                options={voiceInputOptions}
                className="w-full sm:w-auto justify-center"
              />
            </div>
            <div>
              <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-brand mb-3">After transcription</p>
              <SegmentedControl
                value={composer.voiceSubmitMode}
                onChange={composer.setVoiceSubmitMode}
                options={voiceSubmitOptions}
                className="w-full sm:w-auto justify-center"
              />
              <p className="text-xs text-malv-muted mt-3 leading-relaxed">
                Manual leaves the final text in the composer for edits. Auto-send submits one message and clears the voice overlay.
              </p>
            </div>
            <div>
              <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-brand mb-3">Assistant route</p>
              <SegmentedControl
                value={composer.assistantRoute}
                onChange={composer.setAssistantRoute}
                options={assistantRouteOptions}
                className="w-full sm:w-auto justify-center"
              />
              <p className="text-xs text-malv-muted mt-3 leading-relaxed">
                Operator biases execution-style routing for typed messages and composer voice that fills the input. Voice-only operator streaming still uses the realtime voice path when you hold or tap the mic.
              </p>
            </div>
            <div>
              <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-brand mb-3">Reply mode</p>
              <SegmentedControl
                value={composer.replyMode}
                onChange={composer.setReplyMode}
                options={replyModeOptions}
                className="w-full sm:w-auto justify-center"
              />
              <p className="text-xs text-malv-muted mt-3 leading-relaxed">
                Text + voice keeps read-aloud controls on each reply. Voice alone reads replies automatically without the extra strip.
              </p>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Experience"
          description="Information density and motion — tuned for long sessions on desktop and thumbs on mobile."
        >
          <div>
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-brand mb-3">Layout density</p>
            <SegmentedControl value={density} onChange={setDensity} options={densityOptions} className="w-full sm:w-auto justify-center" />
            <p className="text-xs text-malv-muted mt-4 leading-relaxed">
              Compact tightens vertical rhythm and panel padding. Comfortable is the default operator layout.
            </p>
          </div>
        </SettingsSection>

        <SettingsToolbar
          hint="Preferences will sync across trusted devices when the account API is connected. Until then, values stay in this browser."
          primary={
            <Button className="w-full min-h-[48px] sm:w-auto sm:min-w-[160px] justify-center px-8" loading={saveBusy} onClick={onSave}>
              Save changes
            </Button>
          }
          secondary={
            <Button
              variant="secondary"
              className="w-full min-h-[48px] sm:w-auto sm:min-w-[120px] justify-center px-8"
              onClick={() => navigate("/app")}
            >
              Close
            </Button>
          }
        />
      </div>
    </ModuleShell>
  );
}
