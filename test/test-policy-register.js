const http = require('http');

const req = http.get('http://localhost:8000/api/policy-register', {
  headers: {'Cookie': 'nist_session=test'}
}, (res) => {
  console.log('Status:', res.statusCode);
  res.on('data', (d) => process.stdout.write(d));
  res.on('end', () => console.log(''));
});

req.on('error', (e) => console.error('Error:', e.message));
