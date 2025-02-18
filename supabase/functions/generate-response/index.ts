import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { corsHeaders } from './utils/cors.ts';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const { prompt, userId, threadId, fileUrl } = await req.json();
    console.log('Request received:', { prompt, userId, threadId, fileUrl });

    let messages = [];
    let systemMessage = "You are a helpful AI assistant.";

    if (fileUrl) {
      systemMessage += " The user has shared an image with you. Please analyze it and provide relevant information.";
      messages.push({
        role: "system",
        content: [
          { type: "text", text: systemMessage },
          { type: "image_url", image_url: fileUrl }
        ]
      });
    } else {
      messages.push({
        role: "system",
        content: systemMessage
      });
    }

    messages.push({
      role: "user",
      content: prompt
    });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: fileUrl ? "gpt-4-vision-preview" : "gpt-4",
        messages: messages,
        max_tokens: 1000,
        temperature: 0.7,
        stream: false
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to generate response');
    }

    const data = await response.json();
    const generatedText = data.choices[0].message.content;

    return new Response(
      JSON.stringify({ 
        generatedText,
        threadId: threadId || crypto.randomUUID()
      }),
      {
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (error) {
    console.error('Error in generate-response:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An unknown error occurred'
      }),
      { 
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});
