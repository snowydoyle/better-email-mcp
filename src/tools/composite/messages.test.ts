import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountConfig } from '../helpers/config.js'

// --- Mocks ---
vi.mock('../helpers/imap-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../helpers/imap-client.js')>()
  return {
    searchEmails: vi.fn(),
    readEmail: vi.fn(),
    modifyFlags: vi.fn(),
    moveEmails: vi.fn(),
    moveToDeleted: vi.fn(),
    listFolders: vi.fn(),
    // Pure folder classifiers stay real so the guard is tested for real.
    isTrashFolder: actual.isTrashFolder,
    isTrashFolderName: actual.isTrashFolderName
  }
})

vi.mock('./send.js', () => ({
  send: vi.fn()
}))

import { listFolders, modifyFlags, moveEmails, moveToDeleted, readEmail, searchEmails } from '../helpers/imap-client.js'
import { clearArchiveFolderCache, messages, moveToDeletedTool } from './messages.js'
import { send } from './send.js'

const mockSearchEmails = vi.mocked(searchEmails)
const mockReadEmail = vi.mocked(readEmail)
const mockModifyFlags = vi.mocked(modifyFlags)
const mockMoveEmails = vi.mocked(moveEmails)
const mockMoveToDeleted = vi.mocked(moveToDeleted)
const mockListFolders = vi.mocked(listFolders)
const mockSend = vi.mocked(send)

const accounts: AccountConfig[] = [
  {
    id: 'user1_gmail_com',
    email: 'user1@gmail.com',
    password: 'pass1',
    imap: { host: 'imap.gmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.gmail.com', port: 465, secure: true }
  },
  {
    id: 'user2_outlook_com',
    email: 'user2@outlook.com',
    password: 'pass2',
    imap: { host: 'outlook.office365.com', port: 993, secure: true },
    smtp: { host: 'smtp.office365.com', port: 587, secure: false }
  }
]

beforeEach(() => {
  vi.clearAllMocks()
})

// ============================================================================
// search
// ============================================================================

describe('messages - search', () => {
  it('searches all accounts by default', async () => {
    mockSearchEmails.mockResolvedValue([])

    const result = await messages(accounts, { action: 'search' })

    expect(result.action).toBe('search')
    expect(result.query).toBe('UNSEEN')
    expect(result.folder).toBe('INBOX')
    expect(result.accounts_searched).toHaveLength(2)
    expect(mockSearchEmails).toHaveBeenCalledWith(accounts, 'UNSEEN', 'INBOX', 20)
  })

  it('returns real messages and unavailable account status without counting failures', async () => {
    const message = {
      account_id: 'user1_gmail_com',
      account_email: 'user1@gmail.com',
      uid: 42,
      subject: 'Real message',
      from: 'sender@example.com',
      to: 'user1@gmail.com',
      date: '2026-08-04T00:00:00.000Z',
      flags: [],
      snippet: 'Message body'
    }
    const searchResult = [message] as any
    Object.defineProperty(searchResult, 'unavailableAccounts', {
      value: [
        {
          account_id: 'user2_outlook_com',
          account_email: 'user2@outlook.com',
          code: 'OAUTH_AUTH_REQUIRED',
          reason: 'OAuth authentication required for this account.'
        }
      ],
      enumerable: false
    })
    mockSearchEmails.mockResolvedValue(searchResult as any)

    const result = await messages(accounts, { action: 'search', query: 'ALL' })

    expect(result.total).toBe(1)
    expect(result.messages).toEqual([message])
    expect(result.messages.some((item: { uid: number }) => item.uid === 0)).toBe(false)
    expect(result.unavailable_accounts).toEqual(searchResult.unavailableAccounts)
  })

  it('filters by account when specified', async () => {
    mockSearchEmails.mockResolvedValue([])

    await messages(accounts, { action: 'search', account: 'user1@gmail.com' })

    expect(mockSearchEmails).toHaveBeenCalledWith(
      [accounts[0]],
      expect.any(String),
      expect.any(String),
      expect.any(Number)
    )
  })

  it('uses custom query, folder, and limit', async () => {
    mockSearchEmails.mockResolvedValue([])

    await messages(accounts, { action: 'search', query: 'FLAGGED', folder: 'Sent', limit: 5 })

    expect(mockSearchEmails).toHaveBeenCalledWith(accounts, 'FLAGGED', 'Sent', 5)
  })

  it('throws when account not found', async () => {
    await expect(messages(accounts, { action: 'search', account: 'nonexistent@test.com' })).rejects.toThrow(
      'Account not found'
    )
  })
})

