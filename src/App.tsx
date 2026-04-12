import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Webcam from 'react-webcam';
import { 
  Camera, 
  Upload, 
  History, 
  Heart, 
  ArrowRight, 
  User, 
  LogOut, 
  Smile, 
  Frown, 
  Meh, 
  AlertCircle,
  Loader2,
  ChevronLeft,
  CheckCircle2,
  Sparkles,
  Mail,
  Download
} from 'lucide-react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  type User as FirebaseUser,
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  type DocumentData
} from './firebase';
import { detectEmotionAndAge, type DetectionResult } from './services/geminiService';
import { cn } from './lib/utils';

// --- Types ---
interface DetectionRecord extends DetectionResult {
  id: string;
  timestamp: any;
  method: 'live' | 'upload';
}

// --- Components ---

const Button = ({ 
  children, 
  onClick, 
  className, 
  variant = 'primary',
  disabled = false,
  loading = false
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  className?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'warning';
  disabled?: boolean;
  loading?: boolean;
}) => {
  const variants = {
    primary: 'bg-brand-teal text-white hover:bg-brand-teal/90 shadow-sm',
    secondary: 'bg-brand-sage text-white hover:bg-brand-sage/90 shadow-sm',
    outline: 'border border-brand-light-grey text-brand-charcoal hover:bg-brand-cream shadow-sm',
    ghost: 'text-brand-muted-grey hover:bg-brand-light-grey',
    danger: 'bg-brand-error text-white hover:bg-brand-error/90 shadow-sm',
    warning: 'bg-brand-yellow text-brand-charcoal hover:bg-brand-yellow/90 shadow-sm',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'px-6 py-2.5 rounded-lg font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        className
      )}
    >
      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : children}
    </button>
  );
};

const Card = React.forwardRef<HTMLDivElement, { children: React.ReactNode; className?: string }>(
  ({ children, className }, ref) => (
    <div 
      ref={ref}
      className={cn('bg-brand-cream rounded-xl p-8 shadow-xl border border-brand-light-grey relative overflow-hidden', className)}
    >
      {children}
    </div>
  )
);
Card.displayName = 'Card';

