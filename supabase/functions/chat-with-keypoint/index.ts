import { corsHeaders } from '../_shared/cors.ts';

const GOOGLE_GEMINI_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { keyPoint, userMessage, uploadId } = await req.json();

    if (!keyPoint || !userMessage || !uploadId) {
      return new Response(
        JSON.stringify({ error: 'Key point, user message, and upload ID are required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Initialize Supabase client
    const { createClient } = await import('npm:@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get the original content (transcription or document text) for context
    const uploadContent = await getUploadContent(uploadId, supabase);
    if (!uploadContent) {
      return new Response(
        JSON.stringify({ error: 'Upload content not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Generate intelligent response using Gemini
    const aiResponse = await generateAIResponse(uploadContent, keyPoint, userMessage);

    // Generate audio using ElevenLabs TTS
    const audioBuffer = await generateTTSAudio(aiResponse);

    // Convert audio buffer to base64 for transmission
    const audioBase64 = arrayBufferToBase64(audioBuffer);

    return new Response(
      JSON.stringify({ 
        response: aiResponse,
        audioBase64: audioBase64,
        audioMimeType: 'audio/mpeg'
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in chat-with-keypoint function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function getUploadContent(uploadId: string, supabase: any): Promise<string | null> {
  try {
    // First get the upload info to determine if it's audio or document
    const { data: upload, error: uploadError } = await supabase
      .from('uploads')
      .select('file_type')
      .eq('id', uploadId)
      .single();

    if (uploadError || !upload) {
      console.error('Upload not found:', uploadError);
      return null;
    }

    if (upload.file_type === 'audio') {
      // Get transcription text
      const { data: transcription, error: transcriptionError } = await supabase
        .from('transcriptions')
        .select('transcription_text')
        .eq('upload_id', uploadId)
        .single();

      if (transcriptionError || !transcription) {
        console.error('Transcription not found:', transcriptionError);
        return null;
      }

      // Parse the JSON to get the plain text
      try {
        const transcriptionData = JSON.parse(transcription.transcription_text);
        return transcriptionData.text || transcriptionData.transcript || '';
      } catch (parseError) {
        // If it's not JSON, return as plain text
        return transcription.transcription_text;
      }
    } else if (upload.file_type === 'document') {
      // Get document text
      const { data: documentText, error: documentError } = await supabase
        .from('document_texts')
        .select('extracted_text')
        .eq('upload_id', uploadId)
        .single();

      if (documentError || !documentText) {
        console.error('Document text not found:', documentError);
        return null;
      }

      return documentText.extracted_text;
    }

    return null;
  } catch (error) {
    console.error('Error getting upload content:', error);
    return null;
  }
}

async function generateAIResponse(originalContent: string, keyPoint: string, userMessage: string): Promise<string> {
  if (!GOOGLE_GEMINI_API_KEY) {
    throw new Error('Google Gemini API key not configured');
  }

  try {
    // Truncate content if too long to fit within API limits
    const maxContentLength = 15000;
    const truncatedContent = originalContent.length > maxContentLength 
      ? originalContent.substring(0, maxContentLength) + '\n\n[Content truncated...]'
      : originalContent;

    const prompt = `
You are an intelligent study assistant helping a student understand their learning material. The student has asked a question about a specific key point from their content.

ORIGINAL CONTENT CONTEXT:
${truncatedContent}

KEY POINT BEING DISCUSSED:
${keyPoint}

STUDENT'S QUESTION:
${userMessage}

Please provide a helpful, conversational response that:
1. Directly addresses the student's question
2. References the specific key point they're asking about
3. Uses relevant information from the original content to provide context
4. Explains concepts in an easy-to-understand way
5. Encourages further learning and engagement

Keep your response conversational, informative, and under 200 words. Speak as if you're having a friendly conversation with the student.
    `;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent?key=${GOOGLE_GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 300,
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      throw new Error(`Gemini API failed: ${response.statusText}`);
    }

    const geminiData = await response.json();
    
    if (!geminiData.candidates || geminiData.candidates.length === 0) {
      throw new Error('No response generated from Gemini API');
    }

    const candidate = geminiData.candidates[0];
    
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      throw new Error('No content in Gemini API response');
    }

    return candidate.content.parts[0].text;

  } catch (error) {
    console.error('Gemini AI response generation error:', error);
    throw new Error(`Failed to generate AI response: ${error.message}`);
  }
}

async function generateTTSAudio(text: string): Promise<ArrayBuffer> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ElevenLabs API key not configured');
  }

  try {
    // Use ElevenLabs TTS API with a conversational voice
    const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', { // Rachel voice
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
          style: 0.0,
          use_speaker_boost: true
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs TTS error:', errorText);
      throw new Error(`ElevenLabs TTS failed: ${response.statusText}`);
    }

    return await response.arrayBuffer();

  } catch (error) {
    console.error('TTS generation error:', error);
    throw new Error(`Failed to generate TTS audio: ${error.message}`);
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
