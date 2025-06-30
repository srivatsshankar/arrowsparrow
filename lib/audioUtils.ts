import toWav from 'audiobuffer-to-wav';

/**
 * Convert an audio file to WAV format with a maximum sample rate of 16kHz
 * This runs entirely on the client side using Web Audio API
 */
export async function convertAudioToWav(audioUri: string): Promise<{ blob: Blob; fileName: string }> {
  try {
    console.log('🎵 Starting audio conversion to WAV (16kHz max)...');

    // Fetch the audio file
    const response = await fetch(audioUri);
    const arrayBuffer = await response.arrayBuffer();

    // Create an AudioContext for processing
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Decode the audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    console.log(`📊 Original audio info:
      - Sample Rate: ${audioBuffer.sampleRate}Hz
      - Channels: ${audioBuffer.numberOfChannels}
      - Duration: ${audioBuffer.duration.toFixed(2)}s`);

    let processedBuffer = audioBuffer;

    // Resample if sample rate is higher than 16kHz
    if (audioBuffer.sampleRate > 16000) {
      console.log('⬇️ Resampling audio from', audioBuffer.sampleRate, 'Hz to 16000Hz');
      processedBuffer = await resampleAudioBuffer(audioContext, audioBuffer, 16000);
    }

    // Convert mono if stereo (to reduce file size)
    if (processedBuffer.numberOfChannels > 1) {
      console.log('🔄 Converting stereo to mono');
      processedBuffer = convertToMono(audioContext, processedBuffer);
    }

    // Convert to WAV format
    const wavArrayBuffer = toWav(processedBuffer);
    const wavBlob = new Blob([wavArrayBuffer], { type: 'audio/wav' });

    // Generate WAV filename
    const originalFileName = audioUri.includes('recording_') ? 
      `recording_${Date.now()}.wav` : 
      `audio_${Date.now()}.wav`;

    console.log(`✅ Audio conversion completed:
      - Format: WAV
      - Sample Rate: ${processedBuffer.sampleRate}Hz
      - Channels: ${processedBuffer.numberOfChannels}
      - Duration: ${processedBuffer.duration.toFixed(2)}s
      - File Size: ${(wavBlob.size / 1024).toFixed(2)}KB`);

    // Close the audio context to free up resources
    await audioContext.close();

    return {
      blob: wavBlob,
      fileName: originalFileName
    };

  } catch (error) {
    console.error('❌ Audio conversion failed:', error);
    throw new Error(`Audio conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Resample an AudioBuffer to a target sample rate
 */
async function resampleAudioBuffer(
  audioContext: AudioContext, 
  audioBuffer: AudioBuffer, 
  targetSampleRate: number
): Promise<AudioBuffer> {
  try {
    // Calculate the new length based on the target sample rate
    const targetLength = Math.round(audioBuffer.length * targetSampleRate / audioBuffer.sampleRate);
    
    // Create a new AudioBuffer with the target sample rate
    const resampledBuffer = audioContext.createBuffer(
      audioBuffer.numberOfChannels,
      targetLength,
      targetSampleRate
    );

    // Resample each channel
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const inputData = audioBuffer.getChannelData(channel);
      const outputData = resampledBuffer.getChannelData(channel);
      
      // Simple linear interpolation resampling
      for (let i = 0; i < targetLength; i++) {
        const position = i * audioBuffer.length / targetLength;
        const index = Math.floor(position);
        const fraction = position - index;
        
        if (index + 1 < inputData.length) {
          // Linear interpolation between two samples
          outputData[i] = inputData[index] * (1 - fraction) + inputData[index + 1] * fraction;
        } else {
          // Use the last sample if we're at the end
          outputData[i] = inputData[inputData.length - 1];
        }
      }
    }

    return resampledBuffer;
  } catch (error) {
    console.error('Resampling failed:', error);
    throw error;
  }
}

/**
 * Convert stereo AudioBuffer to mono by averaging the channels
 */
function convertToMono(audioContext: AudioContext, audioBuffer: AudioBuffer): AudioBuffer {
  if (audioBuffer.numberOfChannels === 1) {
    return audioBuffer; // Already mono
  }

  try {
    // Create a new mono buffer
    const monoBuffer = audioContext.createBuffer(
      1, // Mono (1 channel)
      audioBuffer.length,
      audioBuffer.sampleRate
    );

    const outputData = monoBuffer.getChannelData(0);

    // Average all channels into the mono channel
    for (let i = 0; i < audioBuffer.length; i++) {
      let sum = 0;
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        sum += audioBuffer.getChannelData(channel)[i];
      }
      outputData[i] = sum / audioBuffer.numberOfChannels;
    }

    return monoBuffer;
  } catch (error) {
    console.error('Mono conversion failed:', error);
    throw error;
  }
}

/**
 * Get audio file information without conversion
 */
export async function getAudioInfo(audioUri: string): Promise<{
  sampleRate: number;
  channels: number;
  duration: number;
  size: number;
}> {
  try {
    const response = await fetch(audioUri);
    const arrayBuffer = await response.arrayBuffer();
    
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    const info = {
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      duration: audioBuffer.duration,
      size: arrayBuffer.byteLength
    };

    await audioContext.close();
    return info;
  } catch (error) {
    console.error('Failed to get audio info:', error);
    throw error;
  }
}
