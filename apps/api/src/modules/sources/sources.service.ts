import { Injectable, NotFoundException } from '@nestjs/common';
import { createDbClient, STUB_TENANT_ID } from '@knowledgepilot/db';

@Injectable()
export class SourcesService {
  private readonly db = createDbClient();

  async getChunk(chunkId: string) {
    const chunk = await this.db.chunk.findFirst({
      where: {
        id: chunkId,
        tenantId: STUB_TENANT_ID,
        document: { deletedAt: null },
      },
      include: {
        document: {
          select: { id: true, title: true, originalFilename: true, mimeType: true },
        },
      },
    });
    if (!chunk) {
      throw new NotFoundException('Chunk not found');
    }
    return {
      id: chunk.id,
      documentId: chunk.documentId,
      content: chunk.content,
      headingPath: chunk.headingPath,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      ordinal: chunk.ordinal,
      document: chunk.document,
    };
  }
}
