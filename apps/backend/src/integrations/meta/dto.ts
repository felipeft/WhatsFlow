import { z } from 'zod';

const identifier = z.string().min(1).max(256);
const timestamp = z
  .string()
  .regex(/^\d{1,11}$/)
  .refine((value) => Number(value) <= 253402300799);
export const incomingMessageSchema = z
  .looseObject({
    id: identifier,
    from: z.string().regex(/^\d{5,20}$/),
    timestamp,
    type: z.string().min(1).max(80),
    text: z.object({ body: z.string().max(65536) }).optional(),
  })
  .refine((message) => message.type !== 'text' || message.text !== undefined);

export const deliverySchema = z.looseObject({
  id: identifier,
  recipient_id: z.string().regex(/^\d{5,20}$/),
  timestamp,
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
  biz_opaque_callback_data: z.string().max(512).optional(),
  errors: z
    .array(z.looseObject({ code: z.number().int() }))
    .max(100)
    .optional(),
});

const messageValue = z.looseObject({
  messaging_product: z.literal('whatsapp'),
  metadata: z.looseObject({ phone_number_id: z.string().regex(/^\d+$/) }),
  messages: z.array(incomingMessageSchema).max(1000).optional(),
  statuses: z.array(deliverySchema).max(1000).optional(),
});

export const webhookSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z
    .array(
      z.object({
        id: z.string().regex(/^\d+$/),
        changes: z
          .array(z.object({ field: z.string(), value: z.unknown() }))
          .max(1000),
      }),
    )
    .min(1)
    .max(100),
});

export function parseWebhook(input: unknown) {
  const envelope = webhookSchema.parse(input);
  return envelope.entry.flatMap((entry) =>
    entry.changes.flatMap((change) => {
      if (change.field !== 'messages') return [];
      return [{ wabaId: entry.id, ...messageValue.parse(change.value) }];
    }),
  );
}

export const outboundSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('text'),
      text: z.object({ body: z.string().trim().min(1).max(4096) }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('template'),
      template: z
        .object({
          name: z.string().regex(/^[a-z0-9_]{1,512}$/),
          language: z
            .object({ code: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/) })
            .strict(),
        })
        .strict(),
    })
    .strict(),
]);

export const enqueueSchema = z
  .object({
    requestId: z.uuid(),
    to: z.string().regex(/^[1-9]\d{6,14}$/),
    message: outboundSchema,
  })
  .strict();

export type OutboundContent = z.infer<typeof outboundSchema>;
export type EnqueueInput = z.infer<typeof enqueueSchema>;
export type WebhookChanges = ReturnType<typeof parseWebhook>;

// Falha é terminal acima de sent, mas não regride evidência de entrega/leitura.
export const deliveryRank = {
  sent: 20,
  failed: 30,
  delivered: 40,
  read: 50,
} as const;
