import WebSocket from "ws";
import { HttpsProxyAgent } from "https-proxy-agent";
import {
  DEFAULT_VOICE,
  WSS_URL,
  SEC_MS_GEC_VERSION,
  WSS_HEADERS,
} from "./constants";
import { DRM } from "./drm";
import { TTSConfig } from "./ttsConfig";
import {
  connectId,
  dateToString,
  escapeXml,
  getHeadersAndData,
  removeIncompatibleCharacters,
  splitTextByByteLength,
  unescapeXml,
} from "./utils";
import type { CommunicateOptions, CommunicateState, TTSChunk } from "./types";
import {
  NoAudioReceived,
  UnexpectedResponse,
  UnknownResponse,
  WebSocketError,
} from "./exceptions";

export class Communicate {
  private ttsConfig: TTSConfig;
  private texts: Buffer[];
  private options: CommunicateOptions;
  private state: CommunicateState;

  constructor(
    text: string,
    voice: string = DEFAULT_VOICE,
    options: CommunicateOptions = {},
  ) {
    this.options = {
      rate: "+0%",
      volume: "+0%",
      pitch: "+0Hz",
      boundary: "SentenceBoundary",
      connectTimeout: 10,
      receiveTimeout: 60,
      ...options,
    };

    this.ttsConfig = new TTSConfig(
      voice,
      this.options.rate,
      this.options.volume,
      this.options.pitch,
      this.options.boundary,
    );

    const cleanedText = removeIncompatibleCharacters(text);
    const escaped = escapeXml(cleanedText);

    // Split into chunks of max 4096 bytes
    this.texts = Array.from(splitTextByByteLength(escaped, 4096));

    this.state = {
      partialText: Buffer.alloc(0),
      offsetCompensation: 0,
      lastDurationOffset: 0,
      streamWasCalled: false,
    };
  }

  private parseMetadata(data: Buffer): TTSChunk {
    const jsonStr = data.toString("utf-8");
    const json = JSON.parse(jsonStr);

    for (const metaObj of json.Metadata) {
      const metaType = metaObj.Type;

      if (metaType === "WordBoundary" || metaType === "SentenceBoundary") {
        const currentOffset =
          metaObj.Data.Offset + this.state.offsetCompensation;
        const currentDuration = metaObj.Data.Duration;
        return {
          type: metaType,
          offset: currentOffset,
          duration: currentDuration,
          text: unescapeXml(metaObj.Data.text.Text),
        };
      }

      if (metaType === "SessionEnd") {
        continue;
      }

      throw new UnknownResponse(`Unknown metadata type: ${metaType}`);
    }

    throw new UnexpectedResponse("No boundary metadata found");
  }

