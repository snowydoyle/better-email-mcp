/**
 * home-mcp fork safety checks: guard against permanent delete or credential
 * reset creeping back in through an upstream merge.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : []
  })
}

describe('home-mcp fork safety', () => {
  const files = sourceFiles(join(process.cwd(), 'src'))

  it('no source file can permanently delete mail', () => {
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(/messageDelete|\.expunge\(|EXPUNGE|'\\\\Deleted'/)
    }
  })

  it('no source file wires up a credential reset tool action', () => {
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/(?<!function )resetState\(/)
    }
  })
})