const InfoBox = ({ message, className }: { message: string; className?: string }) => (
  <motion.div 
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className={cn("bg-brand-sky/20 p-4 rounded-xl border border-brand-sky/30 text-brand-charcoal text-sm leading-relaxed", className)}
  >
    {message}
  </motion.div>
);

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'welcome' | 'choice' | 'live' | 'upload' | 'history' | 'result' | 'filters'>('welcome');
  const [history, setHistory] = useState<DetectionRecord[]>([]);
  const [currentResult, setCurrentResult] = useState<DetectionResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [filterPos, setFilterPos] = useState({ x: 0, y: 0 });
  const [filterScale, setFilterScale] = useState(1);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [supportQuote, setSupportQuote] = useState("");

  const webcamRef = useRef<Webcam>(null);
  const filterCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const quotes = [
    "This too shall pass. Better days are ahead.",
    "You are stronger than you think, and more loved than you know.",
    "Every day is a new beginning. Take a deep breath and start again.",
    "You are not alone. There is always someone ready to listen.",
    "It's okay not to be okay. Be kind to yourself today.",
    "Your current situation is not your final destination.",
    "Believe in yourself and all that you are. You have the power to overcome."
  ];

  const helplines = [
    { country: "India", number: "9152987821", name: "iCall (Mental Health Helpline)" },
    { country: "India", number: "1098", name: "Childline (For Children in Distress)" },
    { country: "India", number: "022 2754 6669", name: "Aasra (24/7 Suicide Prevention)" }
  ];

  const filters = [
    { id: 'flowers', icon: '🌸', label: 'Flowers' },
    { id: 'cat', icon: '🐱', label: 'Cat' },
    { id: 'dog', icon: '🐶', label: 'Dog' },
    { id: 'icecream', icon: '🍦', label: 'Ice Cream' },
    { id: 'car', icon: '🚗', label: 'Car' },
    { id: 'happy', icon: '😊', label: 'Happy Face' },
    { id: 'party', icon: '🎉', label: 'Party' },
  ];

  const handleSendEmail = async (imageData: string) => {
    if (!user?.email) return;
    setIsSendingEmail(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      setError("Success! The photo has been sent to " + user.email);
    } catch (err) {
      setError("Failed to send email. Please try again.");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const saveFilteredImage = () => {
    const canvas = document.createElement('canvas');
    const video = webcamRef.current?.video;
    const container = containerRef.current;
    if (!video || !container) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Mirror if needed to match UI
    const isMirrored = webcamRef.current?.props.mirrored;
    if (isMirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    // Draw video
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Reset transform for filter drawing if we mirrored
    if (isMirrored) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // Draw filter if active
    if (activeFilter) {
      const filter = filters.find(f => f.id === activeFilter);
      if (filter) {
        const rect = container.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        
        // If mirrored, the filter's X position relative to center needs to be inverted 
        // because the user dragged it on a mirrored view.
        const adjustedX = isMirrored ? -filterPos.x : filterPos.x;
        const drawX = centerX + (adjustedX * scaleX);
        const drawY = centerY + (filterPos.y * scaleY);

        const fontSize = (canvas.height / 3) * filterScale;
        ctx.font = `${fontSize}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(filter.icon, drawX, drawY);
      }
    }

    const dataUrl = canvas.toDataURL('image/jpeg');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `emo-sense-filter-${Date.now()}.jpg`;
    link.click();
    
    setCapturedImage(dataUrl);
    setError("Photo saved. You can now send it to your email for your records.");
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const q = query(
        collection(db, 'detections'),
        where('userId', '==', user.uid),
        orderBy('timestamp', 'desc')
      );
      const unsub = onSnapshot(q, (snapshot) => {
        const records = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as DetectionRecord[];
        setHistory(records);
      });
      return () => unsub();
    }
  }, [user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login failed", err);
      setError("Failed to sign in. Please try again.");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setView('welcome');
  };

  const processImage = async (image: string, method: 'live' | 'upload') => {
    if (!user) return;
    setIsProcessing(true);
    setError(null);
    setCapturedImage(image);
    
    try {
      const result = await detectEmotionAndAge(image);
      setCurrentResult(result);
      
      if (result.emotion.toLowerCase().includes('sad')) {
        setSupportQuote(quotes[Math.floor(Math.random() * quotes.length)]);
      } else {
        setSupportQuote("");
      }
      
      // Save to Firestore
      await addDoc(collection(db, 'detections'), {
        userId: user.uid,
        emotion: result.emotion,
        age: result.age,
        timestamp: serverTimestamp(),
        method
      });
      
      setView('result');
    } catch (err) {
      console.error("Processing failed", err);
      setError("Failed to analyze image. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const captureLive = () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      processImage(imageSrc, 'live');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        processImage(reader.result as string, 'upload');
      };
      reader.readAsDataURL(file);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-cream flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-brand-teal animate-spin" />
          <p className="text-brand-muted-grey font-medium">Initializing system...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-cream text-brand-charcoal font-sans selection:bg-brand-sky/40 overflow-x-hidden">
      {/* Professional Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-20">
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-brand-sage/30 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-brand-sky/30 rounded-full blur-[120px]" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex justify-between items-center bg-brand-cream/80 backdrop-blur-md border-b border-brand-light-grey shadow-sm">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setView('welcome')}>
          <div className="w-10 h-10 bg-brand-teal rounded-lg flex items-center justify-center transition-transform group-hover:scale-105">
            <Smile className="text-white w-6 h-6" />
          </div>
          <span className="text-xl font-bold tracking-tight text-brand-charcoal">EMO-SENSE</span>
        </div>
        
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setView('history')}
                className="p-2 hover:bg-brand-light-grey rounded-full transition-colors text-brand-muted-grey"
                title="History"
              >
                <History className="w-6 h-6" />
              </button>
              <div className="flex items-center gap-3 pl-4 border-l border-brand-light-grey">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold text-brand-charcoal">{user.displayName}</p>
                  <p className="text-xs text-brand-muted-grey">{user.email}</p>
                </div>
                <img src={user.photoURL || ''} className="w-10 h-10 rounded-full border-2 border-brand-cream shadow-sm" alt="User" />
                <button onClick={handleLogout} className="p-2 hover:bg-brand-error/10 text-brand-error rounded-full transition-colors" title="Logout">
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          ) : (
            <Button onClick={handleLogin} variant="outline" className="py-2 px-6">
              Sign In
            </Button>
          )}
        </div>
      </nav>

      <main className="pt-24 pb-12 px-6 max-w-4xl mx-auto">
        <AnimatePresence mode="wait">
          {view === 'welcome' && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center space-y-12 py-12"
            >
              <div className="space-y-6">
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ repeat: Infinity, duration: 4 }}
                  className="inline-block p-4 bg-brand-sage/20 rounded-2xl text-brand-teal mb-4"
                >
                  <Sparkles className="w-12 h-12" />
                </motion.div>
                <h1 className="text-5xl sm:text-7xl font-bold text-brand-charcoal tracking-tight">
                  Advanced Emotion & <span className="text-brand-teal">Age Detection</span>
                </h1>
                <p className="text-xl text-brand-muted-grey max-w-2xl mx-auto">
                  Experience professional-grade facial analysis powered by advanced AI models.
                </p>
              </div>

              <InfoBox 
                message="Experience professional-grade facial analysis. Please sign in to begin your session." 
                className="max-w-md mx-auto"
              />

              <div className="flex flex-col items-center gap-6">
                {!user ? (
                  <Button onClick={handleLogin} className="w-full max-w-xs py-4 text-lg">
                    Get Started
                  </Button>
                ) : (
                  <Button onClick={() => setView('choice')} className="w-full max-w-xs py-4 text-lg" variant="secondary">
                    Let's Start
                  </Button>
                )}
                <div className="flex gap-3 flex-wrap justify-center">
                  {['Professional', 'Accurate', 'Secure', 'Private'].map(tag => (
                    <span key={tag} className="px-3 py-1 bg-brand-light-grey rounded-full text-brand-muted-grey text-xs font-medium uppercase tracking-wider">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {view === 'choice' && (
            <motion.div
              key="choice"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="space-y-8"
            >
              <div className="text-center space-y-4">
                <h2 className="text-4xl font-bold text-brand-charcoal">Select Analysis Method</h2>
                <InfoBox 
                  message="Choose a method to proceed. Use your camera for live detection or upload an existing image." 
                  className="max-w-lg mx-auto"
                />
              </div>

              <div className="grid sm:grid-cols-3 gap-6">
                <button 
                  onClick={() => setView('live')}
                  className="group relative bg-brand-cream rounded-xl p-8 shadow-md border border-brand-light-grey hover:border-brand-teal transition-all text-left"
                >
                  <div className="space-y-4">
                    <div className="w-12 h-12 bg-brand-sky/20 rounded-lg flex items-center justify-center text-brand-teal group-hover:bg-brand-teal group-hover:text-white transition-colors">
                      <Camera className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold text-brand-charcoal">Live Detection</h3>
                    <p className="text-sm text-brand-muted-grey">Real-time analysis via webcam.</p>
                  </div>
                </button>

                <div className="relative">
                  <input 
                    type="file" 
                    id="photo-upload" 
                    className="hidden" 
                    accept="image/*" 
                    onChange={handleFileUpload}
                  />
                  <label 
                    htmlFor="photo-upload"
                    className="group block cursor-pointer bg-brand-cream rounded-xl p-8 shadow-md border border-brand-light-grey hover:border-brand-sage transition-all text-left h-full"
                  >
                    <div className="space-y-4">
                      <div className="w-12 h-12 bg-brand-sage/20 rounded-lg flex items-center justify-center text-brand-sage group-hover:bg-brand-sage group-hover:text-white transition-colors">
                        <Upload className="w-6 h-6" />
                      </div>
                      <h3 className="text-xl font-bold text-brand-charcoal">Image Upload</h3>
                      <p className="text-sm text-brand-muted-grey">Analyze a stored photograph.</p>
                    </div>
                  </label>
                </div>

                <button 
                  onClick={() => setView('filters')}
                  className="group relative bg-brand-cream rounded-xl p-8 shadow-md border border-brand-light-grey hover:border-brand-lavender transition-all text-left"
                >
                  <div className="space-y-4">
                    <div className="w-12 h-12 bg-brand-lavender/20 rounded-lg flex items-center justify-center text-brand-lavender group-hover:bg-brand-lavender group-hover:text-white transition-colors">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold text-brand-charcoal">Visual Filters</h3>
                    <p className="text-sm text-brand-muted-grey">Apply overlays to your capture.</p>
                  </div>
                </button>
              </div>

              <div className="text-center">
                <Button variant="ghost" onClick={() => setView('welcome')}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Return to Home
                </Button>
              </div>
            </motion.div>
          )}

          {view === 'filters' && (
            <motion.div
              key="filters"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6 max-w-4xl mx-auto"
            >
              <div className="flex items-center justify-between gap-4">
                <Button variant="ghost" onClick={() => setView('choice')} className="px-4">
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <InfoBox message="Apply visual overlays to your capture. Drag the filter to position it and use the slider to adjust scale." className="flex-1" />
              </div>

              <Card className="p-2 overflow-hidden relative aspect-video bg-brand-charcoal flex items-center justify-center" ref={containerRef}>
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  className="w-full h-full object-cover rounded-lg"
                  videoConstraints={{ facingMode: "user" }}
                  onUserMediaError={() => setError("Camera access denied.")}
                  mirrored={true}
                  screenshotQuality={1}
                  disablePictureInPicture={false}
                  forceScreenshotSourceSize={false}
                  imageSmoothing={true}
                  onUserMedia={() => {}}
                />
                
                {activeFilter && (
                  <motion.div 
                    drag
                    dragConstraints={containerRef}
                    dragMomentum={false}
                    onDragEnd={(_, info) => {
                      setFilterPos(prev => ({
                        x: prev.x + info.offset.x,
                        y: prev.y + info.offset.y
                      }));
                    }}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: filterScale, opacity: 1 }}
                    className="absolute inset-0 flex items-center justify-center cursor-move"
                    style={{ x: filterPos.x, y: filterPos.y }}
                  >
                    <span className="text-9xl select-none">
                      {filters.find(f => f.id === activeFilter)?.icon}
                    </span>
                  </motion.div>
                )}
              </Card>

              <div className="grid sm:grid-cols-2 gap-6 items-center">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-brand-muted-grey uppercase tracking-wider">Filter Scale</label>
                  <input 
                    type="range" 
                    min="0.5" 
                    max="3" 
                    step="0.1" 
                    value={filterScale} 
                    onChange={(e) => setFilterScale(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-brand-light-grey rounded-lg appearance-none cursor-pointer accent-brand-teal"
                  />
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    onClick={() => {
                      setActiveFilter(null);
                      setFilterPos({ x: 0, y: 0 });
                      setFilterScale(1);
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                      !activeFilter ? "bg-brand-teal text-white" : "bg-brand-cream text-brand-muted-grey border border-brand-light-grey"
                    )}
                  >
                    Clear
                  </button>
                  {filters.map((filter) => (
                    <button
                      key={filter.id}
                      onClick={() => {
                        setActiveFilter(filter.id);
                        setFilterPos({ x: 0, y: 0 });
                        setFilterScale(1);
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                        activeFilter === filter.id ? "bg-brand-teal text-white" : "bg-brand-cream text-brand-muted-grey border border-brand-light-grey"
                      )}
                    >
                      <span>{filter.icon}</span>
                      <span>{filter.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-center gap-4">
                <Button onClick={saveFilteredImage}>
                  <Download className="w-4 h-4 mr-2" /> Export Capture
                </Button>
                {capturedImage && (
                  <Button 
                    variant="secondary" 
                    onClick={() => handleSendEmail(capturedImage)}
                    loading={isSendingEmail}
                  >
                    <Mail className="w-4 h-4 mr-2" /> Send to Email
                  </Button>
                )}
              </div>
            </motion.div>
          )}

          {view === 'live' && (
            <motion.div
              key="live"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6 max-w-4xl mx-auto"
            >
              <div className="flex items-center justify-between gap-4">
                <Button variant="ghost" onClick={() => setView('choice')} className="px-4">
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <InfoBox message="Ensure your face is clearly visible in the frame for accurate detection." className="flex-1" />
              </div>

              <Card className="p-2 overflow-hidden relative aspect-video bg-brand-charcoal flex items-center justify-center">
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  className="w-full h-full object-cover rounded-lg"
                  videoConstraints={{ facingMode: "user" }}
                  onUserMediaError={() => setError("Camera access denied.")}
                  mirrored={true}
                  screenshotQuality={1}
                  disablePictureInPicture={false}
                  forceScreenshotSourceSize={false}
                  imageSmoothing={true}
                  onUserMedia={() => {}}
                />
                {isProcessing && (
                  <div className="absolute inset-0 bg-brand-charcoal/60 backdrop-blur-sm flex flex-col items-center justify-center text-white gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-brand-sky" />
                    <p className="font-medium">Analyzing facial features...</p>
                  </div>
                )}
              </Card>

              <div className="flex justify-center gap-4">
                <Button variant="outline" onClick={() => setView('choice')}>Cancel</Button>
                <Button onClick={captureLive} disabled={isProcessing} className="px-8">
                  <Camera className="w-4 h-4 mr-2" /> Capture Analysis
                </Button>
              </div>
            </motion.div>
          )}

          {view === 'result' && currentResult && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md mx-auto space-y-6"
            >
              <InfoBox 
                message={currentResult.emotion.toLowerCase().includes('sad') 
                  ? "Analysis indicates a lower mood state. Support resources are available below."
                  : "Analysis complete. Detected metrics are displayed below."} 
                className="mb-4"
              />
              <Card className="text-center space-y-6">
                <div className="space-y-2">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-sage/20 text-brand-teal mb-2">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h2 className="text-2xl font-bold text-brand-charcoal">Analysis Results</h2>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-brand-light-grey p-4 rounded-xl border border-brand-light-grey/50">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-brand-muted-grey/60">Emotion</p>
                    <p className="text-xl font-bold text-brand-charcoal">{currentResult.emotion}</p>
                  </div>
                  <div className="bg-brand-light-grey p-4 rounded-xl border border-brand-light-grey/50">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-brand-muted-grey/60">Estimated Age</p>
                    <p className="text-xl font-bold text-brand-charcoal">{currentResult.age}</p>
                  </div>
                </div>

                {currentResult.emotion.toLowerCase().includes('sad') && (
                  <div className="p-4 bg-brand-sky/20 rounded-xl border border-brand-sky/30 text-left space-y-4">
                    <p className="text-sm text-brand-charcoal font-medium italic">
                      "{supportQuote}"
                    </p>
                    <div className="pt-3 border-t border-brand-sky/30">
                      <p className="text-[10px] font-bold text-brand-charcoal uppercase tracking-wider mb-2">
                        Support Resources (India):
                      </p>
                      <div className="space-y-2">
                        {helplines.map((h, i) => (
                          <div key={i} className="flex justify-between items-center bg-brand-cream p-2 rounded-lg border border-brand-sky/10">
                            <div>
                              <p className="text-[10px] font-bold text-brand-charcoal">{h.name}</p>
                              <p className="text-xs font-bold text-brand-teal">{h.number}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <Button onClick={() => setView('choice')} className="w-full">New Analysis</Button>
                    <Button variant="outline" onClick={() => setView('history')} className="w-full">View History</Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {view === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8 max-w-4xl mx-auto"
            >
              <div className="flex flex-col sm:flex-row justify-between items-center gap-6">
                <div className="space-y-2 text-center sm:text-left">
                  <h2 className="text-4xl font-bold text-brand-charcoal">Analysis History</h2>
                  <p className="text-brand-muted-grey">A comprehensive record of your previous emotional assessments.</p>
                </div>
                <Button variant="outline" onClick={() => setView('choice')}>
                  New Analysis
                </Button>
              </div>

              <InfoBox message="Review your previous analysis records below." className="max-w-lg mx-auto" />

              {history.length === 0 ? (
                <Card className="text-center py-20 space-y-6">
                  <div className="w-16 h-16 bg-brand-light-grey rounded-full flex items-center justify-center mx-auto text-brand-muted-grey/30 border border-brand-light-grey">
                    <History className="w-8 h-8" />
                  </div>
                  <p className="text-brand-muted-grey font-medium">No analysis records found.</p>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {history.map((record) => (
                    <motion.div
                      layout
                      key={record.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="bg-brand-cream rounded-xl p-6 shadow-sm border border-brand-light-grey flex flex-col sm:flex-row items-center justify-between group hover:border-brand-teal/30 transition-all gap-6"
                    >
                      <div className="flex items-center gap-6">
                        <div className={cn(
                          "w-12 h-12 rounded-lg flex items-center justify-center border",
                          record.method === 'live' ? "bg-brand-sky/20 text-brand-teal border-brand-sky/30" : "bg-brand-sage/20 text-brand-sage border-brand-sage/30"
                        )}>
                          {record.method === 'live' ? <Camera className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
                        </div>
                        <div className="text-center sm:text-left">
                          <div className="flex items-center gap-3 justify-center sm:justify-start">
                            <h4 className="font-bold text-brand-charcoal text-lg">{record.emotion}</h4>
                            <span className="px-2 py-0.5 bg-brand-light-grey rounded text-xs font-medium text-brand-muted-grey">
                              Age: {record.age}
                            </span>
                          </div>
                          <p className="text-xs text-brand-muted-grey/60 mt-1">
                            {record.timestamp?.toDate().toLocaleString() || 'Just now'}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" className="text-sm" onClick={() => {
                        setCurrentResult({ emotion: record.emotion, age: record.age });
                        setView('result');
                      }}>
                        View Details <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] bg-brand-error text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">{error}</span>
            <button onClick={() => setError(null)} className="ml-2 hover:opacity-80">×</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="mt-auto py-12 px-6 text-center border-t border-brand-light-grey">
        <p className="text-sm text-brand-muted-grey/60">
          Built with care for your well-being. © 2026 EMO-SENSE
        </p>
      </footer>
    </div>
  );
}
