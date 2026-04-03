export type PresenceVariant = 'orb' | 'halo' | 'shell' | 'pulse' | 'neural' | 'holographic'

export type PresenceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'reconnecting' | 'muted'

export type CallMode = 'video' | 'audio'

export interface PresenceConfig {
  variant: PresenceVariant
  primaryColor: string
  secondaryColor: string
  glowColor: string
  glowIntensity: number
  breathingSpeed: number
  pulseSpeed: number
  particleCount: number
}

export interface PresenceProps {
  state: PresenceState
  config: PresenceConfig
  audioLevel?: number
  className?: string
}

export const defaultConfigs: Record<PresenceVariant, PresenceConfig> = {
  orb: {
    variant: 'orb',
    primaryColor: 'oklch(0.75 0.15 200)',
    secondaryColor: 'oklch(0.6 0.2 220)',
    glowColor: 'oklch(0.7 0.18 200 / 0.4)',
    glowIntensity: 1,
    breathingSpeed: 4,
    pulseSpeed: 2,
    particleCount: 6,
  },
  halo: {
    variant: 'halo',
    primaryColor: 'oklch(0.7 0.18 280)',
    secondaryColor: 'oklch(0.6 0.15 260)',
    glowColor: 'oklch(0.65 0.2 280 / 0.35)',
    glowIntensity: 0.8,
    breathingSpeed: 5,
    pulseSpeed: 3,
    particleCount: 4,
  },
  shell: {
    variant: 'shell',
    primaryColor: 'oklch(0.65 0.12 200)',
    secondaryColor: 'oklch(0.5 0.15 220)',
    glowColor: 'oklch(0.6 0.14 210 / 0.3)',
    glowIntensity: 0.7,
    breathingSpeed: 6,
    pulseSpeed: 2.5,
    particleCount: 3,
  },
  pulse: {
    variant: 'pulse',
    primaryColor: 'oklch(0.8 0.2 200)',
    secondaryColor: 'oklch(0.7 0.25 190)',
    glowColor: 'oklch(0.75 0.22 195 / 0.5)',
    glowIntensity: 1.2,
    breathingSpeed: 3,
    pulseSpeed: 1.5,
    particleCount: 8,
  },
  neural: {
    variant: 'neural',
    primaryColor: 'oklch(0.7 0.15 260)',
    secondaryColor: 'oklch(0.6 0.2 280)',
    glowColor: 'oklch(0.65 0.18 270 / 0.4)',
    glowIntensity: 0.9,
    breathingSpeed: 4.5,
    pulseSpeed: 2,
    particleCount: 12,
  },
  holographic: {
    variant: 'holographic',
    primaryColor: 'oklch(0.75 0.1 200)',
    secondaryColor: 'oklch(0.7 0.15 280)',
    glowColor: 'oklch(0.72 0.12 240 / 0.35)',
    glowIntensity: 0.85,
    breathingSpeed: 5,
    pulseSpeed: 2.5,
    particleCount: 5,
  },
}

export const stateAnimations: Record<PresenceState, {
  scale: number[]
  opacity: number[]
  glowMultiplier: number
  rotationSpeed: number
  innerMotion: 'minimal' | 'moderate' | 'active' | 'intense'
}> = {
  idle: {
    scale: [1, 1.02, 1],
    opacity: [0.8, 1, 0.8],
    glowMultiplier: 0.6,
    rotationSpeed: 20,
    innerMotion: 'minimal',
  },
  listening: {
    scale: [1, 1.04, 1],
    opacity: [0.9, 1, 0.9],
    glowMultiplier: 0.85,
    rotationSpeed: 15,
    innerMotion: 'moderate',
  },
  thinking: {
    scale: [1, 1.03, 0.98, 1],
    opacity: [0.85, 1, 0.9, 0.85],
    glowMultiplier: 1,
    rotationSpeed: 8,
    innerMotion: 'active',
  },
  speaking: {
    scale: [1, 1.06, 1],
    opacity: [0.95, 1, 0.95],
    glowMultiplier: 1.2,
    rotationSpeed: 12,
    innerMotion: 'intense',
  },
  reconnecting: {
    scale: [0.98, 1, 0.98],
    opacity: [0.5, 0.7, 0.5],
    glowMultiplier: 0.3,
    rotationSpeed: 30,
    innerMotion: 'minimal',
  },
  muted: {
    scale: [1, 1.01, 1],
    opacity: [0.6, 0.7, 0.6],
    glowMultiplier: 0.4,
    rotationSpeed: 25,
    innerMotion: 'minimal',
  },
}