// ============================================================================
// read
// ============================================================================

describe('messages - read', () => {
  it('reads email by UID', async () => {
    mockReadEmail.mockResolvedValue({
      account_id: 'user1_gmail_com',
      account_email: 'user1@gmail.com',
      uid: 42,
      subject: 'Test',
      from: 'sender@test.com',
      to: 'user1@gmail.com',
      date: '2025-01-01',
      flags: ['\\Seen'],
      body_text: 'Hello',
      attachments: []
    })

    const result = await messages(accounts, { action: 'read', uid: 42, account: 'user1@gmail.com' })

    expect(result.action).toBe('read')
    expect(result.uid).toBe(42)
    expect(result.subject).toBe('Test')
  })
  it('returns a bounded preview with truncation metadata', async () => {
    mockReadEmail.mockResolvedValue({
      account_id: 'user1_gmail_com',
      account_email: 'user1@gmail.com',
      uid: 42,
      subject: 'Test',
      from: 'sender@test.com',
      to: 'user1@gmail.com',
      date: '2025-01-01',
      flags: ['\\Seen'],
      body_text: '0123456789',
      attachments: [{ filename: 'report.pdf', content_type: 'application/pdf', size: 123 }]
    })

    const result = await messages(accounts, {
      action: 'read',
      uid: 42,
      account: 'user1@gmail.com',
      preview: true,
      max_chars: 5
    })

    expect(result.body_text).toBe('01234')
    expect(result.preview).toBe(true)
    expect(result.body_truncated).toBe(true)
    expect(result.body_char_count).toBe(10)
    expect(result.body_limit).toBe(5)
    expect(result.attachments).toEqual([{ filename: 'report.pdf', content_type: 'application/pdf', size: 123 }])
  })

  it('returns untruncated preview metadata when the body fits the limit', async () => {
    mockReadEmail.mockResolvedValue({
      account_id: 'user1_gmail_com',
      account_email: 'user1@gmail.com',
      uid: 42,
      subject: 'Test',
      from: 'sender@test.com',
      to: 'user1@gmail.com',
      date: '2025-01-01',
      flags: ['\\Seen'],
      body_text: 'short body',
      attachments: [{ filename: 'report.pdf', content_type: 'application/pdf', size: 123 }]
    })

    const result = await messages(accounts, {
      action: 'read',
      uid: 42,
      account: 'user1@gmail.com',
      preview: true,
      max_chars: 100
    })

    expect(result.body_text).toBe('short body')
    expect(result.body_truncated).toBe(false)
    expect(result.body_char_count).toBe(10)
    expect(result.body_limit).toBe(100)
    expect(result.attachments).toEqual([{ filename: 'report.pdf', content_type: 'application/pdf', size: 123 }])
  })

  it('rejects an unbounded preview limit', async () => {
    await expect(
      messages(accounts, { action: 'read', uid: 42, account: 'user1@gmail.com', preview: true, max_chars: 0 })
    ).rejects.toThrow('max_chars must be an integer')
  })

  it('throws when uid is missing', async () => {
    await expect(messages(accounts, { action: 'read', account: 'user1@gmail.com' })).rejects.toThrow('uid is required')
  })

  it('throws when multiple accounts match', async () => {
    await expect(messages(accounts, { action: 'read', uid: 1, account: '.com' })).rejects.toThrow(
      'Multiple accounts matched'
    )
  })
})

