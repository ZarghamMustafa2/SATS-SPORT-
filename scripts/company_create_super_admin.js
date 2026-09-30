#!/usr/bin/env node
/**
 * Company Account Administrative Tool
 * Provisions Super Admin accounts directly into the database without requiring any username/password login.
 * 
 * Usage:
 *   node scripts/company_create_super_admin.js <username> <password> [phone] [reference]
 */

const path = require('path');
const authDb = require('../lib/auth_db');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('================================================================');
  console.error('Company Account Super Admin Provisioner');
  console.error('================================================================');
  console.error('Usage:');
  console.error('  node scripts/company_create_super_admin.js <username> <password> [phone] [reference]');
  console.error('\nExample:');
  console.error('  node scripts/company_create_super_admin.js superadmin_alpha Secret@123');
  console.error('================================================================');
  process.exit(1);
}

const [username, password, phone, reference] = args;

try {
  const result = authDb.createSuperAdminByCompany({
    username,
    password,
    phone: phone || '',
    reference: reference || ''
  });

  console.log('----------------------------------------------------------------');
  console.log('SUCCESS: Super Admin Account Created by Company Account');
  console.log('----------------------------------------------------------------');
  console.log('ID:         ', result.id);
  console.log('Username:   ', result.username);
  console.log('Role:       ', result.role, `(${result.roleLabel})`);
  console.log('Parent:     ', result.parentId, `(${result.createdBy})`);
  console.log('Created At: ', result.createdAt);
  console.log('----------------------------------------------------------------');
  console.log('The Super Admin can now log in using the common login page.');
} catch (err) {
  console.error('ERROR: Failed to create Super Admin account:', err.message);
  process.exit(1);
}
