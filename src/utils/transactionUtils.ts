
import { supabase } from "@/integrations/supabase/client";

export async function attachImageToTransaction(
  transactionId: number,
  file: File
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Upload the file to storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('transaction_attachments')
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) throw uploadError;

    // 2. Create a document page entry
    const { data: pageData, error: pageError } = await supabase
      .from('document_pages')
      .insert({
        image_url: `${process.env.VITE_SUPABASE_URL}/storage/v1/object/public/transaction_attachments/${fileName}`,
        page_number: 1
      })
      .select()
      .single();

    if (pageError) throw pageError;

    // 3. Update the transaction with the document page reference
    const { error: updateError } = await supabase
      .from('transactions')
      .update({ document_page_id: pageData.id })
      .eq('id', transactionId);

    if (updateError) throw updateError;

    return { success: true };
  } catch (error) {
    console.error('Error attaching image to transaction:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to attach image' 
    };
  }
}
