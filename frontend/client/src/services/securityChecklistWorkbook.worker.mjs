/** Parse untrusted Excel away from the UI; the caller terminates this worker on timeout. */
import { verifyChecklistArchive } from './securityChecklistArchive.mjs';
import { readChecklistWorkbook } from './securityChecklistWorkbook.mjs';

self.onmessage = async ({ data }) => {
  try {
    await verifyChecklistArchive(data.buffer);
    self.postMessage({ result: readChecklistWorkbook(data.buffer, data.defaults) });
  } catch (error) {
    self.postMessage({ error: error.message || 'File Excel tidak dapat dibaca. Gunakan format .xlsx.' });
  }
};
