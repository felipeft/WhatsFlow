import type { MetaConfig } from '@/integrations/meta/config.js';

export const metaConfig: MetaConfig = {
  appSecret: 'synthetic-app-secret-for-local-tests',
  verifyToken: 'synthetic-verify-token-for-local-tests',
  accessToken: 'synthetic-access-token-never-use',
  phoneNumberId: '100001',
  wabaId: '200001',
  apiBaseUrl: 'https://graph.facebook.com',
  apiVersion: 'v25.0',
  requestTimeoutMs: 100,
  pollMs: 100,
};

export function payload(
  value: Record<string, unknown>,
  phoneNumberId = metaConfig.phoneNumberId,
) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: metaConfig.wabaId,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: phoneNumberId },
              ...value,
            },
          },
        ],
      },
    ],
  };
}

export const incoming = {
  id: 'wamid.synthetic-inbound',
  from: '5500000000000',
  timestamp: '1790726400',
  type: 'text',
  text: { body: 'mensagem sintética privada' },
};
