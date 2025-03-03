
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Device } from '@capacitor/device';

const Index = () => {
  const [text, setText] = useState("");
  const [platform, setPlatform] = useState("");
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const texts = [
    "Your AI Bookkeeper",
    "Expense tracking simplified",
    "No more need for an accountant"
  ];
  const navigate = useNavigate();

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTextIndex((prevIndex) => (prevIndex + 1) % texts.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let currentText = texts[currentTextIndex];
    let currentChar = 0;
    setText("");

    const typingInterval = setInterval(() => {
      if (currentChar <= currentText.length) {
        setText(currentText.slice(0, currentChar));
        currentChar++;
      } else {
        clearInterval(typingInterval);
      }
    }, 100);

    return () => clearInterval(typingInterval);
  }, [currentTextIndex]);

  useEffect(() => {
    console.log("Index component mounted");
    const getPlatform = async () => {
      try {
        const info = await Device.getInfo();
        console.log("Device info retrieved:", info);
        setPlatform(info.platform || 'web');
      } catch (error) {
        console.error("Error getting device info:", error);
        setPlatform('unknown');
      }
    };
    getPlatform();
  }, []);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <div className="text-center space-y-8 max-w-2xl mx-auto px-6">
        <h1 className="text-2xl md:text-3xl font-light text-white min-h-[80px] tracking-wide">
          {text}
        </h1>
        {platform && (
          <p className="text-white/60">Running on {platform}</p>
        )}
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
