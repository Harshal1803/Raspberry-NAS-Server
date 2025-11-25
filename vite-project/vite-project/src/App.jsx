import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Sector, LineChart, Line, BarChart, Bar } from 'recharts';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import io from 'socket.io-client';
import {
    HardDrive, Cpu, Thermometer, MemoryStick, Download, Upload, Image as ImageIcon,
    Video as VideoIcon, FileAudio, FileText, File, Folder, Home, LogOut, X, Clock,
    Search, BrainCircuit, Trash2, ArrowLeft, ArrowRight, ZoomIn, ZoomOut, Loader2, CheckCircle2,
    AlertCircle, DownloadCloud, Trash, Undo, ShieldAlert, Play, Pause,
    Rewind, FastForward, List, LayoutGrid, Info, SkipBack, SkipForward, Sun, Moon, Settings,
    FolderPlus, Edit, ChevronRight, Terminal as TerminalIcon, VolumeX, Volume2
} from 'lucide-react';

// --- SERVER CONFIGURATION ---
// Change this to the Raspberry Pi's IP address on the hotspot network (e.g., 'http://192.168.43.100:4002')
const SERVER_BASE_URL = 'http://localhost:4002';
// --- REAL DATA FROM RASPBERRY PI ---
const initialServerStats = {
    os: "DietPi", model: "Raspberry Pi 4B", cpuLoad: 0, ramUsage: 0, cpuTemp: 0,
};
const storageData = [
    { name: 'Images', value: 45.2, color: '#3b82f6' },
    { name: 'Videos', value: 470.9, color: '#a78bfa' },
    { name: 'Audio', value: 4.7, color: '#34d399' },
    { name: 'Documents', value: 3.7, color: '#f59e0b' },
    { name: 'Other', value: 78.4, color: '#f43f5e' },
    { name: 'Free', value: 357.3, color: '#6b7280' },
];
const initialNetworkData = [];

// --- HELPER & CORE UI COMPONENTS ---
const AnimatedGradientBackground = () => (
    <div className="fixed inset-0 -z-10 bg-background transition-colors duration-500">
        <motion.div
            className="absolute inset-0 opacity-50 theme-deep-ocean:opacity-100"
            style={{
                background: 'linear-gradient(135deg, rgba(20, 29, 58, 1) 0%, rgba(29, 53, 87, 1) 25%, rgba(128, 9, 221, 0.4) 50%, rgba(29, 53, 87, 1) 75%, rgba(20, 29, 58, 1) 100%)',
                backgroundSize: '400% 400%',
            }}
            animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
            transition={{ duration: 25, ease: 'linear', repeat: Infinity }}
        />
        <div className="absolute inset-0 bg-black/20"/>
    </div>
);

const TypingAnimation = ({ text, className, stagger = 0.05, delay = 0.1 }) => {
    const textChars = Array.from(text);
    const container = {
        hidden: { opacity: 0 },
        visible: (i = 1) => ({
            opacity: 1,
            transition: { staggerChildren: stagger, delayChildren: i * delay },
        }),
    };
    const child = {
        visible: { opacity: 1, y: 0, transition: { type: 'spring', damping: 12, stiffness: 100 } },
        hidden: { opacity: 0, y: 20, transition: { type: 'spring', damping: 12, stiffness: 100 } },
    };
    return (
        <motion.div className={`flex overflow-hidden ${className}`} variants={container} initial="hidden" animate="visible">
            {textChars.map((char, index) => (
                <motion.span variants={child} key={index}>
                    {char === ' ' ? '\u00A0' : char}
                </motion.span>
            ))}
        </motion.div>
    );
};

const Panel = ({ children, className = '', ...props }) => (
    <motion.div
        className={`relative rounded-3xl shadow-lg bg-card-bg/60 backdrop-blur-2xl border border-card-border transition-colors duration-500 theme-soft-sky:shadow-sm ${className}`}
        {...props}
    >
        {children}
    </motion.div>
);

const ModalWrapper = ({ children, isOpen, onClose }) => (
    <AnimatePresence>
        {isOpen && (
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 30 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                    className="relative" onClick={(e) => e.stopPropagation()}
                >
                    {children}
                </motion.div>
            </motion.div>
        )}
    </AnimatePresence>
);

const FileIconComponent = ({ type, large=false }) => {
    const sizeClass = large ? "w-24 h-24" : "w-full h-full";
    const icons = {
        image: <ImageIcon className={`${sizeClass} text-blue-400`} />, video: <VideoIcon className={`${sizeClass} text-purple-400`} />,
        audio: <FileAudio className={`${sizeClass} text-emerald-400`} />, document: <FileText className={`${sizeClass} text-orange-400`} />,
        other: <File className={`${sizeClass} text-gray-400`} />,
        default: <File className={`${sizeClass} text-gray-400`} />,
    };
    return icons[type] || icons.default;
};

// --- ERROR BOUNDARY ---
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Error in ImageViewer:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="w-screen h-screen p-4 flex items-center justify-center">
                    <Panel className="p-8 text-center">
                        <AlertCircle size={48} className="mx-auto text-red-400 mb-4" />
                        <h2 className="text-2xl font-bold text-main-accent mb-2">Something went wrong</h2>
                        <p className="text-main mb-6">An error occurred while viewing the image.</p>
                        <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={() => this.setState({ hasError: false })} className="px-6 py-2 rounded-lg bg-primary text-card-bg font-semibold">Retry</motion.button>
                        <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={this.props.onClose} className="ml-4 px-6 py-2 rounded-lg bg-white/20 text-main-accent hover:bg-white/30 transition-colors">Close</motion.button>
                    </Panel>
                </div>
            );
        }
        return this.props.children;
    }
}

