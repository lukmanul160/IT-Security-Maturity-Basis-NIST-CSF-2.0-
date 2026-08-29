# Vendor Risk Tiering Matrix

> **Purpose**: Classify all vendors by inherent risk to determine due diligence depth, monitoring frequency, and contract requirements.  
> **Used By**: TPRM Committee for vendor onboarding decisions and annual re-tiering.

---

## 1. Tier Definitions

| Tier | Risk Level | Definition | Typical Profile |
|------|-----------|------------|-----------------|
| **Tier 1** | High | Vendor processes sensitive PII, has administrative access to critical systems, or integrates with OT/IoT networks. A breach at this vendor could cause material harm. | Custom software developers (ERP/MES), cloud infrastructure (AWS/Azure), payroll processors, OT integrators |
| **Tier 2** | Medium | Vendor processes limited PII or has restricted system access. Breach impact is moderate. | SaaS CRM, logistics partners, IT support vendors, analytics platforms |
| **Tier 3** | Low | Vendor has no PII access or processes only anonymized/aggregated data. Breach impact is minimal. | Office supplies, training content providers, non-PII consultants |

---

## 2. Risk Scoring Model (0–100)

| Dimension | Weight | Score 1 (Poor) | Score 3 (Adequate) | Score 5 (Excellent) |
|-----------|--------|---------------|-------------------|---------------------|
| **PII Exposure** | 40% | Processes sensitive PII at scale with admin access | Processes limited PII with restricted access | No PII access or anonymized only |
| **Security Maturity** | 30% | No certifications; no documented security program | SOC 2 Type II or ISO 27001; basic security controls | Multiple certifications; mature security program with continuous improvement |
| **Financial Stability** | 10% | Startup; no insurance; unclear financials | Established company; insurance but <$5M | Enterprise-grade; >$5M cyber insurance; public/audited financials |
| **Reputation & References** | 20% | History of breaches; no manufacturing references; legal actions | Clean breach history (<3 years); relevant industry references | Excellent reputation; glowing manufacturing references; industry thought leader |

**Final Score = Σ (Dimension_Score × Weight)**

---

## 3. Tier Assignment Rules

| Score Range | Tier | Required Approvals |
|-------------|------|-------------------|
| 0–40 | **Tier 1 (High)** | CISO + Privacy Officer + Legal |
| 41–70 | **Tier 2 (Medium)** | CISO or delegate + Business Owner |
| 71–100 | **Tier 3 (Low)** | Business Owner |

**Override Rules**: A vendor may be elevated to a higher tier if:
- They have access to OT/IoT systems regardless of PII (add +15 penalty to PII Exposure score)
- They are offshore and in a jurisdiction with weaker data protection laws (add +10 penalty)
- They are the sole source for a critical business function (concentration risk — flag, but do not change tier automatically)
- They have experienced a breach involving PII in the last 24 months (automatic Tier 1)

---

## 4. Due Diligence Requirements by Tier

| Requirement | Tier 1 | Tier 2 | Tier 3 |
|------------|:---:|:---:|:---:|
| Due Diligence Questionnaire (full) | ✅ Required | ✅ Required | ❌ Not required |
| Technical Assessment (code review, pen test review) | ✅ Required | ⚠️ If PII involved | ❌ |
| Reference Checks (≥3) | ✅ Required | ✅ ≥2 required | ❌ |
| On-Site Visit (or virtual walkthrough) | ✅ Required (annual) | ⚠️ Optional | ❌ |
| Financial Review | ✅ Required | ⚠️ If financially material | ❌ |
| Background Check (key personnel) | ✅ Required (for dev partners) | ❌ | ❌ |
| CISO Approval | ✅ Required | ⚠️ May delegate | ❌ |

---

## 5. Monitoring Frequency by Tier

| Activity | Tier 1 | Tier 2 | Tier 3 |
|----------|:---:|:---:|:---:|
| Security Questionnaire Refresh | Quarterly | Biannual | Annual |
| Evidence Request (audit reports, pen tests) | Annual | Annual | Biannual (or none) |
| Audit (on-site or remote) | Annual (on-site preferred) | Annual (remote) | Triennial (or trigger-based) |
| Performance Review (SLA/KPI) | Quarterly | Biannual | Annual |
| Continuous Security Monitoring | Yes | Yes | Optional |
| Vendor Risk Committee Review | Quarterly | Biannual | Annual |

