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

// Helper function to format timestamp in seconds to MM:SS format
function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Note: Audio conversion is now handled on the client side (React Native) before upload
// This ensures the audio is already in the correct format when it reaches the Edge Function

async function processAudioWithElevenLabs(fileUrl: string, uploadId: string, supabase: any): Promise<string> {
  if (!ELEVEN_LABS_API_KEY) {
    throw new Error('Eleven Labs API key not configured. Please set ELEVEN_LABS_API_KEY in your Supabase Edge Function environment variables.');
  }

  try {
    // Import the Eleven Labs client
    const { ElevenLabsClient } = await import('npm:@elevenlabs/elevenlabs-js');
    
    // Initialize the client with API key
    const elevenlabs = new ElevenLabsClient({
      apiKey: ELEVEN_LABS_API_KEY,
    });

    // Download audio file
    const audioResponse = await fetch(fileUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio file: ${audioResponse.statusText}`);
    }
    
    const audioBuffer = await audioResponse.arrayBuffer();
    
    // Convert audio buffer to blob for Eleven Labs API
    // Audio is expected to already be in WAV format from React Native client
    const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });

    // Use Eleven Labs client for transcription
    const transcription = await elevenlabs.speechToText.convert({
      file: audioBlob,
      modelId: "scribe_v1", // Using the supported model
      tagAudioEvents: true, // Tag audio events like laughter, applause, etc.
      languageCode: "eng", // Language of the audio file
      diarize: true, // Whether to annotate who is speaking
    });

    console.log('Eleven Labs transcription response:', transcription);
    
    if (!transcription || !transcription.text) {
      throw new Error('No transcription text received from Eleven Labs');
    }
    
    // Store the entire JSON response from Eleven Labs API in transcription_text
    const transcriptionData = {
      upload_id: uploadId,
      transcription_text: JSON.stringify(transcription),
      // Add new fields with fallbacks
      audio_events: transcription.audioEvents || {},
      language_detected: transcription.detectedLanguage || 'eng',
    };

    console.log('Storing transcription data:', {
      upload_id: uploadId,
      transcription_json_preview: JSON.stringify(transcription).substring(0, 500) + '...',
      has_segments: !!(transcription.segments && transcription.segments.length > 0),
      segments_count: transcription.segments?.length || 0,
      plain_text_preview: transcription.text.substring(0, 200) + '...'
    });

    const { error: insertError } = await supabase
      .from('transcriptions')
      .insert(transcriptionData);

    if (insertError) {
      console.error('Failed to save transcription:', insertError);
      throw new Error('Failed to save transcription to database');
    }

    // Generate meaningful content name using Gemini
    const contentName = await generateContentName(transcription.text);
    
    // Update the upload record with the generated name
    await supabase
      .from('uploads')
      .update({ 
        generated_name: contentName
      })
      .eq('id', uploadId);

    // Return the original plain text for AI processing (summary/key points)
    // The formatted text with timestamps is stored in the database
    return transcription.text;
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

    // Check if extracted text is too long (PostgreSQL text field limit is ~1GB but we'll be more conservative)
    const maxTextLength = 10000000; // 10MB limit for extracted text
    if (extractedText.length > maxTextLength) {
      console.warn(`Extracted text too long (${extractedText.length} chars), truncating to ${maxTextLength} chars`);
      extractedText = extractedText.substring(0, maxTextLength) + '\n\n[Note: Text was truncated due to length limits]';
    }

    // Generate meaningful content name using Gemini
    const contentName = await generateContentName(extractedText);
    
    // Update the upload record with the generated name
    await supabase
      .from('uploads')
      .update({ 
        generated_name: contentName,
        original_filename: fileName 
      })
      .eq('id', uploadId);

    // Save extracted text to database
    console.log('Attempting to save document text:', {
      upload_id: uploadId,
      text_length: extractedText.length,
      text_preview: extractedText.substring(0, 200) + '...'
    });

    // First verify the upload exists
    const { data: uploadExists, error: uploadCheckError } = await supabase
      .from('uploads')
      .select('id, status')
      .eq('id', uploadId)
      .single();

    if (uploadCheckError || !uploadExists) {
      console.error('Upload not found or inaccessible:', {
        uploadId,
        error: uploadCheckError
      });
      throw new Error(`Upload with ID ${uploadId} not found or inaccessible`);
    }

    console.log('Upload verified:', uploadExists);

    const { data: insertData, error: insertError } = await supabase
      .from('document_texts')
      .insert({
        upload_id: uploadId,
        extracted_text: extractedText,
      })
      .select();

    if (insertError) {
      console.error('Failed to save document text:', {
        error: insertError,
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        upload_id: uploadId,
        text_length: extractedText.length
      });
      throw new Error(`Failed to save document text to database: ${insertError.message || insertError.code || 'Unknown error'}`);
    }

    console.log('Document text saved successfully:', insertData);

    return extractedText;
  } catch (error) {
    console.error('Document processing error:', error);
    throw error;
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error(`Failed to extract text from DOCX: ${errorMessage}`);
  }
}

async function extractPDFText(buffer: ArrayBuffer): Promise<string> {
  try {
    // Import pdf-parse for PDF text extraction
    const pdfParse = await import('npm:pdf-parse@1.1.1');
    
    // Extract text from PDF using pdf-parse
    const data = await pdfParse.default(buffer);
    
    if (!data.text || data.text.trim().length === 0) {
      throw new Error('PDF file appears to contain no readable text. It may be image-based, encrypted, or corrupted.');
    }
    
    // Clean up the extracted text
    const cleanText = data.text
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // Remove null bytes and control characters
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\r/g, '\n') // Convert remaining \r to \n
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Clean up excessive newlines
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    if (!cleanText || cleanText.length < 10) {
      throw new Error('PDF file appears to contain minimal or no readable text content.');
    }
    
    console.log('PDF text extracted successfully using pdf-parse, length:', cleanText.length);
    
    return cleanText;
  } catch (error) {
    console.error('PDF extraction error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error(`Failed to extract text from PDF: ${errorMessage}`);
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
  
  // Clean up whitespace more carefully - preserve whitespace within strings
  cleaned = cleanWhitespacePreservingStrings(cleaned);
  
  return cleaned.trim();
}

function cleanWhitespacePreservingStrings(text: string): string {
  let result = '';
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const prevChar = i > 0 ? text[i - 1] : '';
    
    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }
    
    if (char === '\\' && inString) {
      result += char;
      escapeNext = true;
      continue;
    }
    
    if (char === '"' && !escapeNext) {
      inString = !inString;
      result += char;
      continue;
    }
    
    if (inString) {
      // Inside string - preserve all whitespace
      result += char;
    } else {
      // Outside string - normalize whitespace
      if (/\s/.test(char)) {
        // Only add space if previous char wasn't whitespace
        if (result.length > 0 && !/\s$/.test(result)) {
          result += ' ';
        }
      } else {
        result += char;
      }
    }
  }
  
  return result;
}

function extractJsonFromText(text: string): string | null {
  // Method 1: Try to extract from markdown JSON code block
  const markdownJsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (markdownJsonMatch) {
    const extracted = markdownJsonMatch[1].trim();
    // Test if it's valid JSON before cleaning
    if (isValidJson(extracted)) {
      return extracted;
    }
    return cleanJsonString(extracted);
  }

  // Method 2: Try to extract from generic code block
  const codeBlockMatch = text.match(/```\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].trim();
    // Check if it looks like JSON (starts with { and ends with })
    if (content.startsWith('{') && content.endsWith('}')) {
      if (isValidJson(content)) {
        return content;
      }
      return cleanJsonString(content);
    }
  }

  // Method 3: Extract content between first { and last }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
    const extracted = text.substring(firstBrace, lastBrace + 1);
    if (isValidJson(extracted)) {
      return extracted;
    }
    return cleanJsonString(extracted);
  }

  // Method 4: Try the original regex approach as fallback
  const regexMatch = text.match(/\{[\s\S]*\}/);
  if (regexMatch) {
    const candidate = regexMatch[0];
    if (isValidJson(candidate)) {
      return candidate;
    }
    return cleanJsonString(candidate);
  }

  return null;
}

