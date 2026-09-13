import type { Stats } from 'node:fs'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path'

// Node replacement for the Cloudflare R2 binding, backed by files under
// `${dataDir}/r2`. Object metadata is persisted in a `<key>.meta.json` sidecar.
// Keys are validated to prevent path traversal outside the bucket root.

const META_SUFFIX = '.meta.json'

interface SerializedHttpMetadata {
  contentType?: string
  contentLanguage?: string
  contentDisposition?: string
  contentEncoding?: string
  cacheControl?: string
}

interface StoredMetadata {
  size: number
  etag: string
  uploaded: string
  httpMetadata: SerializedHttpMetadata | null
  customMetadata: Record<string, string> | null
}

function md5Hex(buffer: Buffer): string {
  return createHash('md5').update(buffer).digest('hex')
}

function resolveKeyPath(root: string, key: string): string {
  if (typeof key !== 'string' || key.length === 0)
    throw new Error('R2 key must be a non-empty string')
  if (isAbsolute(key) || key.includes('\\') || key.includes('\0'))
    throw new Error(`Invalid R2 key: ${key}`)
  if (key.split('/').includes('..'))
    throw new Error(`Invalid R2 key: ${key}`)

  const rootPath = resolve(root)
  const fullPath = resolve(rootPath, normalize(key))
  if (fullPath !== rootPath && !fullPath.startsWith(rootPath + sep))
    throw new Error(`Invalid R2 key: ${key}`)
  return fullPath
}

function normalizeHttpMetadata(value: R2HTTPMetadata | Headers | undefined): SerializedHttpMetadata | null {
  if (!value)
    return null
  if (value instanceof Headers) {
    return {
      contentType: value.get('content-type') ?? undefined,
      contentLanguage: value.get('content-language') ?? undefined,
      contentDisposition: value.get('content-disposition') ?? undefined,
      contentEncoding: value.get('content-encoding') ?? undefined,
      cacheControl: value.get('cache-control') ?? undefined,
    }
  }
  return {
    contentType: value.contentType,
    contentLanguage: value.contentLanguage,
    contentDisposition: value.contentDisposition,
    contentEncoding: value.contentEncoding,
    cacheControl: value.cacheControl,
  }
}

async function streamToBuffer(stream: ReadableStream): Promise<Buffer> {
  const reader = stream.getReader()
  const chunks: Buffer[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      if (value)
        chunks.push(Buffer.from(value))
    }
  }
  finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks)
}

async function toBuffer(value: unknown): Promise<Buffer> {
  if (value === null || value === undefined)
    return Buffer.alloc(0)
  if (typeof value === 'string')
    return Buffer.from(value, 'utf8')
  if (value instanceof ArrayBuffer)
    return Buffer.from(value)
  if (ArrayBuffer.isView(value))
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  if (typeof Blob !== 'undefined' && value instanceof Blob)
    return Buffer.from(await value.arrayBuffer())
  if (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream)
    return await streamToBuffer(value)
  throw new TypeError('Unsupported R2 put value type')
}

async function readMetadata(metaPath: string): Promise<StoredMetadata | null> {
  try {
    const raw = await readFile(metaPath, 'utf8')
    return JSON.parse(raw) as StoredMetadata
  }
  catch {
    return null
  }
}

function buildObject(key: string, metadata: StoredMetadata): R2Object {
  return {
    key,
    version: metadata.etag,
    size: metadata.size,
    etag: metadata.etag,
    httpEtag: `"${metadata.etag}"`,
    checksums: { md5: metadata.etag },
    uploaded: new Date(metadata.uploaded),
    httpMetadata: metadata.httpMetadata ?? undefined,
    customMetadata: metadata.customMetadata ?? undefined,
    storageClass: 'Standard',
    writeHttpMetadata(headers: Headers) {
      if (metadata.httpMetadata?.contentType)
        headers.set('Content-Type', metadata.httpMetadata.contentType)
      if (metadata.httpMetadata?.cacheControl)
        headers.set('Cache-Control', metadata.httpMetadata.cacheControl)
      if (metadata.httpMetadata?.contentDisposition)
        headers.set('Content-Disposition', metadata.httpMetadata.contentDisposition)
      if (metadata.httpMetadata?.contentEncoding)
        headers.set('Content-Encoding', metadata.httpMetadata.contentEncoding)
      if (metadata.httpMetadata?.contentLanguage)
        headers.set('Content-Language', metadata.httpMetadata.contentLanguage)
    },
  } as unknown as R2Object
}

class NodeR2ObjectBody implements R2ObjectBody {
  readonly key: string
  readonly version: string
  readonly size: number
  readonly etag: string
  readonly httpEtag: string
  readonly checksums: R2Checksums
  readonly uploaded: Date
  readonly httpMetadata?: R2HTTPMetadata
  readonly customMetadata?: Record<string, string>
  readonly storageClass = 'Standard'
  readonly bodyUsed = false

  private readonly buffer: Buffer
  private readonly base: R2Object

  constructor(key: string, metadata: StoredMetadata, buffer: Buffer) {
    this.buffer = buffer
    this.base = buildObject(key, metadata)
    this.key = this.base.key
    this.version = this.base.version
    this.size = this.base.size
    this.etag = this.base.etag
    this.httpEtag = this.base.httpEtag
    this.checksums = this.base.checksums
    this.uploaded = this.base.uploaded
    this.httpMetadata = this.base.httpMetadata
    this.customMetadata = this.base.customMetadata
  }

