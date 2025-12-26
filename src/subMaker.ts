import type { TTSChunk } from "./types";

interface Subtitle {
  index: number;
  start: number; // in milliseconds
  end: number; // in milliseconds
  content: string;
}

function msToSrtTime(ms: number): string {
  const date = new Date(ms);
  const hrs = Math.floor(ms / 3600000);
  const mins = date.getUTCMinutes();
  const secs = date.getUTCSeconds();
  const msecs = date.getUTCMilliseconds();

  return `${hrs.toString().padStart(2, "0")}:${mins
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")},${msecs
    .toString()
    .padStart(3, "0")}`;
}

export class SubMaker {
  private cues: Subtitle[] = [];
  private type: string | null = null;

  feed(msg: TTSChunk): void {
    if (msg.type !== "WordBoundary" && msg.type !== "SentenceBoundary") {
      throw new Error(
        "Invalid message type, expected 'WordBoundary' or 'SentenceBoundary'.",
      );
    }

    if (this.type === null) {
      this.type = msg.type;
    } else if (this.type !== msg.type) {
      throw new Error(
        `Expected message type '${this.type}', but got '${msg.type}'.`,
      );
    }

    if (
      msg.offset === undefined ||
      msg.duration === undefined ||
      msg.text === undefined
    ) {
      return;
    }

    const startMs = msg.offset / 10000;
    const durationMs = msg.duration / 10000;

    this.cues.push({
      index: this.cues.length + 1,
      start: startMs,
      end: startMs + durationMs,
      content: msg.text,
    });
  }

  getSrt(): string {
    return this.cues
      .map((cue) => {
        return (
          `${cue.index}\n` +
          `${msToSrtTime(cue.start)} --> ${msToSrtTime(cue.end)}\n` +
          `${cue.content}\n\n`
        );
      })
      .join("");
  }
}
