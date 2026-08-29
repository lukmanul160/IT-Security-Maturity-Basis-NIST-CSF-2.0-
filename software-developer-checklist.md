# Software Developer Partner — Security & Compliance Checklist

> **Purpose**: Evaluate software development partners against security, privacy, and SDLC best practices.  
> **Used By**: TPRM Committee during onboarding and annual assessment.  
> **Reference**: [TPRM Framework](./tprm-framework.md), [Due Diligence Questionnaire](./due-diligence-questionnaire.md)

---

## 1. Secure SDLC (Software Development Lifecycle)

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| 1.1 | Documented SDLC methodology with security gates at each phase | ⬜ | |
| 1.2 | Threat modeling performed during design phase for features handling PII | ⬜ | |
| 1.3 | Security requirements defined in user stories / acceptance criteria | ⬜ | |
| 1.4 | SAST (Static Application Security Testing) integrated into CI/CD pipeline | ⬜ | |
| 1.5 | DAST (Dynamic Application Security Testing) run prior to each major release | ⬜ | |
| 1.6 | SCA (Software Composition Analysis) for all third-party dependencies | ⬜ | |
| 1.7 | Manual code review required before merge to main branch | ⬜ | |
| 1.8 | Security-focused code review for all paths handling PII or authentication | ⬜ | |
| 1.9 | OWASP Top 10 / CWE Top 25 awareness training for all developers | ⬜ | |
| 1.10 | Penetration test conducted annually by independent third party | ⬜ | |

---

## 2. Code Repository Security

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| 2.1 | Source code hosted in access-controlled repository (GitHub Enterprise, GitLab, Bitbucket) | ⬜ | |
| 2.2 | Two-factor authentication enforced for all repository access | ⬜ | |
| 2.3 | Branch protection: direct push to main/master prohibited | ⬜ | |
| 2.4 | Pull request review required (≥1 reviewer) before merge | ⬜ | |
| 2.5 | Commit signing enforced (GPG/SSH) | ⬜ | |
| 2.6 | Repository audit logging enabled and immutable | ⬜ | |
| 2.7 | No secrets (API keys, passwords, tokens) in source code — verified by pre-commit hooks and CI scanning | ⬜ | |
| 2.8 | `.gitignore` properly configured to exclude environment files, secrets, and PII test data | ⬜ | |

---

## 3. Access Control & Identity

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| 3.1 | Developer access to production systems prohibited unless explicitly authorized | ⬜ | |
| 3.2 | All authorized production access: time-limited, logged, and pre-approved | ⬜ | |
| 3.3 | Individual developer accounts (no shared/generic accounts) | ⬜ | |
| 3.4 | MFA enforced for all systems (code repo, CI/CD, cloud console, communication tools) | ⬜ | |
| 3.5 | Privileged access review conducted quarterly | ⬜ | |
| 3.6 | Immediate access revocation upon developer offboarding (within 24 hours) | ⬜ | |
| 3.7 | Session timeout / auto-lock after 15 minutes of inactivity | ⬜ | |

---

## 4. Data Handling in Development

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| 4.1 | Production PII never used in development or testing environments | ⬜ | |
| 4.2 | Synthetic/test data used for development and testing | ⬜ | |
| 4.3 | If production data is necessary for testing: anonymized/pseudonymized before use | ⬜ | |
| 4.4 | Database dumps and log files excluded from version control | ⬜ | |
| 4.5 | Developer workstations: full-disk encryption enabled | ⬜ | |
| 4.6 | Developer workstations: endpoint protection / EDR deployed | ⬜ | |
| 4.7 | Local development databases secured (authentication, network binding) | ⬜ | |
| 4.8 | Screen locking enforced after 10 minutes of inactivity | ⬜ | |

---

