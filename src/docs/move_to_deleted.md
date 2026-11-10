# move_to_deleted Tool - Full Documentation

## Overview

Moves emails to the account's Deleted Messages folder (iCloud) or Trash folder. The emails stay recoverable there until the provider empties that folder. This server has no permanent delete.

## Important

- The Deleted/Trash folder is found from the IMAP `\Trash` special-use flag, then by well-known names (Deleted Messages, Trash, Deleted Items, Bin).
- If no such folder is found, nothing is changed and an error is returned. The server never falls back to deleting.
- Emails already in the Deleted/Trash folder are left as they are.
- UIDs are per-account and per-folder: pass the `folder` the emails are in now.

## Examples

```json
{"account": "user@icloud.com", "uid": 123}
```
```json
{"account": "user@icloud.com", "uids": [123, 456], "folder": "Newsletters"}
```

## Parameters

- `account` - Account email (required)
- `uid` - Single email UID
- `uids` - Multiple email UIDs
- `folder` - Folder the emails are in now (default: INBOX)
