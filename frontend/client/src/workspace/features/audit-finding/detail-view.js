// Render only: filtering, permissions and API state stay in tracker.js.
function renderAuditFindingDetails(audit, { findings: scopedFindings, children, isOverdue, escapeHtml }) {
    const findings = scopedFindings.filter(row => row.parentId === audit.id);
    const pending = findings.filter(row => row.data.status !== 'Closed');
    const overdue = pending.filter(isOverdue).length;
    pending.sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || (a.data.dueDate || '9999').localeCompare(b.data.dueDate || '9999'));
    return `<p class="muted">${findings.length} finding · ${findings.length - pending.length} selesai · ${pending.length} belum selesai · <strong class="${overdue ? 'aft-overdue' : ''}">${overdue} lewat tenggat</strong></p><details class="insight-panel" data-aft-details="${audit.id}"><summary>Lihat ${pending.length} finding belum selesai</summary>${pending.length ? `<div class="excel-wrap"><table class="excel-table"><thead><tr><th>Finding / Severity</th><th>PIC</th><th>Status</th><th>Tenggat</th><th>Follow-up</th></tr></thead><tbody>${pending.map(finding => {
      const actions = children(finding.id).filter(row => row.kind === 'followup');
      return `<tr><td><strong>${escapeHtml(finding.data.title)}</strong><br>${escapeHtml(finding.data.severity)}<br><small>${escapeHtml(finding.data.description)}</small></td><td>${escapeHtml(finding.data.owner || 'Belum ditentukan')}</td><td>${escapeHtml(finding.data.status)}</td><td>${escapeHtml(finding.data.dueDate || 'Tanpa tenggat')}${isOverdue(finding) ? '<br><strong class="aft-overdue">Lewat tenggat</strong>' : ''}</td><td>${actions.length} follow-up<br><button class="button button-quiet" type="button" data-aft-finding="${finding.id}">Buka Follow-up</button></td></tr>`;
    }).join('')}</tbody></table></div>` : `<p class="muted">${findings.length ? 'Semua finding sudah selesai.' : 'Belum ada finding pada audit ini.'}</p>`}</details>`;
  }
