/** Grille uniforme : chaque item est rangé dans la cellule de son point. */
export class SpatialGrid<T> {
  private readonly cols: number;
  private readonly rows: number;
  private readonly cells: T[][];

  constructor(width: number, height: number, private readonly cellSize: number) {
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
  }

  clear(): void {
    for (const c of this.cells) c.length = 0;
  }

  insert(x: number, y: number, item: T): void {
    this.cells[this.cellIndex(x, y)].push(item);
  }

  remove(x: number, y: number, item: T): void {
    const cell = this.cells[this.cellIndex(x, y)];
    const i = cell.indexOf(item);
    if (i >= 0) cell.splice(i, 1);
  }

  /** Items des cellules couvrant [x±r, y±r]. Le test précis de distance est à l'appelant. */
  query(x: number, y: number, r: number, fn: (item: T) => void): void {
    const c0 = this.col(x - r);
    const c1 = this.col(x + r);
    const r0 = this.row(y - r);
    const r1 = this.row(y + r);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        for (const it of this.cells[row * this.cols + col]) fn(it);
      }
    }
  }

  private col(x: number): number {
    return Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)));
  }

  private row(y: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellSize)));
  }

  private cellIndex(x: number, y: number): number {
    return this.row(y) * this.cols + this.col(x);
  }
}
