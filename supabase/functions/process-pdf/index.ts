
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';
import { PDFDocument } from 'https://cdn.skypack.dev/pdf-lib';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function convertPDFPageToImage(pdfBytes: Uint8Array, pageIndex: number): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const page = pdfDoc.getPages()[pageIndex];
  
  // Create a new document with just this page
  const singlePageDoc = await PDFDocument.create();
  const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [pageIndex]);
  singlePageDoc.addPage(copiedPage);
  
  // Convert to PNG
  const pngBytes = await singlePageDoc.saveAsBase64({ format: 'png' });
  return Uint8Array.from(atob(pngBytes), c => c.charCodeAt(0));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId, fileUrl } = await req.json();
    console.log('Processing PDF:', { documentId, fileUrl });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update document status to processing
    await supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', documentId);

    // Download the PDF file
    const response = await fetch(fileUrl);
    const pdfBuffer = await response.arrayBuffer();
    const pdfBytes = new Uint8Array(pdfBuffer);

    // Load the PDF document
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();

    // Process each page
    for (let i = 0; i < pageCount; i++) {
      try {
        const pageImageBytes = await convertPDFPageToImage(pdfBytes, i);
        
        // Upload the image to storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('pdf_pages')
          .upload(`${documentId}/page-${i + 1}.png`, pageImageBytes, {
            contentType: 'image/png',
          });

        if (uploadError) throw uploadError;

        // Get the public URL
        const { data: { publicUrl } } = supabase.storage
          .from('pdf_pages')
          .getPublicUrl(`${documentId}/page-${i + 1}.png`);

        // Save page info to database
        await supabase
          .from('document_pages')
          .insert({
            document_id: documentId,
            page_number: i + 1,
            image_url: publicUrl,
          });

      } catch (error) {
        console.error(`Error processing page ${i + 1}:`, error);
        throw error;
      }
    }

    // Update document status to completed
    await supabase
      .from('documents')
      .update({ status: 'completed' })
      .eq('id', documentId);

    return new Response(
      JSON.stringify({ success: true, pageCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing PDF:', error);
    
    // Update document status to error if we have a documentId
    if (error.documentId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      
      await supabase
        .from('documents')
        .update({ status: 'error' })
        .eq('id', error.documentId);
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
