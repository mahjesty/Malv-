'use client'

import { PresenceProps, PresenceVariant, defaultConfigs, PresenceConfig } from '../types'
import { OrbPresence } from './orb-presence'
import { HaloPresence } from './halo-presence'
import { ShellPresence } from './shell-presence'
import { PulsePresence } from './pulse-presence'
import { NeuralPresence } from './neural-presence'
import { HolographicPresence } from './holographic-presence'

interface MALVPresenceProps extends Omit<PresenceProps, 'config'> {
  variant?: PresenceVariant
  config?: Partial<PresenceConfig>
}

const presenceComponents: Record<PresenceVariant, React.ComponentType<PresenceProps>> = {
  orb: OrbPresence,
  halo: HaloPresence,
  shell: ShellPresence,
  pulse: PulsePresence,
  neural: NeuralPresence,
  holographic: HolographicPresence,
}

export function MALVPresence({
  variant = 'orb',
  state,
  audioLevel = 0,
  className = '',
  config: customConfig,
}: MALVPresenceProps) {
  const PresenceComponent = presenceComponents[variant]
  const baseConfig = defaultConfigs[variant]
  const config: PresenceConfig = {
    ...baseConfig,
    ...customConfig,
  }

  return (
    <PresenceComponent
      state={state}
      config={config}
      audioLevel={audioLevel}
      className={className}
    />
  )
}

export { OrbPresence } from './orb-presence'
export { HaloPresence } from './halo-presence'
export { ShellPresence } from './shell-presence'
export { PulsePresence } from './pulse-presence'
export { NeuralPresence } from './neural-presence'
export { HolographicPresence } from './holographic-presence'
