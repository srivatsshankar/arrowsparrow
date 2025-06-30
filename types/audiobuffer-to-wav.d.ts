declare module 'audiobuffer-to-wav' {
  function toWav(audioBuffer: AudioBuffer): ArrayBuffer;
  export = toWav;
}
