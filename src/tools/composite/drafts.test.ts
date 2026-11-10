import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountConfig } from '../helpers/config.js'

vi.mock('../helpers/imap-client.js', () => ({
  readEmail: vi.fn(),
  saveDraft: vi.fn()
}))

import { readEmail, saveDraft } from '../helpers/imap-client.js'
import { draft } from './drafts.js'

const mockRead = vi.mocked(readEmail)
const mockSave = vi.mocked(saveDraft)

const accounts: AccountConfig[] = [
  {
    id: 'me_icloud_com',
    email: 'me@icloud.com',
    password: 'p',
    imap: { host: 'imap.mail.me.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.me.com', port: 587, secure: false }
  }
]

const original = {
  uid: 42,
  folder: 'INBOX',
  message_id: '<orig@example.com>',
  references: '<root@example.com> <orig@example.com>',
  subject: 'Plans',
  from: 'friend@example.com',
  body_text: 'See you Friday?'
} as any

beforeEach(() => {
  vi.clearAllMocks()
  mockSave.mockResolvedValue({ drafts_folder: 'Drafts' })
  mockRead.mockResolvedValue(original)
})

function savedRaw(): string {
  const call = mockSave.mock.calls.at(-1)
  if (!call) throw new Error('saveDraft was not called')
  return (call[1] as Buffer).toString()
}

describe('draft tools never send', () => {
  it('draft_email saves to Drafts and reports sent: false', async () => {
    const result = await draft(accounts, {
      action: 'new',
      account: 'me@icloud.com',
      to: 'a@example.com',
      subject: 'Hello',
      body: 'Hi'
    })
    expect(mockSave).toHaveBeenCalledWith(accounts[0], expect.any(Buffer))
    expect(savedRaw()).toContain('Subject: Hello')
    expect(result).toMatchObject({ action: 'draft_email', sent: false, drafts_folder: 'Drafts' })
    expect(result.note).toContain('NOTHING WAS SENT')
  })

  it('draft_reply threads to the original and defaults to its sender', async () => {
    const result = await draft(accounts, { action: 'reply', account: 'me@icloud.com', uid: 42, body: 'Yes!' })
    expect(mockRead).toHaveBeenCalledWith(accounts[0], 42, 'INBOX')
    const raw = savedRaw()
    expect(raw).toContain('To: friend@example.com')
    expect(raw).toContain('In-Reply-To: <orig@example.com>')
    expect(raw).toContain('Subject: Re: Plans')
    expect(result).toMatchObject({ action: 'draft_reply', sent: false, to: 'friend@example.com' })
  })

  it('draft_forward includes the original body', async () => {
    const result = await draft(accounts, {
      action: 'forward',
      account: 'me@icloud.com',
      uid: 42,
      to: 'b@example.com',
      body: 'FYI'
    })
    expect(savedRaw()).toContain('See you Friday?')
    expect(result).toMatchObject({ action: 'draft_forward', sent: false, subject: 'Fwd: Plans' })
  })

  it.each([
    [{ action: 'new', account: 'me@icloud.com', subject: 's', body: 'b' }, 'to is required'],
    [{ action: 'new', account: 'me@icloud.com', to: 'a@e.com', body: 'b' }, 'subject is required'],
    [{ action: 'reply', account: 'me@icloud.com', body: 'b' }, 'uid is required'],
    [{ action: 'forward', account: 'me@icloud.com', uid: 1, body: 'b' }, 'to is required'],
    [{ action: 'new', to: 'a@e.com', subject: 's', body: 'b' }, 'account is required'],
    [{ action: 'new', account: 'me@icloud.com', to: 'a@e.com', subject: 's' }, 'body is required']
  ])('validates input %#', async (input, message) => {
    await expect(draft(accounts, input as any)).rejects.toThrow(message)
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('surfaces a failed save instead of claiming success', async () => {
    mockSave.mockRejectedValue(new Error('Could not find a Drafts folder for this account'))
    await expect(
      draft(accounts, { action: 'new', account: 'me@icloud.com', to: 'a@e.com', subject: 's', body: 'b' })
    ).rejects.toThrow(/Drafts folder/)
  })
})
