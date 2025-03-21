// TTS state variables
let worker = $state<Worker | null>(null);
let isGenerating = $state(false);
let availableVoices = $state<VoiceType[]>([]);
let selectedVoice = $state<VoiceType>("af_heart");
let deviceType = $state<string>("");
let audioQueue = $state<Blob[]>([]);
let currentAudio = $state<HTMLAudioElement | null>(null);
let streamedText = $state<string>("");
let speedSetting = $state<number>(1.0);

// Add audio blob to queue and play if not already playing
function addToAudioQueue(audioBlob: Blob) {
    audioQueue = [...audioQueue, audioBlob];
    
    // If not currently playing audio, start playing
    if (!currentAudio) {
        playNextInQueue();
    }
}

// Play next audio in queue
function playNextInQueue() {
    if (audioQueue.length === 0) {
        currentAudio = null;
        return;
    }
    
    // Get next blob from queue
    const nextBlob = audioQueue[0];
    audioQueue = audioQueue.slice(1);
    
    // Create audio element and play
    const audioUrl = URL.createObjectURL(nextBlob);
    const audio = new Audio(audioUrl);
    
    audio.onended = () => {
        // Clean up URL object
        URL.revokeObjectURL(audioUrl);
        // Play next in queue when done
        playNextInQueue();
    };
    
    currentAudio = audio;
    
    // Play the audio
    audio.play().catch(error => {
        console.error('Error playing audio:', error);
        URL.revokeObjectURL(audioUrl);
        playNextInQueue();
    });
}

// Format voice name for display
function formatVoiceName(voice: VoiceType): string {
    // Parse voice ID format (e.g., "af_heart", "bm_daniel")
    const parts = voice.split('_');
    if (parts.length !== 2) return voice;
    
    const [typeCode, name] = parts;
    
    // Map country codes to flag emojis
    let countryEmoji = '';
    if (typeCode.startsWith('a')) countryEmoji = '🇺🇸'; // American
    else if (typeCode.startsWith('b')) countryEmoji = '🇬🇧'; // British
    else countryEmoji = '🌐'; // Unknown country
    
    // Map gender codes to gender emojis
    let genderEmoji = '';
    if (typeCode.endsWith('f')) genderEmoji = '👩'; // Female
    else if (typeCode.endsWith('m')) genderEmoji = '👨'; // Male
    else genderEmoji = '🧑'; // Unknown gender
    
    // Capitalize the name
    const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
    
    // Format with emojis: [Flag][Gender] Name
    return `${countryEmoji}${genderEmoji} ${capitalizedName}`;
}

// Function to send text to TTS engine
function speakText() {
    if (!worker || !ttsText.trim() || isGenerating) return;
    
    try {
        isGenerating = true;
        streamedText = "";
        
        // Clear existing audio queue
        audioQueue = [];
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }
        
        // Send message to worker to generate speech
        const message: WorkerInMessage = {
            text: ttsText,
            voice: selectedVoice,
            speed: speedSetting
        };
        
        worker.postMessage(message);
    } catch (error) {
        console.error('Error sending message to worker:', error);
        isGenerating = false;
    }
}