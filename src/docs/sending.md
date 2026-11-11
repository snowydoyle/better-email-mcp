# Sending Tools - Full Documentation

## Overview

Three separate tools send email, so each can require approval in the MCP client:

- `send_email` - send a new email
- `reply_email` - reply to an existing email (by UID)
- `forward_email` - forward an existing email (by UID)

Every call sends immediately and cannot be unsent.

## Important

- Outbound bodies support plain text or HTML; do not mix both. Basic markdown (headings, lists, bold) is rendered.
- **reply_email** reads the original email to set In-Reply-To and References headers for threading, and auto-derives the recipient when `to` is omitted. The subject is prefixed with `Re:` when needed.
- **forward_email** includes the original email body with a separator. The subject is prefixed with `Fwd:` when needed.
- Attachments use base64 content, max 10 files and 25MB decoded total.

## Examples

### send_email
```json
{"account": "user@icloud.com", "to": "recipient@example.com", "subject": "Hello", "body": "Hi there!"}
```
```json
{"account": "user@icloud.com", "to": "a@example.com", "subject": "Update", "body": "See details.", "cc": "b@example.com", "bcc": "c@example.com"}
```

### reply_email
```json
{"account": "user@icloud.com", "uid": 12345, "body": "Thanks!"}
```

### forward_email
```json
{"account": "user@icloud.com", "uid": 12345, "to": "colleague@example.com", "body": "FYI, see below."}
```

## Response and provider behaviour

- `saved_to_sent` reports whether the sent message was saved to the Sent folder via IMAP APPEND.
- Gmail and Yahoo auto-save sent messages, so IMAP APPEND is skipped. iCloud does not, so it is appended like any other provider.
- Outlook, Zoho, Fastmail, and other providers use best-effort IMAP APPEND.
