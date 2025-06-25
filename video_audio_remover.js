#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

class VideoAudioRemover {
  constructor() {
    this.checkFFmpeg();
  }

  // Check if FFmpeg is installed
  checkFFmpeg() {
    try {
      execSync('ffmpeg -version', { stdio: 'ignore' });
      console.log('✓ FFmpeg is installed and ready to use');
    } catch (error) {
      console.error('❌ FFmpeg is not installed. Please install FFmpeg first.');
      console.error('Visit: https://ffmpeg.org/download.html');
      process.exit(1);
    }
  }

  // Validate video file exists
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

  // Parse timeline input (e.g., "10-20" or "1:30-2:45")
  parseTimeline(timelineStr) {
    // Handle both "start-end" and "start - end" formats
    const parts = timelineStr.trim().split(/\s*-\s*/);
    if (parts.length !== 2) {
      throw new Error('Timeline format should be: start-end (e.g., "10-20" or "1:30-2:45")');
    }

    const start = this.parseTime(parts[0].trim());
    const end = this.parseTime(parts[1].trim());

    if (start >= end) {
      throw new Error('Start time must be less than end time');
    }

    return { start, end };
  }

  // Parse time string to seconds
  parseTime(timeStr) {
    // Handle formats: "10", "1:30", "1:30:45"
    const parts = timeStr.split(':').map(p => parseFloat(p));
    
    if (parts.length === 1) {
      return parts[0]; // seconds only
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1]; // minutes:seconds
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2]; // hours:minutes:seconds
    } else {
      throw new Error('Invalid time format. Use: seconds, mm:ss, or hh:mm:ss');
    }
  }

  // Format seconds to time string
  formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toFixed(2).padStart(5, '0')}`;
    } else {
      return `${minutes}:${secs.toFixed(2).padStart(5, '0')}`;
    }
  }

  // Remove audio from timeline segments
  async removeAudioFromTimelines(inputPath, timelines, outputPath) {
    try {
      console.log('\n🎬 Processing video...');
      console.log(`Input: ${inputPath}`);
      console.log(`Output: ${outputPath}`);
      console.log(`Timelines to mute: ${timelines.length}`);

      // Build audio filter for muting specific timelines
      let audioFilter = '[0:a]';
      
      if (timelines.length > 0) {
        // Create volume filter to mute specified timelines
        const volumeConditions = timelines.map(({ start, end }) => 
          `between(t,${start},${end})`
        ).join('+');
        
        audioFilter = `[0:a]volume=enable='${volumeConditions}':volume=0[a]`;
      } else {
        audioFilter = '[0:a]copy[a]';
      }

      // Build FFmpeg command
      const command = [
        'ffmpeg',
        '-i', `"${inputPath}"`,
        '-filter_complex', `"${audioFilter}"`,
        '-map', '0:v', // Map original video stream
        '-map', '[a]', // Map processed audio stream
        '-c:v', 'copy', // Copy video without re-encoding
        '-c:a', 'aac',  // Re-encode audio to apply filters
        '-y', // Overwrite output file
        `"${outputPath}"`
      ].join(' ');

      console.log('\n⚙️  Executing FFmpeg command...');
      console.log('This may take a while depending on video size...\n');

      // Execute FFmpeg command
      execSync(command, { 
        stdio: 'inherit',
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      console.log('\n✅ Video processing completed successfully!');
      console.log(`📁 Output saved to: ${outputPath}`);

    } catch (error) {
      console.error('\n❌ Error processing video:', error.message);
      throw error;
    }
  }

  // Get user input with promise
  question(prompt) {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  }

  // Main program flow
  async run() {
    try {
      console.log('🎥 Video Audio Remover');
      console.log('='.repeat(50));

      // Get video file path
      const videoPath = await this.question('\n📁 Enter video file path: ');
      this.validateVideoFile(videoPath);

      // Get timelines to mute
      const timelines = [];
      console.log('\n⏱️  Enter timeline segments to mute audio (format: start-end)');
      console.log('Examples: "10-20", "1:30-2:45", "0:30-1:15"');
      console.log('Press Enter with empty input when done.\n');

      let timelineIndex = 1;
      while (true) {
        const timelineInput = await this.question(`Timeline ${timelineIndex}: `);
        
        if (!timelineInput.trim()) {
          break;
        }

        try {
          const timeline = this.parseTimeline(timelineInput);
          timelines.push(timeline);
          console.log(`✓ Added: ${this.formatTime(timeline.start)} - ${this.formatTime(timeline.end)}`);
          timelineIndex++;
        } catch (error) {
          console.error(`❌ Invalid timeline: ${error.message}`);
        }
      }

      if (timelines.length === 0) {
        console.log('\n⚠️  No timelines specified. Exiting...');
        return;
      }

      // Generate output filename
      const inputDir = path.dirname(videoPath);
      const inputName = path.basename(videoPath, path.extname(videoPath));
      const inputExt = path.extname(videoPath);
      const outputPath = path.join(inputDir, `${inputName}_audio_removed${inputExt}`);

      // Confirm processing
      console.log('\n📋 Summary:');
      console.log(`Input file: ${videoPath}`);
      console.log(`Output file: ${outputPath}`);
      console.log(`Timelines to mute: ${timelines.length}`);
      timelines.forEach((timeline, i) => {
        console.log(`  ${i + 1}. ${this.formatTime(timeline.start)} - ${this.formatTime(timeline.end)}`);
      });

      const confirm = await this.question('\n🚀 Start processing? (y/N): ');
      if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
        console.log('❌ Processing cancelled.');
        return;
      }

      // Process the video
      await this.removeAudioFromTimelines(videoPath, timelines, outputPath);

    } catch (error) {
      console.error('\n❌ Program error:', error.message);
    } finally {
      rl.close();
    }
  }
}

// Run the program
if (require.main === module) {
  const remover = new VideoAudioRemover();
  remover.run().catch(console.error);
}

module.exports = VideoAudioRemover;
