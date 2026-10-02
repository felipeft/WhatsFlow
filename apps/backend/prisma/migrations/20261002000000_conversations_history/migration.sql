CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "phoneNumberId" TEXT NOT NULL,
    "externalContactId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ChannelMessage"
    ADD COLUMN "conversationId" UUID,
    ADD COLUMN "occurredAt" TIMESTAMP(3);

-- Preserva e agrupa as mensagens reais da Fase 4 pela identidade do canal.
INSERT INTO "Conversation" (
    "id", "channel", "phoneNumberId", "externalContactId",
    "lastMessageAt", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid(),
    'whatsapp',
    "phoneNumberId",
    "peer",
    MAX(COALESCE("providerTimestamp", "createdAt")),
    MIN("createdAt"),
    MAX("updatedAt")
FROM "ChannelMessage"
GROUP BY "phoneNumberId", "peer";

UPDATE "ChannelMessage" AS message
SET
    "conversationId" = conversation."id",
    "occurredAt" = COALESCE(message."providerTimestamp", message."createdAt")
FROM "Conversation" AS conversation
WHERE conversation."channel" = 'whatsapp'
  AND conversation."phoneNumberId" = message."phoneNumberId"
  AND conversation."externalContactId" = message."peer";

ALTER TABLE "ChannelMessage"
    ALTER COLUMN "conversationId" SET NOT NULL,
    ALTER COLUMN "occurredAt" SET NOT NULL;

CREATE UNIQUE INDEX "Conversation_channel_phoneNumberId_externalContactId_key"
    ON "Conversation"("channel", "phoneNumberId", "externalContactId");
CREATE INDEX "Conversation_lastMessageAt_id_idx"
    ON "Conversation"("lastMessageAt", "id");
CREATE INDEX "ChannelMessage_conversationId_occurredAt_id_idx"
    ON "ChannelMessage"("conversationId", "occurredAt", "id");

ALTER TABLE "ChannelMessage"
    ADD CONSTRAINT "ChannelMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
