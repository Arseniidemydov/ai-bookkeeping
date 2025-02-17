
import { attachImageToTransaction } from "./transactionUtils";

export async function handleImageAttachment(transactionId: number, imageFile: File) {
  const result = await attachImageToTransaction(transactionId, imageFile);
  
  if (!result.success) {
    console.error('Failed to attach image:', result.error);
    // Handle the error in your assistant implementation
    return false;
  }
  
  return true;
}