// --- FUTURISTIC MEDIA MODALS (UNCHANGED) ---
const ImageViewer = ({ files, initialFile, onClose, getPreviewUrl }) => {
    if (!files || files.length === 0) return null;
    const startIndex = Math.max(0, files.findIndex(f => f.id === initialFile?.id));
    const [currentIndex, setCurrentIndex] = useState(startIndex);
    const [zoom, setZoom] = useState(1);
    const [direction, setDirection] = useState(0);

    const changeFile = useCallback((dir) => {
        setDirection(dir);
        setCurrentIndex(prev => (prev + dir + files.length) % files.length);
        setZoom(1);
    }, [files.length]);


    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowRight') changeFile(1);
            if (e.key === 'ArrowLeft') changeFile(-1);
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [changeFile, onClose]);

    const currentFile = files[currentIndex];

    if (!currentFile) {
        return (
            <div className="w-screen h-screen p-4 flex items-center justify-center">
                <Panel className="p-8 text-center">
                    <AlertCircle size={48} className="mx-auto text-orange-400 mb-4" />
                    <h2 className="text-2xl font-bold text-main-accent mb-2">File Not Found</h2>
                    <p className="text-main mb-6">This file could not be found in the current gallery view.</p>
                    <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={onClose} className="px-6 py-2 rounded-lg bg-primary text-card-bg font-semibold">Close</motion.button>
                </Panel>
            </div>
        );
    }

    const variants = {
        enter: (direction) => ({ x: direction > 0 ? '100%' : '-100%', opacity: 0 }),
        center: { x: 0, opacity: 1 },
        exit: (direction) => ({ x: direction < 0 ? '100%' : '-100%', opacity: 0 })
    };

    return (
        <div className="w-screen h-screen p-4 flex items-center justify-center overflow-hidden">
            <div className="absolute top-4 right-4 z-20 flex space-x-2">
                <motion.button whileHover={{scale:1.1}} whileTap={{scale:0.9}} onClick={() => setZoom(z => Math.min(3, z + 0.2))} className="p-2 bg-black/30 rounded-full text-white hover:bg-primary backdrop-blur-sm"><ZoomIn size={20} /></motion.button>
                <motion.button whileHover={{scale:1.1}} whileTap={{scale:0.9}} onClick={() => setZoom(z => Math.max(0.5, z - 0.2))} className="p-2 bg-black/30 rounded-full text-white hover:bg-primary backdrop-blur-sm"><ZoomOut size={20} /></motion.button>
                <motion.button whileHover={{scale:1.1}} whileTap={{scale:0.9}} onClick={onClose} className="p-2 bg-black/30 rounded-full text-white hover:bg-red-500 backdrop-blur-sm"><X size={20} /></motion.button>
            </div>
            <motion.button whileHover={{scale:1.1}} whileTap={{scale:0.9}} onClick={() => changeFile(-1)} className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 bg-black/30 rounded-full text-white hover:bg-primary backdrop-blur-sm"><ArrowLeft size={24} /></motion.button>
            <motion.button whileHover={{scale:1.1}} whileTap={{scale:0.9}} onClick={() => changeFile(1)} className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 bg-black/30 rounded-full text-white hover:bg-primary backdrop-blur-sm"><ArrowRight size={24} /></motion.button>

            <AnimatePresence initial={false} custom={direction}>
                <motion.img
                    key={currentIndex} src={getPreviewUrl(currentFile)} alt={currentFile.name} className="absolute max-w-[80vw] max-h-[80vh] object-contain rounded-lg shadow-2xl" custom={direction} variants={variants}
                    initial="enter" animate="center" exit="exit" transition={{ type: 'spring', stiffness: 300, damping: 30 }} style={{ scale: zoom }}
                    onError={(e) => { e.target.onerror = null; e.target.src=`https://placehold.co/1920x1080/f43f5e/ffffff?text=${encodeURIComponent(currentFile.name || 'Unknown')}`; }}
                />
            </AnimatePresence>
        </div>
    );
};
const VideoPlayer = ({ file, onClose }) => {
    const videoRef = useRef(null);
    const progressRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    const togglePlay = useCallback(async () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            try {
                await video.play();
            } catch (e) {
                console.error("Play error:", e);
            }
        } else {
            video.pause();
        }
    }, []);

    const handleTimeUpdate = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        if (video.duration) {
            setProgress((video.currentTime / video.duration) * 100);
            setCurrentTime(video.currentTime);
        }
    },[]);

    const handleSeek = (e) => {
        if (!duration || !videoRef.current || !progressRef.current) return;
        const progressRect = progressRef.current.getBoundingClientRect();
        videoRef.current.currentTime = ((e.clientX - progressRect.left) / progressRect.width) * duration;
    };
    const handleRewind = () => { if(videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10); };
    const handleForward = () => { if(videoRef.current) videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 10); };

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onTimeUpdate = () => handleTimeUpdate();
        const onLoadedMetadata = () => setDuration(video.duration);
        const onCanPlay = () => setLoaded(true);

        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener('canplay', onCanPlay);

        return () => {
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('timeupdate', onTimeUpdate);
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            video.removeEventListener('canplay', onCanPlay);
        };
    }, [handleTimeUpdate]);

    useEffect(() => {
        if (loaded && videoRef.current) {
            videoRef.current.play().catch(e => console.error("Play error:", e));
        }
    }, [loaded]);

    const formatTime = (time) => {
      if (isNaN(time) || !isFinite(time) || time <= 0) return '00:00';
      const date = new Date(time * 1000);
      const minutes = date.getUTCMinutes();
      const seconds = date.getUTCSeconds().toString().padStart(2, '0');
      return `${minutes}:${seconds}`;
    };

    return (
        <Panel className="w-[90vw] max-w-5xl p-1 relative group bg-black">
            <video ref={videoRef} src={file.url} muted={isMuted} className="w-full rounded-lg aspect-video" onClick={togglePlay} controls={false} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6">
                <div ref={progressRef} onClick={handleSeek} className="w-full h-2 bg-white/20 rounded-full cursor-pointer group/progress mb-4">
                    <div className="h-full bg-primary rounded-full relative" style={{ width: `${progress}%` }}>
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity" />
                    </div>
                </div>
                <div className="flex justify-between items-center text-white">
                    <div className="flex items-center space-x-4 w-1/3"><span className="text-sm font-mono">{formatTime(currentTime)} / {formatTime(duration)}</span></div>
                    <div className="flex items-center justify-center space-x-6 w-1/3">
                        <button onClick={handleRewind} className="hover:text-primary transition-colors"><Rewind size={24} /></button>
                        <button onClick={togglePlay} className="p-3 bg-primary rounded-full text-card-bg">{isPlaying ? <Pause size={28} /> : <Play size={28} />}</button>
                        <button onClick={handleForward} className="hover:text-primary transition-colors"><FastForward size={24} /></button>
                        <button onClick={() => setIsMuted(!isMuted)} className="hover:text-primary transition-colors">{isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}</button>
                    </div>
                    <div className="w-1/3"></div>
                </div>
            </div>
            <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/30 rounded-full text-white z-10 hover:bg-red-500"><X size={18} /></button>
        </Panel>
    );
};
const AudioPlayer = ({ files, initialFile, onClose }) => {
    const startIndex = Math.max(0, files.findIndex(f => f.id === initialFile?.id));
    const [currentIndex, setCurrentIndex] = useState(startIndex);
    const currentFile = files[currentIndex];
    const audioRef = useRef(null);
    const canvasRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(true);

    useEffect(() => {
        const audio = audioRef.current;
        let audioContext = null;
        let analyser = null;
        let source = null;
        let animationFrameId = null;

        const setupAudioContext = () => {
            try {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                source = audioContext.createMediaElementSource(audio);
                analyser = audioContext.createAnalyser();
                source.connect(analyser);
                analyser.connect(audioContext.destination);
                analyser.fftSize = 256;
                visualize();
            } catch (e) { console.error("Web Audio API not supported", e); }
        };

        const visualize = () => {
            const canvas = canvasRef.current;
            if (!analyser || !canvas) return;
            const ctx = canvas.getContext('2d');
            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const loop = () => {
                animationFrameId = requestAnimationFrame(loop);
                if(!analyser) return;
                analyser.getByteFrequencyData(dataArray);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#38bdf8';
                for (let i = 0; i < dataArray.length; i++) {
                    const barHeight = dataArray[i] / 2;
                    ctx.fillStyle = themeColor;
                    ctx.fillRect(i * 4, (canvas.height - barHeight) / 2, 2, barHeight);
                }
            };
            loop();
        };

        audio.addEventListener('canplay', setupAudioContext, { once: true });

        return () => {
            cancelAnimationFrame(animationFrameId);
            if (source) source.disconnect();
            if (analyser) analyser.disconnect();
            if (audioContext && audioContext.state !== 'closed') audioContext.close().catch(()=>{});
        };
    }, []);

    useEffect(() => {
        if(audioRef.current){
            audioRef.current.src = currentFile.url;
            audioRef.current.load();
            if(isPlaying) audioRef.current.play().catch(e=>console.error(e));
        }
    }, [currentIndex, currentFile, isPlaying]);

    useEffect(() => {
        isPlaying ? audioRef.current?.play().catch(e=>console.log(e)) : audioRef.current?.pause();
    }, [isPlaying]);

    const changeTrack = (dir) => setCurrentIndex(prev => (prev + dir + files.length) % files.length);

    if(!currentFile) return null;

    return (
        <Panel className="w-[90vw] max-w-md p-8 text-center">
            <button onClick={onClose} className="absolute top-4 right-4 p-1 rounded-full text-main-accent hover:bg-red-500/20"><X size={16} /></button>
            <motion.div layoutId={`album-art-${currentFile.id}`} className="w-48 h-48 mx-auto rounded-lg overflow-hidden shadow-lg mt-4"><img src={currentFile.albumArtUrl} alt={currentFile.name} className="w-full h-full object-cover" /></motion.div>
            <h3 className="font-bold text-2xl mt-4 text-main-accent">{currentFile.name}</h3>
            <canvas ref={canvasRef} width="300" height="100" className="mx-auto my-4"></canvas>
            <audio ref={audioRef} src={currentFile.url} onEnded={() => changeTrack(1)} />
            <div className="flex justify-between items-center w-full max-w-xs mx-auto mt-4">
                <button onClick={() => changeTrack(-1)} className="text-main-accent hover:text-primary"><SkipBack size={28} /></button>
                <button onClick={() => setIsPlaying(!isPlaying)} className="p-4 bg-primary rounded-full text-card-bg shadow-lg">{isPlaying ? <Pause size={32}/> : <Play size={32}/>}</button>
                <button onClick={() => changeTrack(1)} className="text-main-accent hover:text-primary"><SkipForward size={28} /></button>
            </div>
        </Panel>
    );
};
const DetailsModal = ({ file, onClose, token }) => {
    const [summary, setSummary] = useState('');
    const [summarizing, setSummarizing] = useState(false);

    const handleSummarize = async () => {
        if (!file.path) return;
        setSummarizing(true);
        try {
            const response = await fetch(`${SERVER_BASE_URL}/ai/summarize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ filePath: file.path })
            });
            const data = await response.json();
            if (data.summary) {
                setSummary(data.summary);
            } else {
                setSummary(data.error || 'Failed to summarize');
            }
        } catch (error) {
            setSummary('Error summarizing file');
        }
        setSummarizing(false);
    };

    return (
        <Panel className="w-[90vw] max-w-md p-8 text-center">
             <button onClick={onClose} className="absolute top-4 right-4 p-1 rounded-full text-main-accent hover:bg-red-500/20"><X size={16} /></button>
             <div className="mx-auto w-24 h-24 mb-4"><FileIconComponent type={file.type} large /></div>
             <h3 className="font-bold text-2xl mt-4 text-main-accent break-all">{file.name}</h3>
             <div className="mt-4 text-left space-y-2 bg-black/20 p-4 rounded-lg">
                <p><strong className="text-main-accent w-24 inline-block">Size:</strong> <span className="text-main">{file.size}</span></p>
                <p><strong className="text-main-accent w-24 inline-block">Type:</strong> <span className="text-main capitalize">{file.type}</span></p>
                <p><strong className="text-main-accent w-24 inline-block">Added:</strong> <span className="text-main">{new Date(file.date).toLocaleString()}</span></p>
                {(file.type === 'document') && (
                    <div className="mt-4">
                        <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={handleSummarize} disabled={summarizing} className="w-full flex justify-center items-center space-x-2 py-2 px-4 bg-primary text-card-bg font-semibold rounded-lg hover:bg-primary/80 transition-colors disabled:opacity-50">
                            {summarizing && <Loader2 className="animate-spin" size={16} />}<span>{summarizing ? 'Summarizing...' : 'Summarize'}</span>
                        </motion.button>
                        {summary && <p className="mt-2 text-sm text-main-accent">{summary}</p>}
                    </div>
                )}
             </div>
        </Panel>
    );
};
const TextViewer = ({ file, onClose }) => {
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(file.url)
            .then(res => res.json())
            .then(data => {
                setContent(data.content || 'No content available');
                setLoading(false);
            })
            .catch(() => {
                setContent('Error loading content');
                setLoading(false);
            });
    }, [file.url]);

    return (
        <Panel className="w-[90vw] h-[90vh] p-4 flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-main-accent">{file.name}</h3>
                <button onClick={onClose} className="p-2 bg-black/30 rounded-full text-main-accent z-10 hover:bg-red-500"><X size={20} /></button>
            </div>
            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="animate-spin" size={48} />
                </div>
            ) : (
                <pre className="flex-1 overflow-auto bg-black/20 p-4 rounded-lg text-main-accent whitespace-pre-wrap">{content}</pre>
            )}
        </Panel>
    );
};

const DocumentViewer = ({ file, onClose }) => {
    // For PDF, use direct iframe; for others, show message
    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
        return (
            <Panel className="w-[95vw] h-[90vh] max-w-6xl p-2 flex flex-col">
                <div className="flex justify-between items-center p-2">
                    <h3 className="font-bold text-main-accent">{file.name}</h3>
                    <button onClick={onClose} className="p-2 bg-black/30 rounded-full text-main-accent z-10 hover:bg-red-500"><X size={20} /></button>
                </div>
                <div className="flex-1 flex items-center justify-center">
                    <p className="text-main">Preview not available for this file type</p>
                </div>
            </Panel>
        );
    }
    return (
        <Panel className="w-[95vw] h-[90vh] max-w-6xl p-2 flex flex-col">
            <div className="flex justify-between items-center p-2">
                <h3 className="font-bold text-main-accent">{file.name}</h3>
                <button onClick={onClose} className="p-2 bg-black/30 rounded-full text-main-accent z-10 hover:bg-red-500"><X size={20} /></button>
            </div>
            <iframe src={file.url} title={file.name} className="w-full h-full flex-grow rounded-lg border-none bg-white" />
        </Panel>
    );
};

const UploadModal = ({ onClose, token, relPath }) => {
    const [status, setStatus] = useState('idle');
    const [progress, setProgress] = useState(0);
    const [selectedFile, setSelectedFile] = useState(null);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSelectedFile(file);
            setError(null);
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) return;

        setStatus('uploading');
        setProgress(0);
        setError(null);

        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('path', relPath);

        try {
            const response = await fetch(`${SERVER_BASE_URL}/files/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Upload failed');
            }

            const result = await response.json();
            setStatus('success');
            setProgress(100);
        } catch (err) {
            setError(err.message);
            setStatus('idle');
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            setSelectedFile(files[0]);
            setError(null);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    return (
        <Panel className="w-[90vw] max-w-lg p-8 relative overflow-hidden">
            <h2 className="text-3xl font-bold text-center text-main-accent mb-6">Upload File</h2>
            <AnimatePresence mode="wait">
                {status === 'idle' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full h-48 border-2 border-dashed border-primary rounded-lg flex flex-col items-center justify-center text-main hover:bg-primary/10 transition-colors cursor-pointer group"
                        onClick={() => fileInputRef.current?.click()} onDrop={handleDrop} onDragOver={handleDragOver}>
                        <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
                        <motion.div initial={{y: -10}} animate={{y: [0, -10, 0]}} transition={{repeat: Infinity, duration: 2}}><DownloadCloud size={48} className="text-primary mb-2" /></motion.div>
                        <p>Drag & drop or <span className="font-semibold text-primary">Click to browse</span></p>
                        {selectedFile && <p className="mt-2 text-sm text-main-accent">{selectedFile.name}</p>}
                        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
                    </motion.div>
                )}
                {status === 'uploading' && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center h-48 flex flex-col justify-center">
                         <div className="relative w-24 h-24 mx-auto mb-4">
                            <motion.div className="absolute inset-0 border-4 border-primary/20 rounded-full" />
                            <motion.div className="absolute inset-0 border-4 border-primary rounded-full" style={{clipPath: `inset(0% ${100-progress}% 0% 0%)`}} animate={{rotate: 360}} transition={{repeat: Infinity, duration: 1, ease: 'linear'}}/>
                            <span className="absolute inset-0 flex items-center justify-center text-main-accent">{Math.floor(progress)}%</span>
                         </div>
                         <p className="text-main-accent">Uploading...</p>
                     </motion.div>
                )}
                {status === 'success' && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center h-48 flex flex-col justify-center">
                        <motion.div
                          initial={{scale:0.5}}
                          animate={{scale:1}}
                          transition={{type:'spring', damping:10, stiffness:100}}
                          onAnimationComplete={() => setTimeout(onClose, 800)}
                          className="mx-auto"
                        >
                          <CheckCircle2 size={64} className="text-emerald-400" />
                        </motion.div>
                        <p className="text-main-accent mt-4">Upload Complete!</p>
                     </motion.div>
                )}
            </AnimatePresence>
            {status === 'idle' && selectedFile && (
                <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={handleUpload} className="mt-4 w-full flex justify-center items-center space-x-2 py-3 px-4 bg-primary text-card-bg font-semibold rounded-lg hover:bg-primary/80 transition-colors">
                    <Upload size={20} /><span>Upload</span>
                </motion.button>
            )}
        </Panel>
    );
};
const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message }) => (
    <ModalWrapper isOpen={isOpen} onClose={onClose}>
        <Panel className="w-[90vw] max-w-md p-8 text-center border-red-500/50">
            <ShieldAlert size={48} className="mx-auto text-red-500 mb-4" />
            <h2 className="text-2xl font-bold text-main-accent mb-2">{title}</h2>
            <p className="text-main mb-6">{message}</p>
            <div className="flex justify-center space-x-4">
                <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={onClose} className="px-6 py-2 rounded-lg bg-white/20 text-main-accent hover:bg-white/30 transition-colors">Cancel</motion.button>
                <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={onConfirm} className="px-6 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors">Confirm</motion.button>
            </div>
        </Panel>
    </ModalWrapper>
);
const NameInputModal = ({ isOpen, onClose, onConfirm, title, placeholder, initialValue = '' }) => {
    const [name, setName] = useState(initialValue);
    useEffect(() => { if (isOpen) setName(initialValue); }, [isOpen, initialValue]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (name.trim()) {
            onConfirm(name.trim());
            onClose();
        }
    };
    return (
        <ModalWrapper isOpen={isOpen} onClose={onClose}>
            <Panel className="w-[90vw] max-w-md p-8">
                <h2 className="text-2xl font-bold text-main-accent mb-4">{title}</h2>
                <form onSubmit={handleSubmit}>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} autoFocus
                        className="w-full bg-black/20 border border-card-border rounded-lg px-4 py-2 text-main-accent focus:outline-none focus:ring-2 focus:ring-primary" />
                    <div className="flex justify-end space-x-4 mt-6">
                        <motion.button type="button" whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={onClose} className="px-6 py-2 rounded-lg bg-white/20 text-main-accent hover:bg-white/30 transition-colors">Cancel</motion.button>
                        <motion.button type="submit" whileHover={{scale:1.05}} whileTap={{scale:0.95}} className="px-6 py-2 rounded-lg bg-primary text-card-bg font-semibold hover:bg-primary/80 transition-colors">Confirm</motion.button>
                    </div>
                </form>
            </Panel>
        </ModalWrapper>
    );
};

