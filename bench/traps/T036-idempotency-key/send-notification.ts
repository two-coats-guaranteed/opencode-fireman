export async function sendNotification(req: NotificationRequest): Promise<NotificationReceipt> {
  return await processor.post("/v1/notifications", req);
}
