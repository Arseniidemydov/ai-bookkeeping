
import React, { useState, useRef } from "react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { SendHorizontal, Upload } from "lucide-react";
import { toast } from "sonner";
import TransactionImageUpload from "./chat/TransactionImageUpload";
import LoadingSpinner from "./chat/LoadingSpinner";
import { useChat } from "@/hooks/useChat";

export default function ChatInput() {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    chatMutation,
    saveMutation,
    uploadMutation,
    simulateWebhookMutation
  } = useChat();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() && !fileInputRef.current?.files?.length) return;

    setIsLoading(true);
    try {
      // First save the user's message
      const userMessage = {
        content: message,
        sender: "user" as const,
      };

      await saveMutation.mutateAsync(userMessage);

      // Generate and save the response
      const response = await chatMutation.mutateAsync({ message });
      
      await saveMutation.mutateAsync({
        content: response,
        sender: "other" as const,
      });

      setMessage("");
    } catch (error) {
      console.error('Error in chat:', error);
      toast.error("Failed to send message");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setIsLoading(true);
    try {
      const uploadedFile = await uploadMutation.mutateAsync(file);

      // Save the user's upload message
      await saveMutation.mutateAsync({
        content: `Uploaded file: ${file.name}`,
        sender: "user" as const,
        file: uploadedFile
      });

      // Generate and save the response
      const response = await chatMutation.mutateAsync({ 
        message: "Analyze this file",
        fileUrl: uploadedFile.url
      });

      await saveMutation.mutateAsync({
        content: response,
        sender: "other" as const,
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error("Failed to upload file");
    } finally {
      setIsLoading(false);
    }
  };

  const simulateWebhook = async () => {
    try {
      await simulateWebhookMutation.mutateAsync();
      toast.success("Webhook simulation triggered");
    } catch (error) {
      console.error('Error simulating webhook:', error);
      toast.error("Failed to simulate webhook");
    }
  };

  return (
    <div className="border-t p-4">
      <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
        <div className="flex items-center space-x-4">
          <TransactionImageUpload onFileSelect={handleFileUpload} />
          <Button 
            type="button"
            variant="outline"
            onClick={simulateWebhook}
            disabled={isLoading}
          >
            Test Plaid Webhook
          </Button>
        </div>
        <div className="flex space-x-4">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1"
            disabled={isLoading}
          />
          <Button type="submit" disabled={isLoading || (!message.trim() && !fileInputRef.current?.files?.length)}>
            {isLoading ? <LoadingSpinner /> : <SendHorizontal className="h-5 w-5" />}
          </Button>
        </div>
      </form>
    </div>
  );
}
