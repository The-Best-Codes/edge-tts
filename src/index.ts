import * as fs from "fs";
import * as path from "path";
import { Communicate } from "./communicate";
import { DRM } from "./drm";
import { SubMaker } from "./subMaker";
import { TTSConfig } from "./ttsConfig";
import type { TTSChunk } from "./types";
import * as utils from "./utils";
import { VoicesManager, listVoices } from "./voices";

export const Experimental_Raw = {
  Communicate,
  SubMaker,
  VoicesManager,
  listVoices,
  DRM,
  TTSConfig,
  utils,
};

/**
 * Options for generating speech.
 */
export interface GenerateSpeechOptions {
  /** The text to convert to speech */
  text: string;
  /** Voice to use for synthesis (default: "en-US-EmmaMultilingualNeural") */
  voice?: string;
  /** Speaking rate in percentage, e.g., "+10%" or "-20%" (default: "+0%") */
  rate?: string;
  /** Volume in percentage, e.g., "+50%" or "-10%" (default: "+0%") */
  volume?: string;
  /** Pitch in hertz, e.g., "+10Hz" or "-5Hz" (default: "+0Hz") */
  pitch?: string;
  /** Boundary type for metadata: "WordBoundary" or "SentenceBoundary" (default: "SentenceBoundary") */
  boundary?: "WordBoundary" | "SentenceBoundary";
  /** Proxy URL for the WebSocket connection */
  proxy?: string;
  /** Connection timeout in seconds (default: 10) */
  connectTimeoutSeconds?: number;
  /** Receive timeout in seconds (default: 60) */
  receiveTimeoutSeconds?: number;
}

/**
 * Options for generating speech and writing to a file.
 */
export interface GenerateSpeechToFileOptions extends GenerateSpeechOptions {
  /** Output file path for the generated audio */
  outputPath: string;
}

/**
 * Options for generating speech with subtitles.
 */
export interface GenerateSpeechWithSubtitlesOptions extends GenerateSpeechOptions {
  /** Output file path for the generated subtitles (SRT format) */
  subtitlePath: string;
}

/**
 * Generate speech audio from text.
 * @param options - Configuration options for speech synthesis
 * @returns Promise resolving to the audio buffer
 */
export async function generateSpeech(
  options: GenerateSpeechOptions,
): Promise<Buffer> {
  const {
    text,
    voice = "en-US-EmmaMultilingualNeural",
    rate = "+0%",
    volume = "+0%",
    pitch = "+0Hz",
    boundary = "SentenceBoundary",
    proxy,
    connectTimeoutSeconds,
    receiveTimeoutSeconds,
  } = options;

  const communicate = new Communicate(text, voice, {
    rate,
    volume,
    pitch,
    boundary,
    proxy,
    connectTimeoutSeconds,
    receiveTimeoutSeconds,
  });

  const audioChunks: Buffer[] = [];

  for await (const chunk of communicate.stream()) {
    if (chunk.type === "audio" && chunk.data) {
      audioChunks.push(chunk.data);
    }
  }

  return Buffer.concat(audioChunks);
}

/**
 * Generate speech from text and save it to a file.
 * @param options - Configuration options including the output file path
 * @returns Promise that resolves when the file is written
 */
export async function generateSpeechToFile(
  options: GenerateSpeechToFileOptions,
): Promise<void> {
  const { outputPath, ...generateOptions } = options;

  const audioBuffer = await generateSpeech(generateOptions);

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, audioBuffer);
}

/**
 * Generate speech audio with generated subtitles.
 * @param options - Configuration options including the subtitle file path
 * @returns Promise resolving to the audio buffer and subtitles string
 */
