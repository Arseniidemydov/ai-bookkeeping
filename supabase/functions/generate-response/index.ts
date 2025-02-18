
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import OpenAI from "https://deno.land/x/openai@v4.24.1/mod.ts";

const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY')!
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    const { prompt, fileUrl } = await req.json();
    console.log('Request received:', { prompt, fileUrl });

    const messages = [
      {
        role: "system",
        content: "You are a helpful AI assistant that helps users manage their finances and business. You're direct and concise in your responses."
      },
      {
        role: "user",
        content: fileUrl ? `${prompt}\nImage URL: ${fileUrl}` : prompt
      }
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: messages,
    });

    const generatedText = completion.choices[0].message.content;
    console.log('Generated response successfully');

    return new Response(
      JSON.stringify({ 
        generatedText,
        threadId: null // For compatibility with existing frontend
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
