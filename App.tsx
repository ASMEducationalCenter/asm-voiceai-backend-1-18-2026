import React, { useState, useEffect, useRef, useCallback } from "react";
import { InterviewStatus, TranscriptionItem } from "./types";
import { SYSTEM_INSTRUCTION } from "./constants";

/* =========================
   UI Components
========================= */

const TranscriptionDisplay: React.FC<{ items: TranscriptionItem[] }> = ({ items }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [items]);

  return (
    <div
      ref={scrollRef}
      className="bg-white rounded-xl shadow-inner border border-slate-200 h-64 overflow-y-auto p-4 space-y-4"
    >
      {items.length === 0 && (
        <div className="flex items-center justify-center h-full text-slate-400 italic">
          Conversation transcription will appear here...
        </div>
      )}
      {items.map((item, idx) => (
        <div
          key={idx}
          className={`flex flex-col ${
            item.role === "user" ? "items-end" : "items-start"
          }`}
        >
          <span className="text-[10px] uppercase font-bold text-slate-400 mb-1">
            {item.role === "user" ? "You" : "Coach"}
          </span>
          <div
            className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${
              item.role === "user"
                ? "bg-blue-600 text-white rounded-tr-none"
                : "bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200"
            }`}
          >
            {item.text}
          </div>
        </div>
      ))}
    </div>
  );
};

const Header: React.FC = () => (
  <header className="bg-white border-b border-slate-200 py-6 mb-8">
    <div className="max-w-4xl mx-auto px-4 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-slate-900">ASM Educational Center</h1>
        <p className="text-sm text-slate-500">IT Help Desk Mock Interview Coach</p>
      </div>
    </div>
  </header>
);

/* =========================
   MAIN APP
========================= */

const App: React.FC = () => {
  const [status, setStatus] = useState<InterviewStatus>(InterviewStatus.IDLE);
  const [transcriptions, setTranscriptions] = useState<TranscriptionItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

  /* =========================
     STOP SESSION
  ========================= */
  const stopSession = useCallback(() => {
    try {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    } catch {}

    try {
      window.speechSynthesis.cancel();
    } catch {}

    setStatus(InterviewStatus.FINISHED);
  }, []);

  /* =========================
     START INTERVIEW
  ========================= */
  const startInterview = async () => {
    try {
      setStatus(InterviewStatus.CONNECTING);
      setErrorMsg(null);
      setTranscriptions([]);

      if (!API_BASE) {
        setErrorMsg("Backend is not configured. Contact ASM support.");
        setStatus(InterviewStatus.ERROR);
        return;
      }

      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        setErrorMsg("Speech Recognition requires Google Chrome on desktop.");
        setStatus(InterviewStatus.ERROR);
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setStatus(InterviewStatus.ACTIVE);

        const intro = new SpeechSynthesisUtterance(
          "Welcome to the ASM IT Help Desk mock interview. Please introduce yourself."
        );
        window.speechSynthesis.speak(intro);
      };

      recognition.onresult = async (event: any) => {
        const last = event.results[event.results.length - 1];
        const transcriptText = last?.[0]?.transcript?.trim();
        if (!transcriptText) return;

        setTranscriptions(prev => [
          ...prev,
          { role: "user", text: transcriptText, timestamp: Date.now() }
        ]);

        const prompt = `${SYSTEM_INSTRUCTION}

Student said:
${transcriptText}

Coach response:`;


        const r = await fetch(`${API_BASE}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt })
        });

        const data = await r.json();

        if (!r.ok) {
          throw new Error(data?.error || "Backend error");
        }

        const aiText = data.text || "";

        setTranscriptions(prev => [
          ...prev,
          { role: "model", text: aiText, timestamp: Date.now() }
        ]);

        const utterance = new SpeechSynthesisUtterance(aiText);
        utterance.rate = 1;
        window.speechSynthesis.speak(utterance);
      };

      recognition.onerror = () => {
        setErrorMsg("Microphone error. Please allow microphone access.");
        setStatus(InterviewStatus.ERROR);
      };

      recognitionRef.current = recognition;
      recognition.start();

    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to start interview.");
      setStatus(InterviewStatus.ERROR);
    }
  };

  /* =========================
     RENDER
  ========================= */

  return (
    <div className="min-h-screen flex flex-col pb-12">
      <Header />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4">
        {status === InterviewStatus.IDLE && (
          <div className="bg-white rounded-2xl shadow-xl border p-8 text-center">
            <h2 className="text-3xl font-bold mb-6">Ready for your Interview?</h2>
            <button
              onClick={startInterview}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-10 rounded-full"
            >
              Start Mock Interview
            </button>
          </div>
        )}

        {status === InterviewStatus.ACTIVE && (
          <div className="space-y-6">
            <button
              onClick={stopSession}
              className="text-sm text-red-600 font-semibold"
            >
              End Session
            </button>
            <TranscriptionDisplay items={transcriptions} />
          </div>
        )}

        {status === InterviewStatus.FINISHED && (
          <div className="bg-white rounded-xl p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">Session Completed</h2>
            <button
              onClick={() => setStatus(InterviewStatus.IDLE)}
              className="bg-blue-600 text-white px-8 py-3 rounded-full"
            >
              Start Again
            </button>
          </div>
        )}

        {status === InterviewStatus.ERROR && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
            <h2 className="text-xl font-bold text-red-600 mb-2">Error</h2>
            <p className="mb-6">{errorMsg}</p>
            <button
              onClick={() => setStatus(InterviewStatus.IDLE)}
              className="bg-slate-900 text-white px-8 py-3 rounded-full"
            >
              Try Again
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
