
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const Index = () => {
  const [text, setText] = useState("Your AI Bookkeeper");
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
    }, 4000); // Increased delay between text changes

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setText("");
    let currentText = texts[currentTextIndex];
    let currentChar = 0;

    const typingInterval = setInterval(() => {
      if (currentChar < currentText.length) {
        setText((prev) => prev + currentText[currentChar]);
        currentChar++;
      } else {
        clearInterval(typingInterval);
      }
    }, 100); // Slowed down typing speed

    return () => clearInterval(typingInterval);
  }, [currentTextIndex]);

  return (
    <div className="min-h-screen bg-[#222222] flex flex-col items-center justify-center p-4">
      <div className="text-center space-y-8">
        <h1 className="text-4xl md:text-6xl font-bold text-white min-h-[80px]">
          {text}
        </h1>
        <Button 
          onClick={() => navigate('/auth')}
          className="bg-[#222222] hover:bg-[#2a2a2a] text-white px-8 py-6 text-xl rounded-md border border-white/10"
        >
          Start now
        </Button>
      </div>
    </div>
  );
};

export default Index;
