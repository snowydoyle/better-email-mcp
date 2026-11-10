# Draft Tools - Full Documentation

## Overview

This server cannot send email. Three tools prepare email and save it to the account's **Drafts** folder:

- `draft_email` - write a new email
- `draft_reply` - write a reply to an existing email (by UID)
- `draft_forward` - write a forward of an existing email (by UID)

The user reviews the draft and presses Send in their own mail app (Mail on iPhone, iPad or Mac, or iCloud.com). Always tell the user the draft is waiting in Drafts and has **not** been sent.

## Important

- Bodies support plain text or HTML; do not mix both. Basic markdown (headings, lists, bold) is rendered.
- **draft_reply** reads the original email to set In-Reply-To and References headers, so the reply threads correctly when sent. It defaults the recipient to the original sender and prefixes the subject with `Re:` when needed.
- **draft_forward** includes the original email body with a separator and prefixes the subject with `Fwd:` when needed.
- Cc and Bcc are kept in the draft.
- Attachments use base64 content, max 10 files and 25MB decoded total.
- If no Drafts folder is found, nothing is saved and an error is returned.

## Examples

### draft_email
```json
{"account": "user@icloud.com", "to": "recipient@example.com", "subject": "Hello", "body": "Hi there!"}
```

### draft_reply
```json
{"account": "user@icloud.com", "uid": 12345, "body": "Thanks!"}
```

### draft_forward
```json
{"account": "user@icloud.com", "uid": 12345, "to": "colleague@example.com", "body": "FYI, see below."}
```

## Response

Each tool returns `sent: false`, the `drafts_folder` it saved to, and a `note` saying nothing was sent.