// ============================================================================
// mark_read / mark_unread
// ============================================================================

describe('messages - mark_read', () => {
  it('adds \\Seen flag', async () => {
    mockModifyFlags.mockResolvedValue({ success: true, modified: 1 })

    const result = await messages(accounts, { action: 'mark_read', uid: 5, account: 'user1@gmail.com' })

    expect(result.action).toBe('mark_read')
    expect(mockModifyFlags).toHaveBeenCalledWith(accounts[0], [5], 'INBOX', ['\\Seen'], 'add')
  })

  it('supports batch uids', async () => {
    mockModifyFlags.mockResolvedValue({ success: true, modified: 3 })

    await messages(accounts, { action: 'mark_read', uids: [1, 2, 3], account: 'user1@gmail.com' })

    expect(mockModifyFlags).toHaveBeenCalledWith(accounts[0], [1, 2, 3], 'INBOX', ['\\Seen'], 'add')
  })

  it('throws when no uids provided', async () => {
    await expect(messages(accounts, { action: 'mark_read', account: 'user1@gmail.com' })).rejects.toThrow(
      'uid or uids required'
    )
  })
})

describe('messages - mark_unread', () => {
  it('removes \\Seen flag', async () => {
    mockModifyFlags.mockResolvedValue({ success: true, modified: 1 })

    await messages(accounts, { action: 'mark_unread', uid: 5, account: 'user1@gmail.com' })

    expect(mockModifyFlags).toHaveBeenCalledWith(accounts[0], [5], 'INBOX', ['\\Seen'], 'remove')
  })
})

// ============================================================================
// flag / unflag
// ============================================================================

describe('messages - flag', () => {
  it('adds \\Flagged flag', async () => {
    mockModifyFlags.mockResolvedValue({ success: true, modified: 1 })

    await messages(accounts, { action: 'flag', uid: 10, account: 'user1@gmail.com' })

    expect(mockModifyFlags).toHaveBeenCalledWith(accounts[0], [10], 'INBOX', ['\\Flagged'], 'add')
  })
})

describe('messages - unflag', () => {
  it('removes \\Flagged flag', async () => {
    mockModifyFlags.mockResolvedValue({ success: true, modified: 1 })

    await messages(accounts, { action: 'unflag', uid: 10, account: 'user1@gmail.com' })

    expect(mockModifyFlags).toHaveBeenCalledWith(accounts[0], [10], 'INBOX', ['\\Flagged'], 'remove')
  })
})

// ============================================================================
// move
// ============================================================================

