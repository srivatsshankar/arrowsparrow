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
        // Process document with proper text extraction
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
    const fileName = fileUrl.split('/').pop() || 'document';
    const fileExtension = fileName.split('.').pop()?.toLowerCase();

    let extractedText = '';

    if (fileExtension === 'pdf') {
      extractedText = await extractPDFText(docBuffer);
    } else if (fileExtension === 'docx') {
      extractedText = await extractDocxText(docBuffer);
    } else if (fileExtension === 'doc') {
      // For .doc files, we'll provide a helpful message
      extractedText = `This appears to be a legacy Microsoft Word document (.doc format). 
      
For better text extraction, please convert your document to:
- PDF format (.pdf) - recommended for best results
- Modern Word format (.docx)
- Plain text format (.txt)

The document has been uploaded successfully, but automatic text extraction is limited for legacy .doc files.`;
    } else if (fileExtension === 'txt') {
      // Handle plain text files
      const textDecoder = new TextDecoder('utf-8');
      extractedText = textDecoder.decode(docBuffer);
    } else {
      throw new Error(`Unsupported file format: ${fileExtension}. Supported formats: PDF, DOCX, TXT`);
    }

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text could be extracted from the document. The file may be empty, corrupted, or contain only images.');
    }

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

async function extractPDFText(buffer: ArrayBuffer): Promise<string> {
  try {
    // Import PDF parsing library
    const { getDocument } = await import('npm:pdfjs-dist@4.0.379');
    
    // Configure PDF.js for Deno environment
    const pdfjsLib = { getDocument };
    
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
    });
    
    const pdf = await loadingTask.promise;
    let fullText = '';
    
    // Extract text from each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Combine text items from the page
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      
      if (pageText.trim()) {
        fullText += `\n\n--- Page ${pageNum} ---\n${pageText}`;
      }
    }
    
    // Clean up the text
    fullText = fullText
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n\s*\n/g, '\n\n') // Clean up multiple newlines
      .trim();
    
    if (!fullText) {
      throw new Error('PDF appears to contain no readable text. It may contain only images or be corrupted.');
    }
    
    return fullText;
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}

async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  try {
    // Import mammoth for DOCX parsing
    const mammoth = await import('npm:mammoth@1.6.0');
    
    // Extract text from DOCX
    const result = await mammoth.extractRawText({ 
      arrayBuffer: buffer 
    });
    
    if (!result.value || result.value.trim().length === 0) {
      throw new Error('DOCX file appears to contain no readable text.');
    }
    
    // Clean up the extracted text
    const cleanText = result.value
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Clean up excessive newlines
      .trim();
    
    // Log any warnings from mammoth
    if (result.messages && result.messages.length > 0) {
      console.log('DOCX extraction warnings:', result.messages);
    }
    
    return cleanText;
  } catch (error) {
    console.error('DOCX extraction error:', error);
    throw new Error(`Failed to extract text from DOCX: ${error.message}`);
  }
}

function cleanJsonString(jsonString: string): string {
  // Remove comments (both single-line and multi-line)
  let cleaned = jsonString
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
    .replace(/\/\/.*$/gm, ''); // Remove // comments
  
  // Remove trailing commas before closing braces and brackets
  cleaned = cleaned
    .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas before } or ]
    .replace(/,(\s*$)/gm, ''); // Remove trailing commas at end of lines
  
  // Clean up extra whitespace and newlines
  cleaned = cleaned
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim();
  
  return cleaned;
}

function extractJsonFromText(text: string): string | null {
  // Method 1: Try to extract from markdown JSON code block
  const markdownJsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (markdownJsonMatch) {
    const extracted = markdownJsonMatch[1].trim();
    return cleanJsonString(extracted);
  }

  // Method 2: Try to extract from generic code block
  const codeBlockMatch = text.match(/```\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].trim();
    // Check if it looks like JSON (starts with { and ends with })
    if (content.startsWith('{') && content.endsWith('}')) {
      return cleanJsonString(content);
    }
  }

  // Method 3: Extract content between first { and last }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
    const extracted = text.substring(firstBrace, lastBrace + 1);
    return cleanJsonString(extracted);
  }

  // Method 4: Try the original regex approach as fallback
  const regexMatch = text.match(/\{[\s\S]*\}/);
  if (regexMatch) {
    return cleanJsonString(regexMatch[0]);
  }

  return null;
}

async function processSummaryWithGemini(text: string, uploadId: string, supabase: any): Promise<void> {
  if (!GOOGLE_GEMINI_API_KEY) {
    throw new Error('Google Gemini API key not configured. Please set GOOGLE_GEMINI_API_KEY in your Supabase Edge Function environment variables.');
  }

  try {
    // Truncate text if it's too long for the API
    const maxLength = 30000; // Conservative limit for Gemini
    const processedText = text.length > maxLength 
      ? text.substring(0, maxLength) + '\n\n[Note: Text was truncated due to length limits]'
      : text;

    const prompt = `
      Please analyze the following student coursework text and provide:
      1. A comprehensive summary (2-3 paragraphs)
      2. The most important key points for studying (5-8 points)

      Text: ${processedText}

      Please format your response as valid JSON with the following structure:
      {
        "summary": "Your comprehensive summary here",
        "keyPoints": [
          {"point": "First key point", "importance": 5},
          {"point": "Second key point", "importance": 4}
        ]
      }

      IMPORTANT: Return ONLY valid JSON without any markdown formatting, comments, or additional text. Make sure the summary captures the main themes and important concepts. For key points, assign importance levels from 1-5 (5 being most important).
    `;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.3,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        }
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
    
    console.log('Raw Gemini response:', generatedText);
    
    // Use improved JSON extraction with cleaning
    const jsonString = extractJsonFromText(generatedText);
    if (!jsonString) {
      console.error('No JSON found in Gemini response:', generatedText);
      throw new Error('No valid JSON found in AI response');
    }

    console.log('Extracted and cleaned JSON string:', jsonString);

    let analysis;
    try {
      analysis = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Failed to parse extracted JSON:', parseError);
      console.error('JSON string that failed to parse:', jsonString);
      
      // Try one more aggressive cleaning attempt
      try {
        const aggressivelyCleaned = jsonString
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
          .replace(/\n/g, ' ') // Replace newlines with spaces
          .replace(/\r/g, '') // Remove carriage returns
          .replace(/\t/g, ' ') // Replace tabs with spaces
          .replace(/\\/g, '\\\\') // Escape backslashes
          .replace(/"/g, '\\"') // Escape quotes within strings
          .replace(/\\"/g, '"') // Fix over-escaped quotes
          .replace(/\\\\/g, '\\'); // Fix over-escaped backslashes
        
        console.log('Attempting aggressive cleaning:', aggressivelyCleaned);
        analysis = JSON.parse(aggressivelyCleaned);
      } catch (secondParseError) {
        console.error('Second parse attempt also failed:', secondParseError);
        throw new Error('Failed to parse AI response - invalid JSON format after cleaning attempts');
      }
    }

    if (!analysis.summary) {
      console.error('No summary in parsed analysis:', analysis);
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
        importance_level: Math.min(Math.max(kp.importance || 3, 1), 5), // Ensure importance is between 1-5
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