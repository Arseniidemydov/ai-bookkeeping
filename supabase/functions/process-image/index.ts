
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createWorker } from 'https://esm.sh/tesseract.js@5.0.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl } = await req.json();
    console.log('Processing image:', imageUrl);

    // Download the image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to fetch image');
    }

    // Initialize Tesseract worker with explicit configuration
    const worker = await createWorker({
      workerPath: 'https://unpkg.com/tesseract.js@v5.0.5/dist/worker.min.js',
      corePath: 'https://unpkg.com/tesseract.js-core@v5.0.0/tesseract-core.wasm.js',
      logger: msg => console.log(msg)
    });
    
    await worker.loadLanguage('eng');
    await worker.initialize('eng');

    // Convert image to blob and process with Tesseract
    const imageBlob = await imageResponse.blob();
    const { data: { text } } = await worker.recognize(imageBlob);
    await worker.terminate();

    console.log('Extracted text:', text);

    return new Response(
      JSON.stringify({ 
        text,
        success: true 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error processing image:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
