/** Original, project-maintained observations. Add a fixture when adding a rule.
 * Schema: field, optional key/DOM attribute, optional regex and version capture.
 * No downloaded rules, metadata expression language, or product version guessing.
 */
const js = (key, version = false) => ({ field: 'js', key, ...(version ? { pattern: /^(\d[\w.+-]{0,99})$/, versionGroup: 1 } : {}) });
const dom = (key, attribute) => ({ field: 'dom', key, ...(attribute ? { attribute, pattern: /^(\d[\w.+-]{0,99})$/, versionGroup: 1 } : {}) });
const text = (field, pattern, version) => ({ field, pattern, ...(version ? { version } : {}) });
const rule = (name, categories, observations, implies = []) => ({ name, categories, observations, implies, description: name + ' detected from public page observations.' });
module.exports = [
  rule('React', ['JavaScript frameworks'], [js('React.version', true)]),
  rule('Next.js', ['JavaScript frameworks', 'Web frameworks'], [js('next.version', true), js('__NEXT_DATA__'), text('scriptSrc', /\/_next\//)], ['React']),
  rule('Vue.js', ['JavaScript frameworks'], [js('Vue.version', true), dom('[data-v-app]')]),
  rule('Angular', ['JavaScript frameworks'], [dom('[ng-version]', 'ng-version')]),
  rule('jQuery', ['JavaScript libraries'], [js('jQuery.fn.jquery', true)]),
  rule('styled-components', ['CSS libraries'], [dom('style[data-styled-version]', 'data-styled-version')]),
  rule('Emotion', ['CSS libraries'], [dom('style[data-emotion], style[data-emotion-css]')]),
  rule('Font Awesome', ['Font scripts'], [{ field: 'dom', key: "[class*='fa']", attribute: 'class', pattern: /(?:^|\s)(?:fa|fas|far|fab|fa-[\w-]+)(?:\s|$)/ }]),
  rule('Swiper', ['JavaScript libraries'], [js('Swiper'), dom('.swiper-wrapper'), text('scriptSrc', /(?:^|\/)swiper(?:[.@/-]|\.min\.js)/)]),
  rule('PWA', ['Web capabilities'], [dom("link[rel='manifest']")]),
  rule('Open Graph', ['Metadata'], [dom("meta[property*='og:']")]),
  rule('Google Analytics', ['Analytics'], [text('scriptSrc', /googletagmanager\.com\/gtag\/js\?[^\s]*\bid=G-/, 'GA4'), text('scripts', /gtag\(\s*['"]config['"]\s*,\s*['"]G-/, 'GA4'), js('GoogleAnalyticsObject')]),
  rule('Google Tag Manager', ['Tag managers'], [js('google_tag_manager'), text('scriptSrc', /googletagmanager\.com\/gtm\.js/)]),
  rule('Cloudflare Browser Insights', ['Analytics'], [js('__cfBeaconCustomTag'), text('scriptSrc', /static\.cloudflareinsights\.com\/beacon/)]),
  rule('Cloudflare', ['CDN'], [{ field: 'headers', key: 'server', pattern: /\bcloudflare\b/i }, { field: 'headers', key: 'cf-ray' }]),
  rule('Google Font API', ['Font scripts'], [text('scriptSrc', /fonts\.googleapis\.com/), text('html', /https:\/\/fonts\.googleapis\.com\//)]),
];
