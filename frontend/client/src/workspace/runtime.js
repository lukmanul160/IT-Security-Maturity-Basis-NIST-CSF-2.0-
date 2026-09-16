// Ordered classic-script source: keep shared scope and initialization order intact.
// See features/README.md before moving code between sections.
import part01 from './features/shared/state-and-access.js?raw';
import part02 from './features/risk-acceptance/forms.js?raw';
import part03 from './features/policy-register/dropdowns.js?raw';
import part04 from './features/policy-register/form.js?raw';
import part05 from './features/policy-register/email-reminder.js?raw';
import part06 from './features/policy-register/register-and-calendar.js?raw';
import part07 from './features/tprm/navigation-and-questionnaires.js?raw';
import part08 from './features/tprm/questionnaire-templates.js?raw';
import part09 from './features/tprm/vendor-register.js?raw';
import part10 from './features/risk-management/register.js?raw';
import personnelForms from './features/personnel/organization-and-forms.js?raw';
import part11 from './features/personnel/certifications.js?raw';
import part12 from './features/assessment/overview-and-csf.js?raw';
import part13 from './features/iso27001/controls-and-evidence.js?raw';
import part14 from './features/iso27001/objectives-and-soa.js?raw';
import part15 from './features/assessment/control-editor.js?raw';
import part16 from './features/uploaded-files/attachments.js?raw';
import part17 from './features/assessment/scoring.js?raw';
import part18 from './features/privacy/assessment.js?raw';
import part19 from './features/shared/import-export.js?raw';
import part20 from './features/administration/audit-backup-accounts.js?raw';
import part21 from './features/shared/startup.js?raw';
import part22 from './features/uploaded-files/editor-and-events.js?raw';
import eventBindings from './features/shared/event-bindings.js?raw';
import storageSettings from './features/uploaded-files/storage-settings.js?raw';
import moduleTransfer from './features/shared/module-transfer.js?raw';
import smtpSettings from './features/administration/smtp-settings.js?raw';

import auditFindingTracker from './features/audit-finding/tracker.js?raw';

export default [
  part01,
  part02,
  part03,
  part04,
  part05,
  part06,
  part07,
  part08,
  part09,
  part10,
  personnelForms,
  part11,
  part12,
  part13,
  part14,
  part15,
  part16,
  part17,
  part18,
  part19,
  part20,
  part21,
  part22,
  auditFindingTracker,
  eventBindings,
  storageSettings,
  moduleTransfer,
  smtpSettings
].join('');
