import { simpleParser } from 'mailparser'
import { describe, expect, it } from 'vitest'
import type { AccountConfig } from './config.js'
import * as composer from './smtp-client.js'
import { composeForward, composeNewEmail, composeReply } from './smtp-client.js'

const account: AccountConfig = {
  id: 'me_icloud_com',
  email: 'me@icloud.com',
  password: 'app-password',
  imap: { host: 'imap.mail.me.com', port: 993, secure: true },
  smtp: { host: 'smtp.mail.me.com', port: 587, secure: false }
}

/** Unfold folded header lines so assertions can match whole headers. */
function headers(raw: Buffer): string {
  const text = raw.toString()
  return text.slice(0, text.indexOf('\r\n\r\n')).replace(/\r\n[ \t]+/g, ' ')
}

describe('composeNewEmail', () => {
  it('builds a message from the account with to, cc, bcc and subject', async () => {
    const raw = await composeNewEmail(account, {
      to: 'a@example.com',
      cc: 'c@example.com',
      bcc: 'hidden@example.com',
      subject: 'Hello',
      body: 'Hi there'
    })
    const h = headers(raw)
    expect(h).toContain('From: me@icloud.com')
    expect(h).toContain('To: a@example.com')
    expect(h).toContain('Cc: c@example.com')
    // Drafts keep Bcc so it is still set when the user presses Send.
    expect(h).toContain('Bcc: hidden@example.com')
    expect(h).toContain('Subject: Hello')
    expect(h).toMatch(/Message-ID: <.+>/i)
  })

  it('includes a sanitised HTML part (no script, no javascript: links)', async () => {
    const raw = await composeNewEmail(account, {
      to: 'a@example.com',
      subject: 's',
      body: '# Title\n\n**bold** and [x](javascript:alert(1))\n\n<script>alert(1)</script>'
    })
    const html = String((await simpleParser(raw)).html)
    expect(html).toContain('<strong>bold</strong>')
    expect(html).not.toContain('<script')
    expect(html).not.toMatch(/href=["']?javascript:/i)
  })
})

describe('composeReply', () => {
  it('sets threading headers and prefixes Re: once', async () => {
    const raw = await composeReply(account, {
      to: 'a@example.com',
      subject: 'Plans',
      body: 'Sounds good',
      in_reply_to: '<orig@example.com>',
      references: '<root@example.com> <orig@example.com>'
    })
    const h = headers(raw)
    expect(h).toContain('Subject: Re: Plans')
    expect(h).toContain('In-Reply-To: <orig@example.com>')
    expect(h).toContain('References: <root@example.com> <orig@example.com>')

    const again = headers(
      await composeReply(account, { to: 'a@example.com', subject: 'Re: Plans', body: 'x', in_reply_to: '<o@e>' })
    )
    expect(again).toContain('Subject: Re: Plans')
    expect(again).not.toContain('Re: Re:')
  })

  it('uses in_reply_to as references when none are given', async () => {
    const h = headers(await composeReply(account, { to: 'a@e.com', subject: 's', body: 'b', in_reply_to: '<o@e>' }))
    expect(h).toContain('References: <o@e>')
  })

  it('throws when in_reply_to is missing', async () => {
    await expect(composeReply(account, { to: 'a@e.com', subject: 's', body: 'b' })).rejects.toThrow('in_reply_to')
  })
})

describe('composeForward', () => {
  it('appends the original body and prefixes Fwd: once', async () => {
    const raw = await composeForward(account, {
      to: 'a@example.com',
      subject: 'Report',
      body: 'FYI',
      original_body: 'Original text here'
    })
    expect(headers(raw)).toContain('Subject: Fwd: Report')
    expect(raw.toString()).toContain('---------- Forwarded message ----------')
    expect(raw.toString()).toContain('Original text here')

    const again = headers(
      await composeForward(account, { to: 'a@e.com', subject: 'Fwd: Report', body: 'x', original_body: 'y' })
    )
    expect(again).not.toContain('Fwd: Fwd:')
  })
})

describe('no sending (home-mcp fork)', () => {
  it('exports no send function', () => {
    const names = Object.keys(composer)
    expect(names.filter((n) => /send|transport/i.test(n))).toEqual([])
  })
})
