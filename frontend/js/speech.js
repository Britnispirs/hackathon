/**
 * Voice & Audio Manager for Web Speech API and Canvas Visualizer
 */

class VoiceAssistantSpeech {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.isTtsEnabled = localStorage.getItem('tts_enabled') !== 'false'; // default true
    this.recognitionSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    
    // Web Audio Visualizer state
    this.canvas = null;
    this.canvasCtx = null;
    this.audioCtx = null;
    this.analyser = null;
    this.audioSource = null;
    this.mediaStream = null;
    this.dataArray = null;
    this.visualizerAnimationId = null;
    this.isMicActive = false;

    this.onResultCallback = null;
    this.onErrorCallback = null;
    this.onStatusChangeCallback = null;

    this._initRecognition();
  }

  _initRecognition() {
    if (!this.recognitionSupported) {
      console.warn('SpeechRecognition is not supported in this browser.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'ru-RU';
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    let finalTranscript = '';

    this.recognition.onstart = () => {
      this.isListening = true;
      finalTranscript = '';
      if (this.onStatusChangeCallback) {
        this.onStatusChangeCallback('listening');
      }
    };

    this.recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      const activeText = finalTranscript || interim;
      if (this.onResultCallback) {
        this.onResultCallback(activeText, false);
      }
    };

    this.recognition.onerror = (event) => {
      console.warn('SpeechRecognition error:', event.error);
      this.isListening = false;
      if (this.onErrorCallback) {
        this.onErrorCallback(event.error);
      }
      if (this.onStatusChangeCallback) {
        this.onStatusChangeCallback('idle');
      }
      this.stopMicStream();
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (this.onResultCallback && finalTranscript.trim()) {
        this.onResultCallback(finalTranscript.trim(), true);
      }
      if (this.onStatusChangeCallback) {
        this.onStatusChangeCallback('idle');
      }
      this.stopMicStream();
    };
  }

  setCallbacks({ onResult, onError, onStatusChange }) {
    this.onResultCallback = onResult;
    this.onErrorCallback = onError;
    this.onStatusChangeCallback = onStatusChange;
  }

  async startListening() {
    if (!this.recognitionSupported) {
      if (this.onErrorCallback) this.onErrorCallback('not_supported');
      return;
    }

    if (this.isListening) return;

    try {
      this.cancelSpeech(); // Silence TTS if currently speaking
      await this.startMicStream();
      this.recognition.start();
    } catch (e) {
      console.error('Failed to start recognition:', e);
      if (this.onErrorCallback) this.onErrorCallback(e.message);
    }
  }

  stopListening() {
    if (!this.recognition || !this.isListening) return;
    try {
      this.recognition.stop();
    } catch (e) {
      console.warn('Error stopping recognition:', e);
    }
  }

  toggleListening() {
    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  /* ---------------- TTS (Text To Speech) ---------------- */

  toggleTts() {
    this.isTtsEnabled = !this.isTtsEnabled;
    localStorage.setItem('tts_enabled', this.isTtsEnabled ? 'true' : 'false');
    if (!this.isTtsEnabled) {
      this.cancelSpeech();
    }
    return this.isTtsEnabled;
  }

  speak(text) {
    if (!this.isTtsEnabled || !('speechSynthesis' in window)) return;
    if (!text) return;

    this.cancelSpeech();

    // Clean markdown or technical characters for clean speech
    const cleanText = text
      .replace(/•/g, '')
      .replace(/[#*_~`]/g, '')
      .replace(/«|»/g, '')
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'ru-RU';
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    // Pick a natural Russian voice if available
    const voices = window.speechSynthesis.getVoices();
    const ruVoice = voices.find(v => v.lang.startsWith('ru') && !v.name.includes('eSpeak')) ||
                    voices.find(v => v.lang.startsWith('ru'));
    if (ruVoice) {
      utterance.voice = ruVoice;
    }

    utterance.onstart = () => {
      if (this.onStatusChangeCallback) this.onStatusChangeCallback('speaking');
    };

    utterance.onend = () => {
      if (this.onStatusChangeCallback && !this.isListening) {
        this.onStatusChangeCallback('idle');
      }
    };

    utterance.onerror = () => {
      if (this.onStatusChangeCallback && !this.isListening) {
        this.onStatusChangeCallback('idle');
      }
    };

    window.speechSynthesis.speak(utterance);
  }

  cancelSpeech() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  /* ---------------- Audio Visualizer Canvas ---------------- */

  initVisualizer(canvasElement) {
    this.canvas = canvasElement;
    this.canvasCtx = canvasElement.getContext('2d');
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    this._startVisualizerLoop();
  }

  resizeCanvas() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * (window.devicePixelRatio || 1);
    this.canvas.height = rect.height * (window.devicePixelRatio || 1);
  }

  async startMicStream() {
    try {
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioCtx();
      }
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;
      this.audioSource = this.audioCtx.createMediaStreamSource(this.mediaStream);
      this.audioSource.connect(this.analyser);
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.isMicActive = true;
    } catch (err) {
      console.warn('Could not acquire microphone for audio visualization:', err);
      this.isMicActive = false;
    }
  }

  stopMicStream() {
    this.isMicActive = false;
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.audioSource) {
      try { this.audioSource.disconnect(); } catch (e) {}
      this.audioSource = null;
    }
  }

  _startVisualizerLoop() {
    let phase = 0;

    const render = () => {
      this.visualizerAnimationId = requestAnimationFrame(render);
      if (!this.canvas || !this.canvasCtx) return;

      const ctx = this.canvasCtx;
      const width = this.canvas.width;
      const height = this.canvas.height;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      let intensity = 0;
      if (this.isMicActive && this.analyser && this.dataArray) {
        this.analyser.getByteFrequencyData(this.dataArray);
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
          sum += this.dataArray[i];
        }
        intensity = (sum / this.dataArray.length) / 255;
      }

      phase += 0.04;

      // Draw flowing sine waves (idle or active pulse)
      const numWaves = 3;
      for (let w = 0; w < numWaves; w++) {
        ctx.beginPath();
        const baseAlpha = 0.15 + (w * 0.1) + (intensity * 0.4);
        const waveColor = w === 0 ? `rgba(99, 102, 241, ${baseAlpha})` :
                          w === 1 ? `rgba(6, 182, 212, ${baseAlpha})` :
                                    `rgba(244, 63, 94, ${this.isListening ? baseAlpha : 0.08})`;

        ctx.strokeStyle = waveColor;
        ctx.lineWidth = 2 * (window.devicePixelRatio || 1);

        const freq = 0.008 + (w * 0.003);
        const amp = (10 + (w * 6) + (intensity * 40)) * (window.devicePixelRatio || 1);

        for (let x = 0; x < width; x += 4) {
          const y = centerY + Math.sin(x * freq + phase + w * 1.5) * amp;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };

    render();
  }
}

// Global instance
window.VoiceAssistantSpeech = VoiceAssistantSpeech;
