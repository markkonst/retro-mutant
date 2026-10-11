export class SimulationLoop {
  private running = false;
  private ticksPerSecond = 20;
  private lastTime: number | null = null;
  private accumulatorMs = 0;
  private animationFrameId: number | null = null;

  constructor(
    private readonly onTick: () => void,
    private readonly onRender: () => void,
  ) {}

  start(): void {
    if (this.animationFrameId !== null) return;
    this.animationFrameId = requestAnimationFrame((time) => this.frame(time));
  }

  setRunning(running: boolean): void {
    this.running = running;
    this.lastTime = null;
    this.accumulatorMs = 0;
  }

  isRunning(): boolean {
    return this.running;
  }

  setTicksPerSecond(value: number): void {
    this.ticksPerSecond = Math.max(1, Math.min(240, value));
    this.accumulatorMs = 0;
  }

  getTicksPerSecond(): number {
    return this.ticksPerSecond;
  }

  stepOnce(): void {
    this.onTick();
    this.onRender();
  }

  private frame(time: number): void {
    if (this.lastTime === null) this.lastTime = time;
    const elapsed = Math.min(250, Math.max(0, time - this.lastTime));
    this.lastTime = time;

    if (this.running) {
      this.accumulatorMs += elapsed;
      const stepMs = 1000 / this.ticksPerSecond;
      let guard = 0;
      while (this.accumulatorMs >= stepMs && guard < 20) {
        this.onTick();
        this.accumulatorMs -= stepMs;
        guard++;
      }
    }

    this.onRender();
    this.animationFrameId = requestAnimationFrame((nextTime) => this.frame(nextTime));
  }
}
