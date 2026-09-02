// Branded circular spinner — a spinning ring with "PMC CRM" centered
// inside it. Used both as the full-screen loading overlay and dropped
// into individual tables/cards for a local loading state.
const SIZES = {
  sm: { box: 32, border: 3, font: 6 },
  md: { box: 56, border: 4, font: 8 },
  lg: { box: 88, border: 5, font: 11 },
};

export default function Spinner({ size = 'md', className = '' }) {
  const { box, border, font } = SIZES[size] || SIZES.md;
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: box, height: box }}>
      <div className="absolute inset-0 rounded-full border-slate-200" style={{ borderWidth: border }} />
      <div
        className="absolute inset-0 rounded-full border-transparent border-t-slate-900 animate-spin"
        style={{ borderWidth: border }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="font-bold tracking-wider text-slate-700 text-center leading-[1.05]"
          style={{ fontSize: font }}
        >
          PMC<br />CRM
        </span>
      </div>
    </div>
  );
}
