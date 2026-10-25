import { chunkFixedSize, type TextChunk } from './fixed-size';

type Section = {
  headingPath: string;
  body: string;
};

function splitMarkdownOrHtmlSections(text: string): Section[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const sections: Section[] = [];
  let currentPath = 'Document';
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join('\n').trim();
    if (body) {
      sections.push({ headingPath: currentPath, body });
    }
    buffer = [];
  };

  for (const line of lines) {
    const md = /^(#{1,6})\s+(.+)$/.exec(line);
    const html = /^<h([1-6])[^>]*>(.*?)<\/h\1>/i.exec(line.trim());
    if (md) {
      flush();
      currentPath = md[2]?.trim() || currentPath;
      continue;
    }
    if (html) {
      flush();
      currentPath = html[2]?.replace(/<[^>]+>/g, '').trim() || currentPath;
      continue;
    }
    buffer.push(line);
  }
  flush();

  if (sections.length === 0 && text.trim()) {
    return [{ headingPath: 'Document', body: text.trim() }];
  }
  return sections;
}

export function chunkStructureAware(
  text: string,
  options: { chunkSize: number; overlap: number },
): TextChunk[] {
  const sections = splitMarkdownOrHtmlSections(text);
  const chunks: TextChunk[] = [];
  for (const section of sections) {
    const part = chunkFixedSize(section.body, {
      chunkSize: options.chunkSize,
      overlap: options.overlap,
      headingPath: section.headingPath,
    });
    chunks.push(...part);
  }
  return chunks;
}
