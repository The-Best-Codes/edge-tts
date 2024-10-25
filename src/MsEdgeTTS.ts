import axios from "axios";
import WebSocket from "isomorphic-ws";
import { Buffer } from "buffer/"; // slash is important for browser compatibility
import randomBytes from "randombytes";
import { OUTPUT_FORMAT } from "./OUTPUT_FORMAT";
import { Readable } from "stream";
import * as fs from "fs";
import { Agent } from "http";
import { PITCH } from "./PITCH";
import { RATE } from "./RATE";
import { VOLUME } from "./VOLUME";

declare var window: any;

export type Voice = {
  Name: string;
  ShortName: string;
  Gender: string;
  Locale: string;
  SuggestedCodec: string;
  FriendlyName: string;
  Status: string;
};

export class ProsodyOptions {
  /**
   * The pitch to use.
   * Can be any {@link PITCH}, or a relative frequency in Hz (+50Hz), a relative semitone (+2st), or a relative percentage (+50%).
   * [SSML documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice#:~:text=Optional-,pitch,-Indicates%20the%20baseline)
   */
  pitch?: PITCH | string = "+0Hz";
  /**
   * The rate to use.
   * Can be any {@link RATE}, or a relative number (0.5), or string with a relative percentage (+50%).
   * [SSML documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice#:~:text=Optional-,rate,-Indicates%20the%20speaking)
   */
  rate?: RATE | string | number = 1.0;
  /**
   * The volume to use.
   * Can be any {@link VOLUME}, or an absolute number (0, 100), a string with a relative number (+50), or a relative percentage (+50%).
   * [SSML documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice#:~:text=Optional-,volume,-Indicates%20the%20volume)
   */
  volume?: VOLUME | string | number = 100.0;
}

export class MetadataOptions {
  /**
   * (optional) any voice locale that is supported by the voice. See the list of all voices for compatibility. If not provided, the locale will be inferred from the `voiceName`.
   * Changing the voiceName will reset the voiceLocale.
   */
  voiceLocale?: string;
  /**
   * (optional) whether to enable sentence boundary metadata. Default is `false`
   */
  sentenceBoundaryEnabled?: boolean = false;
  /**
   * (optional) whether to enable word boundary metadata. Default is `false`
   */
  wordBoundaryEnabled?: boolean = false;
}

enum messageTypes {
  TURN_START = "turn.start",
  TURN_END = "turn.end",
  RESPONSE = "response",
  SPEECH_CONFIG = "speech.config",
  AUDIO_METADATA = "audio.metadata",
  AUDIO = "audio",
  SSML = "ssml",
}

export class MsEdgeTTS {
  static OUTPUT_FORMAT = OUTPUT_FORMAT;
  private static TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
  private static VOICES_URL = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${MsEdgeTTS.TRUSTED_CLIENT_TOKEN}`;
  private static SYNTH_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${MsEdgeTTS.TRUSTED_CLIENT_TOKEN}`;
  private static JSON_XML_DELIM = "\r\n\r\n";
  private static AUDIO_DELIM = "Path:audio\r\n";
  private static VOICE_LANG_REGEX = /\w{2}-\w{2}/;
  private readonly _enableLogger;
  private readonly _isBrowser: boolean;
  private _ws: WebSocket;
  private _voice: string | undefined;
  private _outputFormat: OUTPUT_FORMAT | undefined;
  private _metadataOptions: MetadataOptions = new MetadataOptions();
  private _streams: { [key: string]: { audio: Readable; metadata: Readable } } =
    {};
  private _startTime = 0;
  private readonly _agent: Agent | undefined;

  private _log(...o: any[]) {
    if (this._enableLogger) {
      console.log(...o);
    }
  }

  /**
   * Create a new `MsEdgeTTS` instance.
   *
   * @param agent (optional, **NOT SUPPORTED IN BROWSER**) Use a custom http.Agent implementation like [https-proxy-agent](https://github.com/TooTallNate/proxy-agents) or [socks-proxy-agent](https://github.com/TooTallNate/proxy-agents/tree/main/packages/socks-proxy-agent).
   * @param enableLogger=false whether to enable the built-in logger. This logs connections inits, disconnects, and incoming data to the console
   */
  public constructor(agent?: Agent, enableLogger: boolean = false) {
    this._agent = agent;
    this._enableLogger = enableLogger;
    this._isBrowser =
      typeof window !== "undefined" && typeof window.document !== "undefined";
  }