describe('messages - move', () => {
  it('moves emails to destination folder', async () => {
    mockListFolders.mockResolvedValue([
      { name: 'Archive', path: 'Archive', flags: ['\\Archive'], delimiter: '/' },
      { name: 'Deleted Messages', path: 'Deleted Messages', flags: ['\\Trash'], delimiter: '/' }
    ])
    mockMoveEmails.mockResolvedValue({ success: true, moved: 2 })

    const result = await messages(accounts, {
      action: 'move',
      uids: [1, 2],
      destination: 'Archive',
      account: 'user1@gmail.com'
    })

    expect(result.action).toBe('move')
    expect(result.to_folder).toBe('Archive')
    expect(mockMoveEmails).toHaveBeenCalledWith(accounts[0], [1, 2], 'INBOX', 'Archive')
  })

  it('throws when no uids provided', async () => {
    await expect(
      messages(accounts, { action: 'move', destination: 'Archive', account: 'user1@gmail.com' })
    ).rejects.toThrow('uid or uids required')
  })

  it('throws when destination is missing', async () => {
    await expect(messages(accounts, { action: 'move', uid: 1, account: 'user1@gmail.com' })).rejects.toThrow(
      'destination is required'
    )
  })

  // Fork change (home-mcp): moving into Deleted/Trash must use move_to_deleted.
  it.each(['Deleted Messages', 'deleted messages', 'Trash', '[Gmail]/Trash', 'Deleted Items', 'Bin'])(
    'refuses a well-known Deleted/Trash name (%s) without touching IMAP',
    async (destination) => {
      await expect(
        messages(accounts, { action: 'move', uid: 1, destination, account: 'user1@gmail.com' })
      ).rejects.toThrow(/move_to_deleted/)
      expect(mockMoveEmails).not.toHaveBeenCalled()
    }
  )

  it('refuses a folder flagged \\Trash even with an unusual name', async () => {
    mockListFolders.mockResolvedValue([{ name: 'Papierkorb', path: 'Papierkorb', flags: ['\\Trash'], delimiter: '/' }])
    await expect(
      messages(accounts, { action: 'move', uid: 1, destination: 'Papierkorb', account: 'user1@gmail.com' })
    ).rejects.toThrow(/move_to_deleted/)
    expect(mockMoveEmails).not.toHaveBeenCalled()
  })

  it('fails closed when the folder list cannot be read', async () => {
    mockListFolders.mockRejectedValue(new Error('IMAP down'))
    await expect(
      messages(accounts, { action: 'move', uid: 1, destination: 'Receipts', account: 'user1@gmail.com' })
    ).rejects.toThrow(/Could not check the destination folder/)
    expect(mockMoveEmails).not.toHaveBeenCalled()
  })
})

// ============================================================================
// archive
// ============================================================================

describe('messages - archive', () => {
  it('moves to Gmail archive folder', async () => {
    mockListFolders.mockResolvedValue([
      { name: 'All Mail', path: '[Gmail]/All Mail', flags: ['\\All'], delimiter: '/' }
    ])
    mockMoveEmails.mockResolvedValue({ success: true, moved: 1 })

    const result = await messages(accounts, { action: 'archive', uid: 1, account: 'user1@gmail.com' })

    expect(result.action).toBe('archive')
    expect(result.archive_folder).toBe('[Gmail]/All Mail')
  })

  it('falls back to default archive folder if listing fails', async () => {
    mockListFolders.mockRejectedValue(new Error('fail'))
    mockMoveEmails.mockResolvedValue({ success: true, moved: 1 })

    const result = await messages(accounts, { action: 'archive', uid: 1, account: 'user1@gmail.com' })

    expect(result.archive_folder).toBe('[Gmail]/All Mail')
  })

  it('uses Archive for Outlook accounts', async () => {
    mockListFolders.mockResolvedValue([{ name: 'Archive', path: 'Archive', flags: ['\\Archive'], delimiter: '/' }])
    mockMoveEmails.mockResolvedValue({ success: true, moved: 1 })

    const result = await messages(accounts, { action: 'archive', uid: 1, account: 'user2@outlook.com' })

    expect(result.archive_folder).toBe('Archive')
  })

  it('clears cache and rethrows if archive folder resolution fails', async () => {
    const failAccount: AccountConfig = {
      ...accounts[0],
      id: 'cache_clear_test',
      email: 'cache@test.com',
      imap: { ...accounts[0].imap }
    }

    // The IIFE is an async function, so a synchronous throw inside it results in a rejected Promise
    Object.defineProperty(failAccount.imap, 'host', {
      get: () => {
        throw new Error('Intentional error to reject promise')
      }
    })

    await expect(messages([failAccount], { action: 'archive', uid: 1 })).rejects.toThrow(
      'Intentional error to reject promise'
    )

    // Second call with a fixed account matching the same ID to verify cache was cleared
    const fixedAccount: AccountConfig = {
      ...failAccount,
      imap: { ...accounts[0].imap, host: 'imap.gmail.com' }
    }
    mockListFolders.mockResolvedValue([])
    mockMoveEmails.mockResolvedValue({ success: true, moved: 1 })

    const result = await messages([fixedAccount], { action: 'archive', uid: 1 })
    expect(result.archive_folder).toBe('[Gmail]/All Mail')
  })
})

