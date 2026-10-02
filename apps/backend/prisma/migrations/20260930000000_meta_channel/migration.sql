CREATE TABLE "MetaInbox" (
    "id" UUID NOT NULL,
    "digest" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "MetaInbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChannelMessage" (
    "id" UUID NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "direction" TEXT NOT NULL,
    "peer" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "statusRank" INTEGER NOT NULL DEFAULT 0,
    "errorCode" INTEGER,
    "providerTimestamp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChannelMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MetaOutbox" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MetaOutbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MetaDelivery" (
    "id" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "peer" TEXT NOT NULL,
    "callbackId" TEXT,
    "status" TEXT NOT NULL,
    "errorCode" INTEGER,
    "providerTimestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MetaDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MetaInbox_digest_key" ON "MetaInbox"("digest");
CREATE INDEX "MetaInbox_state_availableAt_idx" ON "MetaInbox"("state", "availableAt");
CREATE INDEX "ChannelMessage_phoneNumberId_peer_createdAt_idx" ON "ChannelMessage"("phoneNumberId", "peer", "createdAt");
CREATE UNIQUE INDEX "ChannelMessage_phoneNumberId_providerMessageId_key" ON "ChannelMessage"("phoneNumberId", "providerMessageId");
CREATE UNIQUE INDEX "MetaOutbox_messageId_key" ON "MetaOutbox"("messageId");
CREATE INDEX "MetaOutbox_state_availableAt_idx" ON "MetaOutbox"("state", "availableAt");
CREATE INDEX "MetaDelivery_phoneNumberId_providerMessageId_idx" ON "MetaDelivery"("phoneNumberId", "providerMessageId");
CREATE INDEX "MetaDelivery_callbackId_idx" ON "MetaDelivery"("callbackId");
ALTER TABLE "MetaOutbox" ADD CONSTRAINT "MetaOutbox_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChannelMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
