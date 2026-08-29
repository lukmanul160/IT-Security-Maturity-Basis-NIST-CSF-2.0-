const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

const projectRoot = path.resolve(__dirname, '..', '..');

function invalid(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function normalizeSections(sections) {
  if (!Array.isArray(sections)) throw invalid('sections must be an array');

  const normalized = sections.map((section, index) => {
    if (!Array.isArray(section) || section.length !== 2 || !Array.isArray(section[1])) {
      throw invalid(`Section ${index + 1} is invalid`);
    }

    const title = String(section[0] || '').trim();
    const questions = section[1].map(question => String(question || '').trim()).filter(Boolean);
    if (!title) throw invalid(`Section ${index + 1} requires a title`);
    if (!questions.length) throw invalid(`Section ${index + 1} requires at least one question`);

    return [title, questions];
  });

  if (!normalized.length) throw invalid('At least one section is required');
  return normalized;
}

function parseMarkdownSections(markdownText) {
  const sections = [];
  const lines = String(markdownText || '').split(/\r?\n/);
  let currentTitle = null;
  let currentQuestions = [];
  let inTable = false;

  const flushSection = () => {
    if (!currentTitle) return;
    const questions = currentQuestions
      .map(question => question.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (questions.length) {
      sections.push([currentTitle, questions]);
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('## ')) {
      flushSection();
      currentTitle = line.replace(/^##\s+/, '').trim();
      currentQuestions = [];
      inTable = false;
      continue;
    }

    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
      if (!cells.length || cells.length < 2 || cells[0].startsWith('---') || cells[1].startsWith('Question') || cells[1].startsWith('Control') || cells[1].startsWith('Category')) {
        if (cells[0] && cells[0].startsWith('---')) {
          inTable = false;
        }
        continue;
      }

      const identifier = cells[0];
      const question = cells[1].replace(/\*\*|`/g, '').trim();
      if (!question) continue;
      if (!/^\d+(?:\.\d+)?$/.test(identifier.replace(/[^\d.]/g, '')) && !/^\d+(?:\.\d+)?\s*[-:]\s*/.test(question)) {
        continue;
      }
      currentQuestions.push(question);
      inTable = true;
      continue;
    }

    if (inTable && !line.startsWith('|')) {
      inTable = false;
    }
  }

  flushSection();
  return sections;
}

function loadSectionsFromMarkdown(fileName) {
  const filePath = path.join(projectRoot, fileName);
  const markdown = fs.readFileSync(filePath, 'utf8');
  const sections = parseMarkdownSections(markdown);
  if (!sections.length) {
    throw new Error(`Unable to parse questionnaire content from ${fileName}`);
  }
  return sections;
}

const defaultTemplates = [
  {
    template_name: 'Due Diligence Questionnaire',
    description: 'Standardized vendor due diligence assessment extracted from due-diligence-questionnaire.md.',
    sections: () => loadSectionsFromMarkdown('due-diligence-questionnaire.md'),
    is_default: true,
  },
  {
    template_name: 'Software Developer Security Checklist',
    description: 'Software development partner security and compliance checklist extracted from software-developer-checklist.md.',
    sections: () => loadSectionsFromMarkdown('software-developer-checklist.md'),
    is_default: false,
  },
];

async function ensureStore() {
  const existing = await pool.query('SELECT template_name FROM questionnaire_templates');
  const templateNames = new Set(existing.rows.map(row => row.template_name));

  for (const template of defaultTemplates) {
    if (templateNames.has(template.template_name)) continue;

    await pool.query(
      'INSERT INTO questionnaire_templates (template_name, description, sections, is_default) VALUES ($1, $2, $3, $4)',
      [template.template_name, template.description, JSON.stringify(template.sections()), template.is_default]
    );
  }
}

async function list() {
  const result = await pool.query('SELECT * FROM questionnaire_templates ORDER BY is_default DESC, template_name ASC');
  return result.rows.map(row => ({
    ...row,
    sections: typeof row.sections === 'string' ? JSON.parse(row.sections) : row.sections
  }));
}

async function create(data) {
  const { template_name, description = '', sections = [] } = data;
  if (!template_name) throw new Error('template_name is required');
  const normalizedSections = normalizeSections(sections);

  const result = await pool.query(
    'INSERT INTO questionnaire_templates (template_name, description, sections) VALUES ($1, $2, $3) RETURNING *',
    [template_name, description, JSON.stringify(normalizedSections)]
  );

  const row = result.rows[0];
  return { ...row, sections: typeof row.sections === 'string' ? JSON.parse(row.sections) : row.sections };
}

async function update(id, data) {
  const { template_name, description, sections, is_default } = data;
  const normalizedSections = sections === undefined ? null : normalizeSections(sections);
  const result = await pool.query(
    'UPDATE questionnaire_templates SET template_name = COALESCE($1, template_name), description = COALESCE($2, description), sections = COALESCE($3, sections), is_default = COALESCE($4, is_default), updated_at = NOW() WHERE id = $5 RETURNING *',
    [template_name, description, normalizedSections ? JSON.stringify(normalizedSections) : null, is_default, id]
  );

  const row = result.rows[0];
  if (!row) throw new Error('Template not found');
  return { ...row, sections: typeof row.sections === 'string' ? JSON.parse(row.sections) : row.sections };
}

async function remove(id) {
  const result = await pool.query('DELETE FROM questionnaire_templates WHERE id = $1 RETURNING *', [id]);
  if (!result.rows.length) throw new Error('Template not found');
  return result.rows[0];
}

module.exports = { ensureStore, list, create, update, remove };
