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

    // Update status to processing
    const { error: updateError } = await supabase
      .from('uploads')
      .update({ status: 'processing' })
      .eq('id', uploadId);

    if (updateError) {
      console.error('Failed to update upload status:', updateError);
      throw new Error('Database update failed');
    }

    let processedText = '';
    let errorMessage = '';

    try {
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

    } catch (processingError) {
      console.error('Processing error:', processingError);
      errorMessage = processingError.message || 'Processing failed';
      
      // Update status to error with message
      await supabase
        .from('uploads')
        .update({ 
          status: 'error',
          error_message: errorMessage
        })
        .eq('id', uploadId);

      return new Response(
        JSON.stringify({ error: errorMessage }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

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
      JSON.stringify({ error: error.message || 'Processing failed' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function processAudioWithElevenLabs(fileUrl: string, uploadId: string, supabase: any): Promise<string> {
  if (!ELEVEN_LABS_API_KEY) {
    throw new Error('Eleven Labs API key not configured. Please set ELEVEN_LABS_API_KEY in your Supabase Edge Function environment variables.');
  }

  try {
    // Download audio file
    const audioResponse = await fetch(fileUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio file: ${audioResponse.statusText}`);
    }
    
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
      const errorText = await transcriptionResponse.text();
      console.error('Eleven Labs API error:', errorText);
      throw new Error(`Transcription failed: ${transcriptionResponse.statusText}`);
    }

    const transcriptionData = await transcriptionResponse.json();
    
    if (!transcriptionData.text) {
      throw new Error('No transcription text received from Eleven Labs');
    }
    
    // Save transcription to database
    const { error: insertError } = await supabase
      .from('transcriptions')
      .insert({
        upload_id: uploadId,
        transcription_text: transcriptionData.text,
        timestamps: transcriptionData.segments || {},
        diarization: transcriptionData.speakers || {},
      });

    if (insertError) {
      console.error('Failed to save transcription:', insertError);
      throw new Error('Failed to save transcription to database');
    }

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
    if (!docResponse.ok) {
      throw new Error(`Failed to download document: ${docResponse.statusText}`);
    }
    
    const docBuffer = await docResponse.arrayBuffer();

    // For demonstration, we'll extract basic text
    // In production, you would integrate with Docling API or similar service
    const extractedText = `Document processed successfully. File size: ${docBuffer.byteLength} bytes. 

This is a placeholder for document text extraction. In a production environment, this would use a service like Docling to extract structured text from PDF/Word documents.

The document has been uploaded and is ready for processing. You can implement actual text extraction by:
1. Using a PDF parsing library for PDF files
2. Using a Word document parser for .docx files
3. Integrating with a document processing API like Docling

For now, this serves as a demonstration of the document processing workflow.`;

    // Save extracted text to database
    const { error: insertError } = await supabase
      .from('document_texts')
      .insert({
        upload_id: uploadId,
        extracted_text: extractedText,
      });

    if (insertError) {
      console.error('Failed to save document text:', insertError);
      throw new Error('Failed to save document text to database');
    }

    return extractedText;
  } catch (error) {
    console.error('Document processing error:', error);
    throw error;
  }
}

async function processSummaryWithGemini(text: string, uploadId: string, supabase: any): Promise<void> {
  if (!GOOGLE_GEMINI_API_KEY) {
    throw new Error('Google Gemini API key not configured. Please set GOOGLE_GEMINI_API_KEY in your Supabase Edge Function environment variables.');
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

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`, {
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
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      throw new Error(`Gemini API failed: ${response.statusText}`);
    }

    const geminiData = await response.json();
    const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!generatedText) {
      throw new Error('No response received from Gemini API');
    }
    
    // Parse JSON response
    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Invalid JSON response from Gemini:', generatedText);
      throw new Error('Invalid JSON response from Gemini API');
    }

    let analysis;
    try {
      analysis = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', parseError);
      throw new Error('Failed to parse AI response');
    }

    if (!analysis.summary) {
      throw new Error('No summary received from AI analysis');
    }

    // Save summary to database
    const { error: summaryError } = await supabase
      .from('summaries')
      .insert({
        upload_id: uploadId,
        summary_text: analysis.summary,
      });

    if (summaryError) {
      console.error('Failed to save summary:', summaryError);
      throw new Error('Failed to save summary to database');
    }

    // Save key points if available
    if (analysis.keyPoints && Array.isArray(analysis.keyPoints) && analysis.keyPoints.length > 0) {
      const keyPointsData = analysis.keyPoints.map((kp: any) => ({
        upload_id: uploadId,
        point_text: kp.point || 'Key point',
        importance_level: kp.importance || 3,
      }));

      const { error: keyPointsError } = await supabase
        .from('key_points')
        .insert(keyPointsData);

      if (keyPointsError) {
        console.error('Failed to save key points:', keyPointsError);
        // Don't throw here as summary was saved successfully
      }
    }
  } catch (error) {
    console.error('Gemini processing error:', error);
    throw error;
  }
}