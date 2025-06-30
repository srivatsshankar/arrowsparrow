import { corsHeaders } from '../_shared/cors.ts';
import { ElevenLabsClient } from 'npm:@elevenlabs/elevenlabs-js';

const ELEVEN_LABS_API_KEY = Deno.env.get('ELEVEN_LABS_API_KEY');

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { text } = await req.json();

    if (!text) {
      return new Response(
        JSON.stringify({ error: 'Text is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!ELEVEN_LABS_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ElevenLabs API key not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase configuration');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { createClient } = await import('npm:@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Initialize ElevenLabs client
    const elevenlabs = new ElevenLabsClient({
      apiKey: ELEVEN_LABS_API_KEY,
    });

    // Use ElevenLabs voice "Sarah" - a clear, professional female voice
    const voiceId = 'EXAVITQu4vr4xnSDxMaL';
    
    // Generate audio using the new client
    const audio = await elevenlabs.textToSpeech.convert(voiceId, {
      text: text,
      modelId: 'eleven_multilingual_v2',
      outputFormat: 'mp3_44100_128',
    });

    console.log('Audio object type:', typeof audio);
    console.log('Audio instanceof Uint8Array:', audio instanceof Uint8Array);
    console.log('Audio instanceof ReadableStream:', audio instanceof ReadableStream);
    console.log('Audio instanceof Response:', audio instanceof Response);
    console.log('Audio constructor name:', audio?.constructor?.name);

    // Convert audio stream to buffer - the audio is already a ReadableStream or Uint8Array
    let audioBuffer: Uint8Array;
    
    if (audio instanceof Uint8Array) {
      console.log('Using Uint8Array path');
      audioBuffer = audio;
    } else if (audio instanceof ReadableStream) {
      console.log('Using ReadableStream path');
      // Convert ReadableStream to Uint8Array
      const reader = audio.getReader();
      const chunks: Uint8Array[] = [];
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      
      // Combine all chunks
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      audioBuffer = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        audioBuffer.set(chunk, offset);
        offset += chunk.length;
      }
    } else {
      // Check if it's a Response object
      if (audio instanceof Response) {
        console.log('Using Response path');
        const arrayBuffer = await audio.arrayBuffer();
        audioBuffer = new Uint8Array(arrayBuffer);
      } else {
        console.error('Unknown audio type:', typeof audio, audio);
        // Try to get the actual data by iterating over properties
        if (audio && typeof audio === 'object') {
          console.log('Audio object keys:', Object.keys(audio));
          console.log('Audio object prototype:', Object.getPrototypeOf(audio));
        }
        throw new Error(`Unsupported audio format returned by ElevenLabs: ${typeof audio}, constructor: ${audio?.constructor?.name}`);
      }
    }

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `tts_${timestamp}.mp3`;
    const filePath = `tts/${filename}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(filePath, audioBuffer, {
        contentType: 'audio/mpeg',
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Failed to store audio file' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('uploads')
      .getPublicUrl(filePath);

    return new Response(
      JSON.stringify({ 
        audioUrl: urlData.publicUrl,
        filename: filename,
        size: audioBuffer.length 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in generate-tts function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
