# Data Quality Issue Log

This folder captures the workflow for logging, triaging, resolving, and reporting data quality issues affecting ShelfSync. Keep the log in `data_quality_issue_log_template.csv` and update `data_quality_issue_log_example.csv` with representative cases before any reporting cycle.

## Purpose
- Track every known data problem from detection through verification so nothing slips between teams.
- Assign accountability and severity so stakeholders know what to expect and who is working the fix.
- Build a governance-friendly record for retrospective metrics (open count, remediation time, recurrence).

## What counts as a data-quality issue
- Missing/empty critical values or required records (completeness drift).
- Incorrect or stale values (accuracy/validity) such as invalid enums, timestamps, or financial amounts.
- Duplicate records or broken relationships (uniqueness/integrity/consistency).
- Conflicting definitions (different stakeholders rely on different meanings for the same field).
- Any recurring alert, stakeholder report, or regression flagged by monitoring that blocks delivery expectations.

Refer to `taxonomy.md` for consistent dimension and root cause naming.

## How to add a new issue
1. Copy the header row from `data_quality_issue_log_template.csv` into a new row and populate every required column.
2. Provide clear evidence (`evidence_link_or_query`) such as SQL, dashboards, or stakeholder tickets.
3. Set initial `status` to `New`, assign `severity` (based on impact), and nominate a single `owner`.
4. Fill `reported_date` and pick a realistic `target_fix_date`; leave `resolved_date` blank until closure.

## Triage rules
- Use the severity rubric in `taxonomy.md` to distinguish S1 (system down, data loss) through S4 (low-impact documentation gaps).
- Before moving a row from `New` to `Triaged`, ensure `owner`, `severity`, `business_impact`, and `detection_method` are populated.
- Ownership means the owner either resolves the issue or coordinates the fix with a delivery team; updates on `status` and `root_cause_category` should accompany work.

## Lifecycle
New → Triaged → In Progress → Fixed → Verified → Closed
- `In Progress`: Engineering fix is underway.
- `Fixed`: Fix applied (code change, backfill, etc.) and recorded in `fix_reference`.
- `Verified`: Re-run the detection query or confirm with the reporting stakeholder; document the steps in `verification_steps`.
- `Closed`: Stakeholders sign off and preventive controls are enacted.

## Root cause + prevention
- Use the root cause categories from `taxonomy.md` (upstream source, transformation bug, definition mismatch, late delivery, manual entry, etc.).
- Every recurring issue must include a `preventive_control` (monitoring alert, constraint, additional test, updated definition, etc.).
- If the issue is traced to an upstream partner, note the escalation path and adjust `preventive_control` accordingly.

## Reporting
- Share a weekly summary with:
  - Open issues by severity and dimension.
  - Time-to-triage (from `reported_date` to `Triaged`).
  - Time-to-close for resolved issues.
  - Top recurring `dq_dimension` and `root_cause_category` pairs.
- Include charts or pivot tables that highlight blockers for the next release.

## Nice-to-have additions
1. Host the same log as a Google Sheet and link to it here once available so teammates can contribute without cloning the repo.
2. Add optional columns such as `recurring_issue_flag` and `last_seen_date` when regression tracking is needed for stakeholder communication.
3. Consider a dashboard tab (pivot tables, filters) on the sheet that surfaces open issues by severity/dimension for quick triage.
