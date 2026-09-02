import Spinner from './Spinner.jsx';

// Drop inside any `relative`-positioned table/card container; shows the
// same branded spinner centered over just that block while its own data
// is (re)loading, independent of the full-screen overlay.
export default function TableLoadingOverlay({ active }) {
  if (!active) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
      <Spinner size="md" />
    </div>
  );
}
