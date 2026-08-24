declare module 'h3' {
  interface H3EventContext {
    authMethod?: import('./auth').AuthMethod
    userID?: string
    userEmail?: string
    apiKey?: {
      id: string
      name: string
      scopes: import('../schemas/api-key').ApiKeyScope[]
    }
    cloudflare: {
      request: Request<unknown, IncomingRequestCfProperties>
      env: Cloudflare.Env
      context: ExecutionContext
    }
  }
}

export {}
