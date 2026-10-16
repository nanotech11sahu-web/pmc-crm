import { dialNumber } from '../utils/phone.js';

// One-click call to a listing: opens the device's dialer (tel: link) with
// the listing's mobile / phone number. Disabled when there's no number.
export default function CallButton({ row, className = 'btn btn-secondary btn-sm' }) {
  const number = dialNumber(row);
  if (!number) {
    return <span className={`${className} opacity-50 cursor-not-allowed`} title="No phone number on file">Call</span>;
  }
  return <a className={className} href={`tel:${number}`} title={`Call ${number}`}>Call</a>;
}
