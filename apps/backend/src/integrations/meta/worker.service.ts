import type { Logger } from 'pino';
import { MetaApiError, type MetaSender } from './client.js';
import type { MetaStore } from './store.js';

export function createMetaWorker(
  store: MetaStore,
  sender: MetaSender,
  phoneNumberId: string,
  logger: Logger,
) {
  return {
    async tick() {
      const inbox = await store.claimInbox();
      if (inbox) {
        try {
          await store.processInbox(inbox);
        } catch {
          logger.error(
            { event: 'meta_inbox_failed', inboxId: inbox.id },
            'Falha ao processar evento',
          );
          await store.failInbox(inbox);
        }
      }
      const outbox = await store.claimOutbox(phoneNumberId);
      if (outbox) {
        try {
          const message = await store.outgoing(outbox);
          if (message) await store.accepted(outbox, await sender.send(message));
        } catch (error) {
          // Inclui falha de persistência após HTTP: preservar incerteza, sem repetir envio.
          logger.error(
            { event: 'meta_outbox_failed', jobId: outbox.id },
            'Falha no processamento de envio',
          );
          await store.failed(
            outbox,
            error instanceof MetaApiError
              ? error
              : new MetaApiError('uncertain'),
          );
        }
      }
      return Boolean(inbox || outbox);
    },
  };
}
