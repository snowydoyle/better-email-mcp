# Changes in this fork (home-mcp)

This is a modified copy of [n24q02m/better-email-mcp](https://github.com/n24q02m/better-email-mcp) (Apache License 2.0), forked at upstream commit `36ad214` (v1.42.0). The `main` branch tracks upstream unchanged. The changes below are on the `home-mcp` branch.

Purpose: run as a single-user server for one iCloud mailbox behind Claude. **This server cannot send email.** It writes drafts; a person presses Send in their own mail app. Removing mail is a separate, recoverable tool.

Why drafts: the first version split sending into separate tools so Claude's per-tool "Needs approval" setting could gate them. In testing (10 Nov 2026) Claude sent through those tools without asking, on iPhone and on the web, even with the setting on. So the lock now lives in the server, where no client setting can bypass it.

## Changes

1. **No sending; drafts instead.** The `new`, `reply` and `forward` actions of `messages` are replaced by `draft_email`, `draft_reply` and `draft_forward`, which compose the message (threading headers, Cc and Bcc kept) and save it to the folder flagged `\Drafts` with the `\Draft` flag. The SMTP transport and every send function were deleted (`src/tools/composite/send.ts` removed; `smtp-client.ts` now only composes). Each draft tool fixes its own action, so arguments cannot turn one into another.
2. **No permanent delete.** The `trash` action (which called IMAP `messageDelete`, deleting mail permanently) is removed. A new `move_to_deleted` tool moves mail to the folder flagged `\Trash` (iCloud: "Deleted Messages"), or a well-known name. If none is found it changes nothing and returns an error. It never expunges.
3. **`move` cannot target Deleted/Trash.** A plain `move` into the Deleted/Trash folder is refused (checked by name and by the `\Trash` flag), so removal always goes through `move_to_deleted`. If the folder list can't be read, the move is refused.
4. **`config setup_reset` removed.** It could clear the running server's credentials from a tool call. `config` is now read-only (status and cache actions only).
5. Help docs, tool descriptions and tests updated to match. `tests/fork-safety.test.ts` fails the build if `messageDelete`, `EXPUNGE`, an SMTP transport (`createTransport`, `sendMail`, a `nodemailer` import other than the composer) or a `resetState()` call reappears in the source.

Unchanged: reading, searching, flags, archive, folders, attachments, and the single-user HTTP mode with a bearer-token hash (`EMAIL_MCP_TOKEN_HASH`), which upstream already provides.

## Tool summary

| Tool | Purpose | Annotations |
| --- | --- | --- |
| `messages` | search, read, mark read/unread, flag/unflag, move, archive | not destructive |
| `draft_email` | save a new email to Drafts | not destructive, does not send |
| `draft_reply` | save a reply to Drafts | not destructive, does not send |
| `draft_forward` | save a forward to Drafts | not destructive, does not send |
| `move_to_deleted` | move to Deleted Messages (recoverable) | destructive |
| `folders`, `attachments`, `config`, `help` | as upstream (`config` without `setup_reset`) | read-only |

## Updating from upstream

1. Update `main` from upstream (GitHub "Sync fork").
2. Merge or rebase `main` into `home-mcp`, then read the upstream diff in full.
3. Run `bun run build && bun run test`. The fork safety tests must pass. Upstream changes to sending code must not be merged back in.
