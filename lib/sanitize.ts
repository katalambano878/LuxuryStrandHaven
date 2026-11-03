/**
 * Allowlist HTML sanitizer for admin-written content (blog posts, help
 * articles). Every tag and attribute is rebuilt from scratch: anything not on
 * the lists below is dropped, and links/images only keep safe URL schemes.
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'a', 'span', 'div',
  'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img', 'hr', 'figure', 'figcaption',
]);

const VOID_TAGS = new Set(['br', 'img', 'hr']);

const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ['href', 'title', 'target'],
  img: ['src', 'alt', 'width', 'height', 'title'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
  '*': ['class'],
};

/** Elements removed together with everything inside them. */
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|form|svg|math|template|noscript|textarea|select|button)\b[\s\S]*?<\/\1\s*>/gi;

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&colon;/gi, ':')
    .replace(/&tab;/gi, '\t')
    .replace(/&newline;/gi, '\n')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function safeUrl(raw: string, forImage: boolean): string | null {
  // Browsers ignore control characters and whitespace inside the scheme.
  const url = decodeEntities(raw).replace(/[\u0000-\u0020\u007f-\u009f]/g, '');
  if (/^(https?:|mailto:|tel:)/i.test(url)) return url;
  if (/^(\/(?!\/)|#|\.\/|\.\.\/)/.test(url)) return url;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith('//')) return url; // relative path
  if (forImage && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(url)) return url;
  return null;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function rebuildTag(name: string, attrText: string, closing: boolean): string {
  const tag = name.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) return '';
  if (closing) return VOID_TAGS.has(tag) ? '' : `</${tag}>`;

  const allowed = new Set([...(ALLOWED_ATTRS[tag] || []), ...ALLOWED_ATTRS['*']]);
  const out: string[] = [];
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(attrText))) {
    const attr = m[1].toLowerCase();
    if (!allowed.has(attr)) continue;
    let value = m[2] ?? m[3] ?? m[4] ?? '';
    if (attr === 'href' || attr === 'src') {
      const safe = safeUrl(value, attr === 'src');
      if (safe === null) continue;
      value = safe;
    }
    if (attr === 'target') value = value === '_blank' ? '_blank' : '_self';
    out.push(`${attr}="${escapeAttr(decodeEntities(value))}"`);
  }
  if (tag === 'a' && out.some((a) => a.startsWith('target="_blank"'))) out.push('rel="noopener noreferrer"');
  return `<${tag}${out.length ? ' ' + out.join(' ') : ''}>`;
}

/**
 * Sanitize HTML content to prevent XSS attacks
 * @param html - The HTML string to sanitize
 * @returns Sanitized HTML string
 */
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }
  // Rebuilt tags are parked behind placeholders so every other "<" or ">"
  // left in the text can be escaped and never start a tag in the browser.
  const tags: string[] = [];
  const parked = html
    .replace(/\u0000/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(DROP_WITH_CONTENT, '')
    .replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^<>]*)>/g, (_, slash, name, attrs) => {
      tags.push(rebuildTag(name, attrs, slash === '/'));
      return `\u0000${tags.length - 1}\u0000`;
    });
  return parked
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\u0000(\d+)\u0000/g, (_, i) => tags[Number(i)]);
}

/**
 * Escape HTML entities to prevent XSS when displaying user input as text
 * @param text - The text to escape
 * @returns Escaped text safe for HTML display
 */
export function escapeHtml(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };

  return text.replace(/[&<>"'/]/g, (char) => htmlEntities[char] || char);
}

/**
 * Validate and sanitize a URL
 * @param url - The URL to validate
 * @returns Sanitized URL or empty string if invalid
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  // Only allow http, https, mailto, and tel protocols
  const allowedProtocols = ['http:', 'https:', 'mailto:', 'tel:'];
  
  try {
    const parsed = new URL(url, 'https://example.com');
    if (allowedProtocols.includes(parsed.protocol)) {
      return url;
    }
  } catch {
    // If URL parsing fails, check if it's a relative URL
    if (url.startsWith('/') || url.startsWith('#')) {
      return url;
    }
  }
  
  return '#';
}