// --- VIEWS ---

const StatCard = ({ icon: Icon, title, value, unit, progress }) => (
    <Panel className="p-4 group flex flex-col justify-between h-full">
        <div>
            <div className="flex justify-between items-start">
                <div><p className="text-sm text-main">{title}</p><p className="text-3xl font-bold text-main-accent font-mono">{value}<span className="text-base font-body font-normal">{unit}</span></p></div>
                <Icon size={24} className="text-primary/70 group-hover:text-primary transition-colors" />
            </div>
        </div>
        <div className="relative mt-2 w-full">
            <motion.span
                className="absolute bottom-3 text-xs font-mono text-primary font-semibold"
                initial={{ left: '0%' }}
                animate={{ left: `clamp(0%, ${progress}%, 90%)`}}
                transition={{ type: "spring", stiffness: 100, damping: 20, duration: 1.5 }}
            >
                {Math.round(progress)}%
            </motion.span>
            <div className="h-1.5 bg-black/20 rounded-full w-full overflow-hidden">
                <motion.div
                    className="h-full bg-primary"
                    initial={{ width: '0%' }}
                    animate={{ width: `${progress}%` }}
                    transition={{ type: "spring", stiffness: 100, damping: 20, duration: 1.5 }}
                />
            </div>
        </div>
    </Panel>
);

