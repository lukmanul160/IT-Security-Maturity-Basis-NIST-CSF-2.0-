const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'Security-Certification-Roadmap9.html'), 'utf8');
const decode = value => value.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const domain = className => /network/i.test(className) ? 'Communication and Network Security' : /iam/i.test(className) ? 'Identity and Access Management' : /engineer/i.test(className) ? 'Security Architecture and Engineering' : /asset/i.test(className) ? 'Asset Security' : /mgmt/i.test(className) ? 'Security and Risk Management' : /test/i.test(className) ? 'Security Assessment and Testing' : /software/i.test(className) ? 'Software Security' : /ops/i.test(className) ? 'Security Operations' : 'Security Certification Roadmap';
const level = name => { const value = name.toLowerCase(); const entry = ['associate', 'foundation', 'foundational', 'beginner', 'entry', 'essentials', 'security+', 'pcsa', 'ccna', 'sc-900', 'az-900', 'az-104', 'rhcsa', 'lfcs', 'cysa+'].some(keyword => value.includes(keyword)); const advanced = ['expert', 'architect', 'master', 'lead', 'principal', 'professional', 'advanced', 'senior', 'cissp', 'cism', 'cisa', 'crisc', 'oscp', 'osce', 'osep', 'gse', 'gsp'].some(keyword => value.includes(keyword)); return entry && !advanced ? 'Entry Level' : advanced ? 'Advanced / Expert' : 'Intermediate'; };
const records = [];
const seen = new Set();
const pattern = /<a\s+class="([^"]*item[^"]*)"([^>]*)>([\s\S]*?)<\/a>/gi;
let match;
while ((match = pattern.exec(source))) {
  const certificationName = decode(match[3]);
  const referenceUrl = match[2].match(/href="([^"]*)"/i)?.[1] || '';
  if (!certificationName || certificationName.length > 80 || seen.has(certificationName)) continue;
  seen.add(certificationName);
  const certificationDomain = domain(match[1]);
  records.push({ personnelName: `Roadmap catalog - ${certificationDomain}`, personnelRole: certificationDomain, certificationName, issuer: 'Security Certification Roadmap', referenceUrl, certificationLevel: level(certificationName), status: 'Catalog', notes: 'Imported from Security-Certification-Roadmap9.html' });
}
fs.writeFileSync(path.join(__dirname, '..', 'data', 'personnel-certifications-seed.json'), `${JSON.stringify({ format: 'personnel-certifications-seed-v1', source: 'Security-Certification-Roadmap9.html', records }, null, 2)}\n`);
console.log(`Generated ${records.length} personnel certification seed records.`);
