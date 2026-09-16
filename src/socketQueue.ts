/** Preserve terminal input issued before the WebSocket's open event. */
export function createPreOpenMessageQueue<T>(deliver: (message: T) => void) {
  let open = false;
  const pending: T[] = [];
  return {
    send(message: T) {
      if (open) deliver(message);
      else pending.push(message);
    },
    /** Deliver the required session-start frame first, then queued user input. */
    open(startMessage: T) {
      if (open) return;
      deliver(startMessage);
      open = true;
      for (const message of pending.splice(0)) deliver(message);
    },
    clear() {
      pending.length = 0;
    },
  };
}