---

## 6. Contractual Requirements by Tier

| Requirement | Tier 1 | Tier 2 | Tier 3 |
|------------|:---:|:---:|:---:|
| Data Processing Agreement (DPA) | ✅ Mandatory | ✅ If PII | ❌ (unless PII) |
| Audit Rights (annual + for-cause) | ✅ Mandatory | ✅ Mandatory | ❌ |
| Breach Notification ≤ 48 hours | ✅ Mandatory | ✅ ≤ 72 hours | ⚠️ If PII |
| Sub-Processor Approval (prior written) | ✅ Mandatory | ✅ Mandatory | ❌ |
| Cyber Insurance ≥ $5M | ✅ Mandatory | ⚠️ ≥ $2M | ❌ |
| Data Deletion Certificate (on termination) | ✅ Mandatory | ✅ Mandatory | ⚠️ If PII |
| Code Escrow (for critical software) | ✅ Mandatory | ⚠️ Optional | ❌ |
| Right to Terminate for Breach | ✅ Mandatory | ✅ Mandatory | ❌ |

---

## 7. Re-Tiering Triggers

Vendor tier must be reassessed when:

| Trigger | Action |
|---------|--------|
| Annual re-assessment | Scheduled review of all Tier 1 and Tier 2 vendors |
| Change in data processing scope (e.g., vendor now accesses new PII category) | Immediate re-tiering |
| Vendor security incident involving PII | Automatic Tier 1 for 24 months post-incident |
| Vendor acquisition or merger | Re-assessment within 60 days |
| New regulatory requirement (e.g., CPRA amendment) | Re-assessment of affected vendors within 90 days |
| Significant performance deterioration (3 consecutive quarters below KPI) | Re-assessment and potential re-tiering |

---

## 8. Manufacturing-Specific Tier Considerations

| Scenario | Tier Impact |
|----------|-------------|
| Vendor develops code for OT/IoT systems | Automatic +15 penalty → likely Tier 1 |
| Vendor has remote access to factory network | Automatic +15 penalty → likely Tier 1 |
| Vendor processes employee biometric data | Automatic +15 penalty → likely Tier 1 |
| Vendor is a logistics partner with only shipping addresses | Typically Tier 2 (limited PII) |
| Vendor provides only aggregated/anonymized production analytics | Typically Tier 2–3 |

---

## 9. Vendor Tiering Register (Template)

| Vendor ID | Vendor Name | Service | PII Exposure (1-5) | Security Maturity (1-5) | Financial (1-5) | Reputation (1-5) | Total Score | Tier | Last Assessed | Next Assessment |
|-----------|-------------|---------|-------------------|------------------------|-----------------|-------------------|-------------|------|---------------|-----------------|
| V-001 | [Name] | ERP Custom Dev | 2 | 4 | 4 | 4 | 3.4×40 + 4×30 + 4×10 + 4×20 = 316 | **Tier 1** | [Date] | [Date] |
| V-002 | [Name] | Cloud Hosting | 3 | 5 | 5 | 5 | 3.4×40 + 5×30 + 5×10 + 5×20 = 436 | **Tier 2** | [Date] | [Date] |
| V-003 | [Name] | Office Supplies | 5 | 3 | 3 | 3 | 3.4×40 + 3×30 + 3×10 + 3×20 = 316 | **Tier 3** | [Date] | [Date] |

*Note: PII Exposure uses an inverted scale in the scoring model. Higher score = lower risk. Score 5 = No PII access.*

---

## 10. Quick Reference — Score Calculation

| Dimension | Weight | Formula |
|-----------|--------|---------|
| PII Exposure | 40% | Score × 40 (Inverted: 5=No exposure, 1=Full sensitive PII admin access) |
| Security Maturity | 30% | Score × 30 |
| Financial Stability | 10% | Score × 10 |
| Reputation | 20% | Score × 20 |
| **Maximum Possible** | | **500** (all 5s) |

> **Total Score** = Σ(Dimension Score × Weight). Tier 1 ≤ 200, Tier 2 201–350, Tier 3 351–500.
