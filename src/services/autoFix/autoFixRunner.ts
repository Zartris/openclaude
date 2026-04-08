import { spawn } from 'child_process'

export interface AutoFixCheckOptions {
  lint?: string
  test?: string
  timeout: number
  cwd: string
  signal?: AbortSignal
}

export interface AutoFixResult {
  hasErrors: boolean
  lintOutput?: string
  lintExitCode?: number
  testOutput?: string
  testExitCode?: number
  timedOut?: boolean
  errorSummary?: string
}

async function runCommand(
  command: string,
  cwd: string,
  timeout: number,
  signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
  return new Promise((resolve) => {
    let timedOut = false
    let stdout = ''
    let stderr = ''

    const proc = spawn('bash', ['-c', command], {
      cwd,
      env: { ...process.env },
    })

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
    })
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    const timer = setTimeout(() => {
      timedOut = true
      proc.kill('SIGTERM')
    }, timeout)

    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        stdout: stdout.slice(0, 10000),
        stderr: stderr.slice(0, 10000),
        exitCode: code ?? 1,
        timedOut,
      })
    })

    proc.on('error', () => {
      clearTimeout(timer)
      resolve({
        stdout,
        stderr: stderr || 'Command failed to start',
        exitCode: 1,
        timedOut: false,
      })
    })
  })
}

function buildErrorSummary(result: AutoFixResult): string | undefined {
  if (!result.hasErrors) return undefined
  const parts: string[] = []

  if (result.timedOut) {
    parts.push('Command timed out.')
  }
  if (result.lintExitCode !== undefined && result.lintExitCode !== 0) {
    parts.push(`Lint errors (exit code ${result.lintExitCode}):\n${result.lintOutput ?? ''}`)
  }
  if (result.testExitCode !== undefined && result.testExitCode !== 0) {
    parts.push(`Test failures (exit code ${result.testExitCode}):\n${result.testOutput ?? ''}`)
  }

  return parts.join('\n\n')
}

export async function runAutoFixCheck(
  options: AutoFixCheckOptions,
): Promise<AutoFixResult> {
  const { lint, test, timeout, cwd, signal } = options

  if (!lint && !test) {
    return { hasErrors: false }
  }

  const result: AutoFixResult = { hasErrors: false }

  // Run lint first
  if (lint) {
    const lintResult = await runCommand(lint, cwd, timeout, signal)
    result.lintOutput = (lintResult.stdout + '\n' + lintResult.stderr).trim()
    result.lintExitCode = lintResult.exitCode

    if (lintResult.timedOut) {
      result.hasErrors = true
      result.timedOut = true
      result.errorSummary = buildErrorSummary(result)
      return result
    }

    if (lintResult.exitCode !== 0) {
      result.hasErrors = true
      result.errorSummary = buildErrorSummary(result)
      return result
    }
  }

  // Run tests only if lint passed (or no lint configured)
  if (test) {
    const testResult = await runCommand(test, cwd, timeout, signal)
    result.testOutput = (testResult.stdout + '\n' + testResult.stderr).trim()
    result.testExitCode = testResult.exitCode

    if (testResult.timedOut) {
      result.hasErrors = true
      result.timedOut = true
    } else if (testResult.exitCode !== 0) {
      result.hasErrors = true
    }
  }

  result.errorSummary = buildErrorSummary(result)
  return result
}
