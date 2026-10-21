import { useEffect, useState } from 'react';
import * as api from '../api/index.js';
import { TEMPLATES } from '../config/messageTemplates.js';

// The five fixed messages. Starts with the built-in copy and is replaced by the
// server's exact wording (GET /messages/previews) as soon as it loads. One
// request per page load, shared by every component.
let cache = null;
let inflight = null;

// `{{1}}` in a body is the owner's name. The preview doesn't show a placeholder — it
// reads with the backend's own fallback greeting.
const prettify = (body) => String(body).replace(/\{\{\s*1\s*\}\}/g, 'Sir/Madam');

function merge(list) {
  const out = { ...TEMPLATES };
  list.forEach((s) => {
    const base = TEMPLATES[s.id];
    if (!base) return;
    out[s.id] = {
      ...base,
      title: s.title || base.title,
      templateName: s.template_name ?? base.templateName,
      body: s.body != null ? prettify(s.body) : base.body,
      abridged: s.body != null ? false : base.abridged,
      image: !!s.image_url || base.image,
      imageUrl: s.image_url || base.imageUrl,
    };
  });
  return out;
}

export function useTemplates() {
  const [templates, setTemplates] = useState(cache || TEMPLATES);
  useEffect(() => {
    if (cache) return undefined;
    let alive = true;
    inflight = inflight || api.getMessagePreviews().then((l) => { cache = merge(l); return cache; }).catch(() => null);
    inflight.then((c) => { if (alive && c) setTemplates(c); });
    return () => { alive = false; };
  }, []);
  return templates;
}