function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
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
          temperature: 0.3,
          topK: 40,
          topP: 0.95,
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      throw new Error(`Gemini API failed: ${response.statusText}`);
    }

    const geminiData = await response.json();
    
    // Enhanced response validation
    console.log('Full Gemini API response:', JSON.stringify(geminiData, null, 2));
    
    // Check if candidates array exists and is not empty
    if (!geminiData.candidates || !Array.isArray(geminiData.candidates) || geminiData.candidates.length === 0) {
      console.error('No candidates found in Gemini response. This may indicate content was blocked by safety filters or the API could not generate a response.');
      
      // Check for safety ratings or other blocking reasons
      if (geminiData.promptFeedback) {
        console.error('Prompt feedback:', geminiData.promptFeedback);
        if (geminiData.promptFeedback.blockReason) {
          throw new Error(`Gemini API blocked the request: ${geminiData.promptFeedback.blockReason}`);
        }
      }
      
      throw new Error('No response candidates received from Gemini API. The content may have been blocked by safety filters or the API was unable to generate a response.');
    }
    
    const candidate = geminiData.candidates[0];
    
    // Check if the candidate has content
    if (!candidate.content || !candidate.content.parts || !Array.isArray(candidate.content.parts) || candidate.content.parts.length === 0) {
      console.error('No content parts found in candidate:', candidate);
      
      // Check for finish reason
      if (candidate.finishReason) {
        console.error('Candidate finish reason:', candidate.finishReason);
        if (candidate.finishReason === 'SAFETY') {
          throw new Error('Gemini API response was blocked due to safety concerns');
        } else if (candidate.finishReason === 'RECITATION') {
          throw new Error('Gemini API response was blocked due to recitation concerns');
        } else if (candidate.finishReason === 'OTHER') {
          throw new Error('Gemini API response was blocked for other reasons');
        }
      }
      
      throw new Error('No content received from Gemini API candidate');
    }
    
    const generatedText = candidate.content.parts[0].text;
    
    // Check if generated text exists and is not empty/whitespace
    if (!generatedText || typeof generatedText !== 'string' || generatedText.trim().length === 0) {
      console.error('Generated text is empty or invalid:', generatedText);
      throw new Error('No valid text content received from Gemini API');
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
      
      // Try one more careful cleaning attempt
      try {
        const carefullyCleaned = jsonString
          .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '') // Remove only problematic control characters, keep \n and \t
          .replace(/\r\n/g, '\n') // Normalize line endings
          .replace(/\r/g, '\n'); // Convert remaining \r to \n
        
        console.log('Attempting careful cleaning:', carefullyCleaned);
        analysis = JSON.parse(carefullyCleaned);
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

async function generateContentName(extractedText: string): Promise<string> {
  if (!GOOGLE_GEMINI_API_KEY) {
    console.warn('Google Gemini API key not configured for content naming');
    return 'Document'; // Fallback name
  }

  try {
    // Truncate text for naming (use first 3000 characters for better context)
    const textForNaming = extractedText.length > 3000 
      ? extractedText.substring(0, 3000) + '...'
      : extractedText;

    const prompt = `
      Based on this text content, generate a concise and descriptive name (2-8 words) that captures the main topic, subject matter, or document title. 
      The name should be professional and suitable for academic/educational content.
      
      Guidelines:
      - Focus on the core subject matter or main topic
      - Use clear, descriptive language
      - Avoid generic terms like "document" or "text"
      - If it's a lecture, course material, or academic content, include relevant subject/topic
      - Keep it between 2-8 words
      
      Text content: ${textForNaming}
      
      Return only the descriptive name without quotes, explanations, or additional text.
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
          temperature: 0.3,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 50,
        }
      }),
    });

    if (!response.ok) {
      console.error('Gemini API error for content naming:', response.statusText);
      return 'Document'; // Fallback name
    }

    const geminiData = await response.json();
    
    if (!geminiData.candidates || !Array.isArray(geminiData.candidates) || geminiData.candidates.length === 0) {
      console.warn('No candidates found in Gemini response for content naming');
      return 'Document'; // Fallback name
    }

    const candidate = geminiData.candidates[0];
    
    if (!candidate.content || !candidate.content.parts || !Array.isArray(candidate.content.parts) || candidate.content.parts.length === 0) {
      console.warn('No content parts found in content naming candidate');
      return 'Document'; // Fallback name
    }

    const generatedName = candidate.content.parts[0].text;
    
    if (!generatedName || typeof generatedName !== 'string' || generatedName.trim().length === 0) {
      console.warn('No valid name generated by Gemini');
      return 'Document'; // Fallback name
    }

    // Clean up the generated name - remove quotes, extra whitespace, and limit length
    const cleanName = generatedName
      .trim()
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .replace(/[^\w\s-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, ' ') // Normalize spaces
      .substring(0, 100) // Limit length
      .trim();

    console.log(`Generated content name: "${cleanName}" from text preview: "${textForNaming.substring(0, 100)}..."`);
    
    return cleanName || 'Document'; // Fallback if cleaning results in empty string
  } catch (error) {
    console.error('Error generating content name:', error);
    return 'Document'; // Fallback name
  }
}