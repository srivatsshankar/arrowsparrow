import { corsHeaders } from '../_shared/cors.ts';

const ELEVEN_LABS_API_KEY = Deno.env.get('ELEVEN_LABS_API_KEY');
const GOOGLE_GEMINI_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { uploadId, fileType, fileUrl } = await req.json();

    if (!uploadId || !fileType || !fileUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const { createClient } = await import('npm:@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Update status to processing
    await supabase
      .from('uploads')
      .update({ status: 'processing' })
      .eq('id', uploadId);

    let processedText = '';

    if (fileType === 'audio') {
      // Process audio with Eleven Labs
      processedText = await processAudioWithElevenLabs(fileUrl, uploadId, supabase);
    } else if (fileType === 'document') {
      // Process document with simple text extraction
      processedText = await processDocumentText(fileUrl, uploadId, supabase);
    }

    // Generate summary and key points with Gemini
    await processSummaryWithGemini(processedText, uploadId, supabase);

    // Update status to completed
    await supabase
      .from('uploads')
      .update({ status: 'completed' })
      .eq('id', uploadId);

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Processing error:', error);
    
    return new Response(
      JSON.stringify({ error: 'Processing failed' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function processAudioWithElevenLabs(fileUrl: string, uploadId: string, supabase: any): Promise<string> {
  if (!ELEVEN_LABS_API_KEY) {
    throw new Error('Eleven Labs API key not configured');
  }

  try {
    // Download audio file
    const audioResponse = await fetch(fileUrl);
    const audioBuffer = await audioResponse.arrayBuffer();

    // Send to Eleven Labs for transcription
    const formData = new FormData();
    formData.append('audio', new Blob([audioBuffer]), 'audio.m4a');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');

    const transcriptionResponse = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVEN_LABS_API_KEY,
      },
      body: formData,
    });

    if (!transcriptionResponse.ok) {
      throw new Error(`Transcription failed: ${transcriptionResponse.statusText}`);
    }

    const transcriptionData = await transcriptionResponse.json();
    
    // Save transcription to database
    await supabase
      .from('transcriptions')
      .insert({
        upload_id: uploadId,
        transcription_text: transcriptionData.text,
        timestamps: transcriptionData.segments || {},
        diarization: transcriptionData.speakers || {},
      });

    return transcriptionData.text;
  } catch (error) {
    console.error('Eleven Labs processing error:', error);
    throw error;
  }
}

async function processDocumentText(fileUrl: string, uploadId: string, supabase: any): Promise<string> {
  try {
    // Download document
    const docResponse = await fetch(fileUrl);
    const docBuffer = await docResponse.arrayBuffer();

    // For demonstration, we'll extract basic text
    // In production, you would integrate with Docling API
    const extractedText = `[Document text extracted from uploaded file. In production, this would use Docling to extract structured text from PDF/Word documents.]`;

    // Save extracted text to database
    await supabase
      .from('document_texts')
      .insert({
        upload_id: uploadId,
        extracted_text: extractedText,
      });

    return extractedText;
  } catch (error) {
    console.error('Document processing error:', error);
    throw error;
  }
}

async function processSummaryWithGemini(text: string, uploadId: string, supabase: any): Promise<void> {
  if (!GOOGLE_GEMINI_API_KEY) {
    throw new Error('Google Gemini API key not configured');
  }

  try {
    const prompt = `
      Please analyze the following student coursework text and provide:
      1. A comprehensive summary
      2. The most important key points for studying

      Text: ${text}

      Please format your response as JSON with the following structure:
      {
        "summary": "Your comprehensive summary here",
        "keyPoints": [
          {"point": "First key point", "importance": 5},
          {"point": "Second key point", "importance": 4}
        ]
      }
    `;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GOOGLE_GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }]
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API failed: ${response.statusText}`);
    }

    const geminiData = await response.json();
    const generatedText = geminiData.candidates[0]?.content?.parts[0]?.text || '';
    
    // Parse JSON response
    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid JSON response from Gemini');
    }

    const analysis = JSON.parse(jsonMatch[0]);

    // Save summary and key points to database
    
    // Save summary
    await supabase
      .from('summaries')
      .insert({
        upload_id: uploadId,
        summary_text: analysis.summary,
      });

    // Save key points
    if (analysis.keyPoints && Array.isArray(analysis.keyPoints)) {
      const keyPointsData = analysis.keyPoints.map((kp: any) => ({
        upload_id: uploadId,
        point_text: kp.point,
        importance_level: kp.importance || 3,
      }));

      await supabase
        .from('key_points')
        .insert(keyPointsData);
    }
  } catch (error) {
    console.error('Gemini processing error:', error);
    throw error;
  }
}