
import { SupabaseClient } from '@supabase/supabase-js';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

export async function processAssistantResponse(
  supabase: SupabaseClient,
  prompt: string,
  userId: string,
  threadId?: string,
  fileUrl?: string
) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You are a helpful assistant that helps users manage their finances and expenses.' 
          },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const generatedText = data.choices[0].message.content;

    return {
      generatedText,
      threadId: threadId || crypto.randomUUID()
    };
  } catch (error) {
    console.error('Error in processAssistantResponse:', error);
    throw error;
  }
}