const Dashboard = () => {
    const [stats, setStats] = useState(initialServerStats);
    const [networkData, setNetworkData] = useState(initialNetworkData);
    const [activeIndex, setActiveIndex] = useState(null);
    const [storageBreakdown, setStorageBreakdown] = useState(null);

    const onPieEnter = useCallback((_, index) => { setActiveIndex(index); }, []);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                console.log('Fetching stats from backend...');
                const response = await fetch(`${SERVER_BASE_URL}/stats/system`);
                console.log('Stats response status:', response.status);
                const data = await response.json();
                console.log('Stats data:', data);
                if (data.success) {
                    setStats(prev => ({
                        ...prev,
                        cpuLoad: data.stats.cpuLoad,
                        ramUsage: data.stats.ramUsage,
                        cpuTemp: data.stats.cpuTemp,
                        storage: data.stats.storage
                    }));
                    console.log('Stats updated successfully');
                } else {
                    console.log('Stats fetch failed: no success');
                }
            } catch (error) {
                console.error('Error fetching stats:', error);
            }
        };

        const fetchStorageBreakdown = async () => {
            try {
                const response = await fetch(`${SERVER_BASE_URL}/files/storage-breakdown`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                });
                const data = await response.json();
                if (data.success) {
                    setStorageBreakdown(data.breakdown);
                }
            } catch (error) {
                console.error('Error fetching storage breakdown:', error);
            }
        };

        const fetchNetworkData = async () => {
            try {
                const response = await fetch(`${SERVER_BASE_URL}/stats/network-speed`);
                const data = await response.json();
                setNetworkData(prev => {
                    const newPoint = { time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), download: data.download, upload: data.upload };
                    return [...prev.slice(-19), newPoint]; // Keep last 20 points
                });
            } catch (error) {
                console.error('Error fetching network data:', error);
            }
        };

        fetchStats(); // Initial fetch
        fetchStorageBreakdown(); // Initial fetch
        fetchNetworkData(); // Initial fetch
        const statsInterval = setInterval(fetchStats, 5000); // Update stats every 5 seconds
        const networkInterval = setInterval(fetchNetworkData, 2000); // Update network every 2 seconds
        return () => {
            clearInterval(statsInterval);
            clearInterval(networkInterval);
        };
    }, []);

    // Reset activeIndex when storage data changes
    useEffect(() => {
        setActiveIndex(null);
    }, [storageBreakdown]);

    // Create real storage data from breakdown
    const realStorageData = storageBreakdown ? [
        { name: 'Images', value: storageBreakdown.image, color: '#3b82f6' },
        { name: 'Videos', value: storageBreakdown.video, color: '#a78bfa' },
        { name: 'Audio', value: storageBreakdown.audio, color: '#34d399' },
        { name: 'Documents', value: storageBreakdown.document, color: '#f59e0b' },
       // { name: 'Other', value: storageBreakdown.other, color: '#f43f5e' },
        { name: 'Free', value: stats.storage ? stats.storage.available * 1024 : 0, color: '#6b7280' }, // Convert GB to MB
    ] : storageData;

    const freeStorage = stats.storage ? stats.storage.available : 0;
    const centerText = activeIndex !== null ? (realStorageData[activeIndex]?.name || "Total Free") : "Total Free";
    const centerValue = activeIndex !== null ? (realStorageData[activeIndex]?.value || freeStorage) : freeStorage;

    const renderActiveShape = (props) => {
        if (!props.innerRadius) return null;
        return <Sector {...props} innerRadius={props.innerRadius - 2} outerRadius={props.outerRadius + 4} cornerRadius={5} />;
    };

    const CustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-card-bg/80 backdrop-blur-sm p-3 rounded-xl border border-card-border shadow-lg">
                    {payload?.map?.(p => (
                      <p key={p.name} style={{ color: p.color }} className="font-semibold">{`${p.name}: ${Number(p.value).toFixed(1)} MB/s`}</p>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <motion.div className="p-4 h-full" initial={{opacity: 0}} animate={{opacity: 1}}>
             <div className="h-full flex flex-col gap-4">
                <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" variants={{visible: { transition: { staggerChildren: 0.1 } }}} initial="hidden" animate="visible">
                    <motion.div variants={{hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 }}}><StatCard icon={Cpu} title="CPU Load" value={stats.cpuLoad.toFixed(1)} unit="%" progress={stats.cpuLoad} /></motion.div>
                    <motion.div variants={{hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 }}}><StatCard icon={MemoryStick} title="RAM Usage" value={stats.ramUsage.toFixed(1)} unit="%" progress={stats.ramUsage} /></motion.div>
                    <motion.div variants={{hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 }}}><StatCard icon={Thermometer} title="CPU Temp" value={stats.cpuTemp.toFixed(1)} unit="°C" progress={(stats.cpuTemp/90)*100} /></motion.div>
                    <motion.div variants={{hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 }}}><Panel className="p-4 h-full flex flex-col justify-center"><p className="text-sm text-main">OS / Model</p><p className="text-xl font-bold text-main-accent">{stats.os} / {stats.model}</p></Panel></motion.div>
                </motion.div>
                <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-grow min-h-0" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{delay: 0.2}}>
                    <Panel className="p-4 lg:col-span-1 flex flex-col">
                        <h3 className="text-xl font-bold text-main-accent font-title mb-2 flex-shrink-0">Storage</h3>
                        <div className="flex-grow flex items-center min-h-0">
                             <div className="w-1/2 h-full relative">
                               <ResponsiveContainer width="100%" height="100%">
                                   <PieChart><Pie activeIndex={activeIndex} activeShape={renderActiveShape} data={realStorageData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={'75%'} outerRadius={'95%'} paddingAngle={5} onMouseEnter={onPieEnter} onMouseLeave={() => setActiveIndex(null)}>{realStorageData.map((e, i) => <Cell key={`c-${i}`} fill={e.color} stroke="none" />)}</Pie></PieChart>
                               </ResponsiveContainer>
                               <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><AnimatePresence mode="wait"><motion.p key={centerText} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="text-xs text-main text-center">{centerText}</motion.p><motion.p key={centerValue} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="text-xl font-bold text-main-accent font-mono">{centerValue.toFixed(2)} MB</motion.p></AnimatePresence></div>
                           </div>
                           <div className="w-1/2 space-y-1 pl-2">
                               {realStorageData.map((entry, index) => (
                                   <motion.div key={entry.name} className={`flex items-center space-x-2 px-2 py-0.5 rounded-md text-sm transition-all duration-300 cursor-pointer ${activeIndex === index ? 'bg-black/20' : ''}`} onMouseEnter={() => onPieEnter(null, index)}>
                                       <div className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor: entry.color}}/>
                                       <span className="text-main text-xs truncate">{entry.name}</span>
                                       <span className="font-semibold text-main-accent text-xs ml-auto">{entry.value.toFixed(2)} MB</span>
                                   </motion.div>
                               ))}
                               {stats.storage && (
                                   <motion.div className="mt-2 p-2 bg-black/10 rounded-md text-xs">
                                       <div className="text-main">Total: {stats.storage.total.toFixed(1)} GB</div>
                                       <div className="text-main">Used: {stats.storage.usePercent.toFixed(1)}%</div>
                                   </motion.div>
                               )}
                           </div>
                        </div>
                    </Panel>
                    <Panel className="p-4 lg:col-span-2 flex flex-col">
                        <h3 className="text-xl font-bold text-main-accent mb-2 font-title flex-shrink-0">Network Activity</h3>
                        <div className="flex-grow min-h-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={networkData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                    <defs><linearGradient id="cD" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.8}/><stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/></linearGradient><linearGradient id="cU" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#a78bfa" stopOpacity={0.8}/><stop offset="95%" stopColor="#a78bfa" stopOpacity={0}/></linearGradient></defs>
                                    <XAxis dataKey="time" stroke="var(--color-text-main)" fontSize={12} tickLine={false} axisLine={false} tick={true} />
                                    <YAxis stroke="var(--color-text-main)" fontSize={12} tickLine={false} axisLine={false} label={{ value: 'MB/s', angle: -90, position: 'insideLeft', fill: 'var(--color-text-main)', fontSize: 12 }}/>
                                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--color-primary)', strokeWidth: 1, strokeDasharray: '3 3' }} />
                                    <Area type="monotone" dataKey="download" name="Download" stroke="var(--color-primary)" strokeWidth={2} fill="url(#cD)" isAnimationActive={false}/>
                                    <Area type="monotone" dataKey="upload" name="Upload" stroke="#a78bfa" strokeWidth={2} fill="url(#cU)" isAnimationActive={false}/>
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </Panel>
                </motion.div>
            </div>
        </motion.div>
    );
};


