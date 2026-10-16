// Best number to dial for a directory listing: the mobile if present,
// otherwise the landline/phone number. Returns an E.164-style string
// (India +91 assumed for bare 10-digit numbers) or '' when there is none.
export function dialNumber(row) {
  for (const raw of [row?.MobileNumber, row?.PhoneNumber]) {
    const digits = String(raw ?? '').replace(/[^\d+]/g, '');
    if (!digits) continue;
    if (digits.startsWith('+')) return digits;
    const d = digits.replace(/^0+/, '');
    if (d.length === 10) return `+91${d}`;
    if (d.length === 12 && d.startsWith('91')) return `+${d}`;
    if (d.length >= 6) return `+91${d}`; // landline with STD code
  }
  return '';
}
