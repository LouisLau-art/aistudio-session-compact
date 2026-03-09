import type { SessionTurn } from "../types.js";

export interface TailSelectionOptions {
  tailCharsBudget: number;
  minTailTurns: number;
  maxTailTurns: number;
}

export function selectPreservedTail(turns: SessionTurn[], options: TailSelectionOptions): SessionTurn[] {
  if (!turns.length || options.maxTailTurns <= 0) {
    return [];
  }

  const selected: SessionTurn[] = [];
  let usedChars = 0;

  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!turn) continue;

    const wouldExceedBudget = usedChars + turn.text.length > options.tailCharsBudget;
    if (selected.length >= options.minTailTurns || selected.length > 0) {
      if (wouldExceedBudget && selected.length >= options.minTailTurns) {
        break;
      }
    }

    selected.push(turn);
    usedChars += turn.text.length;

    if (selected.length >= options.maxTailTurns) {
      break;
    }
  }

  while (selected.length < options.minTailTurns && selected.length < options.maxTailTurns) {
    const nextIndex = turns.length - selected.length - 1;
    const turn = turns[nextIndex];
    if (!turn) break;
    selected.push(turn);
  }

  return selected.reverse();
}
