
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export async function processImageWithOCR(fileUrl: string) {
  console.log('Processing image with OCR:', fileUrl);
  const response = await fetch(`${supabaseUrl}/functions/v1/process-image`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageUrl: fileUrl })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to process image: ${error}`);
  }

  const { text } = await response.json();
  return text;
}

export async function getPDFImages(supabase: any, documentId: string) {
  if (!documentId) {
    throw new Error('Document ID is required for fetching PDF images');
  }

  try {
    const { data: pages, error } = await supabase
      .from('document_pages')
      .select('*')
      .eq('document_id', documentId)
      .order('page_number');

    if (error) {
      console.error('Error fetching PDF pages:', error);
      throw error;
    }

    console.log('Successfully fetched PDF pages:', pages);
    return JSON.stringify(pages);
  } catch (error) {
    console.error('Error in getPDFImages:', error);
    throw error;
  }
}
