# Changes in this fork (home-mcp)

This is a modified copy of [n24q02m/better-email-mcp](https://github.com/n24q02m/better-email-mcp) (Apache License 2.0), forked at upstream commit `36ad214` (v1.42.0). The `main` branch tracks upstream unchanged. The changes below are on the `home-mcp` branch.

Purpose: run as a single-user server for one iCloud mailbox behind Claude, where every action that sends or removes mail is its own tool, so the MCP client can require approval for each one.

## Changes

1. **Sending is split into three tools.** `send_email`, `reply_email` and `forward_email` replace the `new`, `reply` and `forward` actions of `messages`. Each tool fixes its own action, so arguments cannot turn one into another. All three are annotated `destructiveHint: true`.
2. **No permanent delete.** The `trash` action (which called IMAP `messageDelete`, deleting mail permanently) is removed. A new `move_to_deleted` tool moves mail to the folder flagged `\Trash` (iCloud: "Deleted Messages"), or a well-known name. If none is found it changes nothing and returns an error. It never expunges.
3. **`move` cannot target Deleted/Trash.** A plain `move` into the Deleted/Trash folder is refused (checked by name and by the `\Trash` flag), so removal always goes through `move_to_deleted`. If the folder list can't be read, the move is refused.
4. **`config setup_reset` removed.** It could clear the running server's credentials from a tool call. `config` is now read-only (status and cache actions only).
5. Help docs, tool descriptions and tests updated to match. `tests/fork-safety.test.ts` fails the build if `messageDelete`, `EXPUNGE` or a `resetState()` call reappears in the source.

Unchanged: reading, searching, flags, archive, folders, attachments, and the single-user HTTP mode with a bearer-token hash (`EMAIL_MCP_TOKEN_HASH`), which upstream already provides.

## Tool summary

| Tool | Purpose | Annotations |
| --- | --- | --- |
| `messages` | search, read, mark read/unread, flag/unflag, move, archive | not destructive |
| `send_email` | send a new email | destructive, open world |
| `reply_email` | reply to an email | destructive, open world |
| `forward_email` | forward an email | destructive, open world |
| `move_to_deleted` | move to Deleted Messages (recoverable) | destructive |
| `folders`, `attachments`, `config`, `help` | as upstream (`config` without `setup_reset`) | read-only |

## Updating from upstream

1. Update `main` from upstream (GitHub "Sync fork").
2. Merge or rebase `main` into `home-mcp`, then read the upstream diff in full.
3. Run `bun run build && bun run test`. The fork safety tests must pass.
