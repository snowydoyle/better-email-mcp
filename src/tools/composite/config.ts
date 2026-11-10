/**
 * Config Tool
 * Unified credential lifecycle + runtime configuration.
 * Replaces the former `setup` tool with canonical name `config`.
 *
 * Setup actions (credential lifecycle):
 *   status, setup_status, setup_start, setup_complete
 *   (fork change, home-mcp: setup_reset removed; it could wipe the running
 *   server's credentials from a tool call)
 *
 * Runtime config actions:
 *   set, cache_clear
 *
 * Credentials are supplied through env vars (EMAIL_CREDENTIALS, or
 * EMAIL_USER + EMAIL_APP_PASSWORD) or the `email auth` CLI. This tool does not
 * open a browser form.
 */

import type { CredentialState } from '../../credential-state.js'
import { getState, resolveCredentialState } from '../../credential-state.js'
import type { AccountConfig } from '../helpers/config.js'
import { createUnknownActionError, withErrorHandling } from '../helpers/errors.js'
import { clearSentFolderCache, clearTrashFolderCache } from '../helpers/imap-client.js'
import { _resetTokenCache } from '../helpers/oauth2.js'
import { clearArchiveFolderCache } from './messages.js'

export interface ConfigInput {
  action: 'status' | 'setup_status' | 'setup_start' | 'setup_complete' | 'set' | 'cache_clear'
  key?: string
  value?: string
}

interface ConfigStatusResult {
  action: 'status'
  state: CredentialState
  accounts: string[]
}

interface ConfigSetupStatusResult {
  action: 'setup_status'
  state: CredentialState
}

interface ConfigSetupStartResult {
  action: 'setup_start'
  state: CredentialState
  message: string
}

interface ConfigSetupCompleteResult {
  action: 'setup_complete'
  previous_state: CredentialState
  state: CredentialState
  accounts: string[]
}

interface ConfigSetResult {
  action: 'set'
  ok: false
  text: string
}

interface ConfigCacheClearResult {
  action: 'cache_clear'
  ok: true
  cleared: number
}

type ConfigResult =
  | ConfigStatusResult
  | ConfigSetupStatusResult
  | ConfigSetupStartResult
  | ConfigSetupCompleteResult
  | ConfigSetResult
  | ConfigCacheClearResult

/**
 * Unified config tool - credential lifecycle + runtime settings
 */
export async function handleConfig(accounts: AccountConfig[], input: ConfigInput): Promise<ConfigResult> {
  return withErrorHandling(async () => {
    switch (input.action) {
      case 'status':
        return handleStatus(accounts)

      case 'setup_status':
        return handleSetupStatus()

      case 'setup_start':
        return handleSetupStart()

      case 'setup_complete':
        return await handleSetupComplete(accounts)

      case 'set':
        return handleSet()

      case 'cache_clear':
        return handleCacheClear()

      default:
        throw createUnknownActionError(
          input.action,
          'status, setup_status, setup_start, setup_complete, set, cache_clear'
        )
    }
  })()
}

function handleStatus(accounts: AccountConfig[]): ConfigStatusResult {
  return {
    action: 'status',
    state: getState(),
    accounts: accounts.map((a) => a.email)
  }
}

function handleSetupStatus(): ConfigSetupStatusResult {
  return {
    action: 'setup_status',
    state: getState()
  }
}

function handleSetupStart(): ConfigSetupStartResult {
  return {
    action: 'setup_start',
    state: getState(),
    message:
      'Set EMAIL_CREDENTIALS (or EMAIL_USER + EMAIL_APP_PASSWORD) and restart the server, or run `email auth outlook <address>` from the CLI.'
  }
}

async function handleSetupComplete(accounts: AccountConfig[]): Promise<ConfigSetupCompleteResult> {
  const previousState = getState()
  const newState = await resolveCredentialState()
  return {
    action: 'setup_complete',
    previous_state: previousState,
    state: newState,
    accounts: newState === 'configured' ? accounts.map((a) => a.email) : []
  }
}

function handleSet(): ConfigSetResult {
  return {
    action: 'set',
    ok: false,
    text: 'email has no runtime settings'
  }
}

function handleCacheClear(): ConfigCacheClearResult {
  const sentCount = clearSentFolderCache()
  const archiveCount = clearArchiveFolderCache()
  const trashCount = clearTrashFolderCache()
  _resetTokenCache()
  const cleared = sentCount + archiveCount + trashCount
  return {
    action: 'cache_clear',
    ok: true,
    cleared
  }
}
