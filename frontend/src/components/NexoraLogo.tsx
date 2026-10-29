/** Logo 4 ô vuông theo SVG mẫu Nexora */
export default function NexoraLogo({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const cell = size * (12 / 36);
  const gap = size * (2 / 36);
  const pad = size * (4.5 / 36);
  const r = size * (2 / 36);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
    >
      <rect width={size} height={size} rx={size * (12 / 36)} fill="#004036" />
      <rect x={pad} y={pad} width={cell} height={cell} rx={r} fill="#fff" />
      <rect
        x={pad + cell + gap}
        y={pad}
        width={cell}
        height={cell}
        rx={r}
        fill="#fff"
      />
      <rect
        x={pad}
        y={pad + cell + gap}
        width={cell}
        height={cell}
        rx={r}
        fill="#fff"
      />
      <rect
        x={pad + cell + gap}
        y={pad + cell + gap}
        width={cell}
        height={cell}
        rx={r}
        fill="#fff"
      />
    </svg>
  );
}