  private async _send(message: string) {
    for (let i = 1; i <= 3 && this._ws.readyState !== this._ws.OPEN; i++) {
      if (i == 1) {
        this._startTime = Date.now();
      }
      this._log("connecting: ", i);
      await this._initClient();
    }
    this._ws.send(message, () => {
      this._log("<-", message);
    });
  }

  private _initClient() {
    this._ws = this._isBrowser
      ? new WebSocket(MsEdgeTTS.SYNTH_URL)
      : new WebSocket(MsEdgeTTS.SYNTH_URL, { agent: this._agent });

    this._ws.binaryType = "arraybuffer";
    return new Promise((resolve, reject) => {
      this._ws.onopen = () => {
        this._log(
          "Connected in",
          (Date.now() - this._startTime) / 1000,
          "seconds"
        );
        this._send(
          `Content-Type:application/json; charset=utf-8\r\nPath:${messageTypes.SPEECH_CONFIG}${MsEdgeTTS.JSON_XML_DELIM}
                    {
                        "context": {
                            "synthesis": {
                                "audio": {
                                    "metadataoptions": {
                                        "sentenceBoundaryEnabled": "${this._metadataOptions.sentenceBoundaryEnabled}",
                                        "wordBoundaryEnabled": "${this._metadataOptions.wordBoundaryEnabled}"
                                    },
                                    "outputFormat": "${this._outputFormat}" 
                                }
                            }
                        }
                    }
                `
        ).then(resolve);
      };
      this._ws.onmessage = (m: MessageEvent) => {
        const buffer = Buffer.from(m.data as ArrayBuffer);
        const message = buffer.toString();

        const requestId =
          (/X-RequestId:(.*?)\r\n/gm.exec(message)?.[1] as string) || "";

        if (message.includes(`Path:${messageTypes.TURN_START}`)) {
          // start of turn, ignore
          this._log("->", message);
        } else if (message.includes(`Path:${messageTypes.TURN_END}`)) {
          // end of turn, close stream
          this._log("->", message);
          this._streams[requestId].audio.push(null);
        } else if (message.includes(`Path:${messageTypes.RESPONSE}`)) {
          // context response, ignore
          this._log("->", message);
        } else if (message.includes(`Path:${messageTypes.AUDIO_METADATA}`)) {
          // audio metadata, wordboundary/sentenceboundary
          const dataStartIndex =
            buffer.indexOf(MsEdgeTTS.JSON_XML_DELIM) +
            MsEdgeTTS.JSON_XML_DELIM.length;
          const data = buffer.subarray(dataStartIndex);

          this._log("->", message);
          this._pushMetadata(data, requestId);
        } else if (
          message.includes(`Path:${messageTypes.AUDIO}`) &&
          m.data instanceof ArrayBuffer
        ) {
          const dataStartIndex =
            buffer.indexOf(MsEdgeTTS.AUDIO_DELIM) +
            MsEdgeTTS.AUDIO_DELIM.length;
          const headers = buffer.subarray(0, dataStartIndex).toString();
          const data = buffer.subarray(dataStartIndex);

          this._log("->", headers);
          this._pushAudioData(data, requestId);
        } else {
          this._log("->", "UNKNOWN MESSAGE", message);
        }
      };
      this._ws.onclose = () => {
        this._log(
          "disconnected after:",
          (Date.now() - this._startTime) / 1000,
          "seconds"
        );
        for (const requestId in this._streams) {
          this._streams[requestId].audio.push(null);
        }
      };
      this._ws.onerror = function (error: Error) {
        reject("Connect Error: " + JSON.stringify(error, null, 2));
      };
    });
  }

  private _pushAudioData(data: Uint8Array, requestId: string) {
    this._streams[requestId].audio.push(data);
  }

