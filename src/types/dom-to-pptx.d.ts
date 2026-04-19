declare module 'dom-to-pptx' {
  export function domToPptx(
    elements: HTMLElement | HTMLElement[],
    options?: {
      slideWidth?: number
      slideHeight?: number
      [key: string]: unknown
    }
  ): Promise<Blob>
}