const MediaGallery = ({ token }) => {
    const [mediaFiles, setMediaFiles] = useState([]);
    const [folders, setFolders] = useState([{ id: 'root', name: 'Home', parentId: null }]);
    const [currentFolderId, setCurrentFolderId] = useState('root');
    const [path, setPath] = useState([{ id: 'root', name: 'Home' }]);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentView, setCurrentView] = useState('my-files');
    const [filter, setFilter] = useState('all');
    const [viewMode, setViewMode] = useState('grid');
    const [viewingFile, setViewingFile] = useState(null);
    const [detailsFile, setDetailsFile] = useState(null);
    const [isUploadOpen, setUploadOpen] = useState(false);
    const [toDelete, setToDelete] = useState(null);
    const [isCreateFolderOpen, setCreateFolderOpen] = useState(false);
    const [isRenameOpen, setRenameOpen] = useState(null);
    const [loading, setLoading] = useState(true);

    const isMediaFile = (item) => !!item && typeof item.type !== 'undefined';
    const uuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const handleFileAction = (file, action) => {
        if (action === 'trash') setMediaFiles(files => files.map(f => f.id === file.id ? { ...f, trashed: true } : f));
        if (action === 'restore') setMediaFiles(files => files.map(f => f.id === file.id ? { ...f, trashed: false } : f));
        if (action === 'delete') setToDelete(file);
    };

    const refreshFiles = () => {
        fetchFiles(getRelPath());
    };

    const handlePermanentDelete = () => {
        if (!toDelete || !isMediaFile(toDelete)) return;
        setMediaFiles(files => files.filter(f => f.id !== toDelete.id));
        setToDelete(null);
    };

    const handleFolderClick = (folderId) => {
        const clickedFolder = folders.find(f => f.id === folderId);
        if(!clickedFolder) return;
        setCurrentFolderId(folderId);
        let newPath = [];
        let current = clickedFolder;
        while(current) {
            newPath.unshift({id: current.id, name: current.name});
            current = folders.find(f => f.id === current.parentId);
        }
        setPath(newPath);
    };

    const handleBreadcrumbClick = (folderId) => {
        const index = path.findIndex(p => p.id === folderId);
        setPath(path.slice(0, index + 1));
        setCurrentFolderId(folderId);
    };

    const handleCreateFolder = async (name) => {
        try {
            const folderPath = getRelPath() ? `${getRelPath()}\\${name}` : name;
            const response = await fetch(`${SERVER_BASE_URL}/files/create-folder`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ path: folderPath })
            });
            const data = await response.json();
            if (data.success) {
                refreshFiles();
            } else {
                alert(`Failed to create folder: ${data.error}`);
            }
        } catch (error) {
            console.error('Error creating folder:', error);
            alert('Error creating folder');
        }
    };

    const handleRename = (newName) => {
        if (!isRenameOpen) return;
        if(isRenameOpen.type === 'folder') {
            setFolders(folders.map(f => f.id === isRenameOpen.id ? { ...f, name: newName } : f));
        } else {
            setMediaFiles(mediaFiles.map(f => f.id === isRenameOpen.id ? { ...f, name: newName } : f));
        }
        setRenameOpen(null);
    };



    const handleDeleteFolder = () => {
        if (!toDelete || isMediaFile(toDelete)) return;
        setFolders(folders.filter(f => f.id !== toDelete.id));
        setMediaFiles(mediaFiles.map(f => f.parentId === toDelete.id ? { ...f, parentId: 'root' } : f));
        setToDelete(null);
    };

    const filteredItems = useMemo(() => {
        let items = [];
        if (currentView === 'trash') {
            items = mediaFiles.filter(f => f.trashed);
        } else {
            const currentFiles = mediaFiles.filter(f => !f.trashed && f.parentId === currentFolderId);
            const currentFolders = folders.filter(f => f.parentId === currentFolderId);
            if (filter === 'all') items = [...currentFolders, ...currentFiles];
            else if (filter === 'folders') items = currentFolders;
            else items = currentFiles.filter(f => f.type === filter);
        }
        if (searchTerm) items = items.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));
        return items;
    }, [mediaFiles, folders, currentFolderId, currentView, filter, searchTerm]);

    const mediaSubsets = useMemo(() => ({
        image: mediaFiles.filter(f => f.type === 'image' && !f.trashed),
        audio: mediaFiles.filter(f => f.type === 'audio' && !f.trashed)
    }), [mediaFiles]);

    const handleDownload = async (file) => {
        try {
            const response = await fetch(`${SERVER_BASE_URL}/files/download?path=${encodeURIComponent(file.path || file.name)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = file.name;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
        } catch (error) {
            console.error('Download error:', error);
        }
    };

    const getPreviewUrl = (file) => {
        if (file.type === 'image') {
            return `${SERVER_BASE_URL}/files/preview?path=${encodeURIComponent(file.path)}&token=${encodeURIComponent(token)}`;
        }
        return file.url;
    };

    const changeView = (view) => {
        setCurrentView(view);
        setFilter('all');
        setSearchTerm('');
        if (view === 'my-files') handleBreadcrumbClick('root');
    };

    const getRelPath = () => {
        if (currentFolderId === 'root') return '';
        const folderPath = path.slice(1).map(p => p.name).join('\\');
        return folderPath;
    };

    const fetchFiles = async (folderPath = '') => {
        try {
            const response = await fetch(`${SERVER_BASE_URL}/files/list?path=${encodeURIComponent(folderPath)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                const files = data.files.map(file => ({
                    id: file.path,
                    type: file.isDirectory ? 'folder' : getFileType(file.name),
                    name: file.name,
                    size: file.isDirectory ? '' : formatSize(file.size), // file.size is in bytes
                    url: file.isDirectory ? '#' : `${SERVER_BASE_URL}/files/preview?path=${encodeURIComponent(file.path)}&token=${encodeURIComponent(token)}`,
                    trashed: false,
                    date: new Date().toISOString(),
                    parentId: currentFolderId,
                    isDirectory: file.isDirectory,
                    path: file.path
                }));

                const newFolders = files.filter(f => f.isDirectory).map(f => ({
                    id: f.id,
                    name: f.name,
                    parentId: currentFolderId
                }));

                const newFiles = files.filter(f => !f.isDirectory);

                setFolders(prev => {
                    const existing = prev.filter(f => f.parentId !== currentFolderId);
                    return [...existing, ...newFolders];
                });
                setMediaFiles(prev => {
                    const existing = prev.filter(f => f.parentId !== currentFolderId);
                    return [...existing, ...newFiles];
                });
            }
        } catch (error) {
            console.error('Error fetching files:', error);
        } finally {
            setLoading(false);
        }
    };

    const getFileType = (filename) => {
        const ext = filename.split('.').pop().toLowerCase();
        const typeMap = {
            jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', bmp: 'image',
            mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video',
            mp3: 'audio', wav: 'audio', flac: 'audio', m4a: 'audio',
            pdf: 'document', doc: 'document', docx: 'document', txt: 'document'
        };
        return typeMap[ext] || 'other';
    };

    const formatSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    useEffect(() => {
        if (token) {
            fetchFiles(getRelPath());
        }
    }, [currentFolderId, token]);

    const itemActionTransition = { type: 'spring', stiffness: 400, damping: 15 };

    return (
        <div className="p-4 h-full flex flex-col relative">
            <Panel className="p-3 flex-grow flex flex-col overflow-hidden">
                <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                    <div className="flex-grow sm:flex-grow-0">
                         <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search files..." className="w-full bg-black/20 border border-card-border rounded-full pl-4 pr-4 py-2 text-main-accent focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {currentView === 'my-files' && <motion.button whileHover={{scale: 1.05}} whileTap={{scale:0.95}} onClick={() => setCreateFolderOpen(true)} className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-full bg-primary/20 text-primary hover:bg-primary/30"><FolderPlus size={16} /> New Folder</motion.button>}
                        <div className="flex items-center bg-black/20 rounded-full p-1"><button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-full ${viewMode === 'grid' ? 'bg-primary text-card-bg' : 'hover:bg-white/10'}`}><LayoutGrid size={20} /></button><button onClick={() => setViewMode('list')} className={`p-1.5 rounded-full ${viewMode === 'list' ? 'bg-primary text-card-bg' : 'hover:bg-white/10'}`}><List size={20} /></button></div>
                    </div>
                </div>

                <div className="flex justify-between items-center border-b border-card-border">
                    <div className="flex items-center gap-2">
                        {[{id: 'my-files', name: 'My Files'}, {id: 'trash', name: 'Trash'}].map(tab => (
                            <button key={tab.id} onClick={() => changeView(tab.id)}
                                className={`px-3 py-2 capitalize relative text-sm font-semibold transition-colors ${currentView === tab.id ? 'text-primary' : 'text-main hover:text-main-accent'}`}>
                                {tab.name}
                                {currentView === tab.id && <motion.div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" layoutId="underline" />}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center justify-between gap-2 py-1 text-sm text-main h-10">
                    {currentView === 'my-files' && (
                        <div className="flex items-center gap-1 flex-wrap overflow-x-auto">
                            {path.map((p, i) => (
                                <React.Fragment key={p.id}>
                                    <button onClick={() => handleBreadcrumbClick(p.id)} className="hover:text-primary px-2 py-1 rounded-md hover:bg-black/20 truncate">{p.name}</button>
                                    {i < path.length - 1 && <ChevronRight size={16} className="flex-shrink-0"/>}
                                </React.Fragment>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex-grow overflow-y-auto pt-2 -mx-2 px-2">
                      {currentView === 'my-files' && (
                        <>
                            <div className="flex flex-wrap gap-2 mb-4">
                                {['all', 'folders', 'image', 'video', 'audio', 'document', 'other'].map(f => (
                                    <motion.button key={f} onClick={() => setFilter(f)} whileHover={{scale:1.05}} whileTap={{scale:0.95}} className={`px-3 py-1 text-sm rounded-full capitalize transition-colors ${filter === f ? 'bg-primary text-card-bg font-semibold' : 'bg-black/20 text-main hover:bg-black/40'}`}>
                                        {f}
                                    </motion.button>
                                ))}
                            </div>
                        </>
                      )}
                    {loading ? (
                        <div className="text-center py-16 text-main">
                            <Loader2 size={48} className="mx-auto mb-4 animate-spin" />
                            <h3 className="text-xl font-semibold text-main-accent">Loading files...</h3>
                        </div>
                    ) : (
                        <motion.div layout className={`transition-all duration-500 ${viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4' : 'flex flex-col gap-2'}`}>
                            <AnimatePresence>
                                {filteredItems.map(item => {
                                    const isFolder = !isMediaFile(item);
                                    return (
                                        <motion.div layout key={item.id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} whileHover="hover" variants={{hover:{y:-5, scale:1.03}}}
                                            className={`relative rounded-lg overflow-hidden cursor-pointer group ${viewMode === 'list' && 'flex items-center p-2 bg-black/20'}`} onClick={() => isFolder ? handleFolderClick(item.id) : (item.type === 'image' || item.type === 'video' || item.type === 'audio' || item.type === 'document') ? setViewingFile(item) : setDetailsFile(item)}>
                                            {isFolder ? (
                                                <>
                                                    <div className={`${viewMode === 'grid' ? 'aspect-square' : 'w-10 h-10 flex-shrink-0'} bg-black/20 rounded-lg flex items-center justify-center`}>
                                                        <Folder size={viewMode === 'grid' ? 48 : 24} className="text-primary" />
                                                    </div>
                                                    <div className={`${viewMode === 'grid' ? 'p-3' : 'ml-4 flex-grow'}`}>
                                                        <p className="font-semibold text-sm truncate text-main-accent">{item.name}</p>
                                                    </div>
                                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
                                                        <motion.button whileHover={{scale:1.1}} whileTap={{scale:0.9}} transition={itemActionTransition} onClick={(e) => { e.stopPropagation(); setRenameOpen({ type: 'folder', id: item.id, name: item.name }); }} className="p-3 bg-black/40 backdrop-blur-sm rounded-full hover:bg-blue-500 transition-colors text-white"><Edit size={20} /></motion.button>
                                                        <motion.button whileHover={{scale:1.1}} whileTap={{scale:0.9}} transition={itemActionTransition} onClick={(e) => { e.stopPropagation(); setToDelete(item); }} className="p-3 bg-black/40 backdrop-blur-sm rounded-full hover:bg-red-500 transition-colors text-white"><Trash size={20} /></motion.button>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className={`${viewMode === 'grid' ? 'aspect-square' : 'w-10 h-10 flex-shrink-0'} bg-black/20 rounded-lg`}>
                                                        {item.type === 'image' ? <img src={getPreviewUrl(item)} alt={item.name} className="object-cover w-full h-full rounded-lg" onError={(e) => { e.target.onerror = null; e.target.src=`https://placehold.co/600x400/f43f5e/ffffff?text=${item.name}`; }} /> : <div className="w-full h-full flex items-center justify-center p-2"><FileIconComponent type={item.type} /></div>}
                                                    </div>
                                                    <div className={`${viewMode === 'grid' ? 'absolute inset-0 bg-gradient-to-t from-black/80 to-transparent' : 'ml-4 flex-grow'}`}>
                                                        <div className={`${viewMode === 'grid' ? 'absolute bottom-0 left-0 p-3' : ''}`}>
                                                            <p className="font-semibold text-sm truncate text-main-accent">{item.name}</p>
                                                            <div className={`text-xs text-main ${viewMode === 'list' ? 'flex gap-4' : ''}`}>
                                                                <span>{item.size}</span>
                                                                <span className="hidden sm:inline">{new Date(item.date).toLocaleDateString()}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
                                                        {currentView === 'my-files' ? <>
                                                            <motion.button whileHover={{scale:1.1}} whileTap={{scale:0.9}} transition={itemActionTransition} onClick={(e) => { e.stopPropagation(); handleDownload(item); }} className="p-3 bg-black/40 backdrop-blur-sm rounded-full hover:bg-green-500 transition-colors text-white"><Download size={20} /></motion.button>
                                                            <motion.button whileHover={{scale:1.1}} whileTap={{scale:0.9}} transition={itemActionTransition} onClick={(e) => { e.stopPropagation(); setDetailsFile(item); }} className="p-3 bg-black/40 backdrop-blur-sm rounded-full hover:bg-blue-500 transition-colors text-white"><Info size={20} /></motion.button>
                                                            <motion.button whileHover={{scale:1.1}} whileTap={{scale:0.9}} transition={itemActionTransition} onClick={(e) => { e.stopPropagation(); handleFileAction(item, 'trash'); }} className="p-3 bg-black/40 backdrop-blur-sm rounded-full hover:bg-red-500 transition-colors text-white"><Trash size={20} /></motion.button>
                                                        </> : <>
                                                            <motion.button whileHover={{scale:1.1}} whileTap={{scale:0.9}} transition={itemActionTransition} onClick={(e) => { e.stopPropagation(); handleFileAction(item, 'restore')}} className="p-3 bg-black/40 backdrop-blur-sm rounded-full hover:bg-emerald-500 transition-colors text-white"><Undo size={20}/></motion.button>
                                                            <motion.button whileHover={{scale:1.1}} whileTap={{scale:0.9}} transition={itemActionTransition} onClick={(e) => { e.stopPropagation(); handleFileAction(item, 'delete')}} className="p-3 bg-black/40 backdrop-blur-sm rounded-full hover:bg-red-500 transition-colors text-white"><Trash2 size={20}/></motion.button>
                                                        </>}
                                                    </div>
                                                </>
                                            )}
                                    </motion.div>
                                    )})}
                            </AnimatePresence>
                        </motion.div>
                    )}
                    {!loading && filteredItems.length === 0 && (
                        <div className="text-center py-16 text-main">
                            <Folder size={48} className="mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-main-accent">
                                Nothing to see here
                            </h3>
                            <p>
                                This folder is empty or no items match your search.
                            </p>
                        </div>
                    )}
                </div>
            </Panel>

            <motion.button whileHover={{ scale: 1.1, rotate: 5 }} whileTap={{ scale: 0.95 }} onClick={() => setUploadOpen(true)} className="fixed bottom-20 right-6 w-14 h-14 bg-primary text-card-bg rounded-full flex items-center justify-center shadow-lg shadow-primary/30 z-40"><Upload size={24}/></motion.button>

            <ModalWrapper isOpen={!!viewingFile} onClose={() => setViewingFile(null)}>
                {viewingFile?.type === 'image' && <ErrorBoundary onClose={() => setViewingFile(null)}><ImageViewer files={mediaSubsets.image} initialFile={viewingFile} onClose={() => setViewingFile(null)} getPreviewUrl={getPreviewUrl} /></ErrorBoundary>}
                {viewingFile?.type === 'video' && <VideoPlayer file={viewingFile} onClose={() => setViewingFile(null)} />}
                {viewingFile?.type === 'audio' && <AudioPlayer files={mediaSubsets.audio} initialFile={viewingFile} onClose={() => setViewingFile(null)} />}
                {viewingFile?.type === 'document' && viewingFile?.name.toLowerCase().endsWith('.txt') && <TextViewer file={viewingFile} onClose={() => setViewingFile(null)} />}
                {viewingFile?.type === 'document' && !viewingFile?.name.toLowerCase().endsWith('.txt') && <DocumentViewer file={viewingFile} onClose={() => setViewingFile(null)} />}
                {viewingFile?.type === 'other' && <DetailsModal file={viewingFile} onClose={() => setViewingFile(null)} />}
            </ModalWrapper>
            <ModalWrapper isOpen={!!detailsFile} onClose={() => setDetailsFile(null)}><DetailsModal file={detailsFile} onClose={() => setDetailsFile(null)} token={token} /></ModalWrapper>
            <ModalWrapper isOpen={isUploadOpen} onClose={() => { setUploadOpen(false); refreshFiles(); }}><UploadModal onClose={() => { setUploadOpen(false); refreshFiles(); }} token={token} relPath={getRelPath()} /></ModalWrapper>
            <ConfirmationModal isOpen={!!toDelete && isMediaFile(toDelete)} onClose={() => setToDelete(null)} onConfirm={handlePermanentDelete} title="Delete Permanently?" message={`This action is irreversible. Are you sure you want to permanently delete '${toDelete?.name}'?`}/>
            <ConfirmationModal isOpen={!!toDelete && !isMediaFile(toDelete)} onClose={() => setToDelete(null)} onConfirm={handleDeleteFolder} title="Delete Folder?" message={`Are you sure you want to delete the folder '${toDelete?.name}'? Its contents will be moved to Home.`}/>
            <NameInputModal isOpen={isCreateFolderOpen} onClose={() => setCreateFolderOpen(false)} onConfirm={handleCreateFolder} title="Create New Folder" placeholder="Enter folder name"/>
            <NameInputModal isOpen={!!isRenameOpen} onClose={() => setRenameOpen(null)} onConfirm={handleRename} title={`Rename ${isRenameOpen?.type || 'Item'}`} placeholder="Enter new name" initialValue={isRenameOpen?.name} />
        </div>
    );
};

