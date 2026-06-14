import { Instance, InstanceCallback } from "./instance";

class InstanceCreationQueue {
  private callbacks = new Map<string, InstanceCallback[]>();

  public request(clientId: string, next: InstanceCallback): boolean {
    const pending = this.callbacks.get(clientId);
    if (pending) {
      pending.push(next);
      return false;
    }
    this.callbacks.set(clientId, [next]);
    return true;
  }

  public has(clientId: string): boolean {
    return this.callbacks.has(clientId);
  }

  public complete(instance: Instance) {
    const callbacks = this.callbacks.get(instance.clientId) || [];
    this.callbacks.delete(instance.clientId);
    callbacks.forEach((callback) => callback(instance));
  }
}

export { InstanceCreationQueue };
