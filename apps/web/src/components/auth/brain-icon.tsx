import { motion } from "framer-motion";

interface BrainIconProps {
  className?: string;
}

export function BrainIcon({ className }: BrainIconProps) {
  return (
    <motion.svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      initial="hidden"
      animate="visible"
    >
      <defs>
        <linearGradient id="brainGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--v0-primary)" />
          <stop offset="50%" stopColor="var(--v0-accent)" />
          <stop offset="100%" stopColor="var(--v0-primary)" />
        </linearGradient>
        <filter id="brainGlow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <motion.path
        d="M32 8C20 8 12 18 12 28C12 35 15 40 18 43C16 46 15 50 15 54C15 56 17 58 19 58C21 58 22 56 23 54C24 53 25 52 27 52C29 52 30 54 31 55C31.5 55.5 31.75 56 32 56C32.25 56 32.5 55.5 33 55C34 54 35 52 37 52C39 52 40 53 41 54C42 56 43 58 45 58C47 58 49 56 49 54C49 50 48 46 46 43C49 40 52 35 52 28C52 18 44 8 32 8Z"
        stroke="url(#brainGradient)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#brainGlow)"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.5, ease: "easeInOut" }}
      />

      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 0.5 }}>
        <motion.path
          d="M22 24C24 22 27 23 28 26C29 29 27 32 24 33"
          stroke="url(#brainGradient)"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 1, duration: 0.8 }}
        />
        <motion.path
          d="M20 32C22 31 25 33 26 36C27 39 25 42 22 43"
          stroke="url(#brainGradient)"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 1.2, duration: 0.8 }}
        />

        <motion.path
          d="M42 24C40 22 37 23 36 26C35 29 37 32 40 33"
          stroke="url(#brainGradient)"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 1.1, duration: 0.8 }}
        />
        <motion.path
          d="M44 32C42 31 39 33 38 36C37 39 39 42 42 43"
          stroke="url(#brainGradient)"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 1.3, duration: 0.8 }}
        />

        <motion.path
          d="M28 30C30 28 34 28 36 30"
          stroke="url(#brainGradient)"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 1.4, duration: 0.6 }}
        />
        <motion.path
          d="M29 38C31 36 33 36 35 38"
          stroke="url(#brainGradient)"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 1.5, duration: 0.6 }}
        />
      </motion.g>

      <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.6, duration: 0.4 }}>
        <circle cx="22" cy="24" r="2" fill="url(#brainGradient)" />
        <circle cx="42" cy="24" r="2" fill="url(#brainGradient)" />
        <circle cx="20" cy="32" r="2" fill="url(#brainGradient)" />
        <circle cx="44" cy="32" r="2" fill="url(#brainGradient)" />
        <circle cx="32" cy="20" r="2.5" fill="url(#brainGradient)" />

        <motion.circle
          cx="32"
          cy="34"
          r="3"
          fill="url(#brainGradient)"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.8, 1, 0.8]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </motion.g>

      <motion.circle
        cx="32"
        cy="34"
        r="6"
        stroke="url(#brainGradient)"
        strokeWidth="1"
        fill="none"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{
          scale: [0.5, 2, 2.5],
          opacity: [0, 0.6, 0]
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          repeatDelay: 1,
          ease: "easeOut"
        }}
      />
    </motion.svg>
  );
}
