# Messages Tool - Full Documentation

## Overview
Email messages: search, read, mark_read, mark_unread, flag, unflag, move, archive.

This tool never sends or deletes. This server cannot send email at all: `draft_email`, `draft_reply` and `draft_forward` save drafts for the user to send. Moving to Deleted Messages / Trash uses `move_to_deleted`. Permanent deletion is not available.

## Important
- **read** returns the full clean plain-text body by default (HTML stripped for LLM token savings)
- Set `preview: true` for a bounded body preview. Preview responses include `body_truncated`, `body_char_count`, and `body_limit`; `max_chars` defaults to 4000 and is capped at 100000.
- **UIDs are per-account and per-folder** - always specify account for modify operations
- Query language supports compound filters: `UNREAD SINCE 2024-01-01`
- **move** refuses the Deleted Messages / Trash folder; use `move_to_deleted`

## Actions

### search
Search emails across all or filtered accounts.
```json
{"action": "search", "query": "UNREAD", "folder": "INBOX", "limit": 20}
```
```json
{"action": "search", "query": "UNREAD SINCE 2024-06-01", "account": "user@gmail.com"}
```
```json
{"action": "search", "query": "FROM boss@company.com", "limit": 5}
```

Query shortcuts:
- `UNREAD` / `UNSEEN` - unread emails
- `READ` / `SEEN` - read emails
- `FLAGGED` / `STARRED` - flagged emails
- `ALL` / `*` - all emails
- `SINCE YYYY-MM-DD` - emails after date
- `FROM email` - emails from sender
- `SUBJECT text` - emails matching subject
- `UNREAD SINCE YYYY-MM-DD` - compound filter
- `UNREAD FROM email` - compound filter
- Any other text is treated as subject search

### read
Read a single email by UID. Omit `preview` for the full clean body, or set `preview: true` for a bounded response.
```json
{"action": "read", "account": "user@gmail.com", "uid": 12345, "folder": "INBOX"}
```
```json
{"action": "read", "account": "user@gmail.com", "uid": 12345, "preview": true, "max_chars": 4000}
```
Preview responses retain the message metadata and return:
- `body_truncated` - whether the body was shortened
- `body_char_count` - full body length in characters
- `body_limit` - applied preview limit

### mark_read
```json
{"action": "mark_read", "account": "user@gmail.com", "uids": [123, 456, 789]}
```

### mark_unread
```json
{"action": "mark_unread", "account": "user@gmail.com", "uid": 123}
```

### flag
Star/flag emails.
```json
{"action": "flag", "account": "user@gmail.com", "uids": [123, 456]}
```

### unflag
Remove star/flag from emails.
```json
{"action": "unflag", "account": "user@gmail.com", "uid": 123}
```

### move
Move emails to another folder.
```json
{"action": "move", "account": "user@gmail.com", "uids": [123], "destination": "[Gmail]/Important"}
```

### archive
Archive emails (auto-detects archive folder per provider).
```json
{"action": "archive", "account": "user@gmail.com", "uids": [123, 456]}
```

## Parameters

- `action` - Action to perform (required)
- `account` - Account email filter (optional for search, required for modify)
- `query` - Search query string (default: UNSEEN)
- `folder` - Mailbox folder (default: INBOX)
- `limit` - Max search results (default: 20)
- `uid` - Single email UID
- `preview` - Return a bounded body preview for read (default: false)
- `max_chars` - Preview body limit, integer 1-100000 (default: 4000 when preview is true)
- `uids` - Multiple email UIDs for batch operations
- `destination` - Target folder for move action (not Deleted Messages / Trash)
