import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../../services/analytics/index.js'
import { shouldUseCodexTransport } from '../../services/api/providerConfig.js'
import { isEnvTruthy } from '../envUtils.js'

export type APIProvider =
  | 'firstParty'
  | 'bedrock'
  | 'vertex'
  | 'foundry'
  | 'openai'
  | 'gemini'
  | 'github'
  | 'codex'
  | 'nvidia-nim'
  | 'minimax'
  | 'mistral'

export function getAPIProvider(): APIProvider {
  if (isEnvTruthy(process.env.NVIDIA_NIM)) {
    return 'nvidia-nim'
  }
  if (isEnvTruthy(process.env.MINIMAX_API_KEY)) {
    return 'minimax'
  }
  return isEnvTruthy(process.env.CLAUDE_CODE_USE_GEMINI)
    ? 'gemini'
    :
    isEnvTruthy(process.env.CLAUDE_CODE_USE_MISTRAL)
    ? 'mistral'
    : isEnvTruthy(process.env.CLAUDE_CODE_USE_GITHUB)
      ? 'github'
      : isEnvTruthy(process.env.CLAUDE_CODE_USE_OPENAI)
        ? isCodexModel()
          ? 'codex'
          : 'openai'
        : isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)
          ? 'bedrock'
          : isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)
            ? 'vertex'
            : isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)
              ? 'foundry'
              : 'firstParty'
}

export function usesAnthropicAccountFlow(): boolean {
  return getAPIProvider() === 'firstParty'
}

/**
 * Returns true when the GitHub provider should use Anthropic's native API
 * format instead of the OpenAI-compatible shim.
 *
 * Enabled automatically when CLAUDE_CODE_USE_GITHUB=1 and the selected model
 * is a Claude model (OPENAI_MODEL starts with "claude-"). Can also be forced
 * on with CLAUDE_CODE_GITHUB_ANTHROPIC_API=1 for Claude models that use an
 * alias (e.g. "github:copilot") that would not be detected automatically.
 *
 * api.githubcopilot.com supports Anthropic native format for Claude models,
 * enabling prompt caching via cache_control blocks which significantly reduces
 * per-turn token costs by caching the system prompt and tool definitions.
 */
export function isGithubNativeAnthropicMode(resolvedModel?: string): boolean {
  if (!isEnvTruthy(process.env.CLAUDE_CODE_USE_GITHUB)) return false
  // Prefer the resolved model name (e.g. "claude-haiku-4.5") over OPENAI_MODEL
  // which may be a generic alias like "github:copilot".
  const model = resolvedModel?.trim() || process.env.OPENAI_MODEL?.trim() || ''
  const isClaudeModel = model.toLowerCase().startsWith('claude-')
  // Force flag: opt in explicitly when using a Claude model under a non-standard
  // alias (e.g. OPENAI_MODEL=github:copilot). This flag is only intended for
  // endpoints known to serve a Claude model; native Anthropic format is only
  // validated for Claude models on Copilot.
  if (isEnvTruthy(process.env.CLAUDE_CODE_GITHUB_ANTHROPIC_API)) {
    return isClaudeModel || !model
  }
  return isClaudeModel
}
function isCodexModel(): boolean {
  return shouldUseCodexTransport(
    process.env.OPENAI_MODEL || '',
    process.env.OPENAI_BASE_URL ?? process.env.OPENAI_API_BASE,
  )
}

export function getAPIProviderForStatsig(): AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS {
  return getAPIProvider() as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
}

/**
 * Check if ANTHROPIC_BASE_URL is a first-party Anthropic API URL.
 * Returns true if not set (default API) or points to api.anthropic.com
 * (or api-staging.anthropic.com for ant users).
 */
export function isFirstPartyAnthropicBaseUrl(): boolean {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  if (!baseUrl) {
    return true
  }
  try {
    const host = new URL(baseUrl).host
    const allowedHosts = ['api.anthropic.com']
    if (process.env.USER_TYPE === 'ant') {
      allowedHosts.push('api-staging.anthropic.com')
    }
    return allowedHosts.includes(host)
  } catch {
    return false
  }
}
