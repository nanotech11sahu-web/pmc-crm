// The fixed, pre-approved messages the backend can send. The frontend never
// sends text or a template name — it only picks WHICH message and hands the
// backend the listing ids; the backend fills in the owner's name etc.
//
//   `route`    backend route (POST /api/messages/<route>, body {directoryIds:[…]})
//   `applies`  which listings it suits: 'any' | 'mobile' | 'email' | 'both'
//              (mobile = mobile number missing, email = email missing, both = both missing)
//   `body`     read-only preview text shown to the user. `null` = exact wording
//              not known to the frontend yet (the UI then says so instead of guessing).
//   `abridged` the preview text is a shortened copy of the real message.

export const TEMPLATES = {
  wa_promo: {
    id: 'wa_promo', channel: 'whatsapp', title: 'Premium promo',
    blurb: 'Offer: get PMC Verified & Trusted with a Premium Listing',
    route: 'promo-whatsapp', hasName: false,
    applies: 'any', image: true, abridged: true,
    body: 'GET PMC VERIFIED & PMC TRUSTED TODAY…\n\nLifetime offer: ₹1499\nCall / WhatsApp: 9437404000',
  },
  wa_missing_mobile: {
    id: 'wa_missing_mobile', channel: 'whatsapp', title: 'Mobile number missing',
    blurb: 'Asks the owner to add the missing mobile number',
    route: 'missing-mobile', templateName: 'mobilenumberismissing', hasName: true, applies: 'mobile', body: null,
  },
  wa_missing_email: {
    id: 'wa_missing_email', channel: 'whatsapp', title: 'Email missing',
    blurb: 'Asks the owner to add the missing email ID',
    route: 'missing-email', templateName: 'missingemailid', hasName: true, applies: 'email', body: null,
  },
  wa_missing_both: {
    id: 'wa_missing_both', channel: 'whatsapp', title: 'Mobile & email missing',
    blurb: 'Asks the owner to add both the mobile number and the email ID',
    route: 'missing-both', templateName: 'mobileandemailidmissing', hasName: true, applies: 'both', body: null,
  },
  sms_promo: {
    id: 'sms_promo', channel: 'sms', title: 'Premium promo SMS',
    blurb: 'Offer: get a Premium Listing',
    route: 'promo-sms', hasName: false,
    applies: 'any', abridged: true,
    body: 'PMC Yellow Pages Update: Your business is not PMC VERIFIED/TRUSTED. Get a Premium Listing @Rs.1499 (Lifetime)… Call: 9437404000',
  },
};

// Which "missing details" WhatsApp template a listing needs (by what it lacks).
export const MISSING_TEMPLATE = { mobile: 'wa_missing_mobile', email: 'wa_missing_email', both: 'wa_missing_both' };
export const KIND_LABEL = { mobile: 'Mobile missing', email: 'Email missing', both: 'Mobile & email missing' };

// Category-wise "missing details" can run as a TRACKED campaign
// (POST /campaigns with message_type: 'missing_details') once the backend
// confirms its DB migration is applied. Until then the form finds the listings
// itself and sends through the three listing routes (no live tracking).
export const MISSING_AS_CAMPAIGN = false;