// ============================================================================
// trash
// ============================================================================

describe('messages - removed actions (home-mcp fork)', () => {
  it.each(['trash', 'new', 'reply', 'forward'])('rejects %s and calls neither IMAP nor SMTP', async (action) => {
    await expect(
      messages(accounts, {
        action: action as any,
        uid: 99,
        account: 'user1@gmail.com',
        to: 'x@example.com',
        subject: 's',
        body: 'b'
      } as any)
    ).rejects.toThrow()
    expect(mockSend).not.toHaveBeenCalled()
    expect(mockMoveEmails).not.toHaveBeenCalled()
    expect(mockMoveToDeleted).not.toHaveBeenCalled()
  })
})

// ============================================================================
// unknown action
// ============================================================================

describe('messages - unknown action', () => {
  it('throws for unknown action', async () => {
    await expect(messages(accounts, { action: 'unknown_action' as any })).rejects.toThrow()
  })
})

// ============================================================================
// outbound actions
// ============================================================================

// ============================================================================
// account resolution
// ============================================================================

describe('account resolution', () => {
  it('matches by partial email', async () => {
    mockSearchEmails.mockResolvedValue([])

    await messages(accounts, { action: 'search', account: 'gmail' })

    expect(mockSearchEmails).toHaveBeenCalledWith(
      [accounts[0]],
      expect.any(String),
      expect.any(String),
      expect.any(Number)
    )
  })

  it('matches by account id', async () => {
    mockSearchEmails.mockResolvedValue([])

    await messages(accounts, { action: 'search', account: 'user1_gmail_com' })

    expect(mockSearchEmails).toHaveBeenCalledWith(
      [accounts[0]],
      expect.any(String),
      expect.any(String),
      expect.any(Number)
    )
  })
})

// ============================================================================
// archive — extended coverage
// ============================================================================

