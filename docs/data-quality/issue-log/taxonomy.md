# Data Quality Taxonomy

## Data Quality Dimensions
Match `dq_dimension` to the most appropriate descriptor; pick only one primary dimension per issue:
- **Completeness**: Missing rows or columns, nulls in required fields.
- **Accuracy**: Incorrect values that do not match reality.
- **Consistency**: Conflicting values between systems or reports.
- **Validity**: Values outside allowed formats, ranges, or enums.
- **Uniqueness**: Duplicate rows or surrogate keys that are not unique.
- **Integrity**: Broken joins, referential integrity, or relationship issues.

## Severity Rubric (S1–S4)
- **S1 (Critical)**: Downstream reporting or systems unusable; financial/regulatory risk.
- **S2 (High)**: Key dashboards or processes misstate data for most users; immediate attention needed.
- **S3 (Medium)**: Impacted personas have a work-around; metric drift is isolated.
- **S4 (Low)**: Cosmetic issues, documentation gaps, or non-blocking anomalies.

Map severity to High/Medium/Low if executive reporting prefers text.

## Root Cause Categories
- **Upstream source**: Partner data missing or malformed before ingestion.
- **Transformation bug**: ETL/SQL logic errors or regression in data pipelines.
- **Definition mismatch**: Different stakeholders use incompatible definitions.
- **Late data**: Expected feeds arrive late, causing incomplete snapshots.
- **Manual entry**: Human error on forms or spreadsheets.
- **Monitoring gap**: Maturity gaps that allow the issue to surface undetected.
- **Schema/constraint change**: System changes without aligning interfaces.

## Optional Flags
- **recurring_issue_flag** (`yes`/`no`): Set to `yes` if the incident represents a regression or repeat occurrence.
- **last_seen_date**: Teaches when the issue was last observed before resolution.
