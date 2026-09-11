import { toggleEnabled, type Toggle } from "../../options.js"

export interface MdastToUniorgOptions {
  preserveMdisms?: Toggle
  interpretHtml?: boolean
  onWarning?: (message: string) => void
}

export interface TransformContext {
  options: MdastToUniorgOptions
  // link definitions of the current run, for resolving reference-style
  // links and images to inline (org has no reference links)
  definitions: Map<string, { url: string; title?: string }>
}

export function mdismEnabled(ctx: TransformContext, key: string): boolean {
  return toggleEnabled(ctx.options.preserveMdisms, key)
}

export function warn(ctx: TransformContext, message: string): void {
  ctx.options.onWarning?.(message)
}
