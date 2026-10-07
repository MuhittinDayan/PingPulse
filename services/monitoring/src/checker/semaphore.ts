export class Semaphore {
  private active = 0;

  constructor(private readonly max: number) {}

  tryAcquire(): boolean {
    if (this.active >= this.max) {
      return false;
    }
    this.active++;
    return true;
  }

  release(): void {
    if (this.active === 0) {
      throw new Error('Semaphore released more times than acquired');
    }
    this.active--;
  }

  get inUse(): number {
    return this.active;
  }
}
