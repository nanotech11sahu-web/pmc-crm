import { SITE_ORIGIN } from '../api/client.js';

// Read-only "what will be sent" panel. The messages are FIXED on the
// server — the user never picks or types anything — so this is purely
// informational static content for the channels they ticked. The wording
// below is the abridged copy supplied by the backend team; the exact text
// lives on the server.

const SAMPLE_CARD = `${SITE_ORIGIN}/assets/frontend/images/pmc-campaign-sample-card.jpg`;

function CardImage() {
  return (
    <img
      src={SAMPLE_CARD} alt="Sample PMC listing card"
      className="rounded-lg border border-slate-200 w-full max-w-sm"
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

function WhatsApp() {
  return (
    <div className="space-y-2">
      <CardImage />
      <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2 text-sm text-slate-700 max-w-sm space-y-1">
        <div className="font-semibold">GET PMC VERIFIED &amp; PMC TRUSTED TODAY…</div>
        <div>Lifetime offer: <b>₹1499</b></div>
        <div>Call / WhatsApp: <b>9437404000</b></div>
      </div>
    </div>
  );
}

function Sms() {
  return (
    <div className="rounded-lg bg-slate-100 border border-slate-200 px-3 py-2 text-sm text-slate-700 max-w-sm">
      PMC Yellow Pages Update: Your business is not PMC VERIFIED/TRUSTED. Get a Premium Listing @Rs.1499 (Lifetime)… Call: 9437404000
    </div>
  );
}

function Email() {
  return (
    <div className="space-y-2 max-w-md">
      <div className="text-sm"><span className="text-slate-400">Subject:</span> <b>Your business is NOT PMC Verified &amp; PMC Trusted – Upgrade today for Rs.1499 (Lifetime)</b></div>
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <div className="bg-white px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <img src="/apple-touch-icon.png" alt="" className="w-8 h-8" />
          <span className="font-semibold text-sm">PMC Yellow Pages</span>
        </div>
        <div className="p-4 space-y-3 bg-slate-50">
          <div className="text-sm">Dear <i>&lt;business owner name&gt;</i>,</div>
          <CardImage />
          <div className="text-xs text-slate-400">Benefits of PMC Verified &amp; Trusted are listed in the email.</div>
          <span className="inline-block rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 select-none">Upgrade Today</span>
        </div>
      </div>
      <div className="text-xs text-slate-400">Layout preview only — the email is addressed to each business owner by name.</div>
    </div>
  );
}

function Voice() {
  return (
    <div className="rounded-lg bg-slate-100 border border-slate-200 px-3 py-2 text-sm text-slate-700 max-w-sm">
      Each reachable listing gets an automated phone call that plays the fixed, pre-recorded PMC message.
    </div>
  );
}

const VIEWS = { whatsapp: ['WhatsApp', WhatsApp], sms: ['SMS', Sms], email: ['Email', Email], voice: ['Voice call', Voice] };

export default function CampaignMessagePreview({ channels }) {
  if (channels.length === 0) return null;
  return (
    <details className="rounded-lg border border-slate-200">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">What will be sent <span className="text-slate-400 font-normal">(fixed messages, read-only)</span></summary>
      <div className="p-3 space-y-4 border-t border-slate-100">
        {channels.map((c) => {
          const [label, View] = VIEWS[c] || [c, () => null];
          return (
            <div key={c}>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">{label}</div>
              <View />
            </div>
          );
        })}
        <div className="text-xs text-slate-400">Wording above is abridged — the exact messages are set on the server and can't be changed from here.</div>
      </div>
    </details>
  );
}
