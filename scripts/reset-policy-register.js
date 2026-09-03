#!/usr/bin/env node
/**
 * Script untuk reset dan recreate table policy_register
 */

const fs = require('fs').promises;
const path = require('path');
const { pool } = require('../src/config/database');

async function resetPolicyRegister() {
  try {
    console.log('🔄 Resetting policy_register table...');
    
    // Drop table if exists
    await pool.query(`DROP TABLE IF EXISTS policy_register CASCADE`);
    console.log('✓ Dropped existing policy_register table');
    
    // Create new table with proper schema
    const createTableSQL = `
      CREATE TABLE policy_register (
        id BIGSERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        owner TEXT NOT NULL,
        review_cycle TEXT NOT NULL,
        approval_status TEXT NOT NULL,
        last_review DATE,
        attachment_name TEXT NOT NULL DEFAULT '',
        attachment_path TEXT NOT NULL DEFAULT '',
        attachment_type TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      
      CREATE INDEX policy_register_updated_idx ON policy_register (updated_at DESC);
      CREATE INDEX policy_register_category_idx ON policy_register (category);
      CREATE INDEX policy_register_owner_idx ON policy_register (owner);
      CREATE INDEX policy_register_status_idx ON policy_register (approval_status);
    `;
    
    await pool.query(createTableSQL);
    console.log('✓ Created fresh policy_register table');
    
    // Verify table exists
    const verify = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'policy_register'`);
    console.log(`✓ Table has ${verify.rowCount} columns:`);
    verify.rows.forEach(row => console.log(`  - ${row.column_name}`));
    
    console.log('\n✅ Policy Register database reset successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error resetting policy_register:', error.message);
    process.exit(1);
  }
}

resetPolicyRegister();