export async function generateSpeechWithSubtitlesToFile(
  options: GenerateSpeechWithSubtitlesOptions,
): Promise<{ audio: Buffer; subtitles: string }> {
  const {
    text,
    voice = "en-US-EmmaMultilingualNeural",
    rate = "+0%",
    volume = "+0%",
    pitch = "+0Hz",
    boundary = "WordBoundary",
    proxy,
    connectTimeoutSeconds,
    receiveTimeoutSeconds,
    subtitlePath,
  } = options;

  const communicate = new Communicate(text, voice, {
    rate,
    volume,
    pitch,
    boundary,
    proxy,
    connectTimeoutSeconds,
    receiveTimeoutSeconds,
  });

  const subMaker = new SubMaker();
  const audioChunks: Buffer[] = [];

  for await (const chunk of communicate.stream()) {
    if (chunk.type === "audio" && chunk.data) {
      audioChunks.push(chunk.data);
    } else if (
      chunk.type === "WordBoundary" ||
      chunk.type === "SentenceBoundary"
    ) {
      subMaker.feed(chunk);
    }
  }

  const audio = Buffer.concat(audioChunks);
  const subtitles = subMaker.getSrt();

  const dir = path.dirname(subtitlePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(subtitlePath, subtitles);

  return { audio, subtitles };
}

/**
 * Get the list of available voices from the Edge TTS service.
 * @param proxy - Optional proxy URL for the HTTP request
 * @returns Promise resolving to an array of voice objects
 */
export async function getVoices(proxy?: string) {
  return listVoices(proxy);
}

/**
 * Find voices matching specific criteria.
 * @param options - Filter options for finding voices
 * @param proxy - Optional proxy URL for the HTTP request
 * @returns Promise resolving to an array of matching voice objects
 */
export async function findVoices(
  options: {
    Gender?: "Female" | "Male";
    Locale?: string;
    Language?: string;
    ShortName?: string;
  },
  proxy?: string,
) {
  const manager = await VoicesManager.create(
    proxy ? await listVoices(proxy) : undefined,
  );
  return manager.find(options);
}

/**
 * Stream speech audio in real-time from text.
 * @param options - Configuration options for speech synthesis
 * @returns AsyncGenerator yielding audio and metadata chunks as they arrive
 */
export async function* streamSpeech(
  options: GenerateSpeechOptions,
): AsyncGenerator<TTSChunk> {
  const {
    text,
    voice = "en-US-EmmaMultilingualNeural",
    rate = "+0%",
    volume = "+0%",
    pitch = "+0Hz",
    boundary = "SentenceBoundary",
    proxy,
    connectTimeoutSeconds,
    receiveTimeoutSeconds,
  } = options;

  const communicate = new Communicate(text, voice, {
    rate,
    volume,
    pitch,
    boundary,
    proxy,
    connectTimeoutSeconds,
    receiveTimeoutSeconds,
  });

  for await (const chunk of communicate.stream()) {
    yield chunk;
  }
}

/**
 * Stream speech audio with subtitles in real-time.
 * @param options - Configuration options including the subtitle file path
 * @returns AsyncGenerator yielding audio chunks and subtitle data as they arrive
 */
export async function* streamSpeechWithSubtitlesToFile(
  options: GenerateSpeechWithSubtitlesOptions,
): AsyncGenerator<TTSChunk & { subtitles?: string }> {
  const {
    text,
    voice = "en-US-EmmaMultilingualNeural",
    rate = "+0%",
    volume = "+0%",
    pitch = "+0Hz",
    boundary = "WordBoundary",
    proxy,
    connectTimeoutSeconds,
    receiveTimeoutSeconds,
    subtitlePath,
  } = options;

  const communicate = new Communicate(text, voice, {
    rate,
    volume,
    pitch,
    boundary,
    proxy,
    connectTimeoutSeconds,
    receiveTimeoutSeconds,
  });

  const subMaker = new SubMaker();

  // Create subtitle file directory
  const dir = path.dirname(subtitlePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  for await (const chunk of communicate.stream()) {
    if (chunk.type === "audio" && chunk.data) {
      yield chunk;
    } else if (
      chunk.type === "WordBoundary" ||
      chunk.type === "SentenceBoundary"
    ) {
      subMaker.feed(chunk);
      // Write subtitles incrementally as boundaries are received
      const subtitles = subMaker.getSrt();
      fs.writeFileSync(subtitlePath, subtitles);
      yield { ...chunk, subtitles };
    }
  }
}

/**
 * Stream speech audio directly to a file in real-time.
 * @param options - Configuration options including the output file path
 * @returns AsyncGenerator yielding progress information as chunks are written
 */
export async function* streamSpeechToFile(
  options: GenerateSpeechToFileOptions,
): AsyncGenerator<{ bytesWritten: number; chunkSize: number }> {
  const { outputPath, ...streamOptions } = options;

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const fileStream = fs.createWriteStream(outputPath);
  let totalBytesWritten = 0;

  try {
    for await (const chunk of streamSpeech(streamOptions)) {
      if (chunk.type === "audio" && chunk.data) {
        fileStream.write(chunk.data);
        totalBytesWritten += chunk.data.length;
        yield {
          bytesWritten: totalBytesWritten,
          chunkSize: chunk.data.length,
        };
      }
    }
  } finally {
    fileStream.end();
  }
}
