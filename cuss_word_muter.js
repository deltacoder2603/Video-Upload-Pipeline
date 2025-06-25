#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Import Google Generative AI SDK
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

class ConservativeCussWordMuter {
  constructor() {
    this.geminiApiKey = 'AIzaSyADv0-3bQ_72nKlxQwzOI9UvXhu7_sn9Go';
    this.initializeGemini();
    this.checkDependencies();
    this.setupStrictCussWords();
    
    // Rate limiting for API calls
    this.lastApiCall = 0;
    this.apiCallDelay = 2000; // 2 seconds between calls
  }

  // Initialize Gemini AI
  initializeGemini() {
    try {
      this.genAI = new GoogleGenerativeAI(this.geminiApiKey);
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      console.log('✓ Gemini AI initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Gemini AI:', error.message);
      this.hasGemini = false;
      return;
    }
    this.hasGemini = true;
  }

  // Setup only the most explicit cuss words (very conservative)
  setupStrictCussWords() {
    this.explicitCussWords = {
      // Only the most explicit English words
      english: [
        'fuck', 'fucking', 'motherfucker', 'cocksucker', 'shit', 'bullshit',
        'bitch', 'asshole', 'dickhead', 'cunt', 'whore', 'slut'
      ],
      
      // Only very explicit Hindi/Urdu words (avoiding common words that might be misheard)
      hindi: [
        'भोसड़ी', 'भोसड़ा', 'मादरचोद', 'रंडी', 'चूतिया', 'बहनचोद',
        'madarchod', 'bhosda', 'bhosdike', 'randi', 'behenchod',
        'بوصری', 'رنڈی', // Only very explicit Urdu
        'chutiya', 'gandu' // Only when clearly used as profanity
      ],
      
      // Conservative Spanish
      spanish: ['puta', 'hijo de puta', 'joder', 'coño'],
      
      // Conservative French  
      french: ['putain', 'salope', 'fils de pute', 'enculé'],
      
      // Conservative German
      german: ['scheiße', 'hurensohn', 'arschloch'],
      
      // Only explicit Arabic
      arabic: ['كس', 'زب']
    };

    // Create strict regex patterns
    this.createStrictRegexPatterns();
  }

  createStrictRegexPatterns() {
    // Only match whole words for Latin scripts
    const latinWords = [
      ...this.explicitCussWords.english,
      ...this.explicitCussWords.spanish,
      ...this.explicitCussWords.french,
      ...this.explicitCussWords.german,
      ...this.explicitCussWords.hindi.filter(word => /^[a-zA-Z]/.test(word))
    ];

    // Very strict word boundary matching
    this.latinRegex = new RegExp(
      '\\b(' + latinWords.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b',
      'gi'
    );

    // Devanagari - only explicit words
    const devanagariWords = this.explicitCussWords.hindi.filter(word => /[\u0900-\u097F]/.test(word));
    if (devanagariWords.length > 0) {
      this.devanagariRegex = new RegExp(
        '\\b(' + devanagariWords.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b',
        'gi'
      );
    }

    // Arabic/Urdu - only explicit words
    const arabicWords = [
      ...this.explicitCussWords.arabic,
      ...this.explicitCussWords.hindi.filter(word => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(word))
    ];
    
    if (arabicWords.length > 0) {
      this.arabicRegex = new RegExp(
        '(' + arabicWords.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')',
        'gi'
      );
    }
  }