describe('messages - archive (extended)', () => {
  const yahooAccount: AccountConfig = {
    id: 'yahoo_user',
    email: 'user@yahoo.com',
    password: 'pass',
    imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.yahoo.com', port: 465, secure: true }
  }

  it('uses Archive for Yahoo accounts', async () => {
    mockListFolders.mockResolvedValue([{ name: 'Archive', path: 'Archive', flags: [], delimiter: '/' }])
    mockMoveEmails.mockResolvedValue({ success: true, moved: 1 })

    const result = await messages([yahooAccount], { action: 'archive', uid: 1 })

    expect(result.action).toBe('archive')
    expect(result.archive_folder).toBe('Archive')
    expect(mockMoveEmails).toHaveBeenCalledWith(yahooAccount, [1], 'INBOX', 'Archive')
  })

  it('detects archive folder from \\All flag', async () => {
    const allAccount: AccountConfig = {
      ...accounts[0],
      id: 'all_flags',
      email: 'all@custom.com'
    }
    mockListFolders.mockResolvedValue([{ name: 'Everything', path: 'Everything', flags: ['\\All'], delimiter: '/' }])
    mockMoveEmails.mockResolvedValue({ success: true, moved: 1 })

    const result = await messages([allAccount], { action: 'archive', uid: 5 })

    expect(result.archive_folder).toBe('Everything')
  })

  it('detects archive folder from flags', async () => {
    const customAccount: AccountConfig = {
      id: 'custom_archive_flags',
      email: 'user@custom.com',
      password: 'pass',
      imap: { host: 'imap.custom.com', port: 993, secure: true },
      smtp: { host: 'smtp.custom.com', port: 465, secure: true }
    }
    mockListFolders.mockResolvedValue([{ name: 'Saved', path: 'Saved', flags: ['\\Archive'], delimiter: '/' }])
    mockMoveEmails.mockResolvedValue({ success: true, moved: 1 })

    const result = await messages([customAccount], { action: 'archive', uid: 5 })

    expect(result.archive_folder).toBe('Saved')
  })

  it('uses default when folder listing fails', async () => {
    const failAccount: AccountConfig = {
      id: 'fail_listing_account',
      email: 'user@fail.com',
      password: 'pass',
      imap: { host: 'imap.fail.com', port: 993, secure: true },
      smtp: { host: 'smtp.fail.com', port: 465, secure: true }
    }
    mockListFolders.mockRejectedValue(new Error('connection refused'))
    mockMoveEmails.mockResolvedValue({ success: true, moved: 1 })

    const result = await messages([failAccount], { action: 'archive', uid: 1 })

    // Default for non-Gmail/non-Outlook/non-Yahoo is [Gmail]/All Mail
    expect(result.archive_folder).toBe('[Gmail]/All Mail')
  })

  it('caches archive folder across calls', async () => {
    const cacheAccount: AccountConfig = {
      id: 'cache_test_account',
      email: 'user@cache.com',
      password: 'pass',
      imap: { host: 'imap.cache.com', port: 993, secure: true },
      smtp: { host: 'smtp.cache.com', port: 465, secure: true }
    }
    mockListFolders.mockResolvedValue([{ name: 'MyArchive', path: 'MyArchive', flags: ['\\Archive'], delimiter: '/' }])
    mockMoveEmails.mockResolvedValue({ success: true, moved: 1 })

    await messages([cacheAccount], { action: 'archive', uid: 1 })
    await messages([cacheAccount], { action: 'archive', uid: 2 })

    // listFolders should only be called once due to caching
    expect(mockListFolders).toHaveBeenCalledTimes(1)
  })

  it('clears the archive folder cache and reports the number of removed entries', async () => {
    clearArchiveFolderCache()
    const cacheAccount: AccountConfig = {
      ...accounts[0]!,
      id: 'clear_archive_cache_account',
      email: 'clear-cache@gmail.com'
    }
    mockListFolders.mockResolvedValue([])
    mockMoveEmails.mockResolvedValue({ success: true, moved: 1 })

    await messages([cacheAccount], { action: 'archive', uid: 1 })
    expect(clearArchiveFolderCache()).toBe(1)
    expect(clearArchiveFolderCache()).toBe(0)
  })

  it('throws when no uid or uids provided', async () => {
    await expect(messages(accounts, { action: 'archive', account: 'user1@gmail.com' })).rejects.toThrow(
      'uid or uids required'
    )
  })
})

// ============================================================================
// trash — extended coverage
// ============================================================================

describe('move_to_deleted tool', () => {
  it('throws when no uid or uids provided', async () => {
    await expect(moveToDeletedTool(accounts, { account: 'user1@gmail.com' })).rejects.toThrow('uid or uids required')
    expect(mockMoveToDeleted).not.toHaveBeenCalled()
  })

  it('moves a single uid from INBOX by default', async () => {
    mockMoveToDeleted.mockResolvedValue({ success: true, moved: 1, deleted_folder: 'Deleted Messages' })
    const result = await moveToDeletedTool(accounts, { uid: 99, account: 'user1@gmail.com' })
    expect(mockMoveToDeleted).toHaveBeenCalledWith(accounts[0], [99], 'INBOX')
    expect(result).toMatchObject({ action: 'move_to_deleted', deleted_folder: 'Deleted Messages', moved: 1 })
  })

  it('supports batch uids and a source folder', async () => {
    mockMoveToDeleted.mockResolvedValue({ success: true, moved: 3, deleted_folder: 'Deleted Messages' })
    await moveToDeletedTool(accounts, { uids: [10, 20, 30], folder: 'Newsletters', account: 'user1@gmail.com' })
    expect(mockMoveToDeleted).toHaveBeenCalledWith(accounts[0], [10, 20, 30], 'Newsletters')
  })
})
