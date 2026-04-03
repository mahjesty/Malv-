import { motion } from "framer-motion";

export function LoadingSpinner(props: { size?: number; label?: string }) {
  const size = props.size ?? 18;
  return (
    <div className="inline-flex items-center gap-2">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.95, ease: "linear" }}
        style={{ width: size, height: size, borderRadius: 999 }}
        className="border-2 border-white/12 border-t-brand border-r-brand/40"
      />
      {props.label ? <span className="text-sm text-malv-text/75">{props.label}</span> : null}
    </div>
  );
}