  // Rate-limited API call to avoid quota issues
  async callGeminiAPI(text) {
    if (!this.hasGemini) {
      return { hasProfanity: false, detectedWords: [], confidence: 0 };
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCall;
    if (timeSinceLastCall < this.apiCallDelay) {
      await new Promise(resolve => setTimeout(resolve, this.apiCallDelay - timeSinceLastCall));
    }
    this.lastApiCall = Date.now();

    try {
      const prompt = `Analyze this text VERY STRICTLY for only extreme profanity/vulgar language. Be CONSERVATIVE - only flag words that are clearly offensive slurs, sexual vulgarities, or extreme profanity. DO NOT flag common words, names, or mild language.

Text: "${text}"

Respond with JSON only:
{
  "hasProfanity": true/false,
  "detectedWords": ["only_extreme_profanity"],
  "confidence": 0.0-1.0
}

Only flag if confidence > 0.8 and words are genuinely offensive.`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const generatedText = response.text();

      const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysisResult = JSON.parse(jsonMatch[0]);
        // Only accept high-confidence results
        if (analysisResult.confidence && analysisResult.confidence < 0.8) {
          return { hasProfanity: false, detectedWords: [], confidence: analysisResult.confidence };
        }
        return analysisResult;
      }
      
      return { hasProfanity: false, detectedWords: [], confidence: 0 };

    } catch (error) {
      console.log('⚠️  Gemini API error, using local detection only:', error.message);
      return { hasProfanity: false, detectedWords: [], confidence: 0 };
    }
  }

  // Check dependencies
  checkDependencies() {
    try {
      execSync('ffmpeg -version', { stdio: 'ignore' });
      console.log('✓ FFmpeg is installed');
    } catch (error) {
      console.error('❌ FFmpeg is not installed. Please install FFmpeg first.');
      process.exit(1);
    }

    try {
      execSync('whisper --help', { stdio: 'ignore' });
      console.log('✓ OpenAI Whisper is available');
      this.hasWhisper = true;
    } catch (error) {
      console.log('⚠️  OpenAI Whisper not found. Using basic detection.');
      this.hasWhisper = false;
    }

    try {
      require('@google/generative-ai');
      console.log('✓ Google Generative AI package is available');
    } catch (error) {
      console.error('❌ Google Generative AI package not found.');
      this.hasGemini = false;
    }
  }

