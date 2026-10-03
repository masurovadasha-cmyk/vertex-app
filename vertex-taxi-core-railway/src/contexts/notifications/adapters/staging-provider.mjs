export const stagingNotificationProvider={
  async deliver(row){
    return {provider:"outbox",providerMessageId:`staging-${row.id}`};
  }
};
