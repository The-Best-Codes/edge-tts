export type AudioOutputFormat =
  | "audio-24khz-48kbitrate-mono-mp3"
  | "webm-24khz-16bit-mono-opus";

export type ChunkType = "audio" | "WordBoundary" | "SentenceBoundary";

export interface TTSChunk {
  type: ChunkType;
  data?: Buffer; // Only for audio
  duration?: number; // Only for Boundaries
  offset?: number; // Only for Boundaries
  text?: string; // Only for Boundaries
}

export interface VoiceTag {
  ContentCategories: string[];
  VoicePersonalities: string[];
}

export interface Voice {
  Name: string;
  ShortName: string;
  Gender: "Female" | "Male";
  Locale: string;
  SuggestedCodec: string;
  FriendlyName: string;
  Status: "Deprecated" | "GA" | "Preview";
  VoiceTag: VoiceTag;
}

export interface VoicesManagerVoice extends Voice {
  Language: string;
}

export interface VoicesManagerFindOptions {
  Gender?: "Female" | "Male";
  Locale?: string;
  Language?: string;
  ShortName?: string;
}

export interface CommunicateState {
  partialText: Buffer;
  offsetCompensation: number;
  lastDurationOffset: number;
  streamWasCalled: boolean;
}

export interface CommunicateOptions {
  rate?: string;
  volume?: string;
  pitch?: string;
  boundary?: "WordBoundary" | "SentenceBoundary";
  proxy?: string;
  connectTimeout?: number; // seconds
  receiveTimeout?: number; // seconds
}