  validateVideoFile(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Video file not found: ${filePath}`);
    }
    
    const ext = path.extname(filePath).toLowerCase();
    const supportedFormats = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm'];
    
    if (!supportedFormats.includes(ext)) {
      throw new Error(`Unsupported video format: ${ext}`);
    }
    
    return true;
  }

  async extractAudio(videoPath, audioPath) {
    console.log('🎵 Extracting audio from video...');
    
    const command = [
      'ffmpeg',
      '-i', `"${videoPath}"`,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '16000',
      '-ac', '1',
      '-y',
      `"${audioPath}"`
    ].join(' ');

    try {
      execSync(command, { stdio: 'inherit' });
      console.log('✓ Audio extracted successfully');
    } catch (error) {
      throw new Error(`Failed to extract audio: ${error.message}`);
    }
  }

  async detectLanguage(audioPath) {
    if (!this.hasWhisper) {
      return 'auto';
    }

    try {
      console.log('🌍 Detecting language...');
      const command = `whisper "${audioPath}" --model base --language auto --task detect-language --output_format txt --output_dir "${path.dirname(audioPath)}"`;
      const output = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
      
      const languageMatch = output.match(/detected language: (\w+)/i);
      const detectedLang = languageMatch ? languageMatch[1].toLowerCase() : 'auto';
      
      console.log(`✓ Detected language: ${detectedLang}`);
      return detectedLang;
    } catch (error) {
      console.log('⚠️  Language detection failed, using auto mode');
      return 'auto';
    }
  }

  async transcribeAudio(audioPath, language = 'auto') {
    console.log('🎤 Transcribing audio...');
    
    if (this.hasWhisper) {
      return await this.transcribeWithWhisper(audioPath, language);
    } else {
      return await this.basicAudioAnalysis(audioPath);
    }
  }

  async transcribeWithWhisper(audioPath, language) {
    try {
      const audioName = path.basename(audioPath, path.extname(audioPath));
      const outputDir = path.dirname(audioPath);
      
      let whisperCommand;
      if (language === 'auto') {
        whisperCommand = `whisper "${audioPath}" --model base --output_format json --output_dir "${outputDir}"`;
      } else {
        whisperCommand = `whisper "${audioPath}" --model base --language ${language} --output_format json --output_dir "${outputDir}"`;
      }
      
      execSync(whisperCommand, { stdio: 'inherit' });
      
      const jsonPath = path.join(outputDir, `${audioName}.json`);
      
      if (fs.existsSync(jsonPath)) {
        const transcription = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        console.log('✓ Transcription completed successfully');
        
        // Clean up temporary files
        try {
          fs.unlinkSync(jsonPath);
          const txtPath = path.join(outputDir, `${audioName}.txt`);
          if (fs.existsSync(txtPath)) fs.unlinkSync(txtPath);
        } catch (e) {}
        
        return transcription.segments || [];
      }
    } catch (error) {
      console.log('⚠️  Whisper transcription failed, using basic analysis');
      return await this.basicAudioAnalysis(audioPath);
    }
  }

  async basicAudioAnalysis(audioPath) {
    console.log('🔄 Using basic audio analysis...');
    
    try {
      const durationCommand = `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`;
      const duration = parseFloat(execSync(durationCommand, { encoding: 'utf8' }).trim());
      
      const segments = [];
      const segmentLength = 3;
      
      for (let i = 0; i < duration; i += segmentLength) {
        segments.push({
          start: i,
          end: Math.min(i + segmentLength, duration),
          text: `[Audio segment ${Math.floor(i/segmentLength) + 1} - Manual review needed]`
        });
      }
      
      console.log(`✓ Created ${segments.length} segments for analysis`);
      return segments;
    } catch (error) {
      throw new Error(`Audio analysis failed: ${error.message}`);
    }
  }

  // MUCH more conservative detection - only flag obvious profanity
  async detectCussWords(segments) {
    console.log('🔍 Detecting inappropriate language (CONSERVATIVE mode)...');
    
    const cussWordTimestamps = [];
    let totalCussWords = 0;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const text = segment.text.toLowerCase();
      const originalText = segment.text;
      const cussWordsFound = [];

      console.log(`🔍 Analyzing segment ${i + 1}/${segments.length}: "${originalText.substring(0, 50)}..."`);

      // Local pattern matching - only strict matches
      let localMatches = [];
      
      if (this.latinRegex) {
        const matches = text.match(this.latinRegex);
        if (matches) {
          localMatches.push(...matches);
        }
      }

      if (this.devanagariRegex) {
        const matches = originalText.match(this.devanagariRegex);
        if (matches) {
          localMatches.push(...matches);
        }
      }

      if (this.arabicRegex) {
        const matches = originalText.match(this.arabicRegex);
        if (matches) {
          localMatches.push(...matches);
        }
      }

      // Only proceed with AI if local detection found something OR text is very short (likely profanity)
      const shouldCheckWithAI = localMatches.length > 0 || originalText.trim().split(' ').length <= 3;

      if (shouldCheckWithAI && this.hasGemini) {
        try {
          const aiAnalysis = await this.callGeminiAPI(originalText);
          
          if (aiAnalysis.hasProfanity && aiAnalysis.confidence > 0.8) {
            console.log(`🚨 HIGH-CONFIDENCE AI detection: ${aiAnalysis.detectedWords.join(', ')} (confidence: ${aiAnalysis.confidence})`);
            cussWordsFound.push(...aiAnalysis.detectedWords);
          } else if (aiAnalysis.hasProfanity) {
            console.log(`⚠️  Low confidence AI detection ignored (confidence: ${aiAnalysis.confidence})`);
          }
        } catch (error) {
          console.log('⚠️  AI analysis failed, using local detection only');
        }
      }

      // Add local matches if they're very explicit
      if (localMatches.length > 0) {
        console.log(`🔍 Local pattern matches: ${localMatches.join(', ')}`);
        cussWordsFound.push(...localMatches);
      }

      // Remove duplicates and add to timestamps if any profanity found
      const uniqueCussWords = [...new Set(cussWordsFound)];
      
      if (uniqueCussWords.length > 0) {
        cussWordTimestamps.push({
          start: segment.start,
          end: segment.end,
          words: uniqueCussWords,
          text: segment.text
        });
        totalCussWords += uniqueCussWords.length;
        console.log(`✅ FLAGGED: "${originalText}" -> [${uniqueCussWords.join(', ')}]`);
      } else {
        console.log(`✓ Clean: "${originalText}"`);
      }
    }

    console.log(`\n📊 SUMMARY: Found ${totalCussWords} inappropriate words in ${cussWordTimestamps.length} segments`);
    
    if (cussWordTimestamps.length > 0) {
      console.log('\n📝 Segments that will be MUTED:');
      cussWordTimestamps.forEach((item, index) => {
        console.log(`${index + 1}. ${this.formatTime(item.start)}-${this.formatTime(item.end)}: [${item.words.join(', ')}]`);
        console.log(`   Text: "${item.text}"`);
      });
      
      console.log(`\n⚠️  Total video time to be muted: ${this.calculateTotalMutedTime(cussWordTimestamps)} seconds`);
    }

    return cussWordTimestamps;
  }

  calculateTotalMutedTime(timestamps) {
    return timestamps.reduce((total, segment) => total + (segment.end - segment.start), 0).toFixed(2);
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(2);
    return `${mins}:${secs.padStart(5, '0')}`;
  }

  async createMutedVideo(inputPath, cussWordTimestamps, outputPath) {
    if (cussWordTimestamps.length === 0) {
      console.log('✅ No inappropriate language detected - copying original video');
      fs.copyFileSync(inputPath, outputPath);
      return;
    }

    console.log(`🎬 Creating video with ${cussWordTimestamps.length} muted segments...`);

    // Build volume filter for muting
    const volumeConditions = cussWordTimestamps.map(({ start, end }) => 
      `between(t,${start},${end})`
    ).join('+');

    const audioFilter = `[0:a]volume=enable='${volumeConditions}':volume=0[a]`;

    const command = [
      'ffmpeg',
      '-i', `"${inputPath}"`,
      '-filter_complex', `"${audioFilter}"`,
      '-map', '0:v',
      '-map', '[a]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-y',
      `"${outputPath}"`
    ].join(' ');

    try {
      console.log('⚙️  Processing video...');
      execSync(command, { stdio: 'inherit' });
      console.log('✅ Video processing completed successfully!');
    } catch (error) {
      throw new Error(`Video processing failed: ${error.message}`);
    }
  }

  question(prompt) {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  }

  async run() {
    try {
      console.log('🤖 CONSERVATIVE Cuss Word Muter - Only Explicit Content');
      console.log('='.repeat(60));
      console.log('🔒 STRICT MODE: Only mutes obvious profanity/vulgar language');
      console.log('🧠 AI-Enhanced with Conservative Detection');

      const videoPath = await this.question('\n📁 Enter video file path: ');
      this.validateVideoFile(videoPath);

      const addCustomWords = await this.question('\n➕ Add custom words to filter? (y/N): ');
      if (addCustomWords.toLowerCase() === 'y' || addCustomWords.toLowerCase() === 'yes') {
        const customWords = await this.question('Enter custom words (comma-separated): ');
        if (customWords.trim()) {
          const words = customWords.split(',').map(w => w.trim());
          this.explicitCussWords.custom = words;
          this.createStrictRegexPatterns();
          console.log(`✓ Added ${words.length} custom words`);
        }
      }

      const inputDir = path.dirname(videoPath);
      const inputName = path.basename(videoPath, path.extname(videoPath));
      const inputExt = path.extname(videoPath);
      const audioPath = path.join(inputDir, `${inputName}_temp_audio.wav`);
      const outputPath = path.join(inputDir, `${inputName}_clean${inputExt}`);

      try {
        await this.extractAudio(videoPath, audioPath);
        const language = await this.detectLanguage(audioPath);
        const segments = await this.transcribeAudio(audioPath, language);
        const cussWordTimestamps = await this.detectCussWords(segments);
        await this.createMutedVideo(videoPath, cussWordTimestamps, outputPath);

        console.log(`\n🎉 Process completed!`);
        console.log(`📁 Clean video saved to: ${outputPath}`);
        console.log(`🔇 Muted ${cussWordTimestamps.length} segments with explicit content only`);

      } finally {
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
        }
      }

    } catch (error) {
      console.error('\n❌ Error:', error.message);
    } finally {
      rl.close();
    }
  }
}

if (require.main === module) {
  const muter = new ConservativeCussWordMuter();
  muter.run().catch(console.error);
}

module.exports = ConservativeCussWordMuter;
