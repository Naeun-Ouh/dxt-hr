# Initial Data Model

This is a logical model, not a final physical schema.

## Identity / Organization

### employee
- id
- name
- english_name?
- company_email
- phone?
- birth_date
- gender?
- profile_image_url?
- department_id
- title
- hire_date
- employment_status: ACTIVE | INACTIVE
- work_location?
- created_at
- updated_at

### employee_role
- employee_id
- role

### organization
- id
- name
- parent_id?
- type?

### employee_private_hr
Restricted by PRIVATE_HR_ACCESS.
- employee_id
- resident_registration_number_encrypted
- address_encrypted
- bank_name
- bank_account_encrypted
- salary_encrypted
- emergency_contact_encrypted

## Project / Career

### project
- id
- customer_name
- name
- start_date
- current_end_date
- pm_employee_id?
- work_location?
- status

### project_extension
- id
- project_id
- previous_end_date
- new_end_date
- reason?
- created_at
- created_by

### project_assignment
- id
- project_id
- employee_id
- start_date
- end_date?
- role
- status

### career
- id
- employee_id
- project_id?
- job_function
- role
- responsibilities
- start_date?
- end_date?
- created_at
- updated_at

### career_skill
- career_id
- skill

## Leave

### leave_policy
For v1 policy constants/configuration where needed.

### leave_grant
- id
- employee_id
- leave_type
- days
- granted_at
- valid_until?
- source

### leave_request
- id
- employee_id
- leave_type
- start_date
- end_date
- half_day_type?
- requested_days
- reason?
- late_request_reason?
- exception_reason?
- status: PENDING | APPROVED | REJECTED | CANCELLED
- approver_id?
- approved_at?
- rejected_at?
- created_at

### leave_ledger
Authoritative transaction ledger.
- id
- employee_id
- leave_bucket
- transaction_type
- days_delta
- reference_type?
- reference_id?
- reason?
- occurred_at

### holiday_calendar
- id
- date
- name
- type: STATUTORY | SUBSTITUTE | COMPANY
- source

### weekend_work
- id
- employee_id
- work_date
- start_time
- end_time
- project_id?
- reason
- approved_by?
- status
- substitute_days_generated

## Expense

### expense
- id
- employee_id
- usage_month
- submitted_at?
- status
- late_reason?
- locked_at?

### expense_item
- id
- expense_id
- usage_date
- type
- merchant
- amount
- project_id?
- trip_context?
- payment_method
- receipt_attachment_id?
- notes?

### expense_attendee
- expense_item_id
- employee_id

### expense_attachment
- id
- storage_path
- mime_type
- original_name

### expense_validation
- id
- expense_item_id?
- row_number?
- severity: ERROR | WARNING
- code
- message

## Asset / Secret Management

### asset
- id
- type
- manufacturer?
- model
- serial_number
- status

### asset_assignment
- id
- asset_id
- employee_id
- assigned_at
- returned_at?

### windows_license
- id
- edition
- device_asset_id?
- product_key_encrypted
- assigned_employee_id?

### service_account
- id
- service_name
- login_id
- url?
- password_encrypted
- memo?
- visibility_policy?

## HR Operations

### onboarding
- id
- employee_id
- started_at
- completed_at?

### onboarding_task
- id
- onboarding_id
- type
- status
- memo?

### onboarding_task_owner
- onboarding_task_id
- employee_id

### offboarding
- id
- employee_id
- resignation_date
- resignation_letter_attachment_id?
- resignation_reason_encrypted?
- unused_leave_checked
- completed_at?

## Company / Messaging

### announcement
- id
- title
- body
- author_id
- published_at

### family_event
- id
- employee_id
- category
- event_date
- title
- body
- created_at

### birthday_email_template
- id
- year
- subject_template
- body_template
- updated_by
- updated_at

### audit_log
Use for sensitive/admin writes.
- id
- actor_id
- action
- entity_type
- entity_id
- metadata_json
- occurred_at
