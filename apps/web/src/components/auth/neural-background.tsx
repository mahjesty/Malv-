import { useMemo } from "react";
import { motion } from "framer-motion";

export function NeuralBackground() {
  const nodes = useMemo(() => {
    const nodeCount = 20;
    return Array.from({ length: nodeCount }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 2,
      delay: Math.random() * 5,
      duration: 15 + Math.random() * 10
    }));
  }, []);

  const connections = useMemo(() => {
    const conns: { x1: number; y1: number; x2: number; y2: number; delay: number }[] = [];
    nodes.forEach((node, i) => {
      nodes.slice(i + 1).forEach((otherNode) => {
        const distance = Math.hypot(node.x - otherNode.x, node.y - otherNode.y);
        if (distance < 35) {
          conns.push({
            x1: node.x,
            y1: node.y,
            x2: otherNode.x,
            y2: otherNode.y,
            delay: Math.random() * 3
          });
        }
      });
    });
    return conns.slice(0, 25);
  }, [nodes]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />

      <div className="absolute top-1/4 -left-1/4 w-1/2 h-1/2 bg-primary/10 rounded-full blur-[120px] animate-pulse-glow" />
      <div
        className="absolute bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-accent/10 rounded-full blur-[120px] animate-pulse-glow"
        style={{ animationDelay: "2s" }}
      />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1/3 h-1/3 bg-primary/5 rounded-full blur-[100px]" />

      <svg className="absolute inset-0 w-full h-full gpu-accelerated" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--v0-primary)" stopOpacity="0.3" />
            <stop offset="50%" stopColor="var(--v0-accent)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--v0-primary)" stopOpacity="0.3" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="0.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {connections.map((conn, i) => (
          <motion.line
            key={i}
            x1={`${conn.x1}%`}
            y1={`${conn.y1}%`}
            x2={`${conn.x2}%`}
            y2={`${conn.y2}%`}
            stroke="url(#lineGradient)"
            strokeWidth="0.15"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{
              pathLength: [0, 1, 1, 0],
              opacity: [0, 0.6, 0.6, 0]
            }}
            transition={{
              duration: 8,
              delay: conn.delay,
              repeat: Infinity,
              repeatDelay: 2,
              ease: "easeInOut"
            }}
          />
        ))}

        {nodes.map((node) => (
          <motion.circle
            key={node.id}
            cx={`${node.x}%`}
            cy={`${node.y}%`}
            r={node.size / 10}
            fill="var(--v0-primary)"
            filter="url(#glow)"
            initial={{ opacity: 0.3, scale: 1 }}
            animate={{
              opacity: [0.3, 0.8, 0.3],
              scale: [1, 1.2, 1]
            }}
            transition={{
              duration: 4,
              delay: node.delay,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        ))}
      </svg>

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgb(var(--malv-bg-rgb))_70%)]" />
    </div>
  );
}
