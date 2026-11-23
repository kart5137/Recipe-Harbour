/** The Recipe Harbour mark: a bowl of food with a fork and spoon. Same drawing as app/icon.svg. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <rect width="64" height="64" rx="16" fill="#2e7d32" />
      <g fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
        <path transform="rotate(34 32 36)" d="M27.5 6v8M32 6v8M36.5 6v8M27.5 14q0 5.5 4.5 5.5t4.5-5.5M32 19.5V40" />
        <g transform="rotate(-34 32 36)">
          <ellipse cx="32" cy="12" rx="4.6" ry="6.6" />
          <path d="M32 18.6V40" />
        </g>
      </g>
      <path d="M15 35q4-9 11.5-6.5Q31 22 38 26.5q7.5-2.5 11 8.5z" fill="#f4c430" />
      <circle cx="25" cy="29.6" r="3.6" fill="#f05a3c" />
      <path d="M38.5 27.5q4.5-6 9.5-4.5-2 5.5-9.5 4.5z" fill="#9ccc65" />
      <path d="M9 34h46q-1.5 18-23 18T9 34z" fill="#fff" />
      <path d="M24 52.5h16" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M15 40q5 6 12 7" fill="none" stroke="#c8e6c9" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
