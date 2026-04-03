export function Skeleton(props: { className?: string }) {
  return (
    <div
      className={[
        "rounded-lg bg-gradient-to-r from-white/[0.07] via-white/[0.14] to-white/[0.07] bg-[length:200%_100%] animate-shimmer",
        props.className
      ].filter(Boolean).join(" ")}
    />
  );
}
