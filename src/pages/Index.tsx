
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const Index = () => {
  const [text, setText] = useState("Your AI Book keeper...");
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const texts = [
    "Your AI Book keeper...",
    "Adding expenses easier than ever...",
    "No more need for accountant..."
  ];
  const navigate = useNavigate();

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTextIndex((prevIndex) => (prevIndex + 1) % texts.length);
    }, 3000);

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
    }, 50);

    return () => clearInterval(typingInterval);
  }, [currentTextIndex]);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="text-center space-y-8">
        <h1 className="text-4xl md:text-6xl font-bold text-white min-h-[80px]">
          {text}
        </h1>
        <Button 
          onClick={() => navigate('/auth')}
          className="bg-primary hover:bg-primary/90 text-white px-8 py-6 text-xl"
        >
          Start now
        </Button>
      </div>
    </div>
  );
};

export default Index;
