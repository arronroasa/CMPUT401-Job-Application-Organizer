'use client';

/**
 * OnFile brand mark + wordmark, hand-ported from the design template.
 * - `size` scales the folder/spark glyph.
 * - `animated` plays the one-time intro (folder lifts, sparks pop, letters rise).
 * - `wordmark={false}` renders just the glyph.
 */
export function OnFileMark({ size = 34, animated = false }) {
  const anim = (name, delay = 0) =>
    animated ? { animation: `${name} 4s ${delay ? delay + 's ' : ''}both` } : undefined;

  return (
    <svg
      viewBox="0 0 220 240"
      style={{ width: size, height: (size * 37) / 34, flex: 'none', overflow: 'visible', ...anim('ofIcon') }}
      aria-hidden="true"
    >
      <path
        d="M18 90 L18 70 Q18 58 30 58 L70 58 L88 78 L172 78 Q184 78 184 90 L184 200 Q184 214 170 214 L32 214 Q18 214 18 200 Z"
        fill="var(--logo)"
      />
      <path
        d="M42 40 L150 30 Q160 29 161 39 L170 130 L46 140 Z"
        fill="var(--surface)"
        stroke="var(--logo)"
        strokeWidth="14"
        strokeLinejoin="round"
        style={{ transformOrigin: '90px 190px', ...anim('ofDoc') }}
      />
      <path
        d="M10 120 Q10 108 24 108 L166 108 Q180 108 174 122 L146 208 Q140 220 126 220 L24 220 Q12 220 12 208 Z"
        fill="var(--logo)"
      />
      <polygon points="118,30 128,0 134,4 122,34" fill="var(--spark)" style={{ transformOrigin: 'center', ...anim('ofSpark') }} />
      <polygon points="140,42 168,26 172,32 144,50" fill="var(--spark)" style={{ transformOrigin: 'center', ...anim('ofSpark', 0.12) }} />
      <polygon points="132,58 160,66 158,73 128,66" fill="var(--spark)" style={{ transformOrigin: 'center', ...anim('ofSpark', 0.24) }} />
    </svg>
  );
}

export function OnFileWordmark({ size = 21, animated = false }) {
  const letters = ['O', 'n', 'F', 'i', 'l', 'e'];
  return (
    <span
      style={{
        display: 'flex',
        fontFamily: 'var(--font-quicksand), sans-serif',
        fontWeight: 600,
        fontSize: size,
        letterSpacing: '.01em',
        color: 'var(--logo)',
      }}
    >
      {letters.map((ch, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            fontStyle: i < 2 ? 'italic' : 'normal',
            ...(animated ? { animation: `ofLetter 4s ${(i * 0.08).toFixed(2)}s both` } : {}),
          }}
        >
          {ch}
        </span>
      ))}
    </span>
  );
}

export default function OnFileLogo({ size = 34, wordmarkSize = 21, animated = false, wordmark = true, gap = 11 }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap }}>
      <OnFileMark size={size} animated={animated} />
      {wordmark && <OnFileWordmark size={wordmarkSize} animated={animated} />}
    </span>
  );
}
