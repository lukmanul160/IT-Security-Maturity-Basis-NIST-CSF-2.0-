# Vendor Due Diligence Questionnaire

> **Purpose**: Standardized assessment for all Tier 1 and Tier 2 vendors prior to onboarding and annually thereafter.  
> **Version**: 2.0 | **Used By**: TPRM Committee, IT Security, Procurement

---

## Section 1: Company Information

| # | Question | Response |
|---|----------|----------|
| 1.1 | Legal company name and any DBAs | |
| 1.2 | Headquarters address and all operational locations | |
| 1.3 | Years in business | |
| 1.4 | Number of employees (total, and in security/engineering) | |
| 1.5 | Primary contact for this assessment (name, title, email, phone) | |
| 1.6 | Data Protection Officer / Security Officer contact (if different) | |
| 1.7 | Parent company or ultimate beneficial owner (if applicable) | |

---

## Section 2: Service Scope & Data Processing

| # | Question | Response |
|---|----------|----------|
| 2.1 | Describe the services provided to our company | |
| 2.2 | Will you process, store, or transmit Personal Data (PII) on our behalf? | ☐ Yes ☐ No |
| 2.3 | If Yes: Describe the categories of Personal Data (e.g., employee names, biometric data, customer contacts, financial data) | |
| 2.4 | If Yes: What is the estimated volume of data subjects? | ☐ <100 ☐ 100–1,000 ☐ 1,000–10,000 ☐ >10,000 |
| 2.5 | Will you process any Special Category / Sensitive Personal Data? (biometric, health, racial/ethnic, precise geolocation) | ☐ Yes ☐ No |
| 2.6 | If Yes to 2.5: Describe the data and processing purpose | |
| 2.7 | Where will the data be stored/processed geographically? (list all countries) | |
| 2.8 | Will data be transferred across international borders? | ☐ Yes ☐ No |
| 2.9 | If Yes to 2.8: What transfer mechanisms are in place? (SCC, DPF, BCR) | |
| 2.10 | Do you use any Sub-Processors to deliver the service? | ☐ Yes ☐ No |
| 2.11 | If Yes to 2.10: List all Sub-Processors, their services, and locations (attach full list) | |

---

## Section 3: Information Security Program

| # | Question | Response |
|---|----------|----------|
| 3.1 | Do you have a formally documented Information Security Program? | ☐ Yes ☐ No |
| 3.2 | Is the program reviewed and updated at least annually? | ☐ Yes ☐ No |
| 3.3 | Which security certifications do you currently hold? (check all that apply) | ☐ ISO 27001 ☐ SOC 2 Type II ☐ SOC 1 ☐ PCI DSS ☐ FedRAMP ☐ HITRUST ☐ Other: ___ |
| 3.4 | Please attach the most recent certification or audit report (SOC 2, ISO 27001, etc.) | [Attach] |
| 3.5 | Do you have a designated CISO or security leader? | ☐ Yes ☐ No — Name & Title: |
| 3.6 | Do you perform annual third-party penetration testing? | ☐ Yes ☐ No |
| 3.7 | If Yes to 3.6: Attach the executive summary of your most recent pen test | [Attach] |
| 3.8 | Do you perform regular vulnerability scanning? | ☐ Yes ☐ No — Frequency: ☐ Weekly ☐ Monthly ☐ Quarterly |
| 3.9 | What is your SLA for critical vulnerability remediation? | ☐ 24 hrs ☐ 48 hrs ☐ 7 days ☐ 30 days ☐ Other: ___ |
| 3.10 | Do you have a bug bounty or vulnerability disclosure program? | ☐ Yes ☐ No |
| 3.11 | Do you maintain a Secure Software Development Lifecycle (SDLC)? (software developers only) | ☐ Yes ☐ No — Framework: ☐ OWASP SAMM ☐ NIST SSDF ☐ Other: ___ |

---

## Section 4: Access Control & Data Protection

| # | Question | Response |
|---|----------|----------|
| 4.1 | Do you enforce Multi-Factor Authentication (MFA) for all user accounts? | ☐ Yes ☐ No |
| 4.2 | Do you implement Role-Based Access Control (RBAC) with least privilege? | ☐ Yes ☐ No |
| 4.3 | How often are privileged access rights reviewed? | ☐ Monthly ☐ Quarterly ☐ Biannually ☐ Annually |
| 4.4 | Is encryption used for data at rest? | ☐ Yes ☐ No — Standard: ☐ AES-256 ☐ AES-128 ☐ Other: ___ |
| 4.5 | Is encryption used for data in transit? | ☐ Yes ☐ No — Standard: ☐ TLS 1.3 ☐ TLS 1.2 ☐ Other: ___ |
| 4.6 | Do you have a Data Loss Prevention (DLP) program? | ☐ Yes ☐ No |
| 4.7 | How do you manage encryption keys? | ☐ HSM ☐ Cloud KMS (AWS KMS/Azure Key Vault) ☐ Other: ___ |
| 4.8 | Do you perform background checks on employees with access to customer data? | ☐ Yes ☐ No |
| 4.9 | Do all employees sign confidentiality agreements? | ☐ Yes ☐ No |

---

## Section 5: Incident Response & Breach History

