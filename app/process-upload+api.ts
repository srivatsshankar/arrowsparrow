export async function POST(request: Request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { uploadId, fileType, fileUrl } = await request.json();

    if (!uploadId || !fileType || !fileUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Update status to processing
    const { supabase } = await import('@/lib/supabase');
    await supabase
      .from('uploads')
      .update({ status: 'processing' })
      .eq('id', uploadId);

    let processedText = '';

    if (fileType === 'audio') {
      // Process audio with Eleven Labs
      processedText = await processAudioWithElevenLabs(fileUrl, uploadId);
    } else if (fileType === 'document') {
      // Process document with Docling
      processedText = await processDocumentWithDocling(fileUrl, uploadId);
    }

    // Generate summary and key points with Gemini
    await processSummaryWithGemini(processedText, uploadId);

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
}

async function processAudioWithElevenLabs(fileUrl: string, uploadId: string): Promise<string> {
  const apiKey = process.env.ELEVEN_LABS_API_KEY;
  
  if (!apiKey) {
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
        'xi-api-key': apiKey,
      },
      body: formData,
    });

    if (!transcriptionResponse.ok) {
      throw new Error(`Transcription failed: ${transcriptionResponse.statusText}`);
    }

    const transcriptionData = await transcriptionResponse.json();
    
    // Save transcription to database
    const { supabase } = await import('@/lib/supabase');
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

async function processDocumentWithDocling(fileUrl: string, uploadId: string): Promise<string> {
  try {
    // Download document
    const docResponse = await fetch(fileUrl);
    const docBuffer = await docResponse.arrayBuffer();

    // For now, we'll use a simplified text extraction
    // In production, you would integrate with Docling API
    const extractedText = `[Document text extracted from ${fileUrl}]`;

    // Save extracted text to database
    const { supabase } = await import('@/lib/supabase');
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

async function processSummaryWithGemini(text: string, uploadId: string): Promise<void> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  
  if (!apiKey) {
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

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
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
    const { supabase } = await import('@/lib/supabase');
    
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