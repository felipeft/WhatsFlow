import { z } from 'zod';
import type { Prisma, PrismaClient } from '@/generated/prisma/client.js';
import { ApiError } from '@/http/api-error.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const cursorSchema = z.object({
  at: z.iso.datetime(),
  id: z.uuid(),
});

export interface HistoryQuery {
  cursor?: string | undefined;
  limit?: number | undefined;
}

export function createConversationService(db: PrismaClient) {
  return {
    async list(query: HistoryQuery) {
      const limit = normalizeLimit(query.limit);
      const cursor = decodeCursor(query.cursor);
      const rows = await db.conversation.findMany({
        ...(cursor
          ? {
              where: {
                OR: [
                  { lastMessageAt: { lt: cursor.at } },
                  { lastMessageAt: cursor.at, id: { lt: cursor.id } },
                ],
              },
            }
          : {}),
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: {
          id: true,
          channel: true,
          externalContactId: true,
          lastMessageAt: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { messages: true } },
        },
      });
      const page = rows.slice(0, limit);
      return {
        data: page.map(({ _count, ...conversation }) => ({
          ...conversation,
          messageCount: _count.messages,
        })),
        page: {
          nextCursor:
            rows.length > limit && page.at(-1)
              ? encodeCursor(page.at(-1)!.lastMessageAt, page.at(-1)!.id)
              : null,
        },
      };
    },

    async get(id: string) {
      const conversation = await db.conversation.findUnique({
        where: { id },
        select: {
          id: true,
          channel: true,
          externalContactId: true,
          lastMessageAt: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { messages: true } },
        },
      });
      if (!conversation) throw new ApiError(404, 'CONVERSATION_NOT_FOUND');
      const { _count, ...data } = conversation;
      return { data: { ...data, messageCount: _count.messages } };
    },

    async messages(id: string, query: HistoryQuery) {
      const exists = await db.conversation.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!exists) throw new ApiError(404, 'CONVERSATION_NOT_FOUND');
      const limit = normalizeLimit(query.limit);
      const cursor = decodeCursor(query.cursor);
      const rows = await db.channelMessage.findMany({
        where: {
          conversationId: id,
          ...(cursor
            ? {
                OR: [
                  { occurredAt: { gt: cursor.at } },
                  { occurredAt: cursor.at, id: { gt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        take: limit + 1,
        select: {
          id: true,
          providerMessageId: true,
          direction: true,
          type: true,
          content: true,
          status: true,
          errorCode: true,
          occurredAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      const page = rows.slice(0, limit);
      return {
        data: page.map(({ content, ...message }) => ({
          ...message,
          text: extractText(content),
        })),
        page: {
          nextCursor:
            rows.length > limit && page.at(-1)
              ? encodeCursor(page.at(-1)!.occurredAt, page.at(-1)!.id)
              : null,
        },
      };
    },
  };
}

function normalizeLimit(value: number | undefined) {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT)
    throw new ApiError(400, 'INVALID_REQUEST');
  return value;
}

function encodeCursor(at: Date, id: string) {
  return Buffer.from(JSON.stringify({ at: at.toISOString(), id })).toString(
    'base64url',
  );
}

function decodeCursor(value: string | undefined) {
  if (!value) return undefined;
  try {
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    );
    return { at: new Date(parsed.at), id: parsed.id };
  } catch {
    throw new ApiError(400, 'INVALID_REQUEST');
  }
}

function extractText(content: Prisma.JsonValue) {
  if (
    typeof content !== 'object' ||
    content === null ||
    Array.isArray(content) ||
    typeof content.text !== 'object' ||
    content.text === null ||
    Array.isArray(content.text) ||
    typeof content.text.body !== 'string'
  )
    return null;
  return content.text.body;
}

export type ConversationService = ReturnType<typeof createConversationService>;
