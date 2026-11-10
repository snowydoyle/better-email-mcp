import { describe, expect, it } from 'vitest'
import type { AccountConfig } from './config.js'
// Real MailComposer: the raw MIME bytes here are what is saved to Drafts.
import { composeNewEmail } from './smtp-client.js'

const account: AccountConfig = {
  id: 'test_icloud_com',
  email: 'test@icloud.com',
  password: 'testpass',
  imap: { host: 'imap.mail.me.com', port: 993, secure: true },
  smtp: { host: 'smtp.mail.me.com', port: 587, secure: false }
}

describe('composeNewEmail attachments (real MIME)', () => {
  it('composes a message with one attachment', async () => {
    const contentBase64 = Buffer.from('PDF').toString('base64')
    const raw = (
      await composeNewEmail(account, {
        to: 'b@example.com',
        subject: 's',
        body: 't',
        attachments: [{ filename: 'report.pdf', content_base64: contentBase64, content_type: 'application/pdf' }]
      })
    ).toString()
    expect(raw).toContain('Content-Disposition: attachment; filename=report.pdf')
    expect(raw).toContain(contentBase64)
  })

  it('rejects attachments whose total decoded size exceeds 25MB', async () => {
    const big = Buffer.alloc(13 * 1024 * 1024).toString('base64')
    await expect(
      composeNewEmail(account, {
        to: 'b@example.com',
        subject: 's',
        body: 't',
        attachments: [
          { filename: 'a.bin', content_base64: big },
          { filename: 'b.bin', content_base64: big }
        ]
      })
    ).rejects.toThrow()
  })

  it('rejects more than 10 attachments', async () => {
    const one = Buffer.from('x').toString('base64')
    await expect(
      composeNewEmail(account, {
        to: 'b@example.com',
        subject: 's',
        body: 't',
        attachments: Array.from({ length: 11 }, (_, i) => ({ filename: `f${i}.txt`, content_base64: one }))
      })
    ).rejects.toThrow()
  })

  it('does not add an attachment part when none are provided', async () => {
    const raw = (await composeNewEmail(account, { to: 'b@example.com', subject: 's', body: 't' })).toString()
    expect(raw).not.toContain('Content-Disposition: attachment')
  })
})
