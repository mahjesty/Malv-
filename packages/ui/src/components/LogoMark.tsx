type LogoMarkVariant = "compact" | "full" | "animated";
type LogoMarkTone = "light" | "dark";

function normalizeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

export function LogoMark(props: { size?: number; className?: string; variant?: LogoMarkVariant; tone?: LogoMarkTone; label?: string }) {
  const size = props.size ?? 28;
  const variant = props.variant ?? "compact";
  const tone = props.tone ?? "light";
  const label = props.label ?? "MALV logo";
  const suffix = normalizeId(`${size}-${variant}-${label || "mark"}`);
  const ringGradId = `malv-logo-ring-${suffix}-${tone}`;
  const coreGradId = `malv-logo-core-${suffix}-${tone}`;
  const innerStroke = tone === "light" ? "oklch(0.97 0.01 245 / 0.9)" : "oklch(0.99 0.005 245 / 0.92)";
  const ringStrokeOpacity = tone === "light" ? "0.16" : "0.28";
  const pulseOpacity = tone === "light" ? "0.18" : "0.22";

  return (
    <div className={props.className} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={label}>
        <defs>
          {tone === "light" ? (
            <>
              <linearGradient id={ringGradId} x1="8" y1="5" x2="32" y2="35" gradientUnits="userSpaceOnUse">
                <stop stopColor="oklch(0.9 0.02 245 / 0.94)" />
                <stop offset="1" stopColor="oklch(0.72 0.07 250 / 0.92)" />
              </linearGradient>
              <linearGradient id={coreGradId} x1="12.2" y1="11.2" x2="27.8" y2="28.8" gradientUnits="userSpaceOnUse">
                <stop stopColor="oklch(0.92 0.02 245 / 0.95)" />
                <stop offset="1" stopColor="oklch(0.8 0.05 250 / 0.9)" />
              </linearGradient>
            </>
          ) : (
            <>
              <linearGradient id={ringGradId} x1="8" y1="5" x2="32" y2="35" gradientUnits="userSpaceOnUse">
                <stop stopColor="oklch(0.28 0.02 250 / 0.98)" />
                <stop offset="1" stopColor="oklch(0.18 0.02 250 / 0.98)" />
              </linearGradient>
              <linearGradient id={coreGradId} x1="12.2" y1="11.2" x2="27.8" y2="28.8" gradientUnits="userSpaceOnUse">
                <stop stopColor="oklch(0.24 0.02 250 / 0.98)" />
                <stop offset="1" stopColor="oklch(0.14 0.02 250 / 0.98)" />
              </linearGradient>
            </>
          )}
        </defs>

        <g fill={`url(#${ringGradId})`}>
          <rect x="12" y="4" width="16" height="7" rx="3.5" />
          <g transform="rotate(60 20 20)">
            <rect x="12" y="4" width="16" height="7" rx="3.5" />
          </g>
          <g transform="rotate(120 20 20)">
            <rect x="12" y="4" width="16" height="7" rx="3.5" />
          </g>
          <g transform="rotate(180 20 20)">
            <rect x="12" y="4" width="16" height="7" rx="3.5" />
          </g>
          <g transform="rotate(240 20 20)">
            <rect x="12" y="4" width="16" height="7" rx="3.5" />
          </g>
          <g transform="rotate(300 20 20)">
            <rect x="12" y="4" width="16" height="7" rx="3.5" />
          </g>
        </g>

        <polygon points="20,11.2 27.8,15.6 27.8,24.4 20,28.8 12.2,24.4 12.2,15.6" fill={`url(#${coreGradId})`} />
        <polygon points="20,13.2 26.2,16.7 26.2,23.3 20,26.8 13.8,23.3 13.8,16.7" stroke={innerStroke} strokeWidth="1.4" />
        {variant !== "compact" ? <circle cx="20" cy="20" r="17.6" stroke="currentColor" strokeOpacity={ringStrokeOpacity} /> : null}

        {variant === "animated" ? (
          <>
            <g>
              <animateTransform attributeName="transform" type="rotate" from="0 20 20" to="360 20 20" dur="10s" repeatCount="indefinite" />
              <circle cx="20" cy="20" r="16.2" stroke="currentColor" strokeOpacity={ringStrokeOpacity} strokeWidth="1.2" strokeDasharray="8 4" />
            </g>
            <circle cx="20" cy="20" r="3.8" fill="currentColor" fillOpacity={pulseOpacity}>
              <animate attributeName="fill-opacity" values="0.14;0.26;0.14" dur="2.4s" repeatCount="indefinite" />
            </circle>
          </>
        ) : null}
      </svg>
    </div>
  );
}

