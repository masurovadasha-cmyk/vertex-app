function scopedStore() {
  const map = new Map();
  return {
    async get(id) {
      const value = map.get(id);
      return value ? structuredClone(value) : null;
    },
    async put(value) {
      map.set(value.id, structuredClone(value));
      return structuredClone(value);
    },
    async list({ tenant_id, organization_id } = {}) {
      return [...map.values()]
        .filter((value) => !tenant_id || value.tenant_id === tenant_id)
        .filter((value) => !organization_id || value.organization_id === organization_id)
        .map((value) => structuredClone(value));
    }
  };
}

export function createMemoryRepository() {
  return {
    projects: scopedStore(),
    assets: scopedStore(),
    workOrders: scopedStore()
  };
}

export function createMemoryEventSink() {
  const events = [];
  return {
    async publish(event) {
      events.push(structuredClone(event));
    },
    list() {
      return structuredClone(events);
    }
  };
}