// --- LAYOUT COMPONENTS ---

const LoginScreen = ({ onLogin, setToken }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            // Connect to NAS with entered credentials
            const connectRes = await fetch(`${SERVER_BASE_URL}/auth/connect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    host: '10.89.127.76',
                    share: 'MyShare',
                    username,
                    password,
                    domain: 'WORKGROUP'
                })
            });
            const connectData = await connectRes.json();
            if (connectData.token) {
                setToken(connectData.token);
                localStorage.setItem('token', connectData.token);
                onLogin();
            } else {
                alert(`NAS connection failed: ${connectData.error || 'Unknown error'}`);
            }
        } catch (err) {
            alert(`Connection error: ${err.message}`);
        }
        setIsLoading(false);
    };

    return (
        <div className="w-screen h-screen overflow-hidden flex items-center justify-center relative">
            <AnimatedGradientBackground />
            <Panel className="w-96 p-8 text-center" initial={{opacity: 0, scale: 0.9}} animate={{opacity: 1, scale: 1}} transition={{duration: 0.5}}>
                <HardDrive size={48} className="mx-auto text-primary mb-2" />
                <h1 className="text-4xl font-bold font-title text-main-accent">NAS Console</h1>
                <p className="text-main mb-8"></p>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-black/20 border border-card-border rounded-lg px-4 py-2 text-main-accent focus:outline-none focus:ring-2 focus:ring-primary" />
                    <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-black/20 border border-card-border rounded-lg px-4 py-2 text-main-accent focus:outline-none focus:ring-2 focus:ring-primary" />
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} type="submit" disabled={isLoading} className="w-full flex justify-center items-center space-x-2 py-3 px-4 bg-primary text-card-bg font-semibold rounded-lg hover:bg-primary/80 transition-colors disabled:opacity-50">
                        {isLoading && <Loader2 className="animate-spin" size={20} />}<span>{isLoading ? 'Connecting...' : 'Connect to NAS'}</span>
                    </motion.button>
                    
                </form>
            </Panel>
        </div>
    );
};

const Header = ({ page, onLogout }) => {
    const pageTitles = { dashboard: 'Dashboard', gallery: 'Media Gallery', chatbot: 'AI Chatbot', cli: 'Command Line Interface', performance: 'API Performance', theme: 'Theme Settings' };
    const [isClockOpen, setClockOpen] = useState(false);

    const LiveClock = ({ isBig = false }) => {
        const [time, setTime] = useState(new Date());
        useEffect(() => { const timer = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(timer); }, []);
        if (isBig) return <Panel className="p-8"><div className="text-center"><div className="text-8xl md:text-9xl font-bold tracking-tighter text-main-accent font-mono">{time.toLocaleTimeString([], { hour12: false })}</div><div className="text-2xl mt-4 text-main">{time.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div></div></Panel>;
        return <Panel className="px-3 py-1.5 !rounded-xl"><div className="flex items-center space-x-2 text-sm text-main"><Clock size={16} /><span>{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span></div></Panel>;
    };

    return (
        <>
            <header className="p-3 sm:px-4 flex items-center justify-between">
                <Panel className="p-2 !rounded-2xl">
                    <div className="flex items-center space-x-3">
                        <HardDrive size={28} className="text-primary" />
                        <div>
                            <h1 className="text-lg font-bold font-title text-main-accent">NAS Console</h1>
                            <AnimatePresence mode="wait">
                                <motion.div key={page} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
                                    <TypingAnimation text={pageTitles[page]} className="text-xs font-semibold text-main" />
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>
                </Panel>

                <div className="flex items-center space-x-2">
                    <div className="cursor-pointer" onClick={() => setClockOpen(true)}><LiveClock /></div>
                    
                    {/* FIXED: Logout button is now a single styled component with better contrast */}
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={onLogout}
                        className="w-10 h-10 flex items-center justify-center bg-card-bg/60 backdrop-blur-sm border border-card-border rounded-full text-main-accent hover:text-red-400 hover:border-red-400/20 transition-colors"
                    >
                        <LogOut size={18} />
                    </motion.button>
                </div>
            </header>
            <ModalWrapper isOpen={isClockOpen} onClose={() => setClockOpen(false)}><LiveClock isBig /></ModalWrapper>
        </>
    );
};

const Dock = ({ page, setPage }) => {
    const navItems = [
        { name: 'Dashboard', icon: Home, page: 'dashboard' },
        { name: 'Media Gallery', icon: Folder, page: 'gallery' },
        { name: 'AI Chatbot', icon: BrainCircuit, page: 'chatbot' },
        { name: 'CLI', icon: TerminalIcon, page: 'cli' },
        { name: 'API Performance', icon: Cpu, page: 'performance' },
        { name: 'Theme', icon: Settings, page: 'theme' }
    ];
    let mouseX = useMotionValue(Infinity);

    return (
        <motion.nav onMouseMove={(e) => mouseX.set(e.pageX)} onMouseLeave={() => mouseX.set(Infinity)}
            className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-end h-12 gap-1 p-1 bg-card-bg/50 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl">
            {navItems.map((item) => <DockIcon key={item.page} name={item.name} icon={item.icon} isSelected={page === item.page} onClick={() => setPage(item.page)} mouseX={mouseX} />)}
        </motion.nav>
    );
};
const DockIcon = ({ name, icon: Icon, isSelected, onClick, mouseX }) => {
    let ref = useRef(null);
    let distance = useTransform(mouseX, (val) => ref.current?.getBoundingClientRect() ? val - ref.current.getBoundingClientRect().x - ref.current.getBoundingClientRect().width / 2 : Infinity);
    let widthSync = useTransform(distance, [-100, 0, 100], [40, 65, 40]);
    let width = useSpring(widthSync, { mass: 0.1, stiffness: 150, damping: 12 });
    const [isHovered, setIsHovered] = useState(false);

    return (
        <motion.div ref={ref} style={{ width }} onClick={onClick} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}
            className="aspect-square flex items-center justify-center relative cursor-pointer">
            <AnimatePresence>{isHovered && (<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute bottom-full mb-2 px-2 py-1 bg-card-bg/90 border border-card-border rounded-md text-xs text-main-accent whitespace-nowrap shadow-lg"><p>{name}</p></motion.div>)}</AnimatePresence>
            <motion.div className="w-full h-full p-1.5 flex items-center justify-center transition-colors duration-300 rounded-lg" animate={{backgroundColor: isSelected ? 'var(--color-primary)' : 'rgba(0,0,0,0)', scale: isSelected ? 1 : 0.9}} whileHover={{scale: 1}}>
                <Icon className={`w-full h-full transition-colors ${isSelected ? "text-card-bg" : "text-main-accent"}`} />
            </motion.div>
        </motion.div>
    );
};

const CliView = ({ token }) => {
    const terminalRef = useRef(null);
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        if (!token) return;
        const newSocket = io(SERVER_BASE_URL, { auth: { token } });
        setSocket(newSocket);
        return () => newSocket.close();
    }, [token]);

    useEffect(() => {
        if (!terminalRef.current || !socket) return;

        const term = new Terminal({
            cursorBlink: true,
            theme: {
                background: '#1e293b',
                foreground: '#e2e8f0',
                cursor: '#38bdf8'
            }
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        fitAddon.fit();
        term.focus();

        term.write('Welcome to Raspberry Pi CLI\r\n$ ');

        let command = '';

        term.onData((data) => {
            if (data === '\r') { // Enter
                if (command.trim()) {
                    socket.emit('command', command.trim());
                }
                term.write('\r\n');
                command = '';
            } else if (data === '\x7f') { // Backspace
                if (command.length > 0) {
                    command = command.slice(0, -1);
                    term.write('\b \b');
                }
            } else if (data === '\x1b[A' || data === '\x1b[B' || data === '\x1b[C' || data === '\x1b[D') {
                // Ignore arrow keys to prevent sending escape sequences
                return;
            } else {
                command += data;
                term.write(data);
            }
        });

        socket.on('output', (data) => {
            console.log('Received output:', data);
            term.write(data);
            // After writing output, show the prompt for next command
            if (data.includes('\n') && !data.includes('$ ')) {
                setTimeout(() => term.write('$ '), 100);
            }
        });

        return () => {
            term.dispose();
        };
    }, [socket]);

    return (
        <div className="p-4 h-full">
            <Panel className="h-full p-4">
                <div ref={terminalRef} className="w-full h-full bg-black rounded-lg"></div>
            </Panel>
        </div>
    );
};

const PerformanceView = ({ token }) => {
    const [performanceData, setPerformanceData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPerformanceData = async () => {
            try {
                const response = await fetch(`${SERVER_BASE_URL}/stats/performance`);
                const data = await response.json();
                setPerformanceData(data);
            } catch (error) {
                console.error('Error fetching performance data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchPerformanceData();
        const interval = setInterval(fetchPerformanceData, 5000); // Update every 5 seconds
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div className="p-4 h-full flex items-center justify-center">
                <Panel className="p-8 text-center">
                    <Loader2 size={48} className="mx-auto mb-4 animate-spin" />
                    <h3 className="text-xl font-semibold text-main-accent">Loading Performance Data...</h3>
                </Panel>
            </div>
        );
    }

    if (!performanceData) {
        return (
            <div className="p-4 h-full flex items-center justify-center">
                <Panel className="p-8 text-center">
                    <AlertCircle size={48} className="mx-auto text-red-400 mb-4" />
                    <h3 className="text-xl font-semibold text-main-accent">Failed to load performance data</h3>
                </Panel>
            </div>
        );
    }

    const responseTimeData = performanceData.recentRequests.map((req, index) => ({
        time: new Date(req.timestamp).toLocaleTimeString(),
        duration: req.duration,
        status: req.statusCode
    }));

    const endpointData = performanceData.endpoints.map(endpoint => ({
        endpoint: `${endpoint.method} ${endpoint.url}`,
        avgDuration: endpoint.avgDuration,
        totalRequests: endpoint.totalRequests,
        errorRate: endpoint.totalRequests > 0 ? (endpoint.errorCount / endpoint.totalRequests) * 100 : 0
    }));

    return (
        <div className="p-4 h-full overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <Panel className="p-4">
                    <h3 className="text-xl font-bold text-main-accent mb-4">Response Times (Recent)</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={responseTimeData}>
                            <XAxis dataKey="time" stroke="var(--color-text-main)" fontSize={12} />
                            <YAxis stroke="var(--color-text-main)" fontSize={12} label={{ value: 'Duration (ms)', angle: -90, position: 'insideLeft' }} />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'var(--color-card-bg)', border: '1px solid var(--color-card-border)' }}
                                labelStyle={{ color: 'var(--color-text-main-accent)' }}
                            />
                            <Line type="monotone" dataKey="duration" stroke="var(--color-primary)" strokeWidth={2} dot={{ fill: 'var(--color-primary)' }} />
                        </LineChart>
                    </ResponsiveContainer>
                </Panel>

                <Panel className="p-4">
                    <h3 className="text-xl font-bold text-main-accent mb-4">Endpoint Performance</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={endpointData}>
                            <XAxis dataKey="endpoint" stroke="var(--color-text-main)" fontSize={10} angle={-45} textAnchor="end" height={80} />
                            <YAxis stroke="var(--color-text-main)" fontSize={12} label={{ value: 'Avg Duration (ms)', angle: -90, position: 'insideLeft' }} />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'var(--color-card-bg)', border: '1px solid var(--color-card-border)' }}
                                labelStyle={{ color: 'var(--color-text-main-accent)' }}
                            />
                            <Bar dataKey="avgDuration" fill="var(--color-primary)" />
                        </BarChart>
                    </ResponsiveContainer>
                </Panel>
            </div>

            <Panel className="p-4">
                <h3 className="text-xl font-bold text-main-accent mb-4">Endpoint Statistics</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-card-border">
                                <th className="text-left py-2 text-main-accent">Endpoint</th>
                                <th className="text-right py-2 text-main-accent">Total Requests</th>
                                <th className="text-right py-2 text-main-accent">Avg Duration (ms)</th>
                                <th className="text-right py-2 text-main-accent">Min Duration (ms)</th>
                                <th className="text-right py-2 text-main-accent">Max Duration (ms)</th>
                                <th className="text-right py-2 text-main-accent">Error Rate (%)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {performanceData.endpoints.map((endpoint, index) => (
                                <tr key={index} className="border-b border-card-border/50">
                                    <td className="py-2 text-main-accent font-mono">{endpoint.method} {endpoint.url}</td>
                                    <td className="py-2 text-right text-main">{endpoint.totalRequests}</td>
                                    <td className="py-2 text-right text-main">{endpoint.avgDuration.toFixed(2)}</td>
                                    <td className="py-2 text-right text-main">{endpoint.minDuration.toFixed(2)}</td>
                                    <td className="py-2 text-right text-main">{endpoint.maxDuration.toFixed(2)}</td>
                                    <td className="py-2 text-right text-main">{endpoint.totalRequests > 0 ? ((endpoint.errorCount / endpoint.totalRequests) * 100).toFixed(2) : 0}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Panel>

            <div className="mt-4 text-center text-main text-sm">
                Total Requests Tracked: {performanceData.totalRequests}
            </div>
        </div>
    );
};

const ThemeView = ({ theme, setTheme }) => {
    const themes = [
        { id: 'deep-ocean', name: 'Deep Ocean', icon: Moon, bg: '#0f172a' },
        { id: 'soft-sky', name: 'Soft Sky', icon: Sun, bg: '#f1f5f9' }
    ];
    return (
        <div className="p-4 h-full flex items-center justify-center">
            <motion.div className="w-full max-w-4xl" initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }}>
                <TypingAnimation text="Select a Theme" className="text-4xl font-bold font-title text-center text-main-accent mb-10 justify-center" />
                <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-8" variants={{ visible: { transition: { staggerChildren: 0.1 } } }} initial="hidden" animate="visible">
                    {themes.map(t => (
                        <motion.div key={t.id} variants={{ hidden: { opacity: 0, scale: 0.8 }, visible: { opacity: 1, scale: 1 } }} onClick={() => setTheme(t.id)}
                            className={`cursor-pointer rounded-3xl p-1 transition-all duration-300 ${theme === t.id ? 'bg-gradient-to-br from-primary to-purple-500' : 'bg-transparent'}`}>
                            <Panel className="p-4 group">
                                <div className="w-full aspect-video rounded-2xl p-4 flex flex-col justify-between border border-card-border" style={{ backgroundColor: t.bg }}>
                                    <div className="flex items-center space-x-2"><t.icon className={t.id === 'soft-sky' ? 'text-slate-800' : 'text-white'} /><h3 className={`font-bold text-xl ${t.id === 'soft-sky' ? 'text-slate-800' : 'text-white'}`}>{t.name}</h3></div>
                                    <div className="flex justify-end"><div className={`w-10 h-10 rounded-full ${t.id === 'deep-ocean' ? 'bg-sky-400' : 'bg-blue-500'}`}></div></div>
                                </div>
                            </Panel>
                        </motion.div>
                    ))}
                </motion.div>
            </motion.div>
        </div>
    );
};

const ChatbotView = ({ token }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    const sendMessage = async () => {
        if (!input.trim()) return;

        const userMessage = { text: input, sender: 'user', timestamp: new Date() };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch(`${SERVER_BASE_URL}/ai/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ message: input })
            });
            const data = await response.json();

            if (data.response) {
                const botMessage = {
                    text: data.response,
                    sender: 'bot',
                    timestamp: new Date(),
                    action: data.action
                };
                setMessages(prev => [...prev, botMessage]);
            } else {
                const errorMessage = {
                    text: data.error || 'Sorry, I couldn\'t process that request.',
                    sender: 'bot',
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, errorMessage]);
            }
        } catch (error) {
            const errorMessage = { text: 'Error communicating with AI service.', sender: 'bot', timestamp: new Date() };
            setMessages(prev => [...prev, errorMessage]);
        }
        setIsLoading(false);
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div className="p-4 h-full flex flex-col">
            <Panel className="flex-1 flex flex-col p-4">
                <div className="flex items-center space-x-2 mb-4">
                    <BrainCircuit size={24} className="text-primary" />
                    <h2 className="text-xl font-bold text-main-accent">AI Chatbot</h2>
                    <span className="text-sm text-main">Powered by Hugging Face</span>
                </div>

                <div className="flex-1 overflow-y-auto mb-4 space-y-4">
                    {messages.length === 0 && (
                        <div className="text-center text-main py-8">
                            <BrainCircuit size={48} className="mx-auto mb-4 text-primary/50" />
                            <p className="text-lg">Hello! I'm your smart file assistant.</p>
                            <p className="text-sm mt-2">I understand natural language commands like:</p>
                            <ul className="text-sm mt-2 space-y-1">
                                <li>• "Move image.jpg to backup folder"</li>
                                <li>• "List files in documents"</li>
                                <li>• "Find images from 2023-01-01"</li>
                                <li>• "Create folder photos"</li>
                            </ul>
                        </div>
                    )}

                    <AnimatePresence>
                        {messages.map((msg, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                                    msg.sender === 'user'
                                        ? 'bg-primary text-card-bg'
                                        : 'bg-black/20 text-main-accent'
                                }`}>
                                    <p className="text-sm">{msg.text}</p>
                                    <p className="text-xs opacity-70 mt-1">
                                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {isLoading && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex justify-start"
                        >
                            <div className="bg-black/20 text-main-accent px-4 py-2 rounded-2xl">
                                <div className="flex items-center space-x-2">
                                    <Loader2 className="animate-spin" size={16} />
                                    <span>Thinking...</span>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                <div className="flex space-x-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Type your command..."
                        className="flex-1 bg-black/20 border border-card-border rounded-full px-4 py-2 text-main-accent focus:outline-none focus:ring-2 focus:ring-primary"
                        disabled={isLoading}
                    />
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={sendMessage}
                        disabled={isLoading || !input.trim()}
                        className="px-6 py-2 bg-primary text-card-bg rounded-full font-semibold hover:bg-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Send
                    </motion.button>
                </div>
            </Panel>
        </div>
    );
};

// --- MAIN APP ---

export default function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [theme, setTheme] = useState('deep-ocean');
    const [token, setToken] = useState(localStorage.getItem('token') || '');

    useEffect(() => {
        document.documentElement.className = `theme-${theme}`;
    }, [theme]);

    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        if (storedToken) {
            fetch(`${SERVER_BASE_URL}/auth/verify`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${storedToken}`
                }
            })
            .then(res => res.json())
            .then(data => {
                if (data.ok) {
                    setToken(storedToken);
                    setIsLoggedIn(true);
                } else {
                    localStorage.removeItem('token');
                    setToken('');
                    setIsLoggedIn(false);
                }
            })
            .catch(() => {
                localStorage.removeItem('token');
                setToken('');
                setIsLoggedIn(false);
            });
        }
    }, []);

    const PageComponent = { dashboard: Dashboard, gallery: () => <MediaGallery token={token} />, chatbot: () => <ChatbotView token={token} />, cli: () => <CliView token={token} />, performance: () => <PerformanceView token={token} />, theme: ThemeView }[currentPage];

    if (!isLoggedIn) return <LoginScreen onLogin={() => setIsLoggedIn(true)} setToken={setToken} />;

    return (
        <div className="w-screen h-screen bg-background text-main overflow-hidden flex flex-col font-body transition-colors duration-500">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700&family=Inter:wght@400;600&display=swap');
                :root {
                    --font-body: 'Inter', sans-serif;
                    --font-title: 'Orbitron', sans-serif;
                }
                .theme-deep-ocean {
                    --color-background: #0f172a;
                    --color-text-main: #94a3b8;
                    --color-text-main-accent: #e2e8f0;
                    --color-primary: #38bdf8;
                    --color-card-bg: #1e293b;
                    --color-card-border: rgba(56, 189, 248, 0.1);
                }
                .theme-soft-sky {
                    --color-background: #f1f5f9;
                    --color-text-main: #475569;
                    --color-text-main-accent: #0f172a;
                    --color-primary: #3b82f6;
                    --color-card-bg: #ffffff;
                    --color-card-border: #e2e8f0;
                }
                body { font-family: var(--font-body); background-color: var(--color-background); color: var(--color-text-main); }
            `}</style>

            <AnimatedGradientBackground />
            <Header page={currentPage} onLogout={() => { setIsLoggedIn(false); setToken(''); localStorage.removeItem('token'); }} />
            <main className="flex-1 min-h-0">
                <AnimatePresence mode="wait">
                     <motion.div key={currentPage} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }} className="h-full">
                        <PageComponent theme={theme} setTheme={setTheme} />
                     </motion.div>
                </AnimatePresence>
            </main>
            <Dock page={currentPage} setPage={setCurrentPage} />
            <div className="fixed bottom-4 right-6 text-xs text-main/50 font-mono z-50 pointer-events-none">
                -Developed by Harshal & Kovid
            </div>
        </div>
    );
}