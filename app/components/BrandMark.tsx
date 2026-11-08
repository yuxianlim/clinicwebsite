export default function BrandMark({
  className = "h-9 w-9",
}: {
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="36" height="36" rx="12" fill="currentColor" />
      <path
        d="M12 20h16M20 12v16"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="28" cy="12" r="2" fill="white" />
    </svg>
  );
}
