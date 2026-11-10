/**
 * Draft tools (fork change, home-mcp)
 *
 * draft_email, draft_reply and draft_forward compose a message and save it to
 * the account's Drafts folder. They never send. The user reviews the draft and
 * presses Send in their own mail app, so nothing leaves the mailbox without a
 * person choosing to send it, whatever the MCP client's approval settings are.
 */

import type { AccountConfig } from '../helpers/config.js'
import { resolveSingleAccount } from '../helpers/config.js'
import { createUnknownActionError, EmailMCPError, withErrorHandling } from '../helpers/errors.js'
import { readEmail, saveDraft } from '../helpers/imap-client.js'
import type { EmailAttachment } from '../helpers/smtp-client.js'
import { composeForward, composeNewEmail, composeReply } from '../helpers/smtp-client.js'

export interface DraftInput {
  action: 'new' | 'reply' | 'forward'
  account: string
  body: string
  to?: string
  subject?: string
  cc?: string
  bcc?: string
  uid?: number
  folder?: string
  attachments?: EmailAttachment[]
}

const NOT_SENT =
  'Saved to Drafts only. NOTHING WAS SENT. Tell the user to open their mail app, check the draft and press Send.'

export async function draft(accounts: AccountConfig[], input: DraftInput): Promise<any> {
  return withErrorHandling(async () => {
    if (!input.account) {
      throw new EmailMCPError('account is required', 'VALIDATION_ERROR', 'Provide the sender account email address')
    }
    if (!input.body) {
      throw new EmailMCPError('body is required', 'VALIDATION_ERROR', 'Provide the email body text')
    }
    switch (input.action) {
      case 'new':
        return await draftNew(accounts, input)
      case 'reply':
        return await draftReply(accounts, input)
      case 'forward':
        return await draftForward(accounts, input)
      default:
        throw createUnknownActionError(input.action, 'new, reply, forward')
    }
  })()
}

async function draftNew(accounts: AccountConfig[], input: DraftInput): Promise<any> {
  if (!input.to) {
    throw new EmailMCPError('to is required', 'VALIDATION_ERROR', 'Provide the recipient email address')
  }
  if (!input.subject) {
    throw new EmailMCPError('subject is required', 'VALIDATION_ERROR', 'Provide the email subject')
  }
  const account = resolveSingleAccount(accounts, input.account)
  const raw = await composeNewEmail(account, {
    to: input.to,
    subject: input.subject,
    body: input.body,
    cc: input.cc,
    bcc: input.bcc,
    attachments: input.attachments
  })
  const saved = await saveDraft(account, raw)
  return {
    action: 'draft_email',
    sent: false,
    from: account.email,
    to: input.to,
    subject: input.subject,
    ...saved,
    note: NOT_SENT
  }
}

async function draftReply(accounts: AccountConfig[], input: DraftInput): Promise<any> {
  if (!input.uid) {
    throw new EmailMCPError('uid is required', 'VALIDATION_ERROR', 'Provide the UID of the email to reply to')
  }
  const account = resolveSingleAccount(accounts, input.account)
  const original = await readEmail(account, input.uid, input.folder || 'INBOX')
  const replyTo = input.to || original.from
  if (!replyTo) {
    throw new EmailMCPError(
      'Could not determine reply-to address',
      'VALIDATION_ERROR',
      'Provide the `to` field explicitly, or ensure the original email has a From address'
    )
  }
  const subject = input.subject || original.subject
  const raw = await composeReply(account, {
    to: replyTo,
    subject,
    body: input.body,
    cc: input.cc,
    bcc: input.bcc,
    in_reply_to: original.message_id,
    references: original.references || original.message_id,
    attachments: input.attachments
  })
  const saved = await saveDraft(account, raw)
  return {
    action: 'draft_reply',
    sent: false,
    from: account.email,
    to: replyTo,
    subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
    in_reply_to: original.message_id,
    ...saved,
    note: NOT_SENT
  }
}

async function draftForward(accounts: AccountConfig[], input: DraftInput): Promise<any> {
  if (!input.uid) {
    throw new EmailMCPError('uid is required', 'VALIDATION_ERROR', 'Provide the UID of the email to forward')
  }
  if (!input.to) {
    throw new EmailMCPError('to is required', 'VALIDATION_ERROR', 'Provide the recipient email address')
  }
  const account = resolveSingleAccount(accounts, input.account)
  const original = await readEmail(account, input.uid, input.folder || 'INBOX')
  const subject = input.subject || original.subject
  const raw = await composeForward(account, {
    to: input.to,
    subject,
    body: input.body,
    cc: input.cc,
    bcc: input.bcc,
    original_body: original.body_text,
    attachments: input.attachments
  })
  const saved = await saveDraft(account, raw)
  return {
    action: 'draft_forward',
    sent: false,
    from: account.email,
    to: input.to,
    subject: subject.startsWith('Fwd:') ? subject : `Fwd: ${subject}`,
    ...saved,
    note: NOT_SENT
  }
}
