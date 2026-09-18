/** Inline SVG icons — no icon library dependency (keeps QuickDrop self-contained). */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (props: P): P => ({
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export function Check(props: P) {
  return (
    <svg {...base({ width: 14, height: 14, ...props })}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function ShieldCheck(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

export function ArrowRight(props: P) {
  return (
    <svg {...base({ width: 18, height: 18, ...props })}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

export function Hash(props: P) {
  return (
    <svg {...base({ width: 16, height: 16, ...props })}>
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  );
}

export function Info(props: P) {
  return (
    <svg {...base({ width: 18, height: 18, ...props })}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

export function Loader(props: P) {
  return (
    <svg {...base({ width: 18, height: 18, className: "qd-spin", ...props })}>
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  );
}

/** Kick scooter — the QuickDrop brand mark. */
export function ScooterIcon(props: P) {
  return (
    <svg {...base({ width: 30, height: 30, ...props })}>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.5 18h7" />
      <path d="M18 15.5V8h-3" />
      <path d="M6 15.5 9.5 6H12" />
    </svg>
  );
}
