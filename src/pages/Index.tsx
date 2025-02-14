
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";

const Index = () => {
  const [text, setText] = useState("");
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const texts = [
    "Your AI Bookkeeper",
    "Making expense tracking easier than ever",
    "No more need for an accountant"
  ];
  const navigate = useNavigate();

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTextIndex((prevIndex) => (prevIndex + 1) % texts.length);
    }, 4000); // Delay between text changes

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setText("");
    let currentText = texts[currentTextIndex];
    let currentChar = 0;

    // Set initial character immediately
    setText(currentText[0] || "");
    currentChar = 1;

    const typingInterval = setInterval(() => {
      if (currentChar < currentText.length) {
        setText(text => text + currentText[currentChar]);
        currentChar++;
      } else {
        clearInterval(typingInterval);
      }
    }, 100); // Typing speed

    return () => clearInterval(typingInterval);
  }, [currentTextIndex]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <div className="text-center space-y-8 max-w-2xl mx-auto px-6">
        <h1 className="text-2xl md:text-3xl font-light text-white min-h-[80px] tracking-wide">
          {text}
        </h1>
        <Button 
          onClick={() => navigate('/auth')}
          className="bg-gradient-to-r from-gray-900 to-gray-800 hover:from-gray-800 hover:to-gray-700 text-white px-8 py-6 text-xl rounded-xl shadow-lg transition-all duration-300 hover:scale-105 border border-white/10"
        >
          Start now
        </Button>
      </div>
    </div>
  );
};

export default Index;