  private _pushMetadata(data: Uint8Array, requestId: string) {
    this._streams[requestId].metadata.push(data);
  }

  private _SSMLTemplate(input: string, options: ProsodyOptions = {}): string {
    // in case future updates to the edge API block these elements, we'll be concatenating strings.
    options = { ...new ProsodyOptions(), ...options };
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${this._metadataOptions.voiceLocale}">
                <voice name="${this._voice}">
                    <prosody pitch="${options.pitch}" rate="${options.rate}" volume="${options.volume}">
                        ${input}
                    </prosody> 
                </voice>
            </speak>`;
  }

  /**
   * Fetch the list of voices available in Microsoft Edge.
   * These, however, are not all. The complete list of voices supported by this module [can be found here](https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/language-support) (neural, standard, and preview).
   */
  getVoices(): Promise<Voice[]> {
    return new Promise((resolve, reject) => {
      axios
        .get(MsEdgeTTS.VOICES_URL)
        .then((res) => resolve(res.data))
        .catch(reject);
    });
  }

  /**
   * Sets the required information for the speech to be synthesised and inits a new WebSocket connection.
   * Must be called at least once before text can be synthesised.
   * Saved in this instance. Can be called at any time times to update the metadata.
   *
   * @param voiceName a string with any `ShortName`. A list of all available neural voices can be found [here](https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/language-support#neural-voices). However, it is not limited to neural voices: standard voices can also be used. A list of standard voices can be found [here](https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/language-support#standard-voices). Changing the voiceName will reset the voiceLocale.
   * @param outputFormat any {@link OUTPUT_FORMAT}
   * @param metadataOptions (optional) {@link MetadataOptions}
   */
  async setMetadata(
    voiceName: string,
    outputFormat: OUTPUT_FORMAT,
    metadataOptions?: MetadataOptions
  ): Promise<void> {
    const oldVoice = this._voice;
    const oldOutputFormat = this._outputFormat;
    const oldOptions = JSON.stringify(this._metadataOptions);

    this._voice = voiceName;
    if (
      !this._metadataOptions.voiceLocale ||
      (metadataOptions &&
        !metadataOptions.voiceLocale &&
        oldVoice !== this._voice)
    ) {
      const voiceLangMatch = MsEdgeTTS.VOICE_LANG_REGEX.exec(this._voice);
      if (!voiceLangMatch)
        throw new Error(
          "Could not infer voiceLocale from voiceName, and no voiceLocale was specified!"
        );
      this._metadataOptions.voiceLocale = voiceLangMatch[0];
    }
    this._outputFormat = outputFormat;

    Object.assign(this._metadataOptions, metadataOptions);

    const changed =
      oldVoice !== this._voice ||
      oldOutputFormat !== this._outputFormat ||
      oldOptions !== JSON.stringify(this._metadataOptions);

    if (!changed && this._ws.readyState === this._ws.OPEN) {
      return;
    }

    // create new client
    this._startTime = Date.now();
    await this._initClient();
  }

  private _metadataCheck() {
    if (!this._ws)
      throw new Error(
        "Speech synthesis not configured yet. Run setMetadata before calling toStream or toFile."
      );
  }

  /**
   * Close the WebSocket connection.
   */
  close() {
    this._ws.close();
  }

  /**
     * Writes raw audio synthesised from text to a file. Uses a basic {@link _SSMLTemplate SML template}.
     *
     * @param dirPath a valid output directory path
     * @param input the input to synthesise
     * @param options (optional) {@link ProsodyOptions}
     @returns {Promise<{audioFilePath: string, metadataFilePath: string}>} - a `Promise` with the full filepaths
     */
  toFile(
    dirPath: string,
    input: string,
    options?: ProsodyOptions
  ): Promise<{
    audioFilePath: string;
    metadataFilePath: string;
  }> {
    return this._rawSSMLRequestToFile(
      dirPath,
      this._SSMLTemplate(input, options)
    );
  }

  /**
   * Writes raw audio synthesised from text in real-time to a {@link Readable}. Uses a basic {@link _SSMLTemplate SML template}.
   *
   * @param input the text to synthesise. Can include SSML elements.
   * @param options (optional) {@link ProsodyOptions}
   * @returns {Readable} - a `stream.Readable` with the audio data
   */
  toStream(input: string, options?: ProsodyOptions): Readable {
    const { audioStream } = this._rawSSMLRequest(
      this._SSMLTemplate(input, options)
    );
    return audioStream;
  }

  /**
   * Writes raw audio synthesised from text to a file. Has no SSML template. Basic SSML should be provided in the request.
   *
   * @param dirPath a valid output directory path.
   * @param requestSSML the SSML to send. SSML elements required in order to work.
   * @returns {Promise<{audioFilePath: string, metadataFilePath: string}>} - a `Promise` with the full filepaths
   */
  rawToFile(
    dirPath: string,
    requestSSML: string
  ): Promise<{ audioFilePath: string; metadataFilePath: string }> {
    return this._rawSSMLRequestToFile(dirPath, requestSSML);
  }

  /**
   * Writes raw audio synthesised from a request in real-time to a {@link Readable}. Has no SSML template. Basic SSML should be provided in the request.
   *
   * @param requestSSML the SSML to send. SSML elements required in order to work.
   * @returns {Readable} - a `stream.Readable` with the audio data
   */
  rawToStream(requestSSML: string): Readable {
    const { audioStream } = this._rawSSMLRequest(requestSSML);
    return audioStream;
  }

  private async _rawSSMLRequestToFile(
    dirPath: string,
    requestSSML: string
  ): Promise<{
    audioFilePath: string;
    metadataFilePath: string;
  }> {
    const { audioStream, metadataStream, requestId } =
      this._rawSSMLRequest(requestSSML);

    try {
      const [audioFilePath, metadataFilePath] = await Promise.all([
        new Promise((resolve, reject) => {
          const writableAudioFile = audioStream.pipe(
            fs.createWriteStream(dirPath + "/example_audio.webm")
          );
          writableAudioFile.once("close", async () => {
            if (writableAudioFile.bytesWritten > 0) {
              resolve(dirPath + "/example_audio.webm");
            } else {
              reject("No audio data received");
            }
          });
          metadataStream.once("error", reject);
        }) as Promise<string>,
        new Promise((resolve, reject) => {
          // get metadata from buffer and combine all MetaData root elements
          const metadataItems: any[] = [];
          metadataStream.on("data", (chunk: Buffer) => {
            const chunkObj = JSON.parse(chunk.toString());
            // .Metadata is an array of objects, just combine them
            metadataItems.push(...chunkObj["Metadata"]);
          });
          metadataStream.on("close", () => {
            // create file if not exists
            const metadataFilePath = dirPath + "/example_metadata.json";
            fs.writeFileSync(
              metadataFilePath,
              JSON.stringify(metadataItems, null, 2)
            );
            resolve(metadataFilePath);
          });
          metadataStream.once("error", reject);
        }) as Promise<string>,
      ]);
      return { audioFilePath, metadataFilePath };
    } catch (e) {
      audioStream.destroy();
      metadataStream.destroy();
      throw e;
    }
  }

  private _rawSSMLRequest(requestSSML: string): {
    audioStream: Readable;
    metadataStream: Readable;
    requestId: string;
  } {
    this._metadataCheck();

    const requestId = randomBytes(16).toString("hex");
    const request =
      `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:${messageTypes.SSML}${MsEdgeTTS.JSON_XML_DELIM}` +
      requestSSML.trim();
    // https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/speech-synthesis-markup
    const self = this;
    const audioStream = new Readable({
      read() {},
      destroy(error: Error | null, callback: (error: Error | null) => void) {
        delete self._streams[requestId];
        callback(error);
      },
    });
    const metadataStream = new Readable({
      read() {},
    });

    audioStream.on("error", (e) => {
      audioStream.destroy();
      metadataStream.destroy();
    });
    audioStream.once("close", () => {
      audioStream.destroy();
      metadataStream.destroy();
    });

    this._streams[requestId] = {
      audio: audioStream,
      metadata: metadataStream,
    };
    this._send(request).then();
    return { audioStream, metadataStream, requestId };
  }
}
