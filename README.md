# YouTube Editing Utilities

This project contains three main Node.js scripts to help with YouTube video editing:
- `cuss_word_muter.js`: Mutes cuss words in a video.
- `copyright_portion_detecter.js` (file name: `index.js`): Detects copyright portions in a video.
- `video_audio_remover.js`: Removes audio from a video file.

## Prerequisites
- [Node.js](https://nodejs.org/) (v14 or higher recommended)
- [npm](https://www.npmjs.com/) (comes with Node.js)
- [Python](https://www.python.org/) (v3.8 or higher recommended)
- [ffmpeg](https://ffmpeg.org/) installed and available in your system PATH (required for video/audio processing)

## Installation
1. Clone or download this repository.
2. Open a terminal in the project directory.
3. Install Node.js dependencies:
   ```bash
   npm install
   ```
4. Install Python dependencies:
   ```bash
   pip install google-api-python-client google-auth-oauthlib moviepy openai-whisper
   ```

## Installation
1. Clone or download this repository.
2. Open a terminal in the project directory.
3. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### 1. Cuss Word Muter
Mute cuss words in a video file.
```bash
node cuss_word_muter.js <input_video> <output_video>
```
Example:
```bash
node cuss_word_muter.js video.mp4 video_clean.mp4
```

### 2. Copyright Portion Detector
Detect copyright portions in a video file.
```bash
node index.js <input_video>
```
Example:
```bash
node index.js video.mp4
```

### 3. Video Audio Remover
Remove audio from a video file.
```bash
node video_audio_remover.js <input_video> <output_video>
```
Example:
```bash
node video_audio_remover.js video.mp4 video_noaudio.mp4
```

## Notes
- Make sure `ffmpeg` is installed and accessible from your terminal.
- Adjust file names and arguments as needed for your workflow.

## License
See LICENSE.txt for details.
