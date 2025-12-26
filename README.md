# @bestcodes/edge-tts

A TypeScript port of [edge-tts](https://github.com/rany2/edge-tts/). Small, fast, and easy text-to-speech using Microsoft Edge's online service.

- Tiny bundle size (< 50kb)
- No API keys required
- Stream audio or save to file
- Generate SRT subtitles
- Access to all available Edge voices

## Installation

```bash
npm install @bestcodes/edge-tts
# or
bun add @bestcodes/edge-tts
```

## Quick Start

### Get audio buffer

```ts
import { generateSpeech } from "@bestcodes/edge-tts";

const audio = await generateSpeech({
  text: "Hello, world!",
  voice: "en-US-EmmaMultilingualNeural",
});

// Do something with the audio buffer
```

### Save to file

```ts
import { generateSpeechToFile } from "@bestcodes/edge-tts";

await generateSpeechToFile({
  text: "Hello, world!",
  outputPath: "./output.mp3",
});
```

### With subtitles

```ts
import { generateSpeechWithSubtitlesToFile } from "@bestcodes/edge-tts";

const { audio, subtitles } = await generateSpeechWithSubtitlesToFile({
  text: "This text will have subtitles.",
  subtitlePath: "./subtitles.srt",
});
```

## Real-time Streaming

### Stream audio chunks

```ts
import { streamSpeech } from "@bestcodes/edge-tts";

for await (const chunk of streamSpeech({
  text: "Hello, world!",
  voice: "en-US-EmmaMultilingualNeural",
})) {
  if (chunk.type === "audio" && chunk.data) {
    // Process audio chunk in real-time
    console.log(`Received ${chunk.data.length} bytes`);
  }
}
```

### Stream directly to file with progress

```ts
import { streamSpeechToFile } from "@bestcodes/edge-tts";

for await (const progress of streamSpeechToFile({
  text: "Hello, world!",
  outputPath: "./output.mp3",
})) {
  console.log(
    `Written: ${progress.bytesWritten} bytes (chunk: ${progress.chunkSize})`,
  );
}
```

### Stream with subtitles (real-time updates)

```ts
import { streamSpeechWithSubtitlesToFile } from "@bestcodes/edge-tts";

for await (const chunk of streamSpeechWithSubtitlesToFile({
  text: "This text will have subtitles.",
  subtitlePath: "./subtitles.srt",
})) {
  if (chunk.type === "audio" && chunk.data) {
    // Process audio chunk
  } else if (chunk.subtitles) {
    // Subtitles file updated in real-time
    console.log("Subtitles updated:", chunk.subtitles);
  }
}
```

## Options

```ts
{
  text: string;                    // Required: text to convert
  voice?: string;                  // Default: "en-US-EmmaMultilingualNeural"
  rate?: string;                   // e.g. "+10%" or "-20%" (default: "+0%")
  volume?: string;                 // e.g. "+50%" or "-10%" (default: "+0%")
  pitch?: string;                  // e.g. "+10Hz" or "-5Hz" (default: "+0Hz")
  boundary?: "WordBoundary" | "SentenceBoundary";
  proxy?: string;                  // Optional proxy URL
  connectTimeoutSeconds?: number;  // Default: 10
  receiveTimeoutSeconds?: number;  // Default: 60
  outputPath?: string;             // For generateSpeechToFile/streamSpeechToFile
  subtitlePath?: string;           // For generateSpeechWithSubtitlesToFile/streamSpeechWithSubtitlesToFile
}
```

## List voices

```ts
import { getVoices, findVoices } from "@bestcodes/edge-tts";

// Get all voices
const allVoices = await getVoices();

// Find specific voices
const femaleVoices = await findVoices({ Gender: "Female" });
const englishVoices = await findVoices({ Locale: "en-US" });
```

## Low-level API

```ts
import { Experimental_Raw } from "@bestcodes/edge-tts";

const communicate = new Experimental_Raw.Communicate(
  "Hello!",
  "en-US-EmmaMultilingualNeural",
);

for await (const chunk of communicate.stream()) {
  if (chunk.type === "audio") {
    // Process audio data (chunk.data is a Buffer)
  } else if (chunk.type === "WordBoundary") {
    // Word boundary metadata
  }
}
```

## License

MIT
