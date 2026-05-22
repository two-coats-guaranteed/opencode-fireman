export async function emitWebhook(req: WebhookRequest): Promise<WebhookReceipt> {
  return await processor.post("/v1/webhooks", req);
}
