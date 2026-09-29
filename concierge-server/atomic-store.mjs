import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

/** Single-process serialized persistence. Uncommitted state is never visible to readers. */
export function createAtomicStore({initial, file, write = writeAtomically}) {
  let committed = structuredClone(initial);
  let queue = Promise.resolve();
  return Object.freeze({
    read: () => structuredClone(committed),
    transact(mutator) {
      // A rejected write must not poison subsequent transactions.
      const operation = queue.then(async () => {
        const draft = structuredClone(committed);
        const result = await mutator(draft);
        await write(file, JSON.stringify(draft));
        committed = draft;
        return result;
      });
      queue = operation.catch(() => {});
      return operation;
    }
  });
}

async function writeAtomically(file, json) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await fs.open(temporary, 'wx', 0o600);
    try { await handle.writeFile(json, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, {force:true}).catch(() => {});
    throw error;
  }
}
