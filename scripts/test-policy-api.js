#!/usr/bin/env node
/**
 * Test script untuk verify Policy Register API endpoints
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const TEST_BASE_URL = 'http://localhost:8000';

// Simple test helper
function makeRequest(method, url, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url, TEST_BASE_URL);
    const options = {
      method,
      headers: {
        'Authorization': 'Bearer test-token',
        ...headers
      }
    };

    const req = http.request(urlObj, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: body ? JSON.parse(body) : null
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body
          });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(typeof data === 'string' ? data : JSON.stringify(data));
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing Policy Register API...\n');

  try {
    // Test 1: GET list (no auth required for this test)
    console.log('1️⃣  GET /api/policy-register');
    try {
      const getRes = await makeRequest('GET', '/api/policy-register');
      console.log(`   Status: ${getRes.status}`);
      if (getRes.status === 401) {
        console.log('   ⚠️  Authentication required - this is expected');
      } else if (getRes.status === 200) {
        console.log(`   ✓ Route works! Found ${Array.isArray(getRes.body) ? getRes.body.length : 0} policies`);
      } else {
        console.log(`   ❌ Unexpected status: ${getRes.status}`);
      }
    } catch (e) {
      console.log(`   ❌ Error: ${e.message}`);
    }

    console.log('\n2️⃣  POST /api/policy-register');
    try {
      const postRes = await makeRequest('POST', '/api/policy-register', 
        { data: JSON.stringify({
          title: 'Test Policy',
          category: 'Cybersecurity',
          owner: 'CISO',
          reviewCycle: 'Annual',
          approvalStatus: 'Draft',
          notes: 'Test'
        })},
        { 'Content-Type': 'application/json' }
      );
      console.log(`   Status: ${postRes.status}`);
      if (postRes.status === 401) {
        console.log('   ⚠️  Authentication required - this is expected');
      } else if (postRes.status === 201) {
        console.log(`   ✓ Policy created! ID: ${postRes.body?.id}`);
      } else if (postRes.status === 403) {
        console.log('   ⚠️  Permission denied - check user role');
      } else if (postRes.status === 404) {
        console.log('   ❌ Route not found! Check API path');
      } else {
        console.log(`   Status ${postRes.status}: ${postRes.body?.error || postRes.body}`);
      }
    } catch (e) {
      console.log(`   ❌ Error: ${e.message}`);
    }

    console.log('\n✅ API endpoint test complete');
    console.log('\nℹ️  Notes:');
    console.log('   - Make sure server is running: node src/server.js');
    console.log('   - Authentication uses session cookies');
    console.log('   - Check browser DevTools Network tab for actual requests');

  } catch (error) {
    console.error('Test error:', error);
  }

  process.exit(0);
}

runTests();