  get body(): ReadableStream {
    const buffer = this.buffer
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(buffer)
        controller.close()
      },
    })
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.buffer.buffer.slice(this.buffer.byteOffset, this.buffer.byteOffset + this.buffer.byteLength) as ArrayBuffer
  }

  async bytes(): Promise<Uint8Array> {
    return new Uint8Array(this.buffer)
  }

  async text(): Promise<string> {
    return this.buffer.toString('utf8')
  }

  async json<T>(): Promise<T> {
    return JSON.parse(this.buffer.toString('utf8')) as T
  }

  async blob(): Promise<Blob> {
    return new Blob([await this.arrayBuffer()], { type: this.httpMetadata?.contentType })
  }

  writeHttpMetadata(headers: Headers): void {
    this.base.writeHttpMetadata(headers)
  }
}

async function collectKeys(root: string, relative: string, output: string[]): Promise<void> {
  const current = relative ? join(root, relative) : root
  const entries = await readdir(current, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory())
      await collectKeys(root, child, output)
    else if (!entry.name.endsWith(META_SUFFIX))
      output.push(child)
  }
}

class NodeR2Bucket {
  private readonly root: string

  constructor(dataDir: string) {
    this.root = join(dataDir, 'r2')
  }

  private async writeObject(key: string, buffer: Buffer, metadata: StoredMetadata): Promise<R2Object> {
    const filePath = resolveKeyPath(this.root, key)
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, buffer)
    await writeFile(filePath + META_SUFFIX, JSON.stringify(metadata))
    return buildObject(key, metadata)
  }

  private createMetadata(buffer: Buffer, options?: R2PutOptions | R2MultipartOptions): StoredMetadata {
    return {
      size: buffer.length,
      etag: md5Hex(buffer),
      uploaded: new Date().toISOString(),
      httpMetadata: normalizeHttpMetadata(options?.httpMetadata),
      customMetadata: options?.customMetadata ?? null,
    }
  }

  async head(key: string): Promise<R2Object | null> {
    const filePath = resolveKeyPath(this.root, key)
    let info: Stats
    try {
      info = await stat(filePath)
    }
    catch {
      return null
    }
    const metadata = await readMetadata(filePath + META_SUFFIX) ?? {
      size: info.size,
      etag: '',
      uploaded: info.mtime.toISOString(),
      httpMetadata: null,
      customMetadata: null,
    }
    return buildObject(key, metadata)
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    const filePath = resolveKeyPath(this.root, key)
    let buffer: Buffer
    try {
      buffer = await readFile(filePath)
    }
    catch {
      return null
    }
    const metadata = await readMetadata(filePath + META_SUFFIX) ?? {
      size: buffer.length,
      etag: md5Hex(buffer),
      uploaded: new Date().toISOString(),
      httpMetadata: null,
      customMetadata: null,
    }
    return new NodeR2ObjectBody(key, metadata, buffer)
  }

  async put(key: string, value: unknown, options?: R2PutOptions): Promise<R2Object> {
    const buffer = await toBuffer(value)
    return await this.writeObject(key, buffer, this.createMetadata(buffer, options))
  }

  async delete(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys]
    for (const key of list) {
      const filePath = resolveKeyPath(this.root, key)
      await rm(filePath, { force: true })
      await rm(filePath + META_SUFFIX, { force: true })
    }
  }

  createMultipartUpload(key: string, options?: R2MultipartOptions): R2MultipartUpload {
    const parts = new Map<number, Buffer>()
    const uploadId = randomUUID()
    // Validate eagerly so invalid keys fail before any part is buffered.
    resolveKeyPath(this.root, key)
    const writeObject = this.writeObject.bind(this)
    const createMetadata = this.createMetadata.bind(this)

    return {
      key,
      uploadId,
      async uploadPart(partNumber: number, value: unknown): Promise<R2UploadedPart> {
        const buffer = await toBuffer(value)
        parts.set(partNumber, buffer)
        return { partNumber, etag: md5Hex(buffer) }
      },
      async abort(): Promise<void> {
        parts.clear()
      },
      async complete(uploadedParts: R2UploadedPart[]): Promise<R2Object> {
        const buffers = [...uploadedParts]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map(part => parts.get(part.partNumber) ?? Buffer.alloc(0))
        const merged = Buffer.concat(buffers)
        return await writeObject(key, merged, createMetadata(merged, options))
      },
    } as unknown as R2MultipartUpload
  }

  resumeMultipartUpload(key: string, _uploadId: string): R2MultipartUpload {
    // Local multipart uploads are complete-or-abort within one process; resume is unsupported.
    return this.createMultipartUpload(key)
  }

  async list(options?: R2ListOptions): Promise<R2Objects> {
    const prefix = options?.prefix ?? ''
    const limit = options?.limit ?? 1000
    const startAfter = options?.startAfter ?? options?.cursor ?? ''
    const entries: string[] = []
    await collectKeys(this.root, '', entries)
    const filtered = entries
      .filter(key => key.startsWith(prefix) && key > startAfter)
      .sort()
    const page = filtered.slice(0, limit)
    const truncated = filtered.length > limit
    const objects: R2Object[] = []
    for (const key of page) {
      const object = await this.head(key)
      if (object)
        objects.push(object)
    }
    return {
      objects,
      truncated,
      ...(truncated ? { cursor: page.at(-1) ?? '' } : {}),
      delimitedPrefixes: [],
    } as R2Objects
  }
}

/** Wraps a data directory as an R2Bucket-compatible binding. */
export function createR2Bucket(dataDir: string): R2Bucket {
  return new NodeR2Bucket(dataDir) as unknown as R2Bucket
}