## 5. Dependency & Vulnerability Management

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| 5.1 | Software Bill of Materials (SBOM) maintained and provided to customer | ⬜ | |
| 5.2 | All third-party dependencies scanned for known vulnerabilities (CVE) on every build | ⬜ | |
| 5.3 | Critical vulnerabilities in dependencies remediated within 48 hours | ⬜ | |
| 5.4 | High vulnerabilities in dependencies remediated within 7 days | ⬜ | |
| 5.5 | Dependency update policy: automatic patch-level; manual review for major/minor | ⬜ | |
| 5.6 | End-of-life or unmaintained dependencies flagged and replaced | ⬜ | |
| 5.7 | License compliance checked for all dependencies (no copyleft GPL without legal review) | ⬜ | |

---

## 6. Secrets & Configuration Management

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| 6.1 | Secrets (API keys, passwords, tokens, certificates) stored in a dedicated secrets manager (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault) | ⬜ | |
| 6.2 | Secrets never hardcoded, stored in environment variables, or committed to repositories | ⬜ | |
| 6.3 | Secrets rotation policy: API keys rotated every 90 days; certificates annually | ⬜ | |
| 6.4 | CI/CD pipeline secrets scoped to minimum required access | ⬜ | |
| 6.5 | Configuration-as-code: all infrastructure and application configs versioned and reviewed | ⬜ | |

---

## 7. Logging & Monitoring

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| 7.1 | Application logs exclude PII (passwords, SSN, biometric, full credit card numbers) | ⬜ | |
| 7.2 | Log retention: ≥ 90 days online, ≥ 1 year archived | ⬜ | |
| 7.3 | Centralized logging with SIEM or equivalent | ⬜ | |
| 7.4 | Alert rules for: authentication failures, privilege escalation, data export, configuration changes | ⬜ | |
| 7.5 | Audit trail for all PII access (who, what, when, source IP) | ⬜ | |

---

## 8. Incident Response

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| 8.1 | Documented incident response plan, tested annually | ⬜ | |
| 8.2 | Breach notification to customer within ≤ 48 hours | ⬜ | |
| 8.3 | Root cause analysis performed for all security incidents | ⬜ | |
| 8.4 | Incident post-mortem shared with customer (for incidents affecting customer data) | ⬜ | |
| 8.5 | Communication plan: designated contact, escalation path, backup contacts | ⬜ | |

---

## 9. Business Continuity

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| 9.1 | BC/DR plan documented and tested annually | ⬜ | |
| 9.2 | RTO ≤ 4 hours, RPO ≤ 1 hour for critical systems | ⬜ | |
| 9.3 | Geographically redundant infrastructure (≥ 2 availability zones or regions) | ⬜ | |
| 9.4 | Backups: encrypted, tested for restoration quarterly | ⬜ | |
| 9.5 | Code escrow available for mission-critical custom software | ⬜ | |

---

## 10. Manufacturing & OT-Specific (Where Applicable)

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| 10.1 | Experience with industrial protocols (Modbus, PROFINET, EtherNet/IP, OPC-UA) | ⬜ | |
| 10.2 | IEC 62443 familiarity and implementation | ⬜ | |
| 10.3 | Understanding of OT safety constraints (no active scanning without maintenance window) | ⬜ | |
| 10.4 | OT system integration: documented isolation from IT; no unintended IT-OT bridges in code | ⬜ | |
| 10.5 | OT test environment mirrors production segmentation for accurate testing | ⬜ | |

---

## Summary

| Category | Total Items | Compliant | Partial/Gap | Non-Compliant | N/A |
|----------|------------|-----------|-------------|---------------|-----|
| 1. Secure SDLC | 10 | | | | |
| 2. Repository Security | 8 | | | | |
| 3. Access Control | 7 | | | | |
| 4. Data Handling in Dev | 8 | | | | |
| 5. Dependency Mgmt | 7 | | | | |
| 6. Secrets Mgmt | 5 | | | | |
| 7. Logging & Monitoring | 5 | | | | |
| 8. Incident Response | 5 | | | | |
| 9. Business Continuity | 5 | | | | |
| 10. Manufacturing/OT | 5 | | | | |
| **TOTAL** | **65** | | | | |

**Overall Assessment**: ☐ Trusted Partner ☐ Conditional Approval ☐ Not Recommended

**Reviewed By**: _____________ **Date**: _____________