| # | Question | Response |
|---|----------|----------|
| 5.1 | Do you have a documented Incident Response Plan? | ☐ Yes ☐ No |
| 5.2 | Is the plan tested at least annually (table-top or live exercise)? | ☐ Yes ☐ No — Date of last test: |
| 5.3 | What is your SLA for notifying customers of a confirmed security incident involving their data? | ☐ ≤ 24 hrs ☐ ≤ 48 hrs ☐ ≤ 72 hrs ☐ Other: ___ |
| 5.4 | Have you experienced any security incidents involving unauthorized access to customer data in the last 3 years? | ☐ Yes ☐ No |
| 5.5 | If Yes to 5.4: Describe the incident(s), root cause, impact, and remediation (attach details if needed) | |
| 5.6 | Have you ever been subject to a regulatory investigation, fine, or enforcement action related to data protection/privacy? | ☐ Yes ☐ No |
| 5.7 | If Yes to 5.6: Provide details of the action and current status | |
| 5.8 | Do you maintain cyber liability insurance? | ☐ Yes ☐ No — Coverage amount: $_____ |

---

## Section 6: Business Continuity & Resilience

| # | Question | Response |
|---|----------|----------|
| 6.1 | Do you have a documented Business Continuity / Disaster Recovery (BC/DR) plan? | ☐ Yes ☐ No |
| 6.2 | What is your Recovery Time Objective (RTO)? | ☐ < 4 hrs ☐ < 8 hrs ☐ < 24 hrs ☐ Other: ___ |
| 6.3 | What is your Recovery Point Objective (RPO)? | ☐ < 1 hr ☐ < 4 hrs ☐ < 12 hrs ☐ Other: ___ |
| 6.4 | Is the BC/DR plan tested at least annually? | ☐ Yes ☐ No — Date of last test: |
| 6.5 | Do you have geographically redundant infrastructure? | ☐ Yes ☐ No — Describe: |
| 6.6 | How do you back up customer data? (frequency, encryption, retention) | |

---

## Section 7: Software Development Practices (Software Developer Partners Only)

| # | Question | Response |
|---|----------|----------|
| 7.1 | Do you follow a documented Secure SDLC methodology? | ☐ Yes ☐ No |
| 7.2 | Which security testing methods are integrated into your SDLC? (check all that apply) | ☐ SAST (Static Analysis) ☐ DAST (Dynamic Analysis) ☐ SCA (Software Composition Analysis) ☐ Manual Code Review ☐ Penetration Testing |
| 7.3 | How do you manage open-source and third-party dependencies? (SCA tool, frequency, vulnerability SLAs) | |
| 7.4 | Do you have a secure code review process (peer review required before merge)? | ☐ Yes ☐ No |
| 7.5 | Do developers have access to production systems or production data? | ☐ Yes ☐ No — If Yes, explain controls: |
| 7.6 | Do you use code repositories with access controls and audit logging? (e.g., GitHub Enterprise, GitLab, Bitbucket) | ☐ Yes ☐ No — Platform: |
| 7.7 | Is code escrow available for critical systems? | ☐ Yes ☐ No |
| 7.8 | How do you handle secrets management? (API keys, passwords in code) | ☐ Vault (HashiCorp) ☐ Cloud KMS ☐ .env files ☐ Other: ___ |

---

## Section 8: Compliance & Privacy

| # | Question | Response |
|---|----------|----------|
| 8.1 | Do you have a GDPR compliance program? | ☐ Yes ☐ No ☐ N/A |
| 8.2 | Do you have a CCPA/CPRA compliance program? | ☐ Yes ☐ No ☐ N/A |
| 8.3 | Will you sign our Data Processing Agreement (DPA) without material modification? | ☐ Yes ☐ No |
| 8.4 | Do you agree to annual audit rights (on-site or remote) by our company or our designated auditor? | ☐ Yes ☐ No |
| 8.5 | How do you handle Data Subject Access Requests (DSARs) from our customers/employees? | |
| 8.6 | Do you maintain a Record of Processing Activities (GDPR Article 30) or equivalent data inventory? | ☐ Yes ☐ No |
| 8.7 | Have you appointed an EU Representative (if applicable under GDPR Art. 27)? | ☐ Yes ☐ No ☐ N/A |

---

## Section 9: Manufacturing-Specific (Where Applicable)

| # | Question | Response |
|---|----------|----------|
| 9.1 | Do you have experience with Operational Technology (OT) or IoT systems? | ☐ Yes ☐ No |
| 9.2 | If Yes: Are you familiar with IEC 62443 (Industrial Control Systems Security)? | ☐ Yes ☐ No |
| 9.3 | Do any of your solutions integrate with manufacturing systems (MES, SCADA, PLC)? | ☐ Yes ☐ No |
| 9.4 | How do you ensure OT network safety during security testing or changes? | |
| 9.5 | Provide 2–3 references from manufacturing clients (company name, contact, engagement scope) | |

---

## Section 10: Declaration & Signature

I certify that the information provided in this questionnaire is accurate and complete to the best of my knowledge. I understand that any material misrepresentation may result in termination of our business relationship.

| Field | Detail |
|-------|--------|
| **Vendor Company Name** | |
| **Signed By (Name & Title)** | |
| **Signature** | |
| **Date** | |

---

## Assessment Team Use Only

| Field | Detail |
|-------|--------|
| **Reviewed By** (TPRM Team) | |
| **Review Date** | |
| **Risk Score** | / 100 |
| **Risk Tier** | ☐ Tier 1 (High) ☐ Tier 2 (Medium) ☐ Tier 3 (Low) |
| **Assessment Result** | ☐ Approved ☐ Approved with Conditions ☐ Rejected |
| **Conditions** (if applicable) | |
| **Next Review Date** | |