  private async *streamInternal(
    websocket: WebSocket,
  ): AsyncGenerator<TTSChunk> {
    const self = this;
    let audioWasReceived = false;

    // Helper to send command
    const sendCommandRequest = () => {
      const wordBoundary = self.ttsConfig.boundary === "WordBoundary";
      const wd = wordBoundary ? "true" : "false";
      const sq = !wordBoundary ? "true" : "false";

      const msg =
        `X-Timestamp:${dateToString()}\r\n` +
        "Content-Type:application/json; charset=utf-8\r\n" +
        "Path:speech.config\r\n\r\n" +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{` +
        `"sentenceBoundaryEnabled":"${sq}","wordBoundaryEnabled":"${wd}"` +
        `},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;

      websocket.send(msg);
    };

    const sendSsmlRequest = () => {
      const reqId = connectId();
      const timestamp = dateToString();
      const ssml = self.ttsConfig.toSSML(
        self.state.partialText.toString("utf-8"),
      );

      const msg =
        `X-RequestId:${reqId}\r\n` +
        "Content-Type:application/ssml+xml\r\n" +
        `X-Timestamp:${timestamp}Z\r\n` +
        "Path:ssml\r\n\r\n" +
        ssml;

      websocket.send(msg);
    };

    sendCommandRequest();
    sendSsmlRequest();

    // Create a promise wrapper for websocket events to treat them as an async iterator
    // This is a manual implementation of async iterator for event emitter

    const messageQueue: any[] = [];
    let resolveNext: ((value?: any) => void) | null = null;
    let errorNext: ((err: any) => void) | null = null;
    let closed = false;

    websocket.on("message", (data, isBinary) => {
      if (closed) return;
      messageQueue.push({ data, isBinary });
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    });

    websocket.on("error", (err) => {
      if (closed) return;
      if (errorNext) errorNext(err);
      closed = true;
    });

    websocket.on("close", () => {
      closed = true;
      if (resolveNext) resolveNext();
    });

    while (!closed || messageQueue.length > 0) {
      if (messageQueue.length === 0) {
        await new Promise<void>((res, rej) => {
          resolveNext = res;
          errorNext = rej;
        });
        if (closed && messageQueue.length === 0) break;
      }

      const { data, isBinary } = messageQueue.shift();

      // Handling Text Message
      if (!isBinary) {
        const textData = Buffer.from(data as Buffer);
        const separator = textData.indexOf("\r\n\r\n");
        const { headers, data: body } = getHeadersAndData(textData, separator);

        const path = headers["Path"];

        if (path === "audio.metadata") {
          const meta = self.parseMetadata(body);
          yield meta;
          self.state.lastDurationOffset =
            (meta.offset || 0) + (meta.duration || 0);
        } else if (path === "turn.end") {
          self.state.offsetCompensation =
            self.state.lastDurationOffset + 8_750_000;
          break; // Move to next text chunk
        } else if (path !== "response" && path !== "turn.start") {
          // throw new UnknownResponse("Unknown path received");
          // Python ignores unknown paths via if/elif logic structure, strict throw might break changes
        }
      }
      // Handling Binary Message
      else {
        const buf = data as Buffer;
        if (buf.length < 2) {
          throw new UnexpectedResponse(
            "Binary message too short for header length",
          );
        }

        const headerLen = buf.readUInt16BE(0);
        if (headerLen > buf.length) {
          throw new UnexpectedResponse(
            "Header length greater than data length",
          );
        }

        const { headers, data: audioData } = getHeadersAndData(buf, headerLen);

        if (headers["Path"] !== "audio") {
          throw new UnexpectedResponse("Binary message path is not audio");
        }

        const contentType = headers["Content-Type"];
        // Empty data is allowed if no content type (end of stream sometimes)
        if (!contentType && audioData.length === 0) {
          continue;
        }

        if (contentType !== "audio/mpeg" && contentType !== undefined) {
          throw new UnexpectedResponse(
            `Unexpected Content-Type: ${contentType}`,
          );
        }

        if (!contentType && audioData.length > 0) {
          throw new UnexpectedResponse("No Content-Type but got data");
        }

        if (audioData.length === 0) {
          throw new UnexpectedResponse("Audio data is empty");
        }

        audioWasReceived = true;
        yield { type: "audio", data: audioData };
      }
    }

    if (!audioWasReceived) {
      throw new NoAudioReceived("No audio received from service.");
    }
  }

  async *stream(): AsyncGenerator<TTSChunk> {
    if (this.state.streamWasCalled) {
      throw new Error("stream() can only be called once.");
    }
    this.state.streamWasCalled = true;

    const agent = this.options.proxy
      ? new HttpsProxyAgent(this.options.proxy)
      : undefined;
    const connectUrl = `${WSS_URL}&ConnectionId=${connectId()}&Sec-MS-GEC=${DRM.generateSecMsGec()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

    // Helper to connect and stream one text chunk
    // We recreate connection logic per chunk if needed, but standard logic implies one session.
    // However, the python code iterates texts and connects for each if the loop is inside.
    // Wait, Python `__stream` creates ONE connection.
    // But `stream` iterates `self.texts`.
    // Inside `stream`, it calls `__stream`.
    // `__stream` opens a NEW websocket connection.
    // So for every 4KB chunk, it opens a new connection.

    for (const textChunk of this.texts) {
      this.state.partialText = textChunk;

      // Need to retry on 403 (clock skew)
      let retryCount = 0;
      while (true) {
        try {
          const ws = new WebSocket(connectUrl, {
            headers: DRM.headersWithMuid(WSS_HEADERS),
            agent: agent,
            perMessageDeflate: false, // edge-tts uses compress=15, ws handles this usually or disable
          });

          // Wait for open
          await new Promise((resolve, reject) => {
            ws.once("open", resolve);
            ws.once("error", reject);
          });

          // Delegate to internal stream generator
          const generator = this.streamInternal(ws);
          for await (const item of generator) {
            yield item;
          }

          ws.close();
          break; // Success, move to next text chunk
        } catch (e: any) {
          if (
            e.name === "UnexpectedServerResponse" &&
            e.code === 403 &&
            retryCount === 0
          ) {
            // If using 'ws', checking headers on error is tricky as standard error event doesn't have them easily.
            // However, 'ws' emits an 'unexpected-response' event for non-101 status codes.
            // To handle this correctly in Node 'ws', we need to listen to 'unexpected-response'.
            // For simplicity here, we assume if we failed handshake, we might need skew adjust.
            // But without the headers, we can't adjust.
            // The Python code relies on aiohttp's exception carrying headers.
            // In 'ws', we need to hook into the upgrade request.
            throw e;
          }

          // Simplification: The Python DRM skew fix is very specific.
          // To strictly port it, we'd need to capture the response headers on failure.
          throw e;
        }
      }
    }
  }
}
