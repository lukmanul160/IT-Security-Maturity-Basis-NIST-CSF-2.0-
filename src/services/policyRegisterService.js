const fs = require('fs').promises;
const path = require('path');
const { pool } = require('../config/database');
const { uploadRoot } = require('../config/paths');

const tableName = 'policy_register';
const itemTableName = 'policy_register_items';
const dropdownTableName = 'policy_register_dropdown_options';
const dropdownFields = ['categories', 'owners', 'reviewCycles', 'approvalStatuses'];
const defaultDropdowns = {
  categories: ['Cybersecurity', 'IT Governance', 'Privacy', 'Risk Management', 'HR & Compliance'],
  owners: ['CISO', 'IT Manager', 'Data Protection Officer', 'Security Manager', 'Legal', 'Procurement'],
  reviewCycles: ['Annual', 'Biannual', 'Quarterly', 'Ad hoc'],
  approvalStatuses: ['Approved', 'Draft', 'Review due', 'Expired'],
};
const fields = [
  'title',
  'category',
  'owner',
  'review_cycle',
  'approval_status',
  'last_review',
  'attachment_name',
  'attachment_path',
  'attachment_type',
  'notes',
];

function invalid(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function normalizeText(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map(item => ({ subtitle: normalizeText(item?.subtitle), content: normalizeText(item?.content) }))
    .filter(item => item.subtitle || item.content);
}

function validate(data, isUpdate = false) {
  if (!data || typeof data !== 'object') throw invalid('Policy data is required');
  if (!isUpdate && !normalizeText(data.title)) throw invalid('title is required');
  if (!isUpdate && !normalizeText(data.category)) throw invalid('category is required');
  if (!isUpdate && !normalizeText(data.owner)) throw invalid('owner is required');
  if (!isUpdate && !normalizeText(data.reviewCycle || data.review_cycle)) throw invalid('reviewCycle is required');
  if (!isUpdate && !normalizeText(data.approvalStatus || data.approval_status)) throw invalid('approvalStatus is required');
  if (data.title !== undefined && data.title !== null && !normalizeText(data.title) && !isUpdate) throw invalid('title is required');
  if (data.category !== undefined && data.category !== null && !normalizeText(data.category) && !isUpdate) throw invalid('category is required');
  if (data.owner !== undefined && data.owner !== null && !normalizeText(data.owner) && !isUpdate) throw invalid('owner is required');
  if (data.reviewCycle !== undefined && data.reviewCycle !== null && !normalizeText(data.reviewCycle) && !isUpdate) throw invalid('reviewCycle is required');
  if (data.approvalStatus !== undefined && data.approvalStatus !== null && !normalizeText(data.approvalStatus) && !isUpdate) throw invalid('approvalStatus is required');
  if (data.lastReview && !/^\d{4}-\d{2}-\d{2}$/.test(String(data.lastReview))) throw invalid('lastReview must be a valid date');
  if (data.attachmentPath && typeof data.attachmentPath !== 'string') throw invalid('attachmentPath must be a string');
}

function values(data) {
  return [
    normalizeText(data.title),
    normalizeText(data.category),
    normalizeText(data.owner),
    normalizeText(data.reviewCycle || data.review_cycle),
    normalizeText(data.approvalStatus || data.approval_status),
    data.lastReview || data.last_review || null,
    normalizeText(data.attachmentName || data.attachment_name),
    normalizeText(data.attachmentPath || data.attachment_path),
    normalizeText(data.attachmentType || data.attachment_type),
    normalizeText(data.notes),
  ];
}

function mapRow(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    owner: row.owner,
    reviewCycle: row.review_cycle,
    approvalStatus: row.approval_status,
    lastReview: row.last_review,
    attachmentName: row.attachment_name,
    attachmentPath: row.attachment_path,
    attachmentType: row.attachment_type,
    notes: row.notes,
    items: Array.isArray(row.items) ? row.items : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureStore() {
  await pool.query(`CREATE TABLE IF NOT EXISTS ${tableName} (
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
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS ${itemTableName} (
    id BIGSERIAL PRIMARY KEY,
    policy_id BIGINT NOT NULL REFERENCES ${tableName}(id) ON DELETE CASCADE,
    subtitle TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT policy_register_item_content_check CHECK (subtitle <> '' OR content <> '')
  )`);

  await pool.query(`CREATE INDEX IF NOT EXISTS policy_register_items_policy_idx ON ${itemTableName} (policy_id, sort_order, id)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS ${dropdownTableName} (
    id BIGSERIAL PRIMARY KEY,
    field_name TEXT NOT NULL,
    option_value TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT policy_register_dropdown_option_unique UNIQUE (field_name, option_value)
  )`);

  for (const [fieldName, options] of Object.entries(defaultDropdowns)) {
    const existing = await pool.query(`SELECT COUNT(*)::int AS count FROM ${dropdownTableName} WHERE field_name = $1`, [fieldName]);
    const count = Number(existing?.rows?.[0]?.count ?? 0);
    if (count > 0) continue;
    for (let index = 0; index < options.length; index += 1) {
      await pool.query(
        `INSERT INTO ${dropdownTableName} (field_name, option_value, sort_order) VALUES ($1, $2, $3) ON CONFLICT (field_name, option_value) DO NOTHING`,
        [fieldName, options[index], index]
      );
    }
  }
}

async function listDropdowns() {
  const result = await pool.query(`SELECT id, field_name AS "fieldName", option_value AS "optionValue", sort_order AS "sortOrder" FROM ${dropdownTableName} ORDER BY field_name, sort_order, option_value`);
  return result.rows;
}

async function createDropdown(data) {
  if (!data || !dropdownFields.includes(data.fieldName) || !normalizeText(data.optionValue)) {
    throw invalid('fieldName and optionValue are required');
  }

  const result = await pool.query(
    `INSERT INTO ${dropdownTableName} (field_name, option_value, sort_order) VALUES ($1, $2, $3) RETURNING id, field_name AS "fieldName", option_value AS "optionValue", sort_order AS "sortOrder"`,
    [data.fieldName, normalizeText(data.optionValue), Number(data.sortOrder || 0)]
  );

  return result.rows[0];
}

async function updateDropdown(id, data) {
  if (!data || !dropdownFields.includes(data.fieldName) || !normalizeText(data.optionValue)) {
    throw invalid('fieldName and optionValue are required');
  }

  const result = await pool.query(
    `UPDATE ${dropdownTableName} SET field_name = $1, option_value = $2, sort_order = $3, updated_at = NOW() WHERE id = $4 RETURNING id, field_name AS "fieldName", option_value AS "optionValue", sort_order AS "sortOrder"`,
    [data.fieldName, normalizeText(data.optionValue), Number(data.sortOrder || 0), id]
  );

  if (!result.rowCount) {
    throw Object.assign(new Error('Dropdown option not found'), { status: 404 });
  }

  return result.rows[0];
}

async function removeDropdown(id) {
  const result = await pool.query(`DELETE FROM ${dropdownTableName} WHERE id = $1`, [id]);
  if (!result.rowCount) {
    throw Object.assign(new Error('Dropdown option not found'), { status: 404 });
  }
  return { id, deleted: true };
}

async function syncDropdownValues(data) {
  const fieldMap = {
    categories: data.category,
    owners: data.owner,
    reviewCycles: data.reviewCycle,
    approvalStatuses: data.approvalStatus,
  };

  for (const [fieldName, value] of Object.entries(fieldMap)) {
    const optionValue = normalizeText(value);
    if (!optionValue) continue;
    await pool.query(
      `INSERT INTO ${dropdownTableName} (field_name, option_value) VALUES ($1, $2) ON CONFLICT (field_name, option_value) DO NOTHING`,
      [fieldName, optionValue]
    );
  }
}

async function getItems(policyIds) {
  if (!policyIds.length) return new Map();
  const result = await pool.query(
    `SELECT id, policy_id AS "policyId", subtitle, content, sort_order AS "sortOrder" FROM ${itemTableName} WHERE policy_id = ANY($1) ORDER BY policy_id, sort_order, id`,
    [policyIds]
  );
  const itemsByPolicy = new Map();
  result.rows.forEach(item => {
    if (!itemsByPolicy.has(item.policyId)) itemsByPolicy.set(item.policyId, []);
    itemsByPolicy.get(item.policyId).push({ id: item.id, subtitle: item.subtitle, content: item.content });
  });
  return itemsByPolicy;
}

async function syncItems(policyId, items) {
  await pool.query(`DELETE FROM ${itemTableName} WHERE policy_id = $1`, [policyId]);
  for (const [index, item] of normalizeItems(items).entries()) {
    await pool.query(
      `INSERT INTO ${itemTableName} (policy_id, subtitle, content, sort_order) VALUES ($1, $2, $3, $4)`,
      [policyId, item.subtitle, item.content, index]
    );
  }
}

function validateItem(data) {
  if (!data || !normalizeText(data.subtitle) || !normalizeText(data.content)) {
    throw invalid('subtitle and content are required');
  }
}

async function listItems(policyId) {
  const result = await pool.query(
    `SELECT id, policy_id AS "policyId", subtitle, content, sort_order AS "sortOrder" FROM ${itemTableName} WHERE policy_id = $1 ORDER BY sort_order, id`,
    [policyId]
  );
  return result.rows.map(item => ({ id: item.id, policyId: item.policyId, subtitle: item.subtitle, content: item.content, sortOrder: item.sortOrder }));
}

async function createItem(policyId, data) {
  validateItem(data);
  const policy = await pool.query(`SELECT id FROM ${tableName} WHERE id = $1`, [policyId]);
  if (!policy.rows.length) throw Object.assign(new Error('Policy not found'), { status: 404 });
  const result = await pool.query(
    `INSERT INTO ${itemTableName} (policy_id, subtitle, content, sort_order) VALUES ($1, $2, $3, COALESCE((SELECT MAX(sort_order) + 1 FROM ${itemTableName} WHERE policy_id = $1), 0)) RETURNING id, policy_id AS "policyId", subtitle, content, sort_order AS "sortOrder"`,
    [policyId, normalizeText(data.subtitle), normalizeText(data.content)]
  );
  return result.rows[0];
}

async function updateItem(policyId, itemId, data) {
  validateItem(data);
  const result = await pool.query(
    `UPDATE ${itemTableName} SET subtitle = $1, content = $2, sort_order = COALESCE($3, sort_order), updated_at = NOW() WHERE id = $4 AND policy_id = $5 RETURNING id, policy_id AS "policyId", subtitle, content, sort_order AS "sortOrder"`,
    [normalizeText(data.subtitle), normalizeText(data.content), data.sortOrder === undefined ? null : Number(data.sortOrder), itemId, policyId]
  );
  if (!result.rows.length) throw Object.assign(new Error('Policy detail not found'), { status: 404 });
  return result.rows[0];
}

async function removeItem(policyId, itemId) {
  const result = await pool.query(`DELETE FROM ${itemTableName} WHERE id = $1 AND policy_id = $2`, [itemId, policyId]);
  if (!result.rowCount) throw Object.assign(new Error('Policy detail not found'), { status: 404 });
  return { id: itemId, policyId, deleted: true };
}

async function list() {
  const result = await pool.query(`SELECT id, title, category, owner, review_cycle, approval_status, last_review, attachment_name, attachment_path, attachment_type, notes, created_at, updated_at FROM ${tableName} ORDER BY updated_at DESC`);
  const itemsByPolicy = await getItems(result.rows.map(row => row.id));
  return result.rows.map(row => mapRow({ ...row, items: itemsByPolicy.get(row.id) || [] }));
}

async function create(data) {
  validate(data);
  const [title, category, owner, reviewCycle, approvalStatus, lastReview, attachmentName, attachmentPath, attachmentType, notes] = values(data);
  
  const result = await pool.query(
    `INSERT INTO ${tableName} (title, category, owner, review_cycle, approval_status, last_review, attachment_name, attachment_path, attachment_type, notes) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
     RETURNING *`,
    [title, category, owner, reviewCycle, approvalStatus, lastReview, attachmentName, attachmentPath, attachmentType, notes]
  );
  
  if (!result.rows.length) {
    throw invalid('Failed to create policy');
  }

  await syncItems(result.rows[0].id, data.items);

  await syncDropdownValues({ category, owner, reviewCycle, approvalStatus });
  
  return mapRow({ ...result.rows[0], items: normalizeItems(data.items) });
}

async function update(id, data) {
  validate(data, true);
  
  // Fetch existing record
  const existing = await pool.query(`SELECT * FROM ${tableName} WHERE id = $1`, [id]);
  if (!existing.rows.length) {
    throw invalid('Policy not found');
  }

  const current = mapRow(existing.rows[0]);
  
  // Merge new data with existing
  const payload = {
    title: data.title !== undefined ? data.title : current.title,
    category: data.category !== undefined ? data.category : current.category,
    owner: data.owner !== undefined ? data.owner : current.owner,
    reviewCycle: (data.reviewCycle || data.review_cycle) !== undefined ? (data.reviewCycle || data.review_cycle) : current.reviewCycle,
    approvalStatus: (data.approvalStatus || data.approval_status) !== undefined ? (data.approvalStatus || data.approval_status) : current.approvalStatus,
    lastReview: data.lastReview !== undefined ? data.lastReview : current.lastReview,
    attachmentName: data.attachmentName !== undefined ? data.attachmentName : current.attachmentName,
    attachmentPath: data.attachmentPath !== undefined ? data.attachmentPath : current.attachmentPath,
    attachmentType: data.attachmentType !== undefined ? data.attachmentType : current.attachmentType,
    notes: data.notes !== undefined ? data.notes : current.notes,
  };

  // Handle attachment removal flag
  if (data.removeAttachment === true) {
    payload.attachmentName = '';
    payload.attachmentPath = '';
    payload.attachmentType = '';
  }

  const [title, category, owner, reviewCycle, approvalStatus, lastReview, attachmentName, attachmentPath, attachmentType, notes] = values(payload);
  
  const result = await pool.query(
    `UPDATE ${tableName} 
     SET title = $1, category = $2, owner = $3, review_cycle = $4, approval_status = $5, 
         last_review = $6, attachment_name = $7, attachment_path = $8, attachment_type = $9, 
         notes = $10, updated_at = NOW() 
     WHERE id = $11 
     RETURNING *`,
    [title, category, owner, reviewCycle, approvalStatus, lastReview, attachmentName, attachmentPath, attachmentType, notes, id]
  );
  
  if (!result.rows.length) {
    throw invalid('Policy not found');
  }

  if (data.items !== undefined) await syncItems(id, data.items);

  await syncDropdownValues(payload);
  
  const itemsByPolicy = data.items !== undefined ? normalizeItems(data.items) : (await getItems([id])).get(Number(id)) || [];
  return mapRow({ ...result.rows[0], items: itemsByPolicy });
}

async function remove(id) {
  // Fetch record to get attachment path for cleanup
  const existing = await pool.query(`SELECT attachment_path FROM ${tableName} WHERE id = $1`, [id]);
  if (!existing.rows.length) {
    throw invalid('Policy not found');
  }

  const attachmentPath = existing.rows[0].attachment_path;
  
  // Delete from database
  const result = await pool.query(`DELETE FROM ${tableName} WHERE id = $1`, [id]);
  if (!result.rowCount) {
    throw invalid('Failed to delete policy');
  }

  // Cleanup file from disk
  if (attachmentPath) {
    try {
      const cleanPath = attachmentPath.replace(/^(upload|uploads)\//, '');
      const fullPath = path.join(uploadRoot, cleanPath);
      await fs.rm(fullPath, { force: true });
    } catch (err) {
      // Log but don't fail if file cleanup fails
      console.error(`[policyRegisterService] File cleanup failed for ${attachmentPath}:`, err.message);
    }
  }

  return { id, deleted: true };
}

module.exports = { ensureStore, listDropdowns, createDropdown, updateDropdown, removeDropdown, syncDropdownValues, list, create, update, remove, listItems, createItem, updateItem, removeItem };
