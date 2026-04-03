import { useMemo } from "react";
import { motion } from "framer-motion";

export function FloatingElements() {
  const particles = useMemo(
    () =>
      [...Array(6)].map((_, i) => ({
        id: i,
        left: `${30 + (i * 11) % 38}%`,
        top: `${32 + (i * 17) % 36}%`
      })),
    []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        className="absolute top-[15%] left-[10%] w-16 h-16 md:w-24 md:h-24 perspective-[500px]"
        animate={{
          y: [0, -30, 0],
          rotateY: [0, 360],
          rotateX: [0, 15, 0]
        }}
        transition={{
          y: { duration: 6, repeat: Infinity, ease: "easeInOut" },
          rotateY: { duration: 20, repeat: Infinity, ease: "linear" },
          rotateX: { duration: 8, repeat: Infinity, ease: "easeInOut" }
        }}
        style={{ transformStyle: "preserve-3d" }}
      >
        <div className="relative w-full h-full" style={{ transformStyle: "preserve-3d" }}>
          <div
            className="absolute inset-0 border border-primary/30 bg-primary/5 backdrop-blur-sm rounded-lg"
            style={{ transform: "translateZ(32px)" }}
          />
          <div
            className="absolute inset-0 border border-primary/20 bg-primary/5 backdrop-blur-sm rounded-lg"
            style={{ transform: "translateZ(-32px)" }}
          />
          <div
            className="absolute inset-0 border border-accent/20 bg-accent/5 rounded-lg origin-left"
            style={{ transform: "rotateY(90deg) translateZ(32px)" }}
          />
        </div>
      </motion.div>

      <motion.div
        className="absolute top-[20%] right-[8%] w-20 h-20 md:w-32 md:h-32"
        animate={{
          y: [0, 25, 0],
          rotateX: [20, 40, 20],
          rotateZ: [0, 360]
        }}
        transition={{
          y: { duration: 7, repeat: Infinity, ease: "easeInOut" },
          rotateX: { duration: 5, repeat: Infinity, ease: "easeInOut" },
          rotateZ: { duration: 25, repeat: Infinity, ease: "linear" }
        }}
        style={{ perspective: "500px" }}
      >
        <div
          className="w-full h-full rounded-full border-4 border-accent/30 shadow-lg shadow-accent/10"
          style={{
            borderTopColor: "transparent",
            borderBottomColor: "transparent"
          }}
        />
      </motion.div>

      <motion.div
        className="absolute bottom-[20%] left-[5%] w-16 h-16 md:w-20 md:h-20"
        animate={{
          y: [0, -20, 0],
          rotateY: [0, 360]
        }}
        transition={{
          y: { duration: 5, repeat: Infinity, ease: "easeInOut" },
          rotateY: { duration: 15, repeat: Infinity, ease: "linear" }
        }}
        style={{ perspective: "300px", transformStyle: "preserve-3d" }}
      >
        <div
          className="w-full h-full"
          style={{
            background: "linear-gradient(135deg, var(--v0-primary) 0%, transparent 50%)",
            clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
            opacity: 0.2
          }}
        />
      </motion.div>

      <motion.div
        className="absolute bottom-[25%] right-[12%] w-14 h-14 md:w-20 md:h-20"
        animate={{
          y: [0, 15, 0],
          scale: [1, 1.1, 1]
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      >
        <div
          className="w-full h-full rounded-full"
          style={{
            background: "radial-gradient(circle at 30% 30%, var(--v0-primary), transparent 70%)",
            opacity: 0.25,
            boxShadow: "inset 0 0 20px var(--v0-primary)"
          }}
        />
      </motion.div>

      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary/40"
          style={{
            left: p.left,
            top: p.top
          }}
          animate={{
            y: [0, -40 - p.id * 10, 0],
            x: [0, (p.id % 2 === 0 ? 20 : -20), 0],
            opacity: [0.2, 0.6, 0.2],
            scale: [1, 1.5, 1]
          }}
          transition={{
            duration: 5 + p.id,
            repeat: Infinity,
            delay: p.id * 0.5,
            ease: "easeInOut"
          }}
        />
      ))}

      <motion.div
        className="absolute top-1/2 left-0 w-full h-px"
        style={{
          background: "linear-gradient(90deg, transparent, var(--v0-primary), transparent)",
          opacity: 0.15
        }}
        animate={{
          scaleX: [0.3, 1, 0.3],
          opacity: [0.1, 0.2, 0.1]
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
    </div>
  );
}
