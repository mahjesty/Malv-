/** UI foundation primitives */
export { MalvButton, malvButtonVariants, type MalvButtonProps } from "./MalvButton";
export { MalvCard, malvCardVariants, type MalvCardProps } from "./MalvCard";
export { MalvInput, malvInputVariants, type MalvInputProps } from "./MalvInput";
export { MalvPanel, malvPanelVariants, type MalvPanelProps } from "./MalvPanel";
export { MalvSectionHeader, type MalvSectionHeaderProps } from "./MalvSectionHeader";

/** Existing MALV shell / call surface (barrel) */
export * from "./presence";
export { MalvPresenceSurface } from "./call/MalvPresenceSurface";
export { MalvCallStatusBar } from "./call/MalvCallStatusBar";
export { MalvVideoCallPanel } from "./call/MalvVideoCallPanel";
export { MalvVideoCallScreen } from "./shell/MalvVideoCallScreen";
export { MalvChatShell } from "./shell/MalvChatShell";
export { MalvComposer } from "./shell/MalvComposer";
export { MalvConversationList } from "./shell/MalvConversationList";
export type { MalvConversationRow } from "./shell/MalvConversationList";
export { MalvMessageList } from "./shell/MalvMessageList";
