/**
 * Message composer (fork change, home-mcp)
 * Builds RFC2822 messages for the Drafts folder. This server has no SMTP sending.
 */

import { marked } from 'marked'
import type { AccountConfig } from './config.js'
import { EmailMCPError } from './errors.js'
import { EMAIL_SANITIZE_OPTIONS, sanitizeHtml } from './html-utils.js'

export interface EmailAttachment {
  filename: string
  content_base64: string
  content_type?: string
}

export interface SendEmailOptions {
  to: string
  subject: string
  body: string
  cc?: string
  bcc?: string
  in_reply_to?: string
  references?: string
  attachments?: EmailAttachment[]
}

const MAX_ATTACHMENT_COUNT = 10

// 25MB is the lowest common total-message-size limit shared by Gmail and Outlook.
const MAX_ATTACHMENT_TOTAL_BYTES = 25 * 1024 * 1024

/**
 * Validate attachment count and estimated total size before any payload is decoded.
 * Size is estimated from base64 length (length * 3/4) so an oversized request is
 * rejected without paying the cost of decoding every attachment first.
 */
function validateAttachments(attachments: EmailAttachment[] | undefined): void {
  if (!attachments || attachments.length === 0) return

  if (attachments.length > MAX_ATTACHMENT_COUNT) {
    throw new EmailMCPError(
      `Too many attachments: ${attachments.length} (max ${MAX_ATTACHMENT_COUNT})`,
      'VALIDATION_ERROR',
      `Send at most ${MAX_ATTACHMENT_COUNT} attachments per email`
    )
  }

  let estimatedBytes = 0
  for (let i = 0; i < attachments.length; i++) {
    estimatedBytes += (attachments[i]!.content_base64.length * 3) / 4
  }

  if (estimatedBytes > MAX_ATTACHMENT_TOTAL_BYTES) {
    throw new EmailMCPError(
      `Attachments too large: ~${(estimatedBytes / (1024 * 1024)).toFixed(1)}MB (max ${MAX_ATTACHMENT_TOTAL_BYTES / (1024 * 1024)}MB)`,
      'VALIDATION_ERROR',
      'Reduce attachment size or count'
    )
  }
}

/**
 * Map base64 attachment payloads to Nodemailer's native attachment format.
 * Returns undefined (rather than an empty array) when there are no attachments,
 * so callers can omit the `attachments` key from mailOptions entirely.
 */
function mapAttachments(
  attachments: EmailAttachment[] | undefined
): Array<{ filename: string; content: Buffer; contentType?: string }> | undefined {
  if (!attachments || attachments.length === 0) return undefined

  return attachments.map((attachment) => ({
    filename: attachment.filename,
    content: Buffer.from(attachment.content_base64, 'base64'),
    contentType: attachment.content_type
  }))
}

// ⚡ Bolt: Extract `marked` options into module-scoped constants.
// This prevents recreating configuration objects on every function call,
// significantly reducing allocation overhead during high-frequency email parsing.
const MARKED_OPTIONS: import('marked').MarkedOptions = { async: false, breaks: true }

/**
 * Convert markdown text to simple HTML for email.
 * Uses sanitize-html to sanitize the output HTML against XSS vectors like javascript: links.
 */
export function textToHtml(text: string): string {
  // marked.parse can return a Promise if async: true, but we use async: false
  const rawHtml = marked.parse(text, MARKED_OPTIONS) as string

  return sanitizeHtml(rawHtml, EMAIL_SANITIZE_OPTIONS)
}

/**
 * Build a raw RFC2822 message using Nodemailer's MailComposer.
 * Returns the exact bytes that can be sent via SMTP and/or appended to IMAP.
 */
async function buildRawMessage(
  mailOptions: {
    from: string
    to: string
    cc?: string
    bcc?: string
    subject: string
    text: string
    html: string
    inReplyTo?: string
    references?: string
    attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>
  },
  keepBcc = false
): Promise<Buffer> {
  // Dynamic import to avoid TypeScript issues with Nodemailer's internal module
  const { default: MailComposer } = await import('nodemailer/lib/mail-composer/index.js')
  const composer = new MailComposer(mailOptions)
  const node = composer.compile()
  // Drafts keep their Bcc header so it is still there when you send from Mail.
  if (keepBcc) (node as { keepBcc?: boolean }).keepBcc = true
  return node.build()
}

// ============================================================================
// Fork change (home-mcp): this server cannot send email. The SMTP transport
// and the send functions were removed. Messages are composed here and saved
// to the Drafts folder; the user sends them from their own mail app.
// ============================================================================

/** Compose a new email as raw RFC2822 bytes, without sending. */
export async function composeNewEmail(account: AccountConfig, options: SendEmailOptions): Promise<Buffer> {
  validateAttachments(options.attachments)
  const attachments = mapAttachments(options.attachments)
  return buildRawMessage(
    {
      from: account.email,
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      subject: options.subject,
      text: options.body,
      html: textToHtml(options.body),
      ...(attachments ? { attachments } : {})
    },
    true
  )
}

/** Compose a reply (with threading headers) as raw bytes, without sending. */
export async function composeReply(account: AccountConfig, options: SendEmailOptions): Promise<Buffer> {
  if (!options.in_reply_to) {
    throw new EmailMCPError(
      'in_reply_to is required for reply',
      'MISSING_PARAM',
      'Read the original email first to get its message_id'
    )
  }
  validateAttachments(options.attachments)
  const attachments = mapAttachments(options.attachments)
  const subject = options.subject.startsWith('Re:') ? options.subject : `Re: ${options.subject}`
  return buildRawMessage(
    {
      from: account.email,
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      subject,
      text: options.body,
      html: textToHtml(options.body),
      inReplyTo: options.in_reply_to,
      references: options.references || options.in_reply_to,
      ...(attachments ? { attachments } : {})
    },
    true
  )
}

/** Compose a forward (note above the original) as raw bytes, without sending. */
export async function composeForward(
  account: AccountConfig,
  options: SendEmailOptions & { original_body: string }
): Promise<Buffer> {
  validateAttachments(options.attachments)
  const attachments = mapAttachments(options.attachments)
  const subject = options.subject.startsWith('Fwd:') ? options.subject : `Fwd: ${options.subject}`
  const body = `${options.body}\n\n---------- Forwarded message ----------\n${options.original_body}`
  return buildRawMessage(
    {
      from: account.email,
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      subject,
      text: body,
      html: textToHtml(body),
      ...(attachments ? { attachments } : {})
    },
    true
  )
}
