export type ExtractedDocument = {
  text: string;
  pageCount?: number;
};

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|br|tr)>/gi, '\n')
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, inner) => {
      const hashes = '#'.repeat(Number(level));
      return `\n${hashes} ${String(inner).replace(/<[^>]+>/g, '').trim()}\n`;
    })
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<ExtractedDocument> {
  const lower = filename.toLowerCase();

  if (mimeType === 'text/plain' || lower.endsWith('.txt')) {
    return { text: buffer.toString('utf8') };
  }

  if (mimeType === 'text/markdown' || lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return { text: buffer.toString('utf8') };
  }

  if (mimeType === 'text/html' || lower.endsWith('.html') || lower.endsWith('.htm')) {
    return { text: stripHtml(buffer.toString('utf8')) };
  }

  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) {
    const pdfParse = (await import('pdf-parse')).default as (
      data: Buffer,
    ) => Promise<{ text: string; numpages?: number }>;
    const parsed = await pdfParse(buffer);
    return {
      text: parsed.text?.trim() || '',
      pageCount: parsed.numpages,
    };
  }

  throw new Error(`Unsupported file type: ${mimeType || filename}`);
}
