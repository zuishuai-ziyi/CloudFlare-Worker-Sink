import type { AiChatResponse } from '../ai'
import { randomUUID } from 'node:crypto'
import TurndownService from 'turndown'

// Node replacement for the Cloudflare Workers AI binding. Chat completions are
// proxied to an OpenAI-compatible endpoint, and toMarkdown() converts HTML to
// Markdown locally with turndown. The binding is only created when both the
// base URL and API key are configured, so existing 501 guards keep working.

const AI_REQUEST_TIMEOUT_MS = 30_000

export interface AiBindingConfig {
  baseUrl: string
  apiKey: string
}

interface OpenAiChatCompletionResponse {
  choices?: { message?: { content?: string } }[]
}

interface AiRunInput {
  messages?: unknown
  stream?: boolean
  [key: string]: unknown
}

function toConversionResponse(name: string, data: string): ConversionResponse {
  return {
    id: randomUUID(),
    name,
    mimeType: 'text/html',
    format: 'markdown',
    tokens: 0,
    data,
  }
}

class NodeAiBinding {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly turndown = new TurndownService()

  constructor(config: AiBindingConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.apiKey = config.apiKey
  }

  async run(model: unknown, inputs: unknown): Promise<AiChatResponse> {
    const payload = (inputs ?? {}) as AiRunInput
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: String(model),
          messages: Array.isArray(payload.messages) ? payload.messages : [],
          temperature: 0,
          stream: false,
        }),
        signal: controller.signal,
      })

      if (!response.ok)
        throw new Error(`AI request failed with status ${response.status}`)

      const json = await response.json() as OpenAiChatCompletionResponse
      const content = json.choices?.[0]?.message?.content ?? ''
      return { response: content, choices: json.choices }
    }
    finally {
      clearTimeout(timeout)
    }
  }

  async toMarkdown(files: MarkdownDocument | MarkdownDocument[]): Promise<ConversionResponse | ConversionResponse[]> {
    if (Array.isArray(files))
      return await Promise.all(files.map(file => this.convert(file)))
    return await this.convert(files)
  }

  private async convert(file: MarkdownDocument): Promise<ConversionResponse> {
    const html = await file.blob.text()
    const markdown = this.turndown.turndown(html)
    return toConversionResponse(file.name, markdown)
  }
}

/** Creates an AI binding when an OpenAI-compatible endpoint is configured. */
export function createAiBinding(config: AiBindingConfig | undefined): Ai | undefined {
  if (!config?.baseUrl || !config.apiKey)
    return undefined
  return new NodeAiBinding(config) as unknown as Ai
}
