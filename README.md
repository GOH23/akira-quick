# Akira Quick - Video to MMD Animation Converter

## Overview
Akira Quick is a web-based motion capture system that converts video footage into MMD (MikuMikuDance) animations. Using MediaPipe's Holistic model for real-time pose, hand, and facial landmark detection, it captures human movements and maps them onto 3D MMD models for animation export.

## Features

### 🎬 Video Processing
- Multi-video upload and queue processing
- Real-time video playback with progress tracking
- Automatic sequential processing of multiple videos
- Progress visualization with status indicators

### 🤖 Motion Capture
- Full-body pose tracking using MediaPipe Holistic
- Hand and finger articulation detection
- Facial expression and eye movement tracking
- Real-time 3D model synchronization

### 🎭 MMD Integration
- Built-in MMD model loading and rendering (using Babylon.js)
- Support for VMD (Vocaloid Motion Data) export
- GLTF animation export for 3D applications
- Bone mapping for accurate motion transfer

### 💻 Technical Highlights
- Client-side processing using WebAssembly
- Real-time filtering with OneEuro and Kalman filters
- Smooth animation interpolation
- Optimized performance for long animations

## Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Modern browser with WebGL support

### Setup
```bash
# Clone the repository
git clone <repository-url>
cd akira-quick

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Usage

1. **Upload Videos**: Click "Select Videos" to upload one or more video files
2. **Start Processing**: Click "Start" to begin motion capture
3. **Real-time Preview**: Watch the 3D model animate in sync with the video
4. **Export Animations**: After processing, download VMD or GLTF files
5. **Use in MMD**: Import VMD files into MikuMikuDance or other MMD-compatible software

## Configuration

### Model Setup
Place your MMD model files in `/public/model/`
- Default model: `绮良良.bpmx`
- Supported formats: BPMX, PMX

## Export Formats

### VMD (Vocaloid Motion Data)
- Native MMD animation format
- Compatible with MikuMikuDance, PMX Editor
- Includes bone and morph animations

## Performance Notes

- **Video Resolution**: Optimal at 720p-1080p
- **Processing Speed**: Real-time (30 FPS) on modern hardware
- **Memory Usage**: ~200MB per video minute
- **Export Size**: ~1MB per second of animation

## Browser Support

- Chrome 90+ (recommended)
- Firefox 88+
- Edge 90+
- Safari 14+ (limited WebGL support)

## Troubleshooting

### Common Issues

1. **WebGL Not Available**: Enable hardware acceleration in browser settings
2. **Model Not Loading**: Ensure BPMX file is in correct directory
3. **Slow Performance**: Reduce video resolution or length
4. **Export Failures**: Check browser console for errors

### Debug Mode
Enable debug mode in `MMDScene.tsx`:
```typescript
const [debugMode] = useState(true) // Change to true
```

## Development

### Key Dependencies
- `@mediapipe/tasks-vision` - MediaPipe vision tasks
- `@babylonjs/core` - 3D rendering engine
- `babylon-mmd` - MMD support for Babylon.js
- `framer-motion` - UI animations
- `encoding-japanese` - Shift-JIS encoding for VMD export

### Architecture Notes
- **Client-side Only**: All processing happens in browser
- **Modular Design**: Separated UI, logic, and rendering components
- **Type Safety**: Full TypeScript implementation
- **Performance**: Optimized with useRef and useMemo hooks

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with appropriate TypeScript types
4. Test with sample videos
5. Submit pull request

## Acknowledgments

- MediaPipe team for Holistic model
- Babylon.js community
- MMD development community
- All contributors and testers

## Support

- GitHub Issues: [Link to issues]
- Telegram: [Link to group]
- Documentation: [Link to docs]

---

**Note**: This tool is designed for creative use with proper permissions. Ensure you have rights to use any video content for motion capture.