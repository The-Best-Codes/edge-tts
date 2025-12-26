export class TTSConfig {
  voice: string;
  rate: string;
  volume: string;
  pitch: string;
  boundary: "WordBoundary" | "SentenceBoundary";

  constructor(
    voice: string,
    rate: string = "+0%",
    volume: string = "+0%",
    pitch: string = "+0Hz",
    boundary: "WordBoundary" | "SentenceBoundary" = "SentenceBoundary",
  ) {
    this.voice = voice;
    this.rate = rate;
    this.volume = volume;
    this.pitch = pitch;
    this.boundary = boundary;

    this.validate();
  }

  private validateStringParam(name: string, value: string, pattern: RegExp) {
    if (!pattern.test(value)) {
      throw new Error(`Invalid ${name} '${value}'.`);
    }
  }

  private validate() {
    // Handle the specific Microsoft Server Speech format if passed
    const match = this.voice.match(/^([a-z]{2,})-([A-Z]{2,})-(.+Neural)$/);
    if (match) {
      const lang = match[1];
      let region = match[2];
      let name = match[3];
      if (name && name.includes("-")) {
        region = `${region}-${name.split("-")[0]}`;
        name = name.split("-")[1];
      }
      this.voice = `Microsoft Server Speech Text to Speech Voice (${lang}-${region}, ${name})`;
    }

    this.validateStringParam(
      "voice",
      this.voice,
      /^Microsoft Server Speech Text to Speech Voice \(.+,.+\)$/,
    );
    this.validateStringParam("rate", this.rate, /^[+-]\d+%$/);
    this.validateStringParam("volume", this.volume, /^[+-]\d+%$/);
    this.validateStringParam("pitch", this.pitch, /^[+-]\d+Hz$/);
  }

  toSSML(escapedText: string): string {
    return (
      `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
      `<voice name='${this.voice}'>` +
      `<prosody pitch='${this.pitch}' rate='${this.rate}' volume='${this.volume}'>` +
      `${escapedText}` +
      `</prosody>` +
      `</voice>` +
      `</speak>`
    );
  }
}
