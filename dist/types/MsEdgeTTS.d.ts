import { OUTPUT_FORMAT } from "./OUTPUT_FORMAT";
import { Readable } from "stream";
import { Agent } from "http";
import { PITCH } from "./PITCH";
import { RATE } from "./RATE";
import { VOLUME } from "./VOLUME";
export type Voice = {
    Name: string;
    ShortName: string;
    Gender: string;
    Locale: string;
    SuggestedCodec: string;
    FriendlyName: string;
    Status: string;
};
export declare class ProsodyOptions {
    /**
     * The pitch to use.
     * Can be any {@link PITCH}, or a relative frequency in Hz (+50Hz), a relative semitone (+2st), or a relative percentage (+50%).
     * [SSML documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice#:~:text=Optional-,pitch,-Indicates%20the%20baseline)
     */
    pitch?: PITCH | string;
    /**
     * The rate to use.
     * Can be any {@link RATE}, or a relative number (0.5), or string with a relative percentage (+50%).
     * [SSML documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice#:~:text=Optional-,rate,-Indicates%20the%20speaking)
     */
    rate?: RATE | string | number;
    /**
     * The volume to use.
     * Can be any {@link VOLUME}, or an absolute number (0, 100), a string with a relative number (+50), or a relative percentage (+50%).
     * [SSML documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice#:~:text=Optional-,volume,-Indicates%20the%20volume)
     */
    volume?: VOLUME | string | number;
}
export declare class MetadataOptions {
    /**
     * (optional) any voice locale that is supported by the voice. See the list of all voices for compatibility. If not provided, the locale will be inferred from the `voiceName`.
     * Changing the voiceName will reset the voiceLocale.
     */
    voiceLocale?: string;
    /**
     * (optional) whether to enable sentence boundary metadata. Default is `false`
     */
    sentenceBoundaryEnabled?: boolean;
    /**
     * (optional) whether to enable word boundary metadata. Default is `false`
     */
    wordBoundaryEnabled?: boolean;
}
export declare class MsEdgeTTS {
    static OUTPUT_FORMAT: typeof OUTPUT_FORMAT;
    private static TRUSTED_CLIENT_TOKEN;
    private static VOICES_URL;
    private static SYNTH_URL;
    private static JSON_XML_DELIM;
    private static AUDIO_DELIM;
    private static VOICE_LANG_REGEX;
    private readonly _enableLogger;
    private readonly _isBrowser;
    private _ws;
    private _voice;
    private _outputFormat;
    private _metadataOptions;
    private _streams;
    private _startTime;
    private readonly _agent;
    private _log;
    /**
     * Create a new `MsEdgeTTS` instance.
     *
     * @param agent (optional, **NOT SUPPORTED IN BROWSER**) Use a custom http.Agent implementation like [https-proxy-agent](https://github.com/TooTallNate/proxy-agents) or [socks-proxy-agent](https://github.com/TooTallNate/proxy-agents/tree/main/packages/socks-proxy-agent).
     * @param enableLogger=false whether to enable the built-in logger. This logs connections inits, disconnects, and incoming data to the console
     */
    constructor(agent?: Agent, enableLogger?: boolean);
    private _send;
    private _initClient;
    private _pushAudioData;
    private _pushMetadata;
    private _SSMLTemplate;
    /**
     * Fetch the list of voices available in Microsoft Edge.
     * These, however, are not all. The complete list of voices supported by this module [can be found here](https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/language-support) (neural, standard, and preview).
     */
    getVoices(): Promise<Voice[]>;
    /**
     * Sets the required information for the speech to be synthesised and inits a new WebSocket connection.
     * Must be called at least once before text can be synthesised.
     * Saved in this instance. Can be called at any time times to update the metadata.
     *
     * @param voiceName a string with any `ShortName`. A list of all available neural voices can be found [here](https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/language-support#neural-voices). However, it is not limited to neural voices: standard voices can also be used. A list of standard voices can be found [here](https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/language-support#standard-voices). Changing the voiceName will reset the voiceLocale.
     * @param outputFormat any {@link OUTPUT_FORMAT}
     * @param metadataOptions (optional) {@link MetadataOptions}
     */
    setMetadata(voiceName: string, outputFormat: OUTPUT_FORMAT, metadataOptions?: MetadataOptions): Promise<void>;
    private _metadataCheck;
    /**
     * Close the WebSocket connection.
     */
    close(): void;
    /**
       * Writes raw audio synthesised from text to a file. Uses a basic {@link _SSMLTemplate SML template}.
       *
       * @param dirPath a valid output directory path
       * @param input the input to synthesise
       * @param options (optional) {@link ProsodyOptions}
       @returns {Promise<{audioFilePath: string, metadataFilePath: string}>} - a `Promise` with the full filepaths
       */
    toFile(dirPath: string, input: string, options?: ProsodyOptions): Promise<{
        audioFilePath: string;
        metadataFilePath: string;
    }>;
    /**
     * Writes raw audio synthesised from text in real-time to a {@link Readable}. Uses a basic {@link _SSMLTemplate SML template}.
     *
     * @param input the text to synthesise. Can include SSML elements.
     * @param options (optional) {@link ProsodyOptions}
     * @returns {Readable} - a `stream.Readable` with the audio data
     */
    toStream(input: string, options?: ProsodyOptions): Readable;
    /**
     * Writes raw audio synthesised from text to a file. Has no SSML template. Basic SSML should be provided in the request.
     *
     * @param dirPath a valid output directory path.
     * @param requestSSML the SSML to send. SSML elements required in order to work.
     * @returns {Promise<{audioFilePath: string, metadataFilePath: string}>} - a `Promise` with the full filepaths
     */
    rawToFile(dirPath: string, requestSSML: string): Promise<{
        audioFilePath: string;
        metadataFilePath: string;
    }>;
    /**
     * Writes raw audio synthesised from a request in real-time to a {@link Readable}. Has no SSML template. Basic SSML should be provided in the request.
     *
     * @param requestSSML the SSML to send. SSML elements required in order to work.
     * @returns {Readable} - a `stream.Readable` with the audio data
     */
    rawToStream(requestSSML: string): Readable;
    private _rawSSMLRequestToFile;
    private _rawSSMLRequest;
}
