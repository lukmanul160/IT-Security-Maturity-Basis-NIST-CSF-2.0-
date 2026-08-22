const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');

module.exports = {
  projectRoot,
  publicRoot: path.join(projectRoot, 'public'),
  dataRoot: path.join(projectRoot, 'data'),
  schemaFile: path.join(projectRoot, 'database', 'schema.sql'),
  usersFile: path.join(projectRoot, 'database', 'users.sql'),
  uploadRoot: path.join(projectRoot, 'upload'),
  stateFile: path.join(projectRoot, 'data', 'assessment-state.json'),
};
